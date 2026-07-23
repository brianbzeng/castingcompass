#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";

import { verifyReleaseCheckout } from "./verify-release-checkout.mjs";

const PRODUCTION_HOSTS = new Set([
  "castingcompass.com",
  "www.castingcompass.com",
  "castcompass.brianbzeng.com",
  "contourcast.brianbzeng.com",
]);
const REMOTE_AUTHORIZATION = "I_HAVE_AUTHORIZATION_FOR_THIS_STAGING_TARGET";
const CONFIG_URL = new URL("../config/performance-budgets.json", import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_SCHEMA_VERSION = "castingcompass.performance-budgets/1.1.0";
const EXPECTED_API_COMPATIBILITY_VERSION = "1";
const EXPECTED_ROUTES = [
  { name: "home", path: "/", expectedStatuses: [200] },
  { name: "health", path: "/api/health", expectedStatuses: [200] },
  { name: "sites", path: "/data/sites.json", expectedStatuses: [200] },
  { name: "opportunities", path: "/data/opportunities.json", expectedStatuses: [200] },
];

function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1"
    || hostname === "::1" || hostname === "[::1]";
}

function isCanonicalDnsHostname(hostname) {
  return !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)
    && !hostname.includes(":")
    && /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u
    .test(hostname);
}

function exactKeys(value, expected, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} is invalid`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${name} has unexpected fields`);
  }
}

function exactJson(value) {
  return JSON.stringify(value);
}

export function validateConfiguration(configuration) {
  exactKeys(configuration, [
    "schemaVersion", "apiCompatibilityVersion", "profiles", "limits",
    "requestTimeoutMilliseconds", "maximumHealthResponseBytes", "budgets", "routes",
  ], "Performance configuration");
  if (configuration.schemaVersion !== EXPECTED_SCHEMA_VERSION
    || configuration.apiCompatibilityVersion !== EXPECTED_API_COMPATIBILITY_VERSION) {
    throw new Error("performance configuration identity is invalid");
  }
  if (!Number.isInteger(configuration.requestTimeoutMilliseconds)
    || configuration.requestTimeoutMilliseconds < 1_000
    || configuration.requestTimeoutMilliseconds > 30_000
    || !Number.isInteger(configuration.maximumHealthResponseBytes)
    || configuration.maximumHealthResponseBytes < 1
    || configuration.maximumHealthResponseBytes > 8_192) {
    throw new Error("performance configuration request limits are invalid");
  }
  exactKeys(configuration.limits, ["maximumDurationSeconds", "maximumConcurrency"], "Performance limits");
  if (!Number.isInteger(configuration.limits.maximumDurationSeconds)
    || configuration.limits.maximumDurationSeconds < 1
    || configuration.limits.maximumDurationSeconds > 1_800
    || !Number.isInteger(configuration.limits.maximumConcurrency)
    || configuration.limits.maximumConcurrency < 1
    || configuration.limits.maximumConcurrency > 50) {
    throw new Error("performance configuration execution limits are invalid");
  }
  exactKeys(configuration.profiles, ["smoke", "load", "spike", "soak"], "Performance profiles");
  for (const [name, profile] of Object.entries(configuration.profiles)) {
    exactKeys(profile, ["durationSeconds", "concurrency"], `Performance profile ${name}`);
    if (!Number.isInteger(profile.durationSeconds) || profile.durationSeconds < 1
      || profile.durationSeconds > configuration.limits.maximumDurationSeconds
      || !Number.isInteger(profile.concurrency) || profile.concurrency < 1
      || profile.concurrency > configuration.limits.maximumConcurrency) {
      throw new Error(`performance profile ${name} exceeds the locked limits`);
    }
  }
  exactKeys(configuration.budgets, [
    "p95Milliseconds", "p99Milliseconds", "errorRatePercent",
  ], "Performance budgets");
  if (!Number.isFinite(configuration.budgets.p95Milliseconds)
    || configuration.budgets.p95Milliseconds < 1
    || configuration.budgets.p95Milliseconds > 750
    || !Number.isFinite(configuration.budgets.p99Milliseconds)
    || configuration.budgets.p99Milliseconds < configuration.budgets.p95Milliseconds
    || configuration.budgets.p99Milliseconds > 1_500
    || !Number.isFinite(configuration.budgets.errorRatePercent)
    || configuration.budgets.errorRatePercent < 0
    || configuration.budgets.errorRatePercent > 1) {
    throw new Error("performance budgets were weakened or are invalid");
  }
  if (exactJson(configuration.routes) !== exactJson(EXPECTED_ROUTES)) {
    throw new Error("performance route scope was widened");
  }
  return configuration;
}

export function validateTarget(value, remoteAuthorization = "") {
  let target;
  try {
    target = new URL(value);
  } catch {
    throw new Error("--target must be an absolute http(s) URL");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error("load targets must use http or https");
  }
  if (target.username || target.password || target.search || target.hash || target.pathname !== "/") {
    throw new Error("--target must contain only scheme, hostname, and optional port");
  }
  const hostname = target.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname) || hostname.endsWith(".castingcompass.com")) {
    throw new Error("production CastingCompass hostnames are permanently blocked by this harness");
  }
  const local = isLoopbackHostname(hostname);
  if (!local && (target.protocol !== "https:" || !isCanonicalDnsHostname(hostname))) {
    throw new Error("remote staging requires a canonical HTTPS DNS hostname");
  }
  if (!local && remoteAuthorization !== REMOTE_AUTHORIZATION) {
    throw new Error(
      `remote staging requires CASTINGCOMPASS_LOAD_AUTHORIZATION=${REMOTE_AUTHORIZATION}`,
    );
  }
  return target;
}

export function validateRemoteIdentity(identity, configuration) {
  if (!/^[0-9a-f]{40}$/u.test(identity.expectedCommit ?? "")) {
    throw new Error("remote staging requires --expected-commit as a full lowercase commit ID");
  }
  if (!/^[A-Za-z0-9-]{1,128}$/u.test(identity.expectedWorkerVersion ?? "")) {
    throw new Error("remote staging requires a valid --expected-worker-version");
  }
  if (!/^sec_[a-f0-9]{32}$/u.test(identity.exerciseId ?? "")) {
    throw new Error("remote staging requires an opaque --exercise-id");
  }
  if (configuration.apiCompatibilityVersion !== EXPECTED_API_COMPATIBILITY_VERSION) {
    throw new Error("remote staging API compatibility policy is invalid");
  }
  return identity;
}

async function boundedResponseText(response, maximumBytes) {
  const contentLength = response.headers.get("Content-Length");
  if (contentLength !== null && (!/^\d+$/u.test(contentLength) || Number(contentLength) > maximumBytes)) {
    throw new Error("remote staging health body exceeded the fixed limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new Error("remote staging health body exceeded the fixed limit");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, bytes).toString("utf8");
}

export async function preflightRemoteTarget(target, identity, configuration, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let response;
  try {
    response = await fetchImpl(new URL("/api/health", target), {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(configuration.requestTimeoutMilliseconds),
    });
  } catch {
    throw new Error("remote staging health preflight was unavailable");
  }
  if (response.status !== 200 || response.type === "opaqueredirect"
    || (response.status >= 300 && response.status < 400)) {
    throw new Error("remote staging health response was not accepted");
  }
  const contentType = response.headers.get("Content-Type") ?? "";
  const cacheControl = response.headers.get("Cache-Control") ?? "";
  if (!/^application\/json\b/iu.test(contentType)
    || !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(cacheControl)) {
    throw new Error("remote staging health headers were not accepted");
  }
  let text;
  try {
    text = await boundedResponseText(response, configuration.maximumHealthResponseBytes);
  } catch (error) {
    if (error instanceof Error && error.message.includes("exceeded the fixed limit")) throw error;
    throw new Error("remote staging health body could not be read");
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("remote staging health body was not valid JSON");
  }
  exactKeys(body, [
    "status", "service", "apiCompatibilityVersion", "workerVersionId",
    "releaseMaintenance", "securityExerciseId",
  ], "Remote staging health body");
  if (body.status !== "ok" || body.service !== "castingcompass-web"
    || body.apiCompatibilityVersion !== configuration.apiCompatibilityVersion
    || body.workerVersionId !== identity.expectedWorkerVersion
    || body.securityExerciseId !== identity.exerciseId
    || body.releaseMaintenance !== false) {
    throw new Error("remote staging identity did not match the authorized load target");
  }
  return true;
}

export function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

export function evaluateResults(latencies, failures, budgets) {
  const total = latencies.length;
  const errorRatePercent = total === 0 ? 100 : (failures / total) * 100;
  const summary = {
    requests: total,
    failures,
    errorRatePercent,
    p50Milliseconds: percentile(latencies, 0.5),
    p95Milliseconds: percentile(latencies, 0.95),
    p99Milliseconds: percentile(latencies, 0.99),
  };
  return {
    summary,
    passed: total > 0 &&
      summary.p95Milliseconds <= budgets.p95Milliseconds &&
      summary.p99Milliseconds <= budgets.p99Milliseconds &&
      summary.errorRatePercent <= budgets.errorRatePercent,
  };
}

export function parseArguments(arguments_) {
  const parsed = {
    target: "",
    profile: "smoke",
    expectedCommit: "",
    expectedWorkerVersion: "",
    exerciseId: "",
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const value = arguments_[index];
    if (value === "--target") parsed.target = arguments_[++index] ?? "";
    else if (value === "--profile") parsed.profile = arguments_[++index] ?? "";
    else if (value === "--expected-commit") parsed.expectedCommit = arguments_[++index] ?? "";
    else if (value === "--expected-worker-version") parsed.expectedWorkerVersion = arguments_[++index] ?? "";
    else if (value === "--exercise-id") parsed.exerciseId = arguments_[++index] ?? "";
    else throw new Error(`unknown argument: ${value}`);
  }
  if (!parsed.target) throw new Error("--target is required; no production default exists");
  return parsed;
}

async function runWorker(workerId, target, configuration, profile, deadline, results, fetchImpl = fetch) {
  let sequence = workerId;
  while (performance.now() < deadline) {
    const route = configuration.routes[sequence % configuration.routes.length];
    sequence += profile.concurrency;
    const url = new URL(route.path, target);
    const started = performance.now();
    let failed = false;
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: route.path.startsWith("/data/") || route.path.startsWith("/api/")
          ? "application/json"
          : "text/html" },
        signal: AbortSignal.timeout(configuration.requestTimeoutMilliseconds),
      });
      if (!route.expectedStatuses.includes(response.status)) failed = true;
      await response.body?.cancel();
    } catch {
      failed = true;
    }
    results.latencies.push(performance.now() - started);
    if (failed) results.failures += 1;
  }
}

export async function executeLoadTest(options) {
  const arguments_ = options.arguments;
  const configuration = validateConfiguration(options.configuration);
  const profile = configuration.profiles[arguments_.profile];
  if (!profile) throw new Error(`unknown profile: ${arguments_.profile}`);
  if (
    profile.durationSeconds < 1 ||
    profile.durationSeconds > configuration.limits.maximumDurationSeconds ||
    profile.concurrency < 1 ||
    profile.concurrency > configuration.limits.maximumConcurrency
  ) {
    throw new Error("selected profile exceeds the repository safety limits");
  }
  const target = validateTarget(
    arguments_.target,
    options.remoteAuthorization ?? "",
  );
  const local = isLoopbackHostname(target.hostname.toLowerCase());
  const identity = {
    expectedCommit: arguments_.expectedCommit,
    expectedWorkerVersion: arguments_.expectedWorkerVersion,
    exerciseId: arguments_.exerciseId,
  };
  if (local && Object.values(identity).some(Boolean)) {
    throw new Error("remote staging identity arguments are not accepted for loopback targets");
  }
  if (!local) {
    validateRemoteIdentity(identity, configuration);
    try {
      await (options.checkoutVerifier ?? verifyReleaseCheckout)({
        root: ROOT,
        expectedCommit: identity.expectedCommit,
      });
    } catch {
      throw new Error("remote load execution requires a clean exact-source reviewed checkout");
    }
    await preflightRemoteTarget(target, identity, configuration, {
      fetchImpl: options.preflightFetch,
    });
  }
  const results = { latencies: [], failures: 0 };
  const deadline = performance.now() + profile.durationSeconds * 1000;
  const workerRunner = options.workerRunner ?? runWorker;
  await Promise.all(Array.from(
    { length: profile.concurrency },
    (_, workerId) => workerRunner(
      workerId,
      target,
      configuration,
      profile,
      deadline,
      results,
      options.loadFetch,
    ),
  ));
  const evaluation = evaluateResults(results.latencies, results.failures, configuration.budgets);
  return {
    schemaVersion: configuration.schemaVersion,
    environment: local ? "local-loopback" : "isolated-staging",
    targetIdentityVerified: !local,
    sourceCommit: local ? null : identity.expectedCommit,
    profile: arguments_.profile,
    ...evaluation.summary,
    passed: evaluation.passed,
  };
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const configuration = JSON.parse(await readFile(CONFIG_URL, "utf8"));
  const result = await executeLoadTest({
    arguments: arguments_,
    configuration,
    remoteAuthorization: process.env.CASTINGCOMPASS_LOAD_AUTHORIZATION ?? "",
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Load test refused or failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
    process.exitCode = 1;
  });
}
