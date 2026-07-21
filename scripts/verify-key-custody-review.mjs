#!/usr/bin/env node

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = "security/key-custody-review-policy.json";
const CONTRACT_PATH = "contracts/key-custody-independent-review.schema.json";
const EVIDENCE_CONTRACT_PATH = "contracts/key-custody-evidence-manifest.schema.json";

export const LOCKED_POLICY_SHA256 = "c96b82a4865f80dee96878a99582fcc2cd429aebd5f3ffed0d59449409404eda";
export const LOCKED_CONTRACT_SHA256 = "7540a3d823430355c8aea4e1f915abe54c6a7293f7ddb522e26e709fc8f4cc56";
export const LOCKED_EVIDENCE_CONTRACT_SHA256 = "cc626fb9b9d14bd76c5ebf34c6238ae6ccaa78c9b7c96a9e08b93fa719ca2273";

const POLICY_SCHEMA_VERSION = "castingcompass.key-custody-review-policy/1.0.0";
const EVIDENCE_SCHEMA_VERSION = "castingcompass.key-custody-evidence-manifest/1.0.0";
const REVIEW_SCHEMA_VERSION = "castingcompass.key-custody-independent-review/1.0.0";
const RECEIPT_SCHEMA_VERSION = "castingcompass.key-custody-independent-review-receipt/1.0.0";
const REVIEWER_ROLE = "independent_cryptography_and_key_custody_reviewer";
const UUID_V4_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export const RUNTIME_SECRET_NAMES = Object.freeze([
  "MIMO_API_KEY",
  "OBSERVABILITY_PSEUDONYM_SECRET",
  "RATE_LIMIT_KEY_SECRET",
  "RESEND_API_KEY",
  "TURNSTILE_SECRET_KEY",
  "VALIDATION_PARTICIPANT_HMAC_SECRET",
  "VALIDATION_RECRUITMENT_HMAC_SECRET",
]);

export const BACKUP_KEY_ROLES = Object.freeze([
  "current-deletion-ledger",
  "operational-d1-snapshot",
  "validation-snapshot",
  "validation-suppression-ledger",
]);

export const REVIEW_CHECKS = Object.freeze([
  "runtime_secret_inventory_complete",
  "backup_key_role_inventory_complete",
  "provider_environment_and_purpose_separation_verified",
  "pseudonym_auth_validation_and_backup_key_separation_verified",
  "named_custodians_and_emergency_recovery_path_reviewed",
  "phishing_resistant_mfa_and_least_privilege_reviewed",
  "stale_user_and_token_removal_reviewed",
  "enabled_feature_missing_key_and_revocation_behavior_reviewed",
  "validation_rotation_hazards_accepted",
  "backup_retention_decryptability_verified",
  "rotation_recovery_and_destruction_records_reviewed",
  "production_shaped_restore_and_deletion_replay_evidence_reviewed",
  "alerts_and_logs_secret_redaction_tested",
  "no_secret_values_entered_repository_or_evidence",
  "no_deployment_or_production_authority_granted",
]);

const REMAINING_APPROVALS = Object.freeze([
  "production-provider-identity-and-binding-evidence",
  "production-change-authorization",
  "current-production-restore-and-deletion-ledger-evidence",
  "deployment-and-live-smoke-evidence",
]);

const REVIEW_FIELDS = Object.freeze([
  "schema_version",
  "review_id",
  "source_commit",
  "policy_sha256",
  "reviewed_at",
  "reviewer_role",
  "reviewer_independent_of_operator",
  "reviewer_competence_evidence_sha256",
  "custody_evidence_sha256",
  "review_evidence_sha256",
  "secret_material_in_review_record",
  "disposition",
  "blocking_finding_count",
  "review_checklist",
]);

const EVIDENCE_FIELDS = Object.freeze([
  "schema_version",
  "source_commit",
  "environment",
  "captured_at",
  "runtime_secret_names",
  "backup_key_roles",
  "runtime_inventory_sha256",
  "backup_custody_inventory_sha256",
  "access_and_mfa_review_sha256",
  "rotation_recovery_exercise_sha256",
  "restore_deletion_replay_sha256",
  "redaction_test_sha256",
  "secret_values_captured",
]);

const EVIDENCE_DIGEST_FIELDS = Object.freeze([
  "runtime_inventory_sha256",
  "backup_custody_inventory_sha256",
  "access_and_mfa_review_sha256",
  "rotation_recovery_exercise_sha256",
  "restore_deletion_replay_sha256",
  "redaction_test_sha256",
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
    throw new Error(`${label} must use exact canonical JSON without duplicate keys.`);
  }
  return value;
}

function parseTimestamp(value, label) {
  const timestamp = Date.parse(value ?? "");
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== value) {
    throw new Error(`${label} must be an exact UTC timestamp with milliseconds.`);
  }
  return timestamp;
}

function compileContract(contract) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(contract);
}

function isOutside(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot);
}

function assertNoCredentialMaterial(source, label) {
  const prohibited = [
    /-----BEGIN [A-Z ]*(?:PRIVATE|SECRET) KEY-----/u,
    /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/u,
    /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/u,
    /\b(?:MIMO_API_KEY|RESEND_API_KEY|TURNSTILE_SECRET_KEY)\s*=\s*\S+/u,
  ];
  if (prohibited.some((pattern) => pattern.test(source))) {
    throw new Error(`${label} appears to contain credential material.`);
  }
}

function assertDigest(value, label) {
  if (!SHA256_PATTERN.test(value ?? "")) throw new Error(`${label} is invalid.`);
}

export function validateKeyCustodyReviewPolicy(policy) {
  exactKeys(policy, [
    "schema_version",
    "evidence_schema_version",
    "review_schema_version",
    "receipt_schema_version",
    "scope",
    "reviewer_role",
    "runtime_secret_names",
    "backup_key_roles",
    "required_review_checks",
    "limits",
    "remaining_approvals_after_review",
    "authority",
    "prohibited_public_receipt_fields",
  ], "Key-custody review policy");
  if (policy.schema_version !== POLICY_SCHEMA_VERSION
    || policy.evidence_schema_version !== EVIDENCE_SCHEMA_VERSION
    || policy.review_schema_version !== REVIEW_SCHEMA_VERSION
    || policy.receipt_schema_version !== RECEIPT_SCHEMA_VERSION
    || policy.scope !== "production-key-custody-evidence"
    || policy.reviewer_role !== REVIEWER_ROLE
    || JSON.stringify(policy.runtime_secret_names) !== JSON.stringify(RUNTIME_SECRET_NAMES)
    || JSON.stringify(policy.backup_key_roles) !== JSON.stringify(BACKUP_KEY_ROLES)
    || JSON.stringify(policy.required_review_checks) !== JSON.stringify(REVIEW_CHECKS)
    || JSON.stringify(policy.remaining_approvals_after_review) !== JSON.stringify(REMAINING_APPROVALS)) {
    throw new Error("Key-custody review policy does not match the locked reviewed boundary.");
  }
  exactKeys(policy.limits, [
    "maximum_review_bytes",
    "maximum_review_age_days",
    "maximum_future_skew_minutes",
    "maximum_blocking_findings",
  ], "Key-custody review limits");
  if (policy.limits.maximum_review_bytes !== 65_536
    || policy.limits.maximum_review_age_days !== 30
    || policy.limits.maximum_future_skew_minutes !== 5
    || policy.limits.maximum_blocking_findings !== 100) {
    throw new Error("Key-custody review limits do not match the locked reviewed boundary.");
  }
  exactKeys(policy.authority, [
    "production_key_custody_approved",
    "production_restore_gate_passed",
    "production_release_authorized",
  ], "Key-custody review authority");
  if (Object.values(policy.authority).some((value) => value !== false)) {
    throw new Error("Key-custody review policy must not grant production authority.");
  }
  if (JSON.stringify(policy.prohibited_public_receipt_fields) !== JSON.stringify([
    "custody_evidence_sha256",
    "review_evidence_sha256",
    "review_id",
    "reviewer_competence_evidence_sha256",
  ])) {
    throw new Error("Key-custody public receipt exclusions are invalid.");
  }
  return policy;
}

export async function loadKeyCustodyReviewPolicy(root = DEFAULT_ROOT) {
  const source = await readFile(resolve(root, POLICY_PATH), "utf8");
  if (sha256(source) !== LOCKED_POLICY_SHA256) {
    throw new Error("Key-custody review policy digest does not match the locked boundary.");
  }
  const policy = parseCanonicalJson(source, "Key-custody review policy");
  return validateKeyCustodyReviewPolicy(policy);
}

export async function loadKeyCustodyReviewContract(root = DEFAULT_ROOT) {
  const source = await readFile(resolve(root, CONTRACT_PATH), "utf8");
  if (sha256(source) !== LOCKED_CONTRACT_SHA256) {
    throw new Error("Key-custody review contract digest does not match the locked boundary.");
  }
  let contract;
  try {
    contract = JSON.parse(source);
  } catch {
    throw new Error("Key-custody review contract is not valid JSON.");
  }
  return compileContract(contract);
}

export async function loadKeyCustodyEvidenceContract(root = DEFAULT_ROOT) {
  const source = await readFile(resolve(root, EVIDENCE_CONTRACT_PATH), "utf8");
  if (sha256(source) !== LOCKED_EVIDENCE_CONTRACT_SHA256) {
    throw new Error("Key-custody evidence contract digest does not match the locked boundary.");
  }
  let contract;
  try {
    contract = JSON.parse(source);
  } catch {
    throw new Error("Key-custody evidence contract is not valid JSON.");
  }
  return compileContract(contract);
}

export function validateKeyCustodyEvidenceManifest(record, policy, {
  expectedSourceCommit,
  validateContract,
  now = new Date(),
} = {}) {
  exactKeys(record, EVIDENCE_FIELDS, "Key-custody evidence manifest");
  if (!COMMIT_PATTERN.test(expectedSourceCommit ?? "")) {
    throw new Error("Key-custody evidence requires an independently supplied full source commit.");
  }
  if (validateContract && !validateContract(record)) {
    throw new Error(`Key-custody evidence manifest violates its schema: ${JSON.stringify(validateContract.errors)}`);
  }
  if (record.source_commit !== expectedSourceCommit) {
    throw new Error("Key-custody evidence source commit does not match the independently supplied commit.");
  }
  if (record.schema_version !== policy.evidence_schema_version
    || record.environment !== "production"
    || JSON.stringify(record.runtime_secret_names) !== JSON.stringify(policy.runtime_secret_names)
    || JSON.stringify(record.backup_key_roles) !== JSON.stringify(policy.backup_key_roles)
    || record.secret_values_captured !== false) {
    throw new Error("Key-custody evidence manifest does not match the locked production boundary.");
  }
  const digests = EVIDENCE_DIGEST_FIELDS.map((field) => {
    assertDigest(record[field], `Key-custody evidence ${field}`);
    return record[field];
  });
  if (new Set(digests).size !== digests.length) {
    throw new Error("Key-custody evidence artifact digests must be distinct.");
  }
  const reservedDigests = new Set([
    LOCKED_POLICY_SHA256,
    LOCKED_CONTRACT_SHA256,
    LOCKED_EVIDENCE_CONTRACT_SHA256,
  ]);
  if (digests.some((digest) => reservedDigests.has(digest))) {
    throw new Error("Key-custody evidence artifacts must be distinct from policy and contract digests.");
  }
  const capturedAt = parseTimestamp(record.captured_at, "Key-custody evidence capture time");
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) throw new Error("Key-custody evidence evaluation time is invalid.");
  const maximumAge = policy.limits.maximum_review_age_days * 24 * 60 * 60 * 1000;
  const futureSkew = policy.limits.maximum_future_skew_minutes * 60 * 1000;
  if (capturedAt > nowMs + futureSkew || nowMs - capturedAt > maximumAge) {
    throw new Error("Key-custody evidence capture time is outside the accepted window.");
  }
  return record;
}

export function createKeyCustodyReviewTemplate(policy, {
  expectedSourceCommit,
  evidenceSource,
  validateEvidenceContract,
  now = new Date(),
}) {
  validateKeyCustodyReviewPolicy(policy);
  if (typeof evidenceSource !== "string") throw new Error("Key-custody evidence source is invalid.");
  assertNoCredentialMaterial(evidenceSource, "Key-custody evidence manifest");
  const evidence = parseCanonicalJson(evidenceSource, "Key-custody evidence manifest");
  validateKeyCustodyEvidenceManifest(evidence, policy, {
    expectedSourceCommit,
    validateContract: validateEvidenceContract,
    now,
  });
  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    review_id: "",
    source_commit: expectedSourceCommit,
    policy_sha256: LOCKED_POLICY_SHA256,
    reviewed_at: "",
    reviewer_role: REVIEWER_ROLE,
    reviewer_independent_of_operator: false,
    reviewer_competence_evidence_sha256: "",
    custody_evidence_sha256: sha256(evidenceSource),
    review_evidence_sha256: "",
    secret_material_in_review_record: false,
    disposition: "changes_required",
    blocking_finding_count: 1,
    review_checklist: Object.fromEntries(REVIEW_CHECKS.map((name) => [name, false])),
  };
}

export function createKeyCustodyEvidenceTemplate(policy, { expectedSourceCommit }) {
  validateKeyCustodyReviewPolicy(policy);
  if (!COMMIT_PATTERN.test(expectedSourceCommit ?? "")) {
    throw new Error("Key-custody evidence template requires a full lowercase source commit.");
  }
  return {
    schema_version: policy.evidence_schema_version,
    source_commit: expectedSourceCommit,
    environment: "production",
    captured_at: "",
    runtime_secret_names: [...policy.runtime_secret_names],
    backup_key_roles: [...policy.backup_key_roles],
    runtime_inventory_sha256: "",
    backup_custody_inventory_sha256: "",
    access_and_mfa_review_sha256: "",
    rotation_recovery_exercise_sha256: "",
    restore_deletion_replay_sha256: "",
    redaction_test_sha256: "",
    secret_values_captured: false,
  };
}

export function evaluateKeyCustodyReviewRecord(record, policy, {
  expectedSourceCommit,
  evidenceSource,
  validateEvidenceContract,
  validateContract,
  now = new Date(),
} = {}) {
  validateKeyCustodyReviewPolicy(policy);
  if (typeof evidenceSource !== "string") throw new Error("Key-custody evidence source is invalid.");
  assertNoCredentialMaterial(evidenceSource, "Key-custody evidence manifest");
  const evidence = parseCanonicalJson(evidenceSource, "Key-custody evidence manifest");
  validateKeyCustodyEvidenceManifest(evidence, policy, {
    expectedSourceCommit,
    validateContract: validateEvidenceContract,
    now,
  });
  exactKeys(record, REVIEW_FIELDS, "Key-custody independent review");
  if (!COMMIT_PATTERN.test(expectedSourceCommit ?? "")) {
    throw new Error("Key-custody review requires an independently supplied full source commit.");
  }
  if (validateContract && !validateContract(record)) {
    throw new Error(`Key-custody independent review violates its schema: ${JSON.stringify(validateContract.errors)}`);
  }
  if (record.schema_version !== REVIEW_SCHEMA_VERSION) throw new Error("Review schema version is invalid.");
  if (!UUID_V4_PATTERN.test(record.review_id ?? "")) throw new Error("Review ID is invalid.");
  if (record.source_commit !== expectedSourceCommit) {
    throw new Error("Review source commit does not match the independently supplied commit.");
  }
  if (record.policy_sha256 !== LOCKED_POLICY_SHA256) throw new Error("Review policy digest is invalid.");
  if (record.custody_evidence_sha256 !== sha256(evidenceSource)) {
    throw new Error("Review custody evidence digest does not match the independently supplied manifest.");
  }
  if (record.reviewer_role !== REVIEWER_ROLE) throw new Error("Review role is invalid.");
  if (record.secret_material_in_review_record !== false) {
    throw new Error("Secret material must not enter the review record.");
  }
  for (const [label, digest] of [
    ["Reviewer competence evidence digest", record.reviewer_competence_evidence_sha256],
    ["Custody evidence digest", record.custody_evidence_sha256],
    ["Review evidence digest", record.review_evidence_sha256],
  ]) assertDigest(digest, label);
  if (new Set([
    record.reviewer_competence_evidence_sha256,
    record.custody_evidence_sha256,
    record.review_evidence_sha256,
  ]).size !== 3) {
    throw new Error("Competence, custody, and review evidence digests must be distinct.");
  }
  const packetDigests = new Set([
    LOCKED_POLICY_SHA256,
    LOCKED_CONTRACT_SHA256,
    LOCKED_EVIDENCE_CONTRACT_SHA256,
    sha256(evidenceSource),
    ...EVIDENCE_DIGEST_FIELDS.map((field) => evidence[field]),
  ]);
  if (packetDigests.has(record.reviewer_competence_evidence_sha256)
    || packetDigests.has(record.review_evidence_sha256)) {
    throw new Error("Reviewer competence and review evidence must be distinct from custody packet digests.");
  }
  const reviewedAt = parseTimestamp(record.reviewed_at, "Review time");
  const capturedAt = parseTimestamp(evidence.captured_at, "Key-custody evidence capture time");
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) throw new Error("Key-custody review evaluation time is invalid.");
  const maximumAge = policy.limits.maximum_review_age_days * 24 * 60 * 60 * 1000;
  const futureSkew = policy.limits.maximum_future_skew_minutes * 60 * 1000;
  if (reviewedAt < capturedAt || reviewedAt > nowMs + futureSkew || nowMs - reviewedAt > maximumAge) {
    throw new Error("Key-custody review time is outside the accepted window.");
  }
  if (record.reviewer_independent_of_operator !== true
    && record.disposition === "accepted_evidence_boundary") {
    throw new Error("An accepted review requires reviewer independence.");
  }
  if (!Number.isSafeInteger(record.blocking_finding_count)
    || record.blocking_finding_count < 0
    || record.blocking_finding_count > policy.limits.maximum_blocking_findings) {
    throw new Error("Blocking finding count is invalid.");
  }
  exactKeys(record.review_checklist, REVIEW_CHECKS, "Key-custody review checklist");
  if (Object.values(record.review_checklist).some((value) => typeof value !== "boolean")) {
    throw new Error("Key-custody review checklist values must be booleans.");
  }
  const verifiedReviewCheckCount = Object.values(record.review_checklist).filter(Boolean).length;
  const allChecksPassed = verifiedReviewCheckCount === REVIEW_CHECKS.length;
  let independentReviewRecordAccepted = false;
  if (record.disposition === "accepted_evidence_boundary") {
    if (!allChecksPassed || record.blocking_finding_count !== 0) {
      throw new Error("An accepted evidence boundary requires every check and zero blocking findings.");
    }
    independentReviewRecordAccepted = true;
  } else if (record.disposition === "changes_required") {
    if (allChecksPassed && record.blocking_finding_count === 0) {
      throw new Error("Changes-required must retain a failed check or blocking finding.");
    }
  } else {
    throw new Error("Key-custody review disposition is invalid.");
  }
  const receipt = {
    schema_version: policy.receipt_schema_version,
    scope: policy.scope,
    source_commit: expectedSourceCommit,
    disposition: record.disposition,
    independent_review_record_accepted: independentReviewRecordAccepted,
    verified_runtime_secret_role_count: RUNTIME_SECRET_NAMES.length,
    verified_backup_key_role_count: BACKUP_KEY_ROLES.length,
    verified_review_check_count: verifiedReviewCheckCount,
    production_key_custody_approved: false,
    production_restore_gate_passed: false,
    production_release_authorized: false,
    remaining_approvals: [...policy.remaining_approvals_after_review],
  };
  const serialized = JSON.stringify(receipt);
  for (const field of policy.prohibited_public_receipt_fields) {
    if (serialized.includes(field)) throw new Error("Key-custody public receipt contains a prohibited field.");
  }
  return receipt;
}

function parseReviewSource(source, evidenceSource, policy, options) {
  assertNoCredentialMaterial(source, "Key-custody independent review");
  const record = parseCanonicalJson(source, "Key-custody independent review");
  return evaluateKeyCustodyReviewRecord(record, policy, { ...options, evidenceSource });
}

async function safeReadPrivateReview(path, { root, maximumBytes }) {
  if (!isAbsolute(path ?? "")) throw new Error("Key-custody review file path must be absolute.");
  const requestedPath = resolve(path);
  const before = await lstat(requestedPath).catch(() => null);
  if (!before || before.isSymbolicLink() || !before.isFile()) {
    throw new Error("Key-custody review file must be an existing regular file, not a symbolic link.");
  }
  if (before.nlink !== 1 || before.size < 2 || before.size > maximumBytes
    || (before.mode & 0o777) !== 0o600
    || (typeof process.getuid === "function" && before.uid !== process.getuid())) {
    throw new Error("Key-custody review file ownership, exact permissions, link count, or size is invalid.");
  }
  const rootReal = await realpath(root);
  const realPathBefore = await realpath(requestedPath);
  if (!isOutside(rootReal, realPathBefore)) {
    throw new Error("Key-custody review file must remain outside the repository checkout.");
  }
  let handle;
  try {
    handle = await open(requestedPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new Error("Key-custody review file could not be opened safely.");
  }
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.nlink !== 1 || opened.size < 2 || opened.size > maximumBytes
      || (opened.mode & 0o777) !== 0o600
      || (typeof process.getuid === "function" && opened.uid !== process.getuid())) {
      throw new Error("Key-custody review file identity is invalid.");
    }
    const bytes = await handle.readFile();
    const completed = await handle.stat();
    const after = await lstat(requestedPath).catch(() => null);
    if (!after || after.isSymbolicLink()
      || completed.dev !== opened.dev || completed.ino !== opened.ino
      || completed.nlink !== 1 || (completed.mode & 0o777) !== 0o600
      || (typeof process.getuid === "function" && completed.uid !== process.getuid())
      || completed.size !== opened.size || completed.size !== bytes.length
      || completed.mtimeMs !== opened.mtimeMs || completed.ctimeMs !== opened.ctimeMs
      || after.dev !== completed.dev || after.ino !== completed.ino
      || after.nlink !== 1 || (after.mode & 0o777) !== 0o600
      || (typeof process.getuid === "function" && after.uid !== process.getuid())
      || after.size !== completed.size || after.mtimeMs !== completed.mtimeMs
      || after.ctimeMs !== completed.ctimeMs
      || await realpath(requestedPath) !== realPathBefore) {
      throw new Error("Key-custody review file changed while it was being read.");
    }
    try {
      return {
        source: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        identity: `${completed.dev}:${completed.ino}`,
      };
    } catch {
      throw new Error("Key-custody review file must be valid UTF-8.");
    }
  } finally {
    await handle.close();
  }
}

async function privateTemplateOutput(outputFile, root) {
  if (typeof outputFile !== "string" || !isAbsolute(outputFile)) {
    throw new Error("Key-custody review template output path must be absolute.");
  }
  const requestedPath = resolve(outputFile);
  if (requestedPath !== outputFile) {
    throw new Error("Key-custody review template output path must already be normalized.");
  }
  const parent = dirname(requestedPath);
  const parentMetadata = await lstat(parent).catch(() => null);
  if (!parentMetadata || parentMetadata.isSymbolicLink() || !parentMetadata.isDirectory()) {
    throw new Error("Key-custody review template directory must be an existing non-symlink directory.");
  }
  const parentReal = await realpath(parent);
  const rootReal = await realpath(root);
  if (!isOutside(rootReal, parentReal)) {
    throw new Error("Key-custody review template directory must remain outside the repository checkout.");
  }
  if ((parentMetadata.mode & 0o777) !== 0o700
    || (typeof process.getuid === "function" && parentMetadata.uid !== process.getuid())) {
    throw new Error("Key-custody review template directory ownership or exact permissions are invalid.");
  }
  return {
    outputPath: resolve(parentReal, basename(requestedPath)),
    parentPath: parentReal,
    parentMetadata,
  };
}

async function writeExclusivePrivateTemplate(output, body, label) {
  const expectedBytes = Buffer.byteLength(body);
  let handle;
  try {
    handle = await open(
      output.outputPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error(`${label} output file must not already exist.`);
    throw new Error(`${label} output file could not be created safely.`);
  }
  let complete = false;
  try {
    await handle.chmod(0o600);
    await handle.writeFile(body, "utf8");
    await handle.sync();
    const metadata = await handle.stat();
    const parentAfter = await lstat(output.parentPath).catch(() => null);
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size !== expectedBytes
      || (metadata.mode & 0o777) !== 0o600
      || (typeof process.getuid === "function" && metadata.uid !== process.getuid())
      || !parentAfter || parentAfter.isSymbolicLink() || !parentAfter.isDirectory()
      || parentAfter.dev !== output.parentMetadata.dev || parentAfter.ino !== output.parentMetadata.ino
      || (parentAfter.mode & 0o777) !== 0o700
      || (typeof process.getuid === "function" && parentAfter.uid !== process.getuid())
      || await realpath(output.parentPath) !== output.parentPath) {
      throw new Error(`${label} did not preserve its private boundary.`);
    }
    complete = true;
  } finally {
    try {
      await handle.close();
    } finally {
      if (!complete) await unlink(output.outputPath).catch(() => undefined);
    }
  }
}

export async function writeKeyCustodyEvidenceTemplate({
  root = DEFAULT_ROOT,
  outputFile,
  expectedSourceCommit,
}) {
  const policy = await loadKeyCustodyReviewPolicy(root);
  await loadKeyCustodyEvidenceContract(root);
  const output = await privateTemplateOutput(outputFile, root);
  const template = createKeyCustodyEvidenceTemplate(policy, { expectedSourceCommit });
  await writeExclusivePrivateTemplate(output, stableJson(template), "Key-custody evidence template");
  return {
    schema_version: "castingcompass.key-custody-evidence-template-write-receipt/1.0.0",
    scope: policy.scope,
    source_commit: expectedSourceCommit,
    owner_only_file_written: true,
    existing_file_overwritten: false,
    production_evidence_accepted: false,
    production_key_custody_approved: false,
    production_restore_gate_passed: false,
    production_release_authorized: false,
  };
}

export async function writeKeyCustodyReviewTemplate({
  root = DEFAULT_ROOT,
  evidenceFile,
  outputFile,
  expectedSourceCommit,
}) {
  const policy = await loadKeyCustodyReviewPolicy(root);
  await loadKeyCustodyReviewContract(root);
  const validateEvidenceContract = await loadKeyCustodyEvidenceContract(root);
  const evidence = await safeReadPrivateReview(evidenceFile, {
    root,
    maximumBytes: policy.limits.maximum_review_bytes,
  });
  const output = await privateTemplateOutput(outputFile, root);
  const template = createKeyCustodyReviewTemplate(policy, {
    expectedSourceCommit,
    evidenceSource: evidence.source,
    validateEvidenceContract,
  });
  const body = stableJson(template);
  await writeExclusivePrivateTemplate(output, body, "Key-custody review template");
  return {
    schema_version: "castingcompass.key-custody-review-template-write-receipt/1.0.0",
    scope: policy.scope,
    source_commit: expectedSourceCommit,
    owner_only_file_written: true,
    existing_file_overwritten: false,
    independent_review_record_accepted: false,
    production_key_custody_approved: false,
    production_restore_gate_passed: false,
    production_release_authorized: false,
  };
}

export async function verifyKeyCustodyIndependentReview({
  root = DEFAULT_ROOT,
  evidenceFile,
  reviewFile,
  expectedSourceCommit,
  now = new Date(),
}) {
  const policy = await loadKeyCustodyReviewPolicy(root);
  const validateContract = await loadKeyCustodyReviewContract(root);
  const validateEvidenceContract = await loadKeyCustodyEvidenceContract(root);
  const evidence = await safeReadPrivateReview(evidenceFile, {
    root,
    maximumBytes: policy.limits.maximum_review_bytes,
  });
  const review = await safeReadPrivateReview(reviewFile, {
    root,
    maximumBytes: policy.limits.maximum_review_bytes,
  });
  if (evidence.identity === review.identity) {
    throw new Error("Key-custody evidence and independent review must be distinct files.");
  }
  return parseReviewSource(review.source, evidence.source, policy, {
    expectedSourceCommit,
    validateContract,
    validateEvidenceContract,
    now,
  });
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || !value || value.startsWith("--") || values.has(name.slice(2))) {
      throw new Error("Key-custody review arguments are invalid.");
    }
    values.set(name.slice(2), value);
    index += 1;
  }
  return values;
}

function exactArguments(values, wanted) {
  if (JSON.stringify([...values.keys()].sort()) !== JSON.stringify([...wanted].sort())) {
    throw new Error(`Expected exactly ${wanted.map((name) => `--${name}`).join(", ")}.`);
  }
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command === "verify-policy") {
    if (argv.length !== 0) throw new Error("verify-policy accepts no arguments.");
    const policy = await loadKeyCustodyReviewPolicy();
    await loadKeyCustodyReviewContract();
    await loadKeyCustodyEvidenceContract();
    process.stdout.write(`${JSON.stringify({
      schema_version: policy.schema_version,
      policy_sha256: LOCKED_POLICY_SHA256,
      contract_sha256: LOCKED_CONTRACT_SHA256,
      evidence_contract_sha256: LOCKED_EVIDENCE_CONTRACT_SHA256,
      runtime_secret_role_count: policy.runtime_secret_names.length,
      backup_key_role_count: policy.backup_key_roles.length,
      provider_query_performed: false,
      production_key_custody_approved: false,
      production_release_authorized: false,
    })}\n`);
    return;
  }
  const values = parseArguments(argv);
  if (command === "write-template") {
    exactArguments(values, ["evidence-file", "output-file", "expected-source-commit"]);
    const receipt = await writeKeyCustodyReviewTemplate({
      evidenceFile: values.get("evidence-file"),
      outputFile: values.get("output-file"),
      expectedSourceCommit: values.get("expected-source-commit"),
    });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return;
  }
  if (command === "write-evidence-template") {
    exactArguments(values, ["output-file", "expected-source-commit"]);
    const receipt = await writeKeyCustodyEvidenceTemplate({
      outputFile: values.get("output-file"),
      expectedSourceCommit: values.get("expected-source-commit"),
    });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return;
  }
  if (command === "evaluate") {
    exactArguments(values, ["evidence-file", "review-file", "expected-source-commit"]);
    const receipt = await verifyKeyCustodyIndependentReview({
      evidenceFile: values.get("evidence-file"),
      reviewFile: values.get("review-file"),
      expectedSourceCommit: values.get("expected-source-commit"),
    });
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
    return;
  }
  throw new Error("Usage: verify-key-custody-review.mjs verify-policy | write-evidence-template --output-file ABSOLUTE_PATH --expected-source-commit SHA | write-template --evidence-file ABSOLUTE_PATH --output-file ABSOLUTE_PATH --expected-source-commit SHA | evaluate --evidence-file ABSOLUTE_PATH --review-file ABSOLUTE_PATH --expected-source-commit SHA");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
