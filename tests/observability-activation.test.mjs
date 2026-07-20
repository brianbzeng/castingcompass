import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ObservabilityActivationRefusal,
  assertPublicReceipt,
  evaluateEvidence,
  loadPolicy,
  validatePolicy,
} from "../scripts/verify-observability-activation.mjs";

const NOW = new Date("2026-07-19T20:00:00.000Z");
const EXPECTED_COMMIT = "a".repeat(40);
const DIGESTS = Array.from({ length: 12 }, (_, index) => (
  index.toString(16).padStart(2, "0").repeat(32)
));

function completeEvidence() {
  const policy = loadPolicy();
  return {
    schema_version: "castingcompass.observability-activation-evidence/1.0.0",
    observed_at: "2026-07-19T19:00:00.000Z",
    evidence_packet_sha256: DIGESTS[0],
    release_binding: {
      reviewed_commit: EXPECTED_COMMIT,
      preview_evidence_sha256: DIGESTS[1],
      production_evidence_sha256: DIGESTS[2],
      preview_matches_reviewed_commit: true,
      production_matches_reviewed_commit: true,
    },
    log_hygiene: {
      preview_evidence_sha256: DIGESTS[3],
      production_evidence_sha256: DIGESTS[4],
      preview_structured_only: true,
      production_structured_only: true,
      preview_raw_invocation_absent: true,
      production_raw_invocation_absent: true,
    },
    dashboards: {
      evidence_sha256: DIGESTS[5],
      saved_views: [...policy.required_saved_views],
    },
    access: {
      evidence_sha256: DIGESTS[6],
      mfa_enforced: true,
      least_privilege_role: true,
      access_review_completed: true,
    },
    retention_and_cost: {
      evidence_sha256: DIGESTS[7],
      plan_recorded: true,
      retention_days: 7,
      sampling_percent: 100,
      estimated_daily_events: 1000,
      estimated_monthly_events: 30000,
      monthly_cost_ceiling_usd: 50,
      owner_assigned: true,
    },
    alerts: {
      evidence_sha256: DIGESTS[8],
      drills: policy.required_alert_drills.map((name) => ({
        name,
        delivered: true,
        acknowledged: true,
        closed: true,
        redaction_tested: true,
      })),
    },
    uptime: {
      evidence_sha256: DIGESTS[9],
      checks: policy.required_uptime_checks.map((name) => ({
        name,
        configured: true,
        delivered: true,
        acknowledged: true,
      })),
    },
    reconstruction: {
      evidence_sha256: DIGESTS[10],
      drills: policy.required_reconstruction_drills.map((name) => ({
        name,
        completed: true,
        structured_only: true,
        redaction_passed: true,
      })),
    },
    pseudonym_key: {
      evidence_sha256: DIGESTS[11],
      distinct_from_session_secret: true,
      access_separated: true,
      rotation_owner_assigned: true,
    },
    posthog: { enabled: false, separate_approval_recorded: false },
    production_change_authorized: false,
  };
}

function evaluate(evidence, options = {}) {
  return evaluateEvidence(evidence, loadPolicy(), {
    now: NOW,
    expectedCommit: EXPECTED_COMMIT,
    ...options,
  });
}

test("the locked policy names every dashboard, alert, uptime, and reconstruction gate", () => {
  const policy = loadPolicy();
  assert.equal(policy.required_saved_views.length, 9);
  assert.equal(policy.required_alert_drills.length, 5);
  assert.equal(policy.required_uptime_checks.length, 3);
  assert.equal(policy.required_reconstruction_drills.length, 6);
  assert.equal(policy.limits.maximum_evidence_age_hours, 72);

  const weakened = structuredClone(policy);
  weakened.required_alert_drills.pop();
  assert.throws(() => validatePolicy(weakened), /locked policy/u);
});

test("complete fresh evidence produces a data-minimized commit-bound ready receipt", () => {
  const evidence = completeEvidence();
  const receipt = evaluate(evidence);
  assert.equal(receipt.activation_ready, true);
  assert.equal(receipt.reviewed_commit, EXPECTED_COMMIT);
  assert.equal(receipt.read_only, true);
  assert.equal(receipt.provider_query_performed, false);
  assert.equal(receipt.production_change_authorized, false);
  assert.deepEqual(receipt.blockers, []);
  assert.equal(Object.values(receipt.checks).every(Boolean), true);

  const publicJson = JSON.stringify(receipt);
  assert.equal(publicJson.includes(EXPECTED_COMMIT), true);
  for (const privateValue of [
    evidence.evidence_packet_sha256,
    ...DIGESTS.slice(1),
    ...evidence.dashboards.saved_views,
  ]) {
    assert.equal(publicJson.includes(privateValue), false);
  }
});

test("a dashboard cannot substitute for access, alerts, retention, or incident evidence", () => {
  const evidence = completeEvidence();
  evidence.access.mfa_enforced = false;
  evidence.alerts.drills[0].delivered = false;
  evidence.retention_and_cost.owner_assigned = false;
  evidence.reconstruction.drills[0].redaction_passed = false;
  const receipt = evaluate(evidence);
  assert.equal(receipt.checks.dashboards, true);
  assert.equal(receipt.activation_ready, false);
  assert.deepEqual(receipt.blockers, [
    "access-evidence-missing",
    "alert-drill-evidence-missing",
    "reconstruction-evidence-missing",
    "retention-cost-evidence-missing",
  ]);
});

test("expired and future-dated evidence fail closed", () => {
  const expired = completeEvidence();
  expired.observed_at = "2026-07-15T00:00:00.000Z";
  assert.deepEqual(evaluate(expired).blockers,
    ["evidence-expired"]);

  const future = completeEvidence();
  future.observed_at = "2026-07-19T20:06:00.000Z";
  assert.deepEqual(evaluate(future).blockers,
    ["evidence-not-yet-valid"]);
});

test("the reviewed commit is independently required, matched, and disclosed", () => {
  assert.throws(
    () => evaluateEvidence(completeEvidence(), loadPolicy(), null),
    (error) => error instanceof ObservabilityActivationRefusal
      && error.code === "evaluation-invalid",
  );
  assert.throws(
    () => evaluate(completeEvidence(), { untrustedOption: true }),
    (error) => error instanceof ObservabilityActivationRefusal
      && error.code === "evaluation-invalid",
  );
  assert.throws(
    () => evaluateEvidence(completeEvidence(), loadPolicy(), { now: NOW }),
    (error) => error instanceof ObservabilityActivationRefusal
      && error.code === "evaluation-invalid",
  );
  assert.throws(
    () => evaluate(completeEvidence(), { expectedCommit: "A".repeat(40) }),
    (error) => error instanceof ObservabilityActivationRefusal
      && error.code === "evaluation-invalid",
  );
  assert.throws(
    () => evaluate(completeEvidence(), { expectedCommit: "b".repeat(40) }),
    (error) => error instanceof ObservabilityActivationRefusal
      && error.code === "release-binding-mismatch",
  );
});

test("the CLI requires an external expected commit and emits its exact binding", () => {
  const directory = mkdtempSync(join(tmpdir(), "castingcompass-observability-"));
  const evidencePath = join(directory, "evidence.json");
  const scriptPath = fileURLToPath(new URL(
    "../scripts/verify-observability-activation.mjs", import.meta.url,
  ));
  try {
    const evidence = completeEvidence();
    evidence.observed_at = new Date().toISOString();
    writeFileSync(evidencePath, `${JSON.stringify(evidence)}\n`, { mode: 0o600 });
    chmodSync(evidencePath, 0o600);

    const success = spawnSync(process.execPath, [
      scriptPath,
      "evaluate",
      "--evidence-file",
      evidencePath,
      "--expected-commit",
      EXPECTED_COMMIT,
    ], { encoding: "utf8" });
    assert.equal(success.status, 0, success.stderr);
    assert.equal(JSON.parse(success.stdout).reviewed_commit, EXPECTED_COMMIT);

    const mismatch = spawnSync(process.execPath, [
      scriptPath,
      "evaluate",
      "--evidence-file",
      evidencePath,
      "--expected-commit",
      "b".repeat(40),
    ], { encoding: "utf8" });
    assert.equal(mismatch.status, 1);
    assert.match(mismatch.stderr, /release-binding-mismatch/u);

    const missing = spawnSync(process.execPath, [
      scriptPath,
      "evaluate",
      "--evidence-file",
      evidencePath,
    ], { encoding: "utf8" });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /usage-invalid/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("PostHog and production authorization remain separate fail-closed boundaries", () => {
  const posthog = completeEvidence();
  posthog.posthog.enabled = true;
  assert.deepEqual(evaluate(posthog).blockers,
    ["posthog-policy-violated"]);

  const authorization = completeEvidence();
  authorization.production_change_authorized = true;
  assert.throws(
    () => evaluate(authorization),
    (error) => error instanceof ObservabilityActivationRefusal
      && error.code === "authorization-boundary-violated",
  );
});

test("unknown fields, names, malformed hashes, and widened receipts are rejected", () => {
  const widened = completeEvidence();
  widened.account_id = "private-account";
  assert.throws(() => evaluate(widened),
    /unexpected fields/u);

  const unknownView = completeEvidence();
  unknownView.dashboards.saved_views[0] = "unreviewed view";
  const viewReceipt = evaluate(unknownView);
  assert.deepEqual(viewReceipt.blockers, ["dashboard-evidence-missing"]);

  const malformed = completeEvidence();
  malformed.access.evidence_sha256 = "not-a-digest";
  assert.throws(() => evaluate(malformed), /SHA-256/u);

  const receipt = evaluate(completeEvidence());
  receipt.evidence_digest = DIGESTS[0];
  assert.throws(() => assertPublicReceipt(receipt, loadPolicy()), /unexpected fields/u);

  const invalidCommitReceipt = evaluate(completeEvidence());
  invalidCommitReceipt.reviewed_commit = "not-a-commit";
  assert.throws(() => assertPublicReceipt(invalidCommitReceipt, loadPolicy()),
    /overstates or widens/u);
});

test("incomplete, duplicated, and non-boolean drill claims are rejected or blocked", () => {
  const incomplete = completeEvidence();
  incomplete.alerts.drills.pop();
  assert.throws(() => evaluate(incomplete),
    /every required entry/u);

  const duplicated = completeEvidence();
  duplicated.uptime.checks[1].name = duplicated.uptime.checks[0].name;
  assert.throws(() => evaluate(duplicated),
    /unique strings/u);

  const invalid = completeEvidence();
  invalid.reconstruction.drills[0].completed = "yes";
  assert.throws(() => evaluate(invalid), /must be boolean/u);

  const invalidAfterFalse = completeEvidence();
  invalidAfterFalse.alerts.drills[0].delivered = false;
  invalidAfterFalse.alerts.drills[0].acknowledged = "yes";
  assert.throws(() => evaluate(invalidAfterFalse), /must be boolean/u);

  const invalidAfterBlockedEntry = completeEvidence();
  invalidAfterBlockedEntry.alerts.drills[0].delivered = false;
  invalidAfterBlockedEntry.alerts.drills[1].acknowledged = "yes";
  assert.throws(() => evaluate(invalidAfterBlockedEntry), /must be boolean/u);

  const invalidPosthogAfterEnabled = completeEvidence();
  invalidPosthogAfterEnabled.posthog.enabled = true;
  invalidPosthogAfterEnabled.posthog.separate_approval_recorded = "no";
  assert.throws(() => evaluate(invalidPosthogAfterEnabled), /must be boolean/u);
});

test("the source never queries a provider or turns the verifier into a release command", () => {
  const source = readFileSync(
    new URL("../scripts/verify-observability-activation.mjs", import.meta.url), "utf8",
  );
  assert.doesNotMatch(source, /fetch\s*\(|spawnSync|execFile|wrangler|cloudflare\.com/iu);
  assert.doesNotMatch(source, /production_change_authorized:\s*true/iu);
});

test("CI and release provenance verify only the locked policy", () => {
  const manifest = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const release = readFileSync(
    new URL("../.github/workflows/release-provenance.yml", import.meta.url), "utf8",
  );
  assert.match(manifest,
    /"security:observability-activation": "node scripts\/verify-observability-activation\.mjs verify-policy"/u);
  assert.match(manifest,
    /"verify:observability:activation": "node scripts\/verify-observability-activation\.mjs evaluate --evidence-file/iu);
  assert.match(manifest, /--expected-commit \\"\$OBSERVABILITY_EXPECTED_COMMIT\\"/u);
  for (const workflow of [ci, release]) {
    assert.match(workflow, /npm run security:observability-activation/u);
    assert.doesNotMatch(workflow, /verify:observability:activation/u);
  }
});
