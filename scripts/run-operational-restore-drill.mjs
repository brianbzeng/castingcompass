#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  OPERATIONAL_RESTORE_FIXTURE_PROHIBITED_EVIDENCE_VALUES,
  operationalRestoreCurrentLedgerSql,
  operationalRestoreSnapshotSql,
} from "./operational-restore-fixture.mjs";
import {
  RESTORE_EVIDENCE_VERSION,
  runOperationalRestoreDrill,
  sealOperationalSnapshot,
  sealPrivacyLedger,
  verifyStorageAuditLog,
} from "./validation-storage.mjs";
import { verifyReleaseCheckout } from "./verify-release-checkout.mjs";

export const OFFLINE_RESTORE_ACCEPTANCE_VERSION =
  "castingcompass.offline-operational-restore-acceptance/1.0.0";

const SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const OUTPUT_FILES = Object.freeze({
  evidence: "operational-restore-evidence.json",
  audit: "storage-audit.ndjson",
  acceptance: "acceptance-record.json",
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalTimestamp(value, name) {
  try {
    if (typeof value !== "string" || new Date(value).toISOString() !== value) throw new Error();
  } catch {
    throw new Error(`${name} must be a canonical UTC timestamp`);
  }
  return value;
}

function sourceCommit(value) {
  if (typeof value !== "string" || !SOURCE_COMMIT_PATTERN.test(value)) {
    throw new Error("Source commit must be an exact lowercase 40-character Git SHA");
  }
  return value;
}

function assertRealDirectory(path, name) {
  const metadata = lstatSync(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${name} must be a real directory`);
  }
}

function makePrivateDirectory(path) {
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
  if ((lstatSync(path).mode & 0o077) !== 0) throw new Error(`Could not make ${path} private`);
}

function privateWrite(path, value) {
  writeFileSync(path, value, { flag: "wx", mode: 0o600 });
  if ((lstatSync(path).mode & 0o077) !== 0) throw new Error(`Could not make ${path} private`);
}

function assertAggregateOnly(serialized, name) {
  for (const prohibited of OPERATIONAL_RESTORE_FIXTURE_PROHIBITED_EVIDENCE_VALUES) {
    if (serialized.includes(prohibited)) throw new Error(`${name} contains a private fixture value`);
  }
}

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`Offline restore acceptance failed: ${message}`);
}

async function expectRejected(operation, pattern, name) {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (pattern.test(message)) return true;
    throw new Error(`${name} failed for an unexpected reason: ${message}`);
  }
  throw new Error(`${name} unexpectedly succeeded`);
}

function restoreInput({
  activationId,
  snapshotArtifactPath,
  snapshotManifestPath,
  snapshotKeyPath,
  ledgerArtifactPath,
  ledgerManifestPath,
  ledgerKeyPath,
  auditPath,
  workParent,
  evidencePath,
  completedAt,
}) {
  return {
    activationId,
    snapshotArtifactPath,
    snapshotManifestPath,
    snapshotKeyPath,
    ledgerArtifactPath,
    ledgerManifestPath,
    ledgerKeyPath,
    auditPath,
    workParent,
    evidencePath,
    completedAt,
    operatorRole: "data-steward",
    destroyRestored: true,
  };
}

export async function runOfflineOperationalRestoreDrill({
  outputDirectory,
  sourceCommit: requestedSourceCommit,
  completedAt: requestedCompletedAt = new Date().toISOString(),
  checkoutVerifier = verifyReleaseCheckout,
}) {
  const commit = sourceCommit(requestedSourceCommit);
  const completedAt = canonicalTimestamp(requestedCompletedAt, "Completion time");
  const checkout = await checkoutVerifier({ expectedCommit: commit });
  requireEvidence(
    checkout?.head === commit && checkout?.expectedCommit === commit && checkout?.clean === true,
    "source checkout was not verified clean at the exact commit",
  );
  const completedMilliseconds = new Date(completedAt).getTime();
  const snapshotCreatedAt = new Date(completedMilliseconds - 120_000).toISOString();
  const ledgerCreatedAt = new Date(completedMilliseconds - 60_000).toISOString();
  const deletionRequestedAt = new Date(completedMilliseconds - 3_600_000).toISOString();
  const output = resolve(outputDirectory);
  assertRealDirectory(dirname(output), "Output parent");
  if (existsSync(output)) throw new Error("Output directory must not already exist");

  let outputCreated = false;
  try {
    makePrivateDirectory(output);
    outputCreated = true;
    const sensitive = join(output, ".sensitive-fixture");
    const restoreWork = join(sensitive, "restore-work");
    makePrivateDirectory(sensitive);
    makePrivateDirectory(restoreWork);

    const suffix = randomBytes(8).toString("hex");
    const activationId = `offline-restore-drill-${suffix}`;
    const snapshotInput = join(sensitive, "snapshot.sql");
    const ledgerInput = join(sensitive, "current-ledger.sql");
    const snapshotKeyPath = join(sensitive, "snapshot.key");
    const ledgerKeyPath = join(sensitive, "ledger.key");
    const wrongKeyPath = join(sensitive, "wrong.key");
    const snapshotArtifactPath = join(sensitive, "snapshot.ccv2");
    const snapshotManifestPath = join(sensitive, "snapshot.manifest.json");
    const ledgerArtifactPath = join(sensitive, "ledger.ccv2");
    const ledgerManifestPath = join(sensitive, "ledger.manifest.json");
    const auditPath = join(sensitive, OUTPUT_FILES.audit);
    const evidencePath = join(sensitive, OUTPUT_FILES.evidence);
    const failedEvidencePath = join(sensitive, "failed-evidence.json");

    privateWrite(snapshotInput, operationalRestoreSnapshotSql({ activationId }));
    privateWrite(ledgerInput, operationalRestoreCurrentLedgerSql({ requestedAt: deletionRequestedAt }));
    privateWrite(snapshotKeyPath, randomBytes(32));
    privateWrite(ledgerKeyPath, randomBytes(32));
    privateWrite(wrongKeyPath, randomBytes(32));

    sealOperationalSnapshot({
      inputPath: snapshotInput,
      artifactPath: snapshotArtifactPath,
      manifestPath: snapshotManifestPath,
      keyPath: snapshotKeyPath,
      keyId: `offline-snapshot-${suffix}`,
      activationId,
      createdAt: snapshotCreatedAt,
      auditPath,
      operatorRole: "data-steward",
      destroyPlaintext: true,
    });
    sealPrivacyLedger({
      inputPath: ledgerInput,
      artifactPath: ledgerArtifactPath,
      manifestPath: ledgerManifestPath,
      keyPath: ledgerKeyPath,
      keyId: `offline-ledger-${suffix}`,
      activationId,
      createdAt: ledgerCreatedAt,
      auditPath,
      operatorRole: "privacy-reviewer",
      destroyPlaintext: true,
    });
    requireEvidence(!existsSync(snapshotInput) && !existsSync(ledgerInput), "plaintext sources survived sealing");

    const originalArtifact = readFileSync(snapshotArtifactPath);
    const tamperedArtifact = Buffer.from(originalArtifact);
    tamperedArtifact[tamperedArtifact.length - 1] ^= 1;
    writeFileSync(snapshotArtifactPath, tamperedArtifact);
    tamperedArtifact.fill(0);
    const commonRestoreInput = {
      activationId,
      snapshotManifestPath,
      snapshotKeyPath,
      ledgerArtifactPath,
      ledgerManifestPath,
      ledgerKeyPath,
      auditPath,
      workParent: restoreWork,
      evidencePath: failedEvidencePath,
      completedAt,
    };
    let tamperedArtifactRejected;
    try {
      tamperedArtifactRejected = await expectRejected(
        () => runOperationalRestoreDrill(restoreInput({
          ...commonRestoreInput,
          snapshotArtifactPath,
        })),
        /checksum does not match/u,
        "Tampered-artifact check",
      );
    } finally {
      writeFileSync(snapshotArtifactPath, originalArtifact);
      originalArtifact.fill(0);
    }
    const wrongKeyRejected = await expectRejected(
      () => runOperationalRestoreDrill(restoreInput({
        ...commonRestoreInput,
        snapshotArtifactPath,
        snapshotKeyPath: wrongKeyPath,
      })),
      /authentication failed/u,
      "Wrong-key check",
    );
    requireEvidence(!existsSync(failedEvidencePath), "a failed drill wrote acceptance evidence");

    const evidence = await runOperationalRestoreDrill(restoreInput({
      ...commonRestoreInput,
      snapshotArtifactPath,
      evidencePath,
    }));
    requireEvidence(evidence.schema_version === RESTORE_EVIDENCE_VERSION, "evidence schema mismatch");
    requireEvidence(evidence.operational_restore_passed === true, "restore did not pass");
    requireEvidence(evidence.integrity_check === "ok", "SQLite integrity check did not pass");
    requireEvidence(evidence.foreign_key_violation_count === 0, "foreign-key violations remain");
    requireEvidence(evidence.suppressed_account_count === 1, "deleted account was not suppressed");
    requireEvidence(evidence.suppressed_trip_count === 1, "deleted trip was not suppressed");
    requireEvidence(
      evidence.suppressed_public_discussion_count === 1,
      "deleted public discussion was not suppressed",
    );
    requireEvidence(evidence.suppressed_validation_event_count === 2, "validation events survived suppression");
    requireEvidence(
      evidence.suppressed_validation_correction_count === 1,
      "validation correction survived suppression",
    );
    requireEvidence(
      evidence.suppressed_validation_recruitment_count === 1,
      "validation recruitment survived suppression",
    );
    requireEvidence(evidence.privacy_job_count === 1, "current privacy job was not preserved");
    requireEvidence(evidence.privacy_task_count === 2, "current privacy tasks were not preserved");
    requireEvidence(evidence.unresolved_object_task_count === 1, "pending object task was not preserved");
    requireEvidence(evidence.completed_object_task_count === 1, "completed object task was not preserved");
    requireEvidence(evidence.candidate_performance_computed === false, "candidate performance was computed");
    requireEvidence(evidence.plaintext_artifacts_retained === false, "evidence claims plaintext retention");
    requireEvidence(evidence.restored_database_retained === false, "evidence claims restored DB retention");
    requireEvidence(readdirSync(restoreWork).length === 0, "restore work directory is not empty");

    const audit = verifyStorageAuditLog(auditPath);
    requireEvidence(
      JSON.stringify(audit.map((event) => event.event_type)) ===
        JSON.stringify(["snapshot_sealed", "privacy_ledger_sealed", "restore_drill_completed"]),
      "storage audit event sequence mismatch",
    );
    const evidenceBytes = readFileSync(evidencePath);
    const auditBytes = readFileSync(auditPath);
    assertAggregateOnly(evidenceBytes.toString("utf8"), "Restore evidence");
    assertAggregateOnly(auditBytes.toString("utf8"), "Storage audit");

    rmSync(sensitive, { recursive: true, force: true });
    requireEvidence(!existsSync(sensitive), "sensitive fixture directory survived cleanup");

    privateWrite(join(output, OUTPUT_FILES.evidence), evidenceBytes);
    privateWrite(join(output, OUTPUT_FILES.audit), auditBytes);
    const acceptance = {
      schema_version: OFFLINE_RESTORE_ACCEPTANCE_VERSION,
      scope: "synthetic-production-shaped-non-production",
      source_commit: commit,
      drill_completed_at: completedAt,
      runtime: {
        node: process.version,
        sqlite: process.versions.sqlite ?? null,
        platform: process.platform,
        architecture: process.arch,
      },
      receipts: {
        restore_evidence_file: OUTPUT_FILES.evidence,
        restore_evidence_sha256: sha256(evidenceBytes),
        restore_evidence_payload_sha256: evidence.evidence_payload_sha256,
        storage_audit_file: OUTPUT_FILES.audit,
        storage_audit_sha256: sha256(auditBytes),
        storage_audit_head_sha256: audit.at(-1).event_sha256,
      },
      acceptance_checks: {
        operational_restore_passed: true,
        sqlite_integrity_passed: true,
        foreign_key_check_passed: true,
        current_deletion_ledger_replayed: true,
        deleted_account_suppressed: true,
        deleted_trip_suppressed: true,
        deleted_public_discussion_suppressed: true,
        pending_object_task_preserved: true,
        completed_object_task_preserved: true,
        tampered_artifact_rejected: tamperedArtifactRejected,
        wrong_key_rejected: wrongKeyRejected,
        plaintext_sources_destroyed: true,
        restored_database_destroyed: true,
        temporary_keys_destroyed: true,
        encrypted_fixture_artifacts_destroyed: true,
        aggregate_only_evidence: true,
        source_checkout_verified_clean: true,
      },
      boundaries: {
        production_data_used: false,
        production_provider_accessed: false,
        production_backup_restored: false,
        production_privacy_ledger_used: false,
        production_key_custody_approved: false,
        second_person_reviewed: false,
        production_restore_gate_passed: false,
        validation_snapshot_governance_approved: false,
      },
      remaining_approvals: [
        "independent-second-person-review",
        "production-key-custody-policy",
        "provider-and-production-release-evidence",
        "validation-snapshot-governance",
      ],
    };
    const acceptanceBytes = Buffer.from(`${JSON.stringify(acceptance)}\n`, "utf8");
    assertAggregateOnly(acceptanceBytes.toString("utf8"), "Acceptance record");
    privateWrite(join(output, OUTPUT_FILES.acceptance), acceptanceBytes);
    requireEvidence(
      JSON.stringify(readdirSync(output).sort()) === JSON.stringify(Object.values(OUTPUT_FILES).sort()),
      "output contains unexpected files",
    );
    return { acceptance, outputDirectory: output };
  } catch (error) {
    if (outputCreated) rmSync(output, { recursive: true, force: true });
    throw error;
  }
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
    values.set(argument.slice(2), value);
    index += 1;
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

async function main() {
  const argumentsByName = parseArguments(process.argv.slice(2));
  const result = await runOfflineOperationalRestoreDrill({
    outputDirectory: required(argumentsByName, "output-directory"),
    sourceCommit: required(argumentsByName, "source-commit"),
  });
  process.stdout.write(`${JSON.stringify({
    scope: result.acceptance.scope,
    sourceCommit: result.acceptance.source_commit,
    operationalRestorePassed: result.acceptance.acceptance_checks.operational_restore_passed,
    secondPersonReviewed: result.acceptance.boundaries.second_person_reviewed,
    productionRestoreGatePassed: result.acceptance.boundaries.production_restore_gate_passed,
    evidenceSha256: result.acceptance.receipts.restore_evidence_sha256,
    auditHeadSha256: result.acceptance.receipts.storage_audit_head_sha256,
    outputDirectory: result.outputDirectory,
  })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
