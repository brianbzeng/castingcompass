import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  LOCKED_POLICY_SHA256,
  LOCKED_SOURCE_COMMIT,
  REVIEW_CHECKS,
  REVIEW_ROLES,
  evaluateReviewFiles,
  stableJson,
  validateReviewRecord,
  verifyPolicy,
  writeReviewTemplate,
} from "../scripts/verify-pollution-score-independent-review.mjs";

const root = new URL("../", import.meta.url).pathname;

function digest(label) {
  return createHash("sha256").update(label).digest("hex");
}

function review(role, label, overrides = {}) {
  const base = {
    schema_version: "castingcompass.pollution-score-independent-review/1.0.0",
    review_id: randomUUID(),
    source_commit: LOCKED_SOURCE_COMMIT,
    pollution_policy_sha256: LOCKED_POLICY_SHA256,
    policy_version: "castingcompass.pollution-score-candidates/0.1.0",
    reviewed_at: "2026-07-21T18:00:00.000Z",
    reviewer_role: role,
    reviewer_independent_of_implementation: true,
    reviewer_competence_evidence_sha256: digest(`${label}-competence`),
    review_evidence_sha256: digest(`${label}-review`),
    disposition: "accepted_boundary",
    blocking_finding_count: 0,
    review_checklist: Object.fromEntries(REVIEW_CHECKS.map((check) => [check, true])),
  };
  return { ...base, ...overrides };
}

async function privatePair(t, fisheries, publicHealth) {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-pollution-review-"));
  await chmod(directory, 0o700);
  const fisheriesPath = join(directory, "fisheries.json");
  const publicHealthPath = join(directory, "public-health.json");
  await writeFile(fisheriesPath, stableJson(fisheries), { mode: 0o600 });
  await writeFile(publicHealthPath, stableJson(publicHealth), { mode: 0o600 });
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, fisheriesPath, publicHealthPath };
}

test("pollution score independent-review policy is locked and non-authorizing", async () => {
  const receipt = await verifyPolicy(root);
  assert.equal(receipt.source_commit, LOCKED_SOURCE_COMMIT);
  assert.equal(receipt.pollution_policy_sha256, LOCKED_POLICY_SHA256);
  assert.equal(receipt.runtime_collection_authorized, false);
  assert.equal(receipt.numeric_score_authorized, false);
  assert.equal(receipt.merge_authorized, false);
  assert.equal(receipt.deployment_authorized, false);
  assert.equal(receipt.production_authorized, false);
});

test("two distinct accepted reviews emit only a minimized non-authorizing receipt", async (t) => {
  const fisheries = review(REVIEW_ROLES[0], "fisheries");
  const publicHealth = review(REVIEW_ROLES[1], "public-health", {
    reviewed_at: "2026-07-21T18:30:00.000Z",
  });
  const paths = await privatePair(t, fisheries, publicHealth);
  const receipt = await evaluateReviewFiles({
    root,
    fisheriesReviewFile: paths.fisheriesPath,
    publicHealthReviewFile: paths.publicHealthPath,
    expectedSourceCommit: LOCKED_SOURCE_COMMIT,
    now: Date.parse("2026-07-21T19:00:00.000Z"),
  });
  assert.equal(receipt.independent_policy_review_complete, true);
  assert.equal(receipt.changes_required, false);
  assert.equal(receipt.review_count, 2);
  assert.equal(receipt.runtime_collection_authorized, false);
  assert.equal(receipt.numeric_score_authorized, false);
  assert.equal(receipt.catch_probability_claim_authorized, false);
  assert.equal(receipt.water_contact_safety_claim_authorized, false);
  assert.equal(receipt.seafood_safety_claim_authorized, false);
  assert.equal(receipt.merge_authorized, false);
  assert.equal(receipt.deployment_authorized, false);
  assert.equal(receipt.production_authorized, false);
  const publicReceipt = stableJson(receipt);
  for (const privateValue of [
    fisheries.review_id,
    publicHealth.review_id,
    fisheries.reviewer_competence_evidence_sha256,
    publicHealth.reviewer_competence_evidence_sha256,
    fisheries.review_evidence_sha256,
    publicHealth.review_evidence_sha256,
    paths.directory,
  ]) {
    assert.equal(publicReceipt.includes(privateValue), false);
  }
});

test("an honest changes-required review remains valid and cannot look complete", async (t) => {
  const fisheries = review(REVIEW_ROLES[0], "fisheries", {
    disposition: "changes_required",
    blocking_finding_count: 1,
    review_checklist: {
      ...Object.fromEntries(REVIEW_CHECKS.map((check) => [check, true])),
      activation_gates_are_sufficient_for_this_boundary: false,
    },
  });
  const publicHealth = review(REVIEW_ROLES[1], "public-health");
  const paths = await privatePair(t, fisheries, publicHealth);
  const receipt = await evaluateReviewFiles({
    root,
    fisheriesReviewFile: paths.fisheriesPath,
    publicHealthReviewFile: paths.publicHealthPath,
    expectedSourceCommit: LOCKED_SOURCE_COMMIT,
    now: Date.parse("2026-07-21T19:00:00.000Z"),
  });
  assert.equal(receipt.fisheries_methods_review_accepted, false);
  assert.equal(receipt.public_health_risk_communication_review_accepted, true);
  assert.equal(receipt.independent_policy_review_complete, false);
  assert.equal(receipt.changes_required, true);
  assert.equal(receipt.numeric_score_authorized, false);
});

test("accepted disposition rejects failed checks or blocking findings", () => {
  const failed = review(REVIEW_ROLES[0], "failed", {
    review_checklist: {
      ...Object.fromEntries(REVIEW_CHECKS.map((check) => [check, true])),
      numeric_scoring_remains_disabled: false,
    },
  });
  assert.throws(() => validateReviewRecord(failed, {
    expectedRole: REVIEW_ROLES[0],
    expectedCommit: LOCKED_SOURCE_COMMIT,
    now: Date.parse("2026-07-21T19:00:00.000Z"),
  }), /accepted boundary requires every check/u);
  const noFinding = review(REVIEW_ROLES[0], "no-finding", {
    disposition: "changes_required",
  });
  assert.throws(() => validateReviewRecord(noFinding, {
    expectedRole: REVIEW_ROLES[0],
    expectedCommit: LOCKED_SOURCE_COMMIT,
    now: Date.parse("2026-07-21T19:00:00.000Z"),
  }), /must identify a failed check or blocking finding/u);
});

test("evaluation rejects source drift, reviewer reuse, and swapped roles", async (t) => {
  const fisheries = review(REVIEW_ROLES[0], "fisheries");
  const publicHealth = review(REVIEW_ROLES[1], "public-health", {
    reviewer_competence_evidence_sha256: fisheries.reviewer_competence_evidence_sha256,
  });
  const paths = await privatePair(t, fisheries, publicHealth);
  await assert.rejects(evaluateReviewFiles({
    root,
    fisheriesReviewFile: paths.fisheriesPath,
    publicHealthReviewFile: paths.publicHealthPath,
    expectedSourceCommit: LOCKED_SOURCE_COMMIT,
    now: Date.parse("2026-07-21T19:00:00.000Z"),
  }), /must be distinct/u);
  await assert.rejects(evaluateReviewFiles({
    root,
    fisheriesReviewFile: paths.fisheriesPath,
    publicHealthReviewFile: paths.publicHealthPath,
    expectedSourceCommit: "0".repeat(40),
    now: Date.parse("2026-07-21T19:00:00.000Z"),
  }), /does not match the locked policy source commit/u);
  const swapped = await privatePair(
    t,
    review(REVIEW_ROLES[1], "swapped-one"),
    review(REVIEW_ROLES[0], "swapped-two"),
  );
  await assert.rejects(evaluateReviewFiles({
    root,
    fisheriesReviewFile: swapped.fisheriesPath,
    publicHealthReviewFile: swapped.publicHealthPath,
    expectedSourceCommit: LOCKED_SOURCE_COMMIT,
    now: Date.parse("2026-07-21T19:00:00.000Z"),
  }), /role is invalid/u);
});

test("private review files reject repository paths, permissive modes, and symlinks", async (t) => {
  const fisheries = review(REVIEW_ROLES[0], "fisheries");
  const publicHealth = review(REVIEW_ROLES[1], "public-health");
  const paths = await privatePair(t, fisheries, publicHealth);
  await chmod(paths.fisheriesPath, 0o644);
  await assert.rejects(evaluateReviewFiles({
    root,
    fisheriesReviewFile: paths.fisheriesPath,
    publicHealthReviewFile: paths.publicHealthPath,
    expectedSourceCommit: LOCKED_SOURCE_COMMIT,
    now: Date.parse("2026-07-21T19:00:00.000Z"),
  }), /must not grant group or other permissions/u);
  await chmod(paths.fisheriesPath, 0o600);
  const linkPath = join(paths.directory, "fisheries-link.json");
  await symlink(paths.fisheriesPath, linkPath);
  await assert.rejects(evaluateReviewFiles({
    root,
    fisheriesReviewFile: linkPath,
    publicHealthReviewFile: paths.publicHealthPath,
    expectedSourceCommit: LOCKED_SOURCE_COMMIT,
    now: Date.parse("2026-07-21T19:00:00.000Z"),
  }), /regular non-symlink file/u);
});

test("private template writer creates canonical owner-only pollution records without overwrite", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-pollution-review-template-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await chmod(directory, 0o700);
  const outputFile = join(directory, "fisheries-review.json");
  const receipt = await writeReviewTemplate({
    root,
    role: REVIEW_ROLES[0],
    outputFile,
    now: Date.parse("2026-07-21T22:00:00.000Z"),
  });
  const metadata = await lstat(outputFile);
  const source = await readFile(outputFile, "utf8");
  const payload = JSON.parse(source);
  assert.equal(metadata.isFile(), true);
  assert.equal(metadata.isSymbolicLink(), false);
  assert.equal(metadata.nlink, 1);
  assert.equal(metadata.mode & 0o777, 0o600);
  assert.equal(source, stableJson(payload));
  assert.equal(payload.reviewer_role, REVIEW_ROLES[0]);
  assert.equal(payload.reviewed_at, "2026-07-21T22:00:00.000Z");
  assert.equal(payload.disposition, "changes_required");
  assert.ok(Object.values(payload.review_checklist).every((value) => value === false));
  assert.equal(receipt.owner_only_file_written, true);
  assert.equal(receipt.existing_file_overwritten, false);
  assert.equal(receipt.runtime_collection_authorized, false);
  assert.equal(receipt.numeric_score_authorized, false);
  assert.equal(receipt.merge_authorized, false);
  assert.equal(receipt.deployment_authorized, false);
  assert.equal(receipt.production_authorized, false);
  await assert.rejects(writeReviewTemplate({
    root,
    role: REVIEW_ROLES[0],
    outputFile,
  }), /must not already exist/u);
  assert.equal(await readFile(outputFile, "utf8"), source);
});

test("private pollution template writer rejects unsafe destination paths", async (t) => {
  await assert.rejects(writeReviewTemplate({
    root,
    role: REVIEW_ROLES[0],
    outputFile: "fisheries-review.json",
  }), /must be absolute/u);
  await assert.rejects(writeReviewTemplate({
    root,
    role: REVIEW_ROLES[0],
    outputFile: join(root, "fisheries-review.json"),
  }), /outside the repository checkout/u);

  const directory = await mkdtemp(join(tmpdir(), "castingcompass-pollution-review-output-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const permissive = join(directory, "permissive");
  await mkdir(permissive, { mode: 0o755 });
  await chmod(permissive, 0o755);
  await assert.rejects(writeReviewTemplate({
    root,
    role: REVIEW_ROLES[0],
    outputFile: join(permissive, "fisheries-review.json"),
  }), /must not grant group or other permissions/u);

  const privateDirectory = join(directory, "private");
  const linkedDirectory = join(directory, "linked");
  await mkdir(privateDirectory, { mode: 0o700 });
  await symlink(privateDirectory, linkedDirectory);
  await assert.rejects(writeReviewTemplate({
    root,
    role: REVIEW_ROLES[0],
    outputFile: join(linkedDirectory, "fisheries-review.json"),
  }), /existing non-symlink directory/u);
});
