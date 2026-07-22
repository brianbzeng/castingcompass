import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildPlan,
  loadPolicy,
  validateAuthorization,
  validatePolicy,
} from "../scripts/authenticated-staging-drill.mjs";
import {
  canonicalJson as stagingCanonicalJson,
  loadPolicy as loadStagingConfigPolicy,
  sha256 as stagingSha256,
} from "../scripts/verify-isolated-staging-config.mjs";

const NOW = new Date("2026-07-22T18:00:00.000Z");
const EXERCISE_ID = "sec_0123456789abcdef0123456789abcdef";

function hashes(offset) {
  return Array.from({ length: 10 }, (_, index) => (offset + index).toString(16).padStart(64, "0"));
}

function configurationReceipt(overrides = {}) {
  const policy = loadStagingConfigPolicy();
  const base = {
    schema_version: "castingcompass.isolated-staging-config-receipt/1.0.0",
    policy_sha256: stagingSha256(stagingCanonicalJson(policy)),
    source_commit: "a".repeat(40),
    target_origin: "https://isolated.example.test",
    config_sha256: { direct: "1".repeat(64), durable_queue: "2".repeat(64) },
    exercise_id_sha256: stagingSha256(EXERCISE_ID),
    synthetic_account_hash: "a".repeat(64),
    exercise_provider_version_id: "stub-version-456",
    resource_identity_sha256: {
      d1: "3".repeat(64),
      rate_limit_namespaces: "4".repeat(64),
      exercise_service: "5".repeat(64),
      queue: "6".repeat(64),
      dead_letter_queue: "7".repeat(64),
    },
    mode_boundaries: [
      { mode: "direct", queue_enabled: false, queue_bindings: 0 },
      { mode: "durable_queue", queue_enabled: true, queue_bindings: 2 },
    ],
    production_resources_excluded: true,
    provider_contacted: false,
    deployment_performed: false,
    production_ready: false,
    production_authority: false,
  };
  return { ...base, ...overrides };
}

function authorization(overrides = {}) {
  const base = {
    schema_version: "castingcompass.authenticated-staging-drill-authorization/1.1.0",
    exercise_id: EXERCISE_ID,
    source_commit: "a".repeat(40),
    environment: "isolated-staging",
    target_origin: "https://isolated.example.test",
    expected_api_compatibility_version: "1",
    expected_worker_version_ids: {
      direct: "direct-worker-version-123",
      durable_queue: "queue-worker-version-456",
    },
    expected_exercise_provider_version_id: "stub-version-456",
    isolated_configuration_receipt_sha256: stagingSha256(stagingCanonicalJson(configurationReceipt())),
    window_start_at: "2026-07-22T18:30:00.000Z",
    window_end_at: "2026-07-22T19:30:00.000Z",
    synthetic_subjects: {
      account_hash: "a".repeat(64),
      direct_trip_hashes: hashes(1),
      queue_trip_hashes: hashes(11),
    },
    authorization: {
      written_scope_approved: true,
      authenticated_testing_approved: true,
      independent_tester_authorized: true,
      client_response_fault_authorized: true,
      queue_duplicate_delivery_authorized: true,
    },
    safety: {
      synthetic_data_only: true,
      production_bindings_attached: false,
      production_user_data_accessible: false,
      real_ai_provider_credentials_attached: false,
      exercise_service_binding_attached: true,
      email_sink_only: true,
      outbound_callbacks_disabled: true,
      monitoring_operator_ready: true,
      emergency_stop_verified: true,
      exact_source_deployed: true,
    },
    fault_injection: {
      client_response_drop_after_upstream_completion: true,
      fault_proxy_identity_sha256: "b".repeat(64),
      maximum_dropped_responses: 1,
    },
    evidence_access: {
      d1_read_only_evidence_approved: true,
      stub_provider_metrics_approved: true,
      queue_metrics_approved: true,
      private_evidence_location_approved: true,
    },
  };
  return {
    ...base,
    ...overrides,
    synthetic_subjects: { ...base.synthetic_subjects, ...(overrides.synthetic_subjects ?? {}) },
    authorization: { ...base.authorization, ...(overrides.authorization ?? {}) },
    safety: { ...base.safety, ...(overrides.safety ?? {}) },
    fault_injection: { ...base.fault_injection, ...(overrides.fault_injection ?? {}) },
    evidence_access: { ...base.evidence_access, ...(overrides.evidence_access ?? {}) },
    expected_worker_version_ids: {
      ...base.expected_worker_version_ids,
      ...(overrides.expected_worker_version_ids ?? {}),
    },
  };
}

function privateParent() {
  const parent = mkdtempSync(join(tmpdir(), "castingcompass-authenticated-drill-"));
  chmodSync(parent, 0o700);
  return parent;
}

test("the authenticated drill policy locks scope, counts, truth boundaries, and every production gate", () => {
  const policy = loadPolicy();
  assert.deepEqual(policy.modes, ["direct", "durable_queue"]);
  assert.equal(policy.limits.trips_per_mode, 10);
  assert.equal(policy.limits.overlapping_retry_requests_per_mode, 2);
  assert.equal(policy.exercise_provider.model, "castingcompass-isolated-stub-v1");
  const stubConfig = JSON.parse(readFileSync("staging/ai-review-exercise-stub.wrangler.jsonc", "utf8"));
  assert.equal(stubConfig.workers_dev, false);
  assert.deepEqual(stubConfig.routes, []);
  assert.equal(stubConfig.vars, undefined);
  assert.equal(stubConfig.d1_databases, undefined);
  assert.equal(stubConfig.r2_buckets, undefined);
  assert.equal(stubConfig.queues, undefined);
  assert.equal(stubConfig.services, undefined);
  assert.equal(policy.truth_boundaries.client_response_drop_is_not_d1_mutation_receipt_loss, true);
  assert.equal(Object.values(policy.production_gates).every((value) => value === false), true);

  const widened = structuredClone(policy);
  widened.limits.maximum_total_http_requests = 81;
  assert.throws(() => validatePolicy(widened), /changed/u);
  const selfApproved = structuredClone(policy);
  selfApproved.production_gates.production_authority = true;
  assert.throws(() => validatePolicy(selfApproved), /self-approve/u);
});

test("authorization is exact, staging-only, synthetic-only, provider-isolated, and disjoint", () => {
  const policy = loadPolicy();
  const accepted = validateAuthorization(authorization(), policy, { now: NOW, expectedSourceCommit: "a".repeat(40) });
  assert.equal(accepted.targetOrigin, "https://isolated.example.test");

  for (const invalid of [
    { ...authorization(), operator_email: "private@example.test" },
    authorization({ target_origin: "https://castingcompass.com" }),
    authorization({ target_origin: "https://preview.castingcompass.com" }),
    authorization({ authorization: { authenticated_testing_approved: false } }),
    authorization({ safety: { real_ai_provider_credentials_attached: true } }),
    authorization({ safety: { exercise_service_binding_attached: false } }),
    authorization({ fault_injection: { maximum_dropped_responses: 2 } }),
    authorization({ window_end_at: "2026-07-22T21:00:00.000Z" }),
    authorization({ expected_worker_version_ids: { durable_queue: "direct-worker-version-123" } }),
    authorization({
      synthetic_subjects: { queue_trip_hashes: hashes(1) },
    }),
  ]) {
    assert.throws(() => validateAuthorization(invalid, policy, { now: NOW }));
  }
});

test("the plan is non-executing and distinguishes client response loss from D1 receipt loss", () => {
  const policy = loadPolicy();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("network must not be used by planning");
  };
  try {
    const plan = buildPlan(
      validateAuthorization(authorization(), policy, { now: NOW }),
      policy,
      configurationReceipt(),
    );
    assert.equal(fetchCalls, 0);
    assert.equal(plan.execution_supported, false);
    assert.equal(plan.network_preflight_performed, false);
    assert.equal(plan.production_authority, false);
    assert.equal(plan.scenarios.length, 2);
    assert.equal(plan.scenarios[0].trip_hashes.length, 10);
    assert.equal(plan.scenarios[1].trip_hashes.length, 10);
    assert.equal(plan.scenarios[0].overlapping_requests, 2);
    assert.match(plan.scenarios[0].claim_boundary, /does not claim D1 SDK mutation-receipt loss/u);
    assert.equal(plan.scenarios[1].duplicate_queue_delivery_required, true);
    assert.notEqual(plan.scenarios[0].expected_worker_version_id, plan.scenarios[1].expected_worker_version_id);
    assert.equal(plan.expected_application_deployments.direct.configuration_sha256, "1".repeat(64));
    assert.equal(plan.expected_application_deployments.durable_queue.configuration_sha256, "2".repeat(64));
    assert.equal(plan.scenarios.every((scenario) => scenario.expected_unique_stub_requests === 10), true);
    assert.equal(plan.scenarios.every((scenario) => scenario.real_provider_expected_requests === 0), true);
    assert.doesNotMatch(JSON.stringify(plan), /Cookie|session=|private@example/u);
    assert.throws(
      () => buildPlan(validateAuthorization(authorization(), policy, { now: NOW }), policy),
      /configuration receipt is required/iu,
    );
    const mismatchedReceipt = configurationReceipt({ source_commit: "b".repeat(40) });
    assert.throws(
      () => buildPlan(
        validateAuthorization(authorization(), policy, { now: NOW }),
        policy,
        mismatchedReceipt,
      ),
      /does not match the exact authorization/iu,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the CLI writes only a private, unapproved template and deliberately has no run command", () => {
  const parent = privateParent();
  try {
    const output = join(parent, "authorization.json");
    const written = spawnSync(process.execPath, [
      "scripts/authenticated-staging-drill.mjs",
      "write-template",
      "--output",
      output,
    ], { encoding: "utf8" });
    assert.equal(written.status, 0, written.stderr);
    const template = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(Object.values(template.authorization).every((value) => value === false), true);
    assert.equal(template.safety.synthetic_data_only, false);
    assert.equal(template.safety.exercise_service_binding_attached, false);
    assert.equal(Object.values(template.evidence_access).every((value) => value === false), true);

    const run = spawnSync(process.execPath, ["scripts/authenticated-staging-drill.mjs", "run"], {
      encoding: "utf8",
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /deliberately has no run command/u);
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    assert.equal(scripts["authenticated-staging-drill:run"], undefined);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("plan input must be a private out-of-repository regular file before checkout verification", () => {
  const parent = privateParent();
  try {
    const input = join(parent, "authorization.json");
    const output = join(parent, "plan.json");
    writeFileSync(input, `${JSON.stringify(authorization())}\n`, { mode: 0o644 });
    const result = spawnSync(process.execPath, [
      "scripts/authenticated-staging-drill.mjs",
      "plan",
      "--authorization",
      input,
      "--configuration-receipt",
      input,
      "--output",
      output,
    ], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /file-safety/u);
    assert.doesNotMatch(result.stderr, /isolated\.example\.test|sec_0123/u);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
