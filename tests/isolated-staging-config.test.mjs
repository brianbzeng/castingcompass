import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildConfigurationReceipt,
  loadPolicy,
  validateConfiguration,
  validateConfigurationPair,
  validateConfigurationReceipt,
  validatePolicy,
} from "../scripts/verify-isolated-staging-config.mjs";

const EXERCISE_ID = "sec_0123456789abcdef0123456789abcdef";

function configuration(mode = "direct") {
  const policy = loadPolicy();
  const config = {
    schema_version: "castingcompass.isolated-staging-wrangler/1.0.0",
    name: policy.application.worker_name,
    main: policy.application.main,
    compatibility_date: policy.application.compatibility_date,
    compatibility_flags: policy.application.compatibility_flags,
    workers_dev: false,
    vars: {
      ...policy.feature_flags,
      AI_REVIEW_QUEUE_ENABLED: mode === "durable_queue" ? "true" : "false",
      AI_REVIEW_EXERCISE_ID: EXERCISE_ID,
      AI_REVIEW_EXERCISE_ACCOUNT_HASH: "a".repeat(64),
      AI_REVIEW_EXERCISE_PROVIDER_VERSION_ID: "stub-version-456",
      SECURITY_EXERCISE_ID: EXERCISE_ID,
    },
    ratelimits: policy.rate_limits.map((entry, index) => ({
      name: entry.name,
      namespace_id: `900000000${index + 1}`,
      simple: { limit: entry.limit, period: entry.period },
    })),
    version_metadata: { binding: policy.application.version_metadata_binding },
    routes: [{ pattern: "isolated.example.test", custom_domain: true }],
    no_bundle: true,
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    assets: { directory: policy.application.assets_directory, binding: policy.application.assets_binding },
    d1_databases: [{
      binding: "DB",
      database_name: "contourcast-trips-isolated-staging",
      database_id: "11111111-1111-4111-8111-111111111111",
      migrations_dir: "drizzle",
    }],
    services: [{
      binding: policy.application.exercise_service_binding,
      service: policy.application.exercise_service_name,
    }],
    observability: { enabled: true, logs: { invocation_logs: false, head_sampling_rate: 1 } },
  };
  if (mode === "durable_queue") {
    config.queues = {
      producers: [{ binding: policy.queue.binding, queue: policy.queue.name }],
      consumers: [{
        queue: policy.queue.name,
        max_batch_size: policy.queue.max_batch_size,
        max_batch_timeout: policy.queue.max_batch_timeout,
        max_retries: policy.queue.max_retries,
        max_concurrency: policy.queue.max_concurrency,
        dead_letter_queue: policy.queue.dead_letter_name,
      }],
    };
  }
  return config;
}

test("the isolated-staging policy is locked to the checked-in production exclusion inventory", () => {
  const policy = loadPolicy();
  assert.equal(policy.application.worker_name, "contourcast-halibut-isolated-staging");
  assert.equal(policy.production.worker_name, "contourcast-halibut");
  assert.equal(policy.feature_flags.RATE_LIMITING_ENABLED, "true");
  assert.equal(Object.values(policy.production_gates).every((value) => value === false), true);

  const widened = structuredClone(policy);
  widened.production.database_id = "11111111-1111-4111-8111-111111111111";
  assert.throws(() => validatePolicy(widened), /production resource inventory/iu);
  const selfApproved = structuredClone(policy);
  selfApproved.production_gates.configurations_verified = true;
  assert.throws(() => validatePolicy(selfApproved), /self-approve/u);
});

test("direct and durable Queue configurations share isolated resources but remain distinct versions", () => {
  const policy = loadPolicy();
  const pair = validateConfigurationPair(configuration("direct"), configuration("durable_queue"), policy);
  assert.equal(pair.direct.targetOrigin, "https://isolated.example.test");
  assert.equal(pair.direct.config.vars.AI_REVIEW_QUEUE_ENABLED, "false");
  assert.equal(pair.durableQueue.config.vars.AI_REVIEW_QUEUE_ENABLED, "true");
  const receipt = buildConfigurationReceipt(pair, "a".repeat(40), policy);
  assert.notEqual(receipt.config_sha256.direct, receipt.config_sha256.durable_queue);
  assert.equal(receipt.provider_contacted, false);
  assert.equal(receipt.deployment_performed, false);
  assert.equal(receipt.production_authority, false);
  assert.equal(validateConfigurationReceipt(receipt, policy), receipt);
  assert.doesNotMatch(JSON.stringify(receipt), /11111111-1111-4111-8111|9000000001/u);
});

test("production resources, public features, real providers, and cross-mode resource drift fail closed", () => {
  const policy = loadPolicy();
  const cases = [];
  const productionD1 = configuration();
  productionD1.d1_databases[0].database_id = policy.production.database_id;
  cases.push([productionD1, "direct"]);
  const productionRoute = configuration();
  productionRoute.routes[0].pattern = "castingcompass.com";
  cases.push([productionRoute, "direct"]);
  const productionRateLimit = configuration();
  productionRateLimit.ratelimits[0].namespace_id = policy.production.rate_limit_namespace_ids[0];
  cases.push([productionRateLimit, "direct"]);
  const discussion = configuration();
  discussion.vars.PUBLIC_DISCUSSIONS_ENABLED = "true";
  cases.push([discussion, "direct"]);
  const provider = configuration();
  provider.vars.MIMO_API_KEY = "never-allowed";
  cases.push([provider, "direct"]);
  const queueOnDirect = configuration();
  queueOnDirect.vars.AI_REVIEW_QUEUE_ENABLED = "true";
  cases.push([queueOnDirect, "direct"]);
  for (const [candidate, mode] of cases) {
    assert.throws(() => validateConfiguration(candidate, mode, policy));
  }

  const driftedQueue = configuration("durable_queue");
  driftedQueue.d1_databases[0].database_id = "22222222-2222-4222-8222-222222222222";
  assert.throws(
    () => validateConfigurationPair(configuration(), driftedQueue, policy),
    /shared staging resources/iu,
  );
});

test("the CLI creates private non-deployable templates and exposes no deployment command", () => {
  const parent = mkdtempSync(join(tmpdir(), "castingcompass-isolated-config-"));
  chmodSync(parent, 0o700);
  try {
    const output = join(parent, "direct.json");
    const written = spawnSync(process.execPath, [
      "scripts/verify-isolated-staging-config.mjs",
      "write-template",
      "--mode",
      "direct",
      "--output",
      output,
    ], { encoding: "utf8" });
    assert.equal(written.status, 0, written.stderr);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const template = JSON.parse(readFileSync(output, "utf8"));
    assert.match(template.d1_databases[0].database_id, /^REPLACE-/u);
    assert.throws(() => validateConfiguration(template, "direct"));

    for (const command of ["deploy", "run"]) {
      const refused = spawnSync(process.execPath, ["scripts/verify-isolated-staging-config.mjs", command], {
        encoding: "utf8",
      });
      assert.notEqual(refused.status, 0);
      assert.match(refused.stderr, /no deploy or run command/u);
    }
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
