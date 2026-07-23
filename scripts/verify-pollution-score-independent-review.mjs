#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = "water-quality/pollution-score-source-policy.json";
const CONTRACT_PATH = "contracts/pollution-score-independent-review.schema.json";
const RUNBOOK_PATH = "docs/POLLUTION-SCORE-INDEPENDENT-REVIEW.md";
const SOURCE_RUNBOOK_PATH = "docs/POLLUTION-SCORE-SOURCE-BOUNDARY.md";
const PACKAGE_PATH = "package.json";

export const LOCKED_SOURCE_COMMIT = "9fd337d561056fef5227eb013fa8f7b909f69343";
export const LOCKED_POLICY_SHA256 = "1061fcffec8283bf48e333a20a58ac8ea77545f5537f1d68685dda267d89d250";
const LOCKED_CONTRACT_SHA256 = "c3c67fdf02e39f20729c71ca3c5ceb3a0f734fe7a6d96de3590ead63065cd60e";
const REVIEW_SCHEMA_VERSION = "castingcompass.pollution-score-independent-review/1.0.0";
const RECEIPT_SCHEMA_VERSION = "castingcompass.pollution-score-independent-review-receipt/1.0.0";
const POLICY_VERSION = "castingcompass.pollution-score-candidates/0.1.0";
const UUID_V4_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_REVIEW_BYTES = 64 * 1024;
const POLICY_REVIEWED_AT = Date.parse("2026-07-21T00:00:00.000Z");
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export const REVIEW_ROLES = Object.freeze([
  "fisheries_or_marine_ecology_methods_reviewer",
  "public_health_risk_communication_reviewer",
]);

export const REVIEW_CHECKS = Object.freeze([
  "source_meanings_are_separated",
  "spatial_temporal_quality_boundaries_are_explicit",
  "agency_advice_remains_authoritative",
  "runtime_collection_remains_disabled",
  "numeric_scoring_remains_disabled",
  "catch_probability_claim_remains_prohibited",
  "water_contact_safety_claim_remains_prohibited",
  "seafood_safety_claim_remains_prohibited",
  "activation_gates_are_sufficient_for_this_boundary",
  "no_merge_deployment_or_activation_authority_is_granted",
]);

const REVIEW_FIELDS = Object.freeze([
  "schema_version",
  "review_id",
  "source_commit",
  "pollution_policy_sha256",
  "policy_version",
  "reviewed_at",
  "reviewer_role",
  "reviewer_independent_of_implementation",
  "reviewer_competence_evidence_sha256",
  "review_evidence_sha256",
  "disposition",
  "blocking_finding_count",
  "review_checklist",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  if (JSON.stringify(Object.keys(value)) !== JSON.stringify(expected)) {
    throw new Error(`${label} fields or field order are invalid.`);
  }
}

function parseCanonicalJson(source, label) {
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  if (source !== stableJson(value)) {
    throw new Error(`${label} must use the exact canonical JSON form without duplicate keys.`);
  }
  return value;
}

function parseTrackedJson(source, label) {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function parseTimestamp(value, label) {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`${label} must be an exact UTC timestamp with milliseconds.`);
  }
  return parsed;
}

function compileContract(contract) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(contract);
}

function isInside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

async function readPrivateReviewFile(root, path, label) {
  if (!isAbsolute(path ?? "")) throw new Error(`${label} path must be absolute.`);
  const rootReal = await realpath(root);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file.`);
  if (stat.nlink !== 1) throw new Error(`${label} must not be hard-linked.`);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${label} must not grant group or other permissions.`);
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
    throw new Error(`${label} must be owned by the current user.`);
  }
  if (stat.size < 2 || stat.size > MAX_REVIEW_BYTES) throw new Error(`${label} size is invalid.`);
  const fileReal = await realpath(path);
  if (isInside(rootReal, fileReal)) throw new Error(`${label} must remain outside the repository checkout.`);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== stat.dev || opened.ino !== stat.ino) {
      throw new Error(`${label} changed while it was being opened.`);
    }
    return {
      source: await handle.readFile("utf8"),
      identity: `${opened.dev}:${opened.ino}`,
      realPath: fileReal,
    };
  } finally {
    await handle.close();
  }
}

async function privateTemplateOutputPath(root, outputFile) {
  if (!isAbsolute(outputFile ?? "")) throw new Error("Template output path must be absolute.");
  const normalizedOutput = resolve(outputFile);
  if (normalizedOutput !== outputFile) throw new Error("Template output path must already be normalized.");
  const rootReal = await realpath(root);
  const parent = dirname(normalizedOutput);
  const parentMetadata = await lstat(parent).catch(() => null);
  if (!parentMetadata || parentMetadata.isSymbolicLink() || !parentMetadata.isDirectory()) {
    throw new Error("Template output directory must be an existing non-symlink directory.");
  }
  const parentReal = await realpath(parent);
  if (isInside(rootReal, parentReal)) throw new Error("Template output must remain outside the repository checkout.");
  if ((parentMetadata.mode & 0o077) !== 0) {
    throw new Error("Template output directory must not grant group or other permissions.");
  }
  if (typeof process.getuid === "function" && parentMetadata.uid !== process.getuid()) {
    throw new Error("Template output directory must be owned by the current user.");
  }
  return resolve(parentReal, basename(normalizedOutput));
}

function assertDigest(value, label) {
  if (!SHA256_PATTERN.test(value ?? "")) throw new Error(`${label} is invalid.`);
}

export function validateReviewRecord(record, {
  expectedRole,
  expectedCommit = LOCKED_SOURCE_COMMIT,
  validateContract,
  now = Date.now(),
} = {}) {
  exactKeys(record, REVIEW_FIELDS, "Pollution score independent review");
  if (validateContract && !validateContract(record)) {
    throw new Error(`Pollution score independent review violates its schema: ${JSON.stringify(validateContract.errors)}`);
  }
  if (record.schema_version !== REVIEW_SCHEMA_VERSION) throw new Error("Review schema version is invalid.");
  if (!UUID_V4_PATTERN.test(record.review_id ?? "")) throw new Error("Review ID is invalid.");
  if (!COMMIT_PATTERN.test(expectedCommit ?? "") || expectedCommit !== LOCKED_SOURCE_COMMIT) {
    throw new Error("Independently supplied source commit does not match the locked policy source commit.");
  }
  if (record.source_commit !== expectedCommit) throw new Error("Review source commit does not match the independently supplied commit.");
  if (record.pollution_policy_sha256 !== LOCKED_POLICY_SHA256) throw new Error("Review policy digest is invalid.");
  if (record.policy_version !== POLICY_VERSION) throw new Error("Review policy version is invalid.");
  if (record.reviewer_role !== expectedRole) throw new Error("Review role is invalid for this review file.");
  if (record.reviewer_independent_of_implementation !== true) throw new Error("Reviewer independence assertion is required.");
  assertDigest(record.reviewer_competence_evidence_sha256, "Reviewer competence evidence digest");
  assertDigest(record.review_evidence_sha256, "Review evidence digest");
  if (record.reviewer_competence_evidence_sha256 === record.review_evidence_sha256) {
    throw new Error("Reviewer competence and review evidence must be distinct.");
  }
  const reviewedAt = parseTimestamp(record.reviewed_at, "Review time");
  if (reviewedAt < POLICY_REVIEWED_AT || reviewedAt > now + FUTURE_SKEW_MS) {
    throw new Error("Review time is outside the accepted policy window.");
  }
  exactKeys(record.review_checklist, REVIEW_CHECKS, "Pollution score review checklist");
  const checks = Object.values(record.review_checklist);
  if (!checks.every((value) => typeof value === "boolean")) throw new Error("Review checklist values must be booleans.");
  if (!Number.isSafeInteger(record.blocking_finding_count)
    || record.blocking_finding_count < 0 || record.blocking_finding_count > 100) {
    throw new Error("Blocking finding count is invalid.");
  }
  const allChecksPassed = checks.every(Boolean);
  if (record.disposition === "accepted_boundary") {
    if (!allChecksPassed || record.blocking_finding_count !== 0) {
      throw new Error("An accepted boundary requires every check to pass and zero blocking findings.");
    }
  } else if (record.disposition === "changes_required") {
    if (allChecksPassed && record.blocking_finding_count === 0) {
      throw new Error("A changes-required disposition must identify a failed check or blocking finding.");
    }
  } else {
    throw new Error("Review disposition is invalid.");
  }
  return {
    accepted: record.disposition === "accepted_boundary",
    reviewedAt,
  };
}

function assertDistinctReviewEvidence(first, second, contractSha256) {
  const values = [
    first.review_id,
    second.review_id,
    first.reviewer_competence_evidence_sha256,
    second.reviewer_competence_evidence_sha256,
    first.review_evidence_sha256,
    second.review_evidence_sha256,
    LOCKED_POLICY_SHA256,
    contractSha256,
  ];
  if (new Set(values).size !== values.length) {
    throw new Error("Reviewer identities, competence evidence, and review evidence must be distinct.");
  }
}

export async function verifyPolicy(root = DEFAULT_ROOT) {
  const [policySource, contractSource, runbook, sourceRunbook, packageSource] = await Promise.all([
    readFile(resolve(root, POLICY_PATH), "utf8"),
    readFile(resolve(root, CONTRACT_PATH), "utf8"),
    readFile(resolve(root, RUNBOOK_PATH), "utf8"),
    readFile(resolve(root, SOURCE_RUNBOOK_PATH), "utf8"),
    readFile(resolve(root, PACKAGE_PATH), "utf8"),
  ]);
  if (sha256(policySource) !== LOCKED_POLICY_SHA256) throw new Error("Pollution score source policy does not match its locked digest.");
  if (sha256(contractSource) !== LOCKED_CONTRACT_SHA256) throw new Error("Pollution score independent-review contract does not match its locked digest.");
  const policy = parseTrackedJson(policySource, "Pollution score source policy");
  const contract = parseTrackedJson(contractSource, "Pollution score independent-review contract");
  const packageJson = parseTrackedJson(packageSource, "Package manifest");
  if (policy.policyVersion !== POLICY_VERSION
    || policy.status !== "research-boundary-not-activated"
    || policy.claimBoundary.runtimeCollectionActivated !== false
    || policy.claimBoundary.scoreContributionActivated !== false
    || policy.claimBoundary.numericScoreDelta !== null
    || policy.claimBoundary.agencyAdviceRemainsAuthoritative !== true
    || JSON.stringify(policy.requiredIndependentReview) !== JSON.stringify([
      "fisheries-or-marine-ecology-methods-review",
      "public-health-and-risk-communication-review",
    ])) {
    throw new Error("Pollution score source policy safety boundary is invalid.");
  }
  if (contract.$id !== "https://castingcompass.com/contracts/pollution-score-independent-review.schema.json"
    || contract.properties?.schema_version?.const !== REVIEW_SCHEMA_VERSION) {
    throw new Error("Pollution score independent-review contract identity is invalid.");
  }
  compileContract(contract);
  const requiredRunbookLanguage = [
    "never authorizes numeric scoring",
    "must remain outside every repository checkout",
    "fisheries or marine ecology methods reviewer",
    "public-health risk-communication reviewer",
    "changes_required",
  ];
  for (const phrase of requiredRunbookLanguage) {
    if (!runbook.includes(phrase)) throw new Error(`Independent-review runbook is missing required boundary: ${phrase}`);
  }
  if (!sourceRunbook.includes("No candidate can currently add or subtract score points.")) {
    throw new Error("Pollution source runbook no longer preserves the disabled scoring boundary.");
  }
  const scripts = packageJson.scripts ?? {};
  if (scripts["security:pollution-score-independent-review"]
      !== "node scripts/verify-pollution-score-independent-review.mjs verify-policy"
    || scripts["verify:pollution-score-independent-review"]
      !== "node scripts/verify-pollution-score-independent-review.mjs evaluate --fisheries-review-file \"$POLLUTION_FISHERIES_REVIEW_FILE\" --public-health-review-file \"$POLLUTION_PUBLIC_HEALTH_REVIEW_FILE\" --expected-source-commit \"$POLLUTION_REVIEW_EXPECTED_SOURCE_COMMIT\""
    || !scripts.security.includes("security:pollution-score-independent-review")) {
    throw new Error("Package scripts do not bind the pollution score independent-review policy.");
  }
  return {
    schema_version: "castingcompass.pollution-score-independent-review-policy-receipt/1.0.0",
    source_commit: LOCKED_SOURCE_COMMIT,
    pollution_policy_sha256: LOCKED_POLICY_SHA256,
    review_contract_sha256: LOCKED_CONTRACT_SHA256,
    runtime_collection_authorized: false,
    numeric_score_authorized: false,
    merge_authorized: false,
    deployment_authorized: false,
    production_authorized: false,
  };
}

export async function evaluateReviewFiles({
  root = DEFAULT_ROOT,
  fisheriesReviewFile,
  publicHealthReviewFile,
  expectedSourceCommit,
  now = Date.now(),
}) {
  await verifyPolicy(root);
  if (!COMMIT_PATTERN.test(expectedSourceCommit ?? "") || expectedSourceCommit !== LOCKED_SOURCE_COMMIT) {
    throw new Error("Independently supplied source commit does not match the locked policy source commit.");
  }
  const contractSource = await readFile(resolve(root, CONTRACT_PATH), "utf8");
  const contract = parseTrackedJson(contractSource, "Pollution score independent-review contract");
  const validateContract = compileContract(contract);
  const [fisheriesFile, publicHealthFile] = await Promise.all([
    readPrivateReviewFile(root, fisheriesReviewFile, "Fisheries review file"),
    readPrivateReviewFile(root, publicHealthReviewFile, "Public-health review file"),
  ]);
  if (fisheriesFile.identity === publicHealthFile.identity
    || fisheriesFile.realPath === publicHealthFile.realPath) {
    throw new Error("The two required reviews must be separate private files.");
  }
  const fisheries = parseCanonicalJson(fisheriesFile.source, "Fisheries review file");
  const publicHealth = parseCanonicalJson(publicHealthFile.source, "Public-health review file");
  const fisheriesResult = validateReviewRecord(fisheries, {
    expectedRole: REVIEW_ROLES[0],
    expectedCommit: expectedSourceCommit,
    validateContract,
    now,
  });
  const publicHealthResult = validateReviewRecord(publicHealth, {
    expectedRole: REVIEW_ROLES[1],
    expectedCommit: expectedSourceCommit,
    validateContract,
    now,
  });
  assertDistinctReviewEvidence(fisheries, publicHealth, LOCKED_CONTRACT_SHA256);
  const complete = fisheriesResult.accepted && publicHealthResult.accepted;
  return {
    schema_version: RECEIPT_SCHEMA_VERSION,
    policy_source_commit: LOCKED_SOURCE_COMMIT,
    pollution_policy_sha256: LOCKED_POLICY_SHA256,
    policy_version: POLICY_VERSION,
    reviewed_through: new Date(Math.max(fisheriesResult.reviewedAt, publicHealthResult.reviewedAt)).toISOString(),
    required_review_roles: REVIEW_ROLES,
    review_count: 2,
    fisheries_methods_review_accepted: fisheriesResult.accepted,
    public_health_risk_communication_review_accepted: publicHealthResult.accepted,
    independent_policy_review_complete: complete,
    changes_required: !complete,
    runtime_collection_authorized: false,
    numeric_score_authorized: false,
    catch_probability_claim_authorized: false,
    water_contact_safety_claim_authorized: false,
    seafood_safety_claim_authorized: false,
    merge_authorized: false,
    deployment_authorized: false,
    production_authorized: false,
  };
}

function template(role, now = Date.now()) {
  if (!REVIEW_ROLES.includes(role)) throw new Error(`Template role must be one of: ${REVIEW_ROLES.join(", ")}`);
  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    review_id: randomUUID(),
    source_commit: LOCKED_SOURCE_COMMIT,
    pollution_policy_sha256: LOCKED_POLICY_SHA256,
    policy_version: POLICY_VERSION,
    reviewed_at: new Date(now).toISOString(),
    reviewer_role: role,
    reviewer_independent_of_implementation: true,
    reviewer_competence_evidence_sha256: "REPLACE_WITH_PRIVATE_COMPETENCE_NOTE_SHA256",
    review_evidence_sha256: "REPLACE_WITH_PRIVATE_REVIEW_NOTE_SHA256",
    disposition: "changes_required",
    blocking_finding_count: 1,
    review_checklist: Object.fromEntries(REVIEW_CHECKS.map((check) => [check, false])),
  };
}

export async function writeReviewTemplate({
  root = DEFAULT_ROOT,
  role,
  outputFile,
  now = Date.now(),
}) {
  const outputPath = await privateTemplateOutputPath(root, outputFile);
  const payload = template(role, now);
  const body = stableJson(payload);
  let handle;
  try {
    handle = await open(
      outputPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("Template output file must not already exist.");
    throw new Error("Template output file could not be created safely.");
  }
  let complete = false;
  try {
    await handle.chmod(0o600);
    await handle.writeFile(body, "utf8");
    await handle.sync();
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.nlink !== 1 || (metadata.mode & 0o777) !== 0o600) {
      throw new Error("Template output file did not preserve the required private mode.");
    }
    complete = true;
  } finally {
    try {
      await handle.close();
    } finally {
      if (!complete) await unlink(outputPath).catch(() => undefined);
    }
  }
  return {
    schema_version: "castingcompass.pollution-score-review-template-write-receipt/1.0.0",
    source_commit: LOCKED_SOURCE_COMMIT,
    pollution_policy_sha256: LOCKED_POLICY_SHA256,
    reviewer_role: role,
    disposition: payload.disposition,
    owner_only_file_written: true,
    existing_file_overwritten: false,
    runtime_collection_authorized: false,
    numeric_score_authorized: false,
    merge_authorized: false,
    deployment_authorized: false,
    production_authorized: false,
  };
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined) throw new Error("Arguments must be --name value pairs.");
    values.set(flag, value);
  }
  return values;
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === "verify-policy") {
    if (rest.length !== 0) throw new Error("verify-policy accepts no arguments.");
    process.stdout.write(stableJson(await verifyPolicy()));
    return;
  }
  if (command === "print-template") {
    const args = parseArgs(rest);
    if (args.size !== 1 || !args.has("--role")) throw new Error("print-template requires only --role.");
    process.stdout.write(stableJson(template(args.get("--role"))));
    return;
  }
  if (command === "write-template") {
    const args = parseArgs(rest);
    if (args.size !== 2 || !args.has("--role") || !args.has("--output-file")) {
      throw new Error("write-template requires only --role and --output-file.");
    }
    process.stdout.write(stableJson(await writeReviewTemplate({
      role: args.get("--role"),
      outputFile: args.get("--output-file"),
    })));
    return;
  }
  if (command === "evaluate") {
    const args = parseArgs(rest);
    const allowed = ["--fisheries-review-file", "--public-health-review-file", "--expected-source-commit"];
    if (args.size !== allowed.length || allowed.some((flag) => !args.has(flag))) {
      throw new Error(`evaluate requires ${allowed.join(", ")}.`);
    }
    process.stdout.write(stableJson(await evaluateReviewFiles({
      fisheriesReviewFile: args.get("--fisheries-review-file"),
      publicHealthReviewFile: args.get("--public-health-review-file"),
      expectedSourceCommit: args.get("--expected-source-commit"),
    })));
    return;
  }
  throw new Error("Usage: verify-pollution-score-independent-review.mjs verify-policy | print-template --role ROLE | write-template --role ROLE --output-file ABSOLUTE_PATH | evaluate --fisheries-review-file ABSOLUTE_PATH --public-health-review-file ABSOLUTE_PATH --expected-source-commit SHA");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
