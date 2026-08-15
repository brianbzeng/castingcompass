import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  calculateProjectedSequenceRequests,
  createGlobalRequestScheduler,
  evaluateResults,
  executeLoadTest,
  percentile,
  preflightRemoteTarget,
  runWorker,
  validateConfiguration,
  validateRemoteIdentity,
  validateTarget,
} from "../scripts/load-test.mjs";
import { API_COMPATIBILITY_VERSION } from "../worker/api-version.ts";
import { healthResponse } from "../worker/security.ts";

const REMOTE_AUTHORIZATION = "I_HAVE_AUTHORIZATION_FOR_THIS_STAGING_TARGET";
const TARGET = "https://isolated.example.test";
const COMMIT = "a".repeat(40);
const WORKER_VERSION = "version-123";
const EXERCISE_ID = "sec_0123456789abcdef0123456789abcdef";
const configuration = validateConfiguration(JSON.parse(
  await readFile(new URL("../config/performance-budgets.json", import.meta.url), "utf8"),
));

function remoteIdentity(overrides = {}) {
  return {
    expectedCommit: COMMIT,
    expectedWorkerVersion: WORKER_VERSION,
    exerciseId: EXERCISE_ID,
    ...overrides,
  };
}

function acceptedHealth(overrides = {}, responseOverrides = {}) {
  return new Response(JSON.stringify({
    status: "ok",
    service: "castingcompass-web",
    apiCompatibilityVersion: API_COMPATIBILITY_VERSION,
    workerVersionId: WORKER_VERSION,
    releaseMaintenance: false,
    securityExerciseId: EXERCISE_ID,
    ...overrides,
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    ...responseOverrides,
  });
}

test("load harness permanently refuses every production hostname", () => {
  for (const target of [
    "https://castingcompass.com",
    "https://www.castingcompass.com",
    "https://preview.castingcompass.com",
    "https://castcompass.brianbzeng.com",
    "https://contourcast.brianbzeng.com",
  ]) {
    assert.throws(() => validateTarget(target, "I_HAVE_AUTHORIZATION_FOR_THIS_STAGING_TARGET"), /production/);
  }
});

test("load harness permits localhost but requires explicit authorization for remote staging", () => {
  assert.equal(validateTarget("http://127.0.0.1:8787").origin, "http://127.0.0.1:8787");
  assert.equal(validateTarget("http://[::1]:8787").origin, "http://[::1]:8787");
  assert.throws(() => validateTarget("https://example.workers.dev"), /requires CASTINGCOMPASS_LOAD_AUTHORIZATION/);
  assert.equal(
    validateTarget(
      "https://example.workers.dev",
      REMOTE_AUTHORIZATION,
    ).origin,
    "https://example.workers.dev",
  );
  for (const target of [
    "http://example.workers.dev",
    "https://127.0.0.2",
    "https://isolated_example.test",
  ]) {
    assert.throws(() => validateTarget(target, REMOTE_AUTHORIZATION), /canonical HTTPS DNS/);
  }
  assert.throws(() => validateTarget("https://user:secret@example.test"), /only scheme/);
});

test("performance configuration locks route scope, execution ceilings, and API identity", () => {
  assert.equal(configuration.apiCompatibilityVersion, API_COMPATIBILITY_VERSION);
  assert.equal(configuration.schemaVersion, "castingcompass.performance-budgets/1.2.0");
  assert.equal(calculateProjectedSequenceRequests(configuration), 64_504);

  const widenedRoute = structuredClone(configuration);
  widenedRoute.routes.push({ name: "account", path: "/api/profile", expectedStatuses: [200] });
  assert.throws(() => validateConfiguration(widenedRoute), /route scope was widened/);

  const weakenedConcurrency = structuredClone(configuration);
  weakenedConcurrency.limits.maximumConcurrency = 51;
  assert.throws(() => validateConfiguration(weakenedConcurrency), /execution limits/);

  const unboundedRate = structuredClone(configuration);
  unboundedRate.profiles.spike.requestsPerSecond = 501;
  assert.throws(() => validateConfiguration(unboundedRate), /locked limits/);

  const weakenedReserve = structuredClone(configuration);
  weakenedReserve.quotaGuard.minimumReserveRequests = 34_999;
  assert.throws(() => validateConfiguration(weakenedReserve), /quota guard/);

  const overDailyAllowance = structuredClone(configuration);
  overDailyAllowance.profiles.soak.requestsPerSecond = 41;
  assert.throws(() => validateConfiguration(overDailyAllowance), /daily request allowance/);

  const staleApi = structuredClone(configuration);
  staleApi.apiCompatibilityVersion = "2";
  assert.throws(() => validateConfiguration(staleApi), /identity is invalid/);
});

test("remote identity requires the exact commit, Worker version, and opaque exercise marker", () => {
  assert.deepEqual(validateRemoteIdentity(remoteIdentity(), configuration), remoteIdentity());
  for (const identity of [
    remoteIdentity({ expectedCommit: "a".repeat(39) }),
    remoteIdentity({ expectedWorkerVersion: "worker/version" }),
    remoteIdentity({ exerciseId: "sec_public-name" }),
  ]) {
    assert.throws(() => validateRemoteIdentity(identity, configuration), /remote staging requires/);
  }
});

test("remote preflight binds current Worker health identity and never follows redirects", async () => {
  const target = validateTarget(TARGET, REMOTE_AUTHORIZATION);
  let request;
  await preflightRemoteTarget(target, remoteIdentity(), configuration, {
    fetchImpl: async (input, init) => {
      request = { input: String(input), init };
      return acceptedHealth();
    },
  });
  assert.equal(request.input, `${TARGET}/api/health`);
  assert.equal(request.init.method, "GET");
  assert.equal(request.init.redirect, "manual");

  for (const response of [
    new Response(null, { status: 302, headers: { Location: "https://castingcompass.com/api/health" } }),
    acceptedHealth({ workerVersionId: "wrong-worker" }),
    acceptedHealth({ apiCompatibilityVersion: "2" }),
    acceptedHealth({ securityExerciseId: "sec_ffffffffffffffffffffffffffffffff" }),
    acceptedHealth({ releaseMaintenance: true }),
    acceptedHealth({ extra: true }),
    new Response("{}", {
      status: 200,
      headers: { "Content-Type": "text/html", "Cache-Control": "no-store" },
    }),
    new Response("x".repeat(configuration.maximumHealthResponseBytes + 1), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    }),
  ]) {
    await assert.rejects(
      () => preflightRemoteTarget(target, remoteIdentity(), configuration, {
        fetchImpl: async () => response,
      }),
    );
  }
});

test("remote preflight accepts the exact current Worker health contract", async () => {
  const target = validateTarget(TARGET, REMOTE_AUTHORIZATION);
  await preflightRemoteTarget(target, remoteIdentity(), configuration, {
    fetchImpl: async (input, init) => {
      const response = await healthResponse(new Request(input, init), {
        DB: {
          prepare(query) {
            assert.equal(query, "SELECT 1 AS ok");
            return { first: async () => ({ ok: 1 }) };
          },
        },
        CF_VERSION_METADATA: { id: WORKER_VERSION },
        SECURITY_EXERCISE_ID: EXERCISE_ID,
      });
      assert.ok(response);
      return response;
    },
  });
});

test("remote execution verifies checkout then target identity before starting workers", async () => {
  const events = [];
  const result = await executeLoadTest({
    arguments: {
      target: TARGET,
      profile: "smoke",
      ...remoteIdentity(),
    },
    configuration,
    remoteAuthorization: REMOTE_AUTHORIZATION,
    checkoutVerifier: async ({ expectedCommit }) => {
      assert.equal(expectedCommit, COMMIT);
      events.push("checkout");
    },
    preflightFetch: async () => {
      events.push("preflight");
      return acceptedHealth();
    },
    workerRunner: async (_workerId, _target, _configuration, _profile, _deadline, results) => {
      events.push("worker");
      results.latencies.push(10);
    },
  });
  assert.deepEqual(events.slice(0, 2), ["checkout", "preflight"]);
  assert.equal(events.filter((event) => event === "worker").length, 2);
  assert.equal(result.environment, "isolated-staging");
  assert.equal(result.targetIdentityVerified, true);
  assert.equal(result.sourceCommit, COMMIT);
  assert.equal(result.passed, true);
  assert.doesNotMatch(JSON.stringify(result), /isolated\.example\.test|version-123|sec_/u);
  assert.equal(result.targetRequestsPerSecond, 20);
  assert.equal(result.projectedProfileRequestCeiling, 300);
});

test("pacer enforces the global request rate and never catches up in a burst", async () => {
  const concurrentProfile = { durationSeconds: 2, concurrency: 3, requestsPerSecond: 4 };
  const scheduler = createGlobalRequestScheduler(concurrentProfile, 0);
  assert.deepEqual([
    scheduler.claim(0, 2_000),
    scheduler.claim(0, 2_000),
    scheduler.claim(0, 2_000),
  ], [0, 250, 500]);
  assert.equal(scheduler.claim(1_000, 2_000), 1_000);
  assert.equal(scheduler.claim(1_000, 2_000), 1_250);

  let concurrentNow = 0;
  let waiters = [];
  const flushAsyncTurns = async () => {
    for (let index = 0; index < 12; index += 1) await Promise.resolve();
  };
  const concurrentTiming = {
    now: () => concurrentNow,
    wait: (milliseconds) => new Promise((resolve) => {
      waiters.push({ at: concurrentNow + milliseconds, resolve });
    }),
  };
  const advanceTo = async (nextNow) => {
    concurrentNow = nextNow;
    const ready = waiters.filter(({ at }) => at <= concurrentNow);
    waiters = waiters.filter(({ at }) => at > concurrentNow);
    for (const waiter of ready) waiter.resolve();
    await flushAsyncTurns();
  };
  const concurrentStarts = [];
  const concurrentResults = { latencies: [], failures: 0 };
  const sharedScheduler = createGlobalRequestScheduler(
    { durationSeconds: 2, concurrency: 2, requestsPerSecond: 4 },
    0,
  );
  const workers = [0, 1].map((workerId) => runWorker(
    workerId,
    new URL("http://127.0.0.1:8787"),
    configuration,
    { durationSeconds: 2, concurrency: 2, requestsPerSecond: 4 },
    2_000,
    concurrentResults,
    async () => {
      concurrentStarts.push(concurrentNow);
      return new Response(null, { status: 200 });
    },
    concurrentTiming,
    sharedScheduler,
  ));
  await flushAsyncTurns();
  await advanceTo(1_000);
  await advanceTo(1_250);
  await advanceTo(1_500);
  await advanceTo(1_750);
  await advanceTo(2_000);
  await Promise.all(workers);
  assert.deepEqual(concurrentStarts, [0, 1_000, 1_250, 1_500, 1_750]);
  assert.equal(new Set(concurrentStarts).size, concurrentStarts.length);

  let now = 0;
  const starts = [];
  const timing = {
    now: () => now,
    wait: async (milliseconds) => { now += milliseconds; },
  };
  const results = { latencies: [], failures: 0 };
  await runWorker(
    0,
    new URL("http://127.0.0.1:8787"),
    configuration,
    { durationSeconds: 2, concurrency: 1, requestsPerSecond: 2 },
    1_600,
    results,
    async () => {
      starts.push(now);
      now += 750;
      return new Response(null, { status: 200 });
    },
    timing,
    createGlobalRequestScheduler(
      { durationSeconds: 2, concurrency: 1, requestsPerSecond: 2 },
      0,
    ),
  );
  assert.deepEqual(starts, [0, 750, 1_500]);
  assert.equal(results.failures, 0);
  assert.deepEqual(results.latencies, [750, 750, 750]);
});

test("checkout or identity refusal occurs before any remote load worker starts", async () => {
  let preflightCalled = false;
  let workerCalled = false;
  await assert.rejects(() => executeLoadTest({
    arguments: { target: TARGET, profile: "smoke", ...remoteIdentity() },
    configuration,
    remoteAuthorization: REMOTE_AUTHORIZATION,
    checkoutVerifier: async () => { throw new Error("not reviewed"); },
    preflightFetch: async () => { preflightCalled = true; return acceptedHealth(); },
    workerRunner: async () => { workerCalled = true; },
  }), /clean exact-source reviewed checkout/);
  assert.equal(preflightCalled, false);
  assert.equal(workerCalled, false);
});

test("tail latency and error budgets fail closed", () => {
  assert.equal(percentile([10, 20, 30, 40], 0.95), 40);
  const budgets = { p95Milliseconds: 100, p99Milliseconds: 150, errorRatePercent: 1 };
  assert.equal(evaluateResults([20, 30, 40], 0, budgets).passed, true);
  assert.equal(evaluateResults([20, 30, 200], 0, budgets).passed, false);
  assert.equal(evaluateResults([20, 30, 40], 1, budgets).passed, false);
  assert.equal(evaluateResults([], 0, budgets).passed, false);
});
