import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  BACKUP_KEY_ROLES,
  LOCKED_POLICY_SHA256,
  REVIEW_CHECKS,
  RUNTIME_SECRET_NAMES,
  createKeyCustodyEvidenceTemplate,
  createKeyCustodyReviewTemplate,
  evaluateKeyCustodyReviewRecord,
  loadKeyCustodyEvidenceContract,
  loadKeyCustodyReviewContract,
  loadKeyCustodyReviewPolicy,
  stableJson,
  validateKeyCustodyReviewPolicy,
  verifyKeyCustodyIndependentReview,
  writeKeyCustodyReviewTemplate,
  writeKeyCustodyEvidenceTemplate,
} from "../scripts/verify-key-custody-review.mjs";

const SOURCE_COMMIT = "a".repeat(40);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function privateWrite(path, source) {
  writeFileSync(path, source, { mode: 0o600 });
  chmodSync(path, 0o600);
}

async function fixture() {
  const now = new Date();
  const capturedAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const reviewedAt = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const parent = mkdtempSync(join(tmpdir(), "castingcompass-key-custody-review-test-"));
  chmodSync(parent, 0o700);
  const evidence = {
    schema_version: "castingcompass.key-custody-evidence-manifest/1.0.0",
    source_commit: SOURCE_COMMIT,
    environment: "production",
    captured_at: capturedAt,
    runtime_secret_names: [...RUNTIME_SECRET_NAMES],
    backup_key_roles: [...BACKUP_KEY_ROLES],
    runtime_inventory_sha256: "1".repeat(64),
    backup_custody_inventory_sha256: "2".repeat(64),
    access_and_mfa_review_sha256: "3".repeat(64),
    rotation_recovery_exercise_sha256: "4".repeat(64),
    restore_deletion_replay_sha256: "5".repeat(64),
    redaction_test_sha256: "6".repeat(64),
    secret_values_captured: false,
  };
  const evidenceSource = stableJson(evidence);
  const evidenceFile = join(parent, "key-custody-evidence.json");
  privateWrite(evidenceFile, evidenceSource);
  const review = {
    schema_version: "castingcompass.key-custody-independent-review/1.0.0",
    review_id: "123e4567-e89b-42d3-a456-426614174000",
    source_commit: SOURCE_COMMIT,
    policy_sha256: LOCKED_POLICY_SHA256,
    reviewed_at: reviewedAt,
    reviewer_role: "independent_cryptography_and_key_custody_reviewer",
    reviewer_independent_of_operator: true,
    reviewer_competence_evidence_sha256: "7".repeat(64),
    custody_evidence_sha256: sha256(evidenceSource),
    review_evidence_sha256: "8".repeat(64),
    secret_material_in_review_record: false,
    disposition: "accepted_evidence_boundary",
    blocking_finding_count: 0,
    review_checklist: Object.fromEntries(REVIEW_CHECKS.map((name) => [name, true])),
  };
  const reviewFile = join(parent, "independent-review.json");
  privateWrite(reviewFile, stableJson(review));
  return { parent, now, evidence, evidenceSource, evidenceFile, review, reviewFile };
}

test("the key-custody policy, evidence contract, review contract, and workflow gates are exact", async () => {
  const policy = await loadKeyCustodyReviewPolicy();
  await loadKeyCustodyEvidenceContract();
  await loadKeyCustodyReviewContract();
  assert.deepEqual(policy.runtime_secret_names, RUNTIME_SECRET_NAMES);
  assert.deepEqual(policy.backup_key_roles, BACKUP_KEY_ROLES);
  assert.deepEqual(policy.required_review_checks, REVIEW_CHECKS);
  assert.equal(policy.authority.production_key_custody_approved, false);
  const weakened = structuredClone(policy);
  weakened.authority.production_key_custody_approved = true;
  assert.throws(() => validateKeyCustodyReviewPolicy(weakened), /must not grant production authority/u);

  const manifest = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const release = readFileSync(new URL("../.github/workflows/release-provenance.yml", import.meta.url), "utf8");
  assert.match(manifest, /"security:key-custody-review": "node scripts\/verify-key-custody-review\.mjs verify-policy"/u);
  assert.match(manifest, /"write:key-custody-review-template": "node scripts\/verify-key-custody-review\.mjs write-template"/u);
  assert.match(manifest, /"write:key-custody-evidence-template": "node scripts\/verify-key-custody-review\.mjs write-evidence-template"/u);
  assert.match(manifest, /"verify:key-custody-review": "node scripts\/verify-key-custody-review\.mjs evaluate/u);
  assert.match(ci, /npm run security:operational-restore-review\n\s+- run: npm run security:key-custody-review/u);
  assert.match(release, /npm run security:operational-restore-review\n\s+- run: npm run security:key-custody-review/u);
});

test("the packet-derived template binds exact evidence while remaining unfilled and non-authorizing", async () => {
  const value = await fixture();
  try {
    const policy = await loadKeyCustodyReviewPolicy();
    const validateEvidenceContract = await loadKeyCustodyEvidenceContract();
    const evidenceTemplate = createKeyCustodyEvidenceTemplate(policy, {
      expectedSourceCommit: SOURCE_COMMIT,
    });
    assert.equal(evidenceTemplate.source_commit, SOURCE_COMMIT);
    assert.equal(evidenceTemplate.captured_at, "");
    assert.equal(evidenceTemplate.secret_values_captured, false);
    assert.equal(evidenceTemplate.runtime_inventory_sha256, "");
    const template = createKeyCustodyReviewTemplate(policy, {
      expectedSourceCommit: SOURCE_COMMIT,
      evidenceSource: value.evidenceSource,
      validateEvidenceContract,
      now: value.now,
    });
    assert.equal(template.source_commit, SOURCE_COMMIT);
    assert.equal(template.custody_evidence_sha256, sha256(value.evidenceSource));
    assert.equal(template.review_id, "");
    assert.equal(template.reviewed_at, "");
    assert.equal(template.reviewer_independent_of_operator, false);
    assert.equal(template.secret_material_in_review_record, false);
    assert.equal(template.disposition, "changes_required");
    assert.equal(Object.values(template.review_checklist).every((result) => result === false), true);
  } finally {
    rmSync(value.parent, { recursive: true, force: true });
  }
});

test("the guarded writer creates one hash-bound owner-only file and never overwrites", async () => {
  const value = await fixture();
  try {
    const outputFile = join(value.parent, "unfilled-independent-review.json");
    const evidenceTemplateFile = join(value.parent, "unfilled-evidence.json");
    const evidenceReceipt = await writeKeyCustodyEvidenceTemplate({
      outputFile: evidenceTemplateFile,
      expectedSourceCommit: SOURCE_COMMIT,
    });
    assert.equal(lstatSync(evidenceTemplateFile).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(evidenceTemplateFile, "utf8")).captured_at, "");
    assert.equal(evidenceReceipt.production_evidence_accepted, false);
    assert.equal(evidenceReceipt.production_key_custody_approved, false);
    const evidenceTemplateBytes = readFileSync(evidenceTemplateFile);
    await assert.rejects(writeKeyCustodyEvidenceTemplate({
      outputFile: evidenceTemplateFile,
      expectedSourceCommit: SOURCE_COMMIT,
    }), /must not already exist/u);
    assert.deepEqual(readFileSync(evidenceTemplateFile), evidenceTemplateBytes);
    const receipt = await writeKeyCustodyReviewTemplate({
      evidenceFile: value.evidenceFile,
      outputFile,
      expectedSourceCommit: SOURCE_COMMIT,
    });
    const original = readFileSync(outputFile);
    const template = JSON.parse(original.toString("utf8"));
    const metadata = lstatSync(outputFile);
    assert.equal(metadata.mode & 0o777, 0o600);
    assert.equal(metadata.nlink, 1);
    assert.equal(template.custody_evidence_sha256, sha256(value.evidenceSource));
    assert.equal(receipt.owner_only_file_written, true);
    assert.equal(receipt.existing_file_overwritten, false);
    assert.equal(receipt.independent_review_record_accepted, false);
    assert.equal(receipt.production_key_custody_approved, false);
    assert.equal(receipt.production_release_authorized, false);
    assert.equal(JSON.stringify(receipt).includes(value.parent), false);
    assert.equal(JSON.stringify(receipt).includes(template.custody_evidence_sha256), false);

    await assert.rejects(writeKeyCustodyReviewTemplate({
      evidenceFile: value.evidenceFile,
      outputFile,
      expectedSourceCommit: SOURCE_COMMIT,
    }), /must not already exist/u);
    assert.deepEqual(readFileSync(outputFile), original);
  } finally {
    rmSync(value.parent, { recursive: true, force: true });
  }
});

test("a current accepted review yields only a minimized non-authorizing receipt", async () => {
  const value = await fixture();
  try {
    const receipt = await verifyKeyCustodyIndependentReview({
      evidenceFile: value.evidenceFile,
      reviewFile: value.reviewFile,
      expectedSourceCommit: SOURCE_COMMIT,
      now: value.now,
    });
    assert.deepEqual(receipt, {
      schema_version: "castingcompass.key-custody-independent-review-receipt/1.0.0",
      scope: "production-key-custody-evidence",
      source_commit: SOURCE_COMMIT,
      disposition: "accepted_evidence_boundary",
      independent_review_record_accepted: true,
      verified_runtime_secret_role_count: 7,
      verified_backup_key_role_count: 4,
      verified_review_check_count: 15,
      production_key_custody_approved: false,
      production_restore_gate_passed: false,
      production_release_authorized: false,
      remaining_approvals: [
        "production-provider-identity-and-binding-evidence",
        "production-change-authorization",
        "current-production-restore-and-deletion-ledger-evidence",
        "deployment-and-live-smoke-evidence",
      ],
    });
    const serialized = JSON.stringify(receipt);
    for (const field of [
      "review_id",
      "reviewer_competence_evidence_sha256",
      "custody_evidence_sha256",
      "review_evidence_sha256",
    ]) assert.doesNotMatch(serialized, new RegExp(field, "u"));
  } finally {
    rmSync(value.parent, { recursive: true, force: true });
  }
});

test("evidence, review, chronology, source, and acceptance mutations fail closed", async () => {
  const value = await fixture();
  const policy = await loadKeyCustodyReviewPolicy();
  const validateContract = await loadKeyCustodyReviewContract();
  const validateEvidenceContract = await loadKeyCustodyEvidenceContract();
  const evaluate = (review = value.review, evidence = value.evidence, options = {}) => (
    evaluateKeyCustodyReviewRecord(review, policy, {
      expectedSourceCommit: SOURCE_COMMIT,
      evidenceSource: stableJson(evidence),
      validateContract,
      validateEvidenceContract,
      now: value.now,
      ...options,
    })
  );
  try {
    assert.throws(() => evaluate(value.review, value.evidence, {
      expectedSourceCommit: "b".repeat(40),
    }), /source commit/u);

    const reordered = structuredClone(value.evidence);
    reordered.runtime_secret_names.reverse();
    assert.throws(() => evaluate(value.review, reordered), /locked production boundary|schema/u);

    const capturedSecret = structuredClone(value.evidence);
    capturedSecret.secret_values_captured = true;
    assert.throws(() => evaluate(value.review, capturedSecret), /locked production boundary|schema/u);

    const duplicateEvidence = structuredClone(value.evidence);
    duplicateEvidence.redaction_test_sha256 = duplicateEvidence.runtime_inventory_sha256;
    assert.throws(() => evaluate(value.review, duplicateEvidence), /must be distinct/u);

    const reusedPolicyDigest = structuredClone(value.evidence);
    reusedPolicyDigest.redaction_test_sha256 = LOCKED_POLICY_SHA256;
    assert.throws(() => evaluate(value.review, reusedPolicyDigest), /distinct from policy/u);

    const staleEvidence = structuredClone(value.evidence);
    staleEvidence.captured_at = new Date(value.now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
    assert.throws(() => evaluate(value.review, staleEvidence), /outside the accepted window/u);

    const unchecked = structuredClone(value.review);
    unchecked.review_checklist.no_deployment_or_production_authority_granted = false;
    assert.throws(() => evaluate(unchecked), /requires every check/u);

    const blocking = structuredClone(value.review);
    blocking.blocking_finding_count = 1;
    assert.throws(() => evaluate(blocking), /zero blocking findings/u);

    const reusedDigest = structuredClone(value.review);
    reusedDigest.review_evidence_sha256 = reusedDigest.reviewer_competence_evidence_sha256;
    assert.throws(() => evaluate(reusedDigest), /must be distinct/u);

    const reusedPacketDigest = structuredClone(value.review);
    reusedPacketDigest.review_evidence_sha256 = value.evidence.runtime_inventory_sha256;
    assert.throws(() => evaluate(reusedPacketDigest), /distinct from custody packet/u);

    const beforeCapture = structuredClone(value.review);
    beforeCapture.reviewed_at = new Date(
      Date.parse(value.evidence.captured_at) - 1,
    ).toISOString();
    assert.throws(() => evaluate(beforeCapture), /outside the accepted window/u);

    const falselyCompleteChanges = structuredClone(value.review);
    falselyCompleteChanges.disposition = "changes_required";
    assert.throws(() => evaluate(falselyCompleteChanges), /must retain a failed check/u);

    const tamperedEvidence = structuredClone(value.evidence);
    tamperedEvidence.redaction_test_sha256 = "9".repeat(64);
    assert.throws(() => evaluate(value.review, tamperedEvidence), /does not match/u);
  } finally {
    rmSync(value.parent, { recursive: true, force: true });
  }
});

test("private evidence, review, and output paths reject exposure and link tricks", async () => {
  const value = await fixture();
  try {
    chmodSync(value.evidenceFile, 0o644);
    await assert.rejects(verifyKeyCustodyIndependentReview({
      evidenceFile: value.evidenceFile,
      reviewFile: value.reviewFile,
      expectedSourceCommit: SOURCE_COMMIT,
      now: value.now,
    }), /exact permissions/u);
    chmodSync(value.evidenceFile, 0o600);

    chmodSync(value.reviewFile, 0o400);
    await assert.rejects(verifyKeyCustodyIndependentReview({
      evidenceFile: value.evidenceFile,
      reviewFile: value.reviewFile,
      expectedSourceCommit: SOURCE_COMMIT,
      now: value.now,
    }), /exact permissions/u);
    chmodSync(value.reviewFile, 0o600);

    const reviewLink = join(value.parent, "review-link.json");
    symlinkSync(value.reviewFile, reviewLink);
    await assert.rejects(verifyKeyCustodyIndependentReview({
      evidenceFile: value.evidenceFile,
      reviewFile: reviewLink,
      expectedSourceCommit: SOURCE_COMMIT,
      now: value.now,
    }), /symbolic link/u);

    const evidenceHardLink = join(value.parent, "evidence-hard-link.json");
    linkSync(value.evidenceFile, evidenceHardLink);
    await assert.rejects(verifyKeyCustodyIndependentReview({
      evidenceFile: evidenceHardLink,
      reviewFile: value.reviewFile,
      expectedSourceCommit: SOURCE_COMMIT,
      now: value.now,
    }), /link count/u);
    rmSync(evidenceHardLink);

    await assert.rejects(verifyKeyCustodyIndependentReview({
      evidenceFile: value.evidenceFile,
      reviewFile: value.evidenceFile,
      expectedSourceCommit: SOURCE_COMMIT,
      now: value.now,
    }), /must be distinct files/u);

    const emptyEvidence = join(value.parent, "empty-evidence.json");
    privateWrite(emptyEvidence, "");
    await assert.rejects(verifyKeyCustodyIndependentReview({
      evidenceFile: emptyEvidence,
      reviewFile: value.reviewFile,
      expectedSourceCommit: SOURCE_COMMIT,
      now: value.now,
    }), /size is invalid/u);

    const oversizedReview = join(value.parent, "oversized-review.json");
    privateWrite(oversizedReview, "x".repeat(65_537));
    await assert.rejects(verifyKeyCustodyIndependentReview({
      evidenceFile: value.evidenceFile,
      reviewFile: oversizedReview,
      expectedSourceCommit: SOURCE_COMMIT,
      now: value.now,
    }), /size is invalid/u);

    const permissive = join(value.parent, "permissive");
    mkdirSync(permissive, { mode: 0o755 });
    chmodSync(permissive, 0o755);
    await assert.rejects(writeKeyCustodyReviewTemplate({
      evidenceFile: value.evidenceFile,
      outputFile: join(permissive, "review.json"),
      expectedSourceCommit: SOURCE_COMMIT,
    }), /exact permissions/u);

    const linkedDirectory = join(value.parent, "linked-directory");
    const privateDirectory = join(value.parent, "private-directory");
    mkdirSync(privateDirectory, { mode: 0o700 });
    symlinkSync(privateDirectory, linkedDirectory);
    await assert.rejects(writeKeyCustodyReviewTemplate({
      evidenceFile: value.evidenceFile,
      outputFile: join(linkedDirectory, "review.json"),
      expectedSourceCommit: SOURCE_COMMIT,
    }), /non-symlink directory/u);

    await assert.rejects(writeKeyCustodyReviewTemplate({
      evidenceFile: value.evidenceFile,
      outputFile: "relative-review.json",
      expectedSourceCommit: SOURCE_COMMIT,
    }), /must be absolute/u);
    await assert.rejects(writeKeyCustodyReviewTemplate({
      evidenceFile: value.evidenceFile,
      outputFile: fileURLToPath(new URL("../key-custody-review.json", import.meta.url)),
      expectedSourceCommit: SOURCE_COMMIT,
    }), /outside the repository/u);
  } finally {
    rmSync(value.parent, { recursive: true, force: true });
  }
});
