import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  OFFLINE_RESTORE_ACCEPTANCE_VERSION,
  runOfflineOperationalRestoreDrill,
} from "../scripts/run-operational-restore-drill.mjs";
import {
  OPERATIONAL_RESTORE_FIXTURE_PROHIBITED_EVIDENCE_VALUES,
} from "../scripts/operational-restore-fixture.mjs";
import {
  RESTORE_EVIDENCE_VERSION,
  verifyStorageAuditLog,
} from "../scripts/validation-storage.mjs";

test("offline restore runner preserves only aggregate acceptance evidence", async () => {
  const parent = mkdtempSync(join(tmpdir(), "castingcompass-offline-restore-test-"));
  chmodSync(parent, 0o700);
  const outputDirectory = join(parent, "evidence");
  const checkoutVerifier = async ({ expectedCommit }) => ({
    head: expectedCommit,
    expectedCommit,
    clean: true,
  });
  try {
    const result = await runOfflineOperationalRestoreDrill({
      outputDirectory,
      sourceCommit: "c".repeat(40),
      completedAt: "2026-07-18T12:00:00.000Z",
      checkoutVerifier,
    });
    assert.equal(result.outputDirectory, outputDirectory);
    assert.equal(result.acceptance.schema_version, OFFLINE_RESTORE_ACCEPTANCE_VERSION);
    assert.equal(result.acceptance.scope, "synthetic-production-shaped-non-production");
    assert.equal(result.acceptance.acceptance_checks.operational_restore_passed, true);
    assert.equal(result.acceptance.acceptance_checks.current_deletion_ledger_replayed, true);
    assert.equal(result.acceptance.acceptance_checks.pending_object_task_preserved, true);
    assert.equal(result.acceptance.acceptance_checks.completed_object_task_preserved, true);
    assert.equal(result.acceptance.acceptance_checks.tampered_artifact_rejected, true);
    assert.equal(result.acceptance.acceptance_checks.wrong_key_rejected, true);
    assert.equal(result.acceptance.acceptance_checks.source_checkout_verified_clean, true);
    assert.equal(result.acceptance.boundaries.production_data_used, false);
    assert.equal(result.acceptance.boundaries.production_provider_accessed, false);
    assert.equal(result.acceptance.boundaries.production_key_custody_approved, false);
    assert.equal(result.acceptance.boundaries.second_person_reviewed, false);
    assert.equal(result.acceptance.boundaries.production_restore_gate_passed, false);

    const expectedFiles = [
      "acceptance-record.json",
      "operational-restore-evidence.json",
      "storage-audit.ndjson",
    ];
    assert.deepEqual(readdirSync(outputDirectory).sort(), expectedFiles);
    assert.equal(statSync(outputDirectory).mode & 0o077, 0);
    for (const file of expectedFiles) assert.equal(statSync(join(outputDirectory, file)).mode & 0o077, 0);

    const evidence = JSON.parse(readFileSync(join(outputDirectory, "operational-restore-evidence.json"), "utf8"));
    assert.equal(evidence.schema_version, RESTORE_EVIDENCE_VERSION);
    assert.equal(evidence.operational_restore_passed, true);
    assert.equal(evidence.suppressed_account_count, 1);
    assert.equal(evidence.suppressed_trip_count, 1);
    assert.equal(evidence.suppressed_public_discussion_count, 1);
    assert.equal(evidence.unresolved_object_task_count, 1);
    assert.equal(evidence.completed_object_task_count, 1);
    const audit = verifyStorageAuditLog(join(outputDirectory, "storage-audit.ndjson"));
    assert.deepEqual(audit.map((event) => event.event_type), [
      "snapshot_sealed",
      "privacy_ledger_sealed",
      "restore_drill_completed",
    ]);

    const serializedOutput = expectedFiles
      .map((file) => readFileSync(join(outputDirectory, file), "utf8"))
      .join("\n");
    for (const prohibited of OPERATIONAL_RESTORE_FIXTURE_PROHIBITED_EVIDENCE_VALUES) {
      assert.doesNotMatch(serializedOutput, new RegExp(prohibited));
    }

    await assert.rejects(runOfflineOperationalRestoreDrill({
      outputDirectory,
      sourceCommit: "c".repeat(40),
      completedAt: "2026-07-18T12:00:00.000Z",
      checkoutVerifier,
    }), /must not already exist/u);
    assert.deepEqual(readdirSync(outputDirectory).sort(), expectedFiles);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
