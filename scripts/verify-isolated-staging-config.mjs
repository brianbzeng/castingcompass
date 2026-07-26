#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { isIP } from "node:net";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { verifyReleaseCheckout } from "./verify-release-checkout.mjs";

export const ISOLATED_STAGING_CONFIG_POLICY_VERSION =
  "castingcompass.isolated-staging-config-policy/1.0.0";
export const ISOLATED_STAGING_CONFIG_VERSION =
  "castingcompass.isolated-staging-wrangler/1.0.0";
export const ISOLATED_STAGING_CONFIG_RECEIPT_VERSION =
  "castingcompass.isolated-staging-config-receipt/1.0.0";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = join(ROOT, "security", "isolated-staging-config-policy.json");
const SCHEMA_PATH = join(ROOT, "contracts", "isolated-staging-wrangler.schema.json");
const PRODUCTION_CONFIG_PATH = join(ROOT, "wrangler.jsonc");
const COMMIT_PATTERN = /^[a-f0-9]{40}$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const WORKER_VERSION_PATTERN = /^[A-Za-z0-9-]{1,128}$/u;

export class IsolatedStagingConfigRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IsolatedStagingConfigRefusal";
    this.code = code;
  }
}

function refuse(code, message) {
  throw new IsolatedStagingConfigRefusal(code, message);
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") refuse("unsupported-json", "Unsupported JSON value");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, expected, name, code = "policy-invalid") {
  if (!value || typeof value !== "object" || Array.isArray(value)) refuse(code, `${name} is invalid`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) refuse(code, `${name} has unexpected fields`);
}

function exactValue(value, expected, name, code = "policy-invalid") {
  if (canonicalJson(value) !== canonicalJson(expected)) refuse(code, `${name} was changed`);
}

function productionIdentity(config) {
  return {
    worker_name: config.name,
    database_name: config.d1_databases?.[0]?.database_name,
    database_id: config.d1_databases?.[0]?.database_id,
    hosts: (config.routes ?? []).map((route) => route.pattern),
    rate_limit_namespace_ids: (config.ratelimits ?? []).map((binding) => binding.namespace_id),
  };
}

export function validatePolicy(policy, productionConfig = JSON.parse(readFileSync(PRODUCTION_CONFIG_PATH, "utf8"))) {
  exactKeys(policy, [
    "schema_version", "config_contract_version", "receipt_contract_version", "application",
    "production", "feature_flags", "rate_limits", "queue", "limits", "production_gates",
  ], "Isolated-staging configuration policy");
  if (policy.schema_version !== ISOLATED_STAGING_CONFIG_POLICY_VERSION
    || policy.config_contract_version !== ISOLATED_STAGING_CONFIG_VERSION
    || policy.receipt_contract_version !== ISOLATED_STAGING_CONFIG_RECEIPT_VERSION) {
    refuse("policy-invalid", "Isolated-staging configuration policy identity is invalid");
  }
  exactKeys(policy.application, [
    "worker_name", "main", "compatibility_date", "compatibility_flags", "assets_binding",
    "assets_directory", "version_metadata_binding", "exercise_service_binding", "exercise_service_name",
  ], "Application boundary");
  exactValue(policy.production, productionIdentity(productionConfig), "Production resource inventory");
  exactValue(policy.feature_flags, {
    PUBLIC_DISCUSSIONS_ENABLED: "false",
    TRIP_PHOTO_UPLOADS_ENABLED: "false",
    TURNSTILE_ENABLED: "false",
    RATE_LIMITING_ENABLED: "true",
    PRIVACY_EXPORT_QUEUE_ENABLED: "false",
    RELEASE_MAINTENANCE_MODE: "false",
  }, "Staging feature flags");
  exactValue(policy.rate_limits, [
    { name: "AUTH_RATE_LIMITER", limit: 20, period: 60 },
    { name: "EMAIL_RATE_LIMITER", limit: 5, period: 60 },
    { name: "WRITE_RATE_LIMITER", limit: 30, period: 60 },
    { name: "SENSITIVE_RATE_LIMITER", limit: 6, period: 60 },
    { name: "READ_RATE_LIMITER", limit: 120, period: 60 },
    { name: "AI_PROVIDER_RATE_LIMITER", limit: 20, period: 60 },
  ], "Staging rate limits");
  exactValue(policy.queue, {
    binding: "AI_REVIEW_QUEUE",
    name: "contourcast-ai-review-isolated-staging",
    dead_letter_name: "contourcast-ai-review-isolated-staging-dlq",
    max_batch_size: 5,
    max_batch_timeout: 10,
    max_retries: 8,
    max_concurrency: 1,
  }, "Staging Queue boundary");
  exactValue(policy.limits, { maximum_config_bytes: 65536, maximum_receipt_bytes: 32768 }, "File limits");
  exactKeys(policy.production_gates, [
    "provider_resources_provisioned", "configurations_verified", "versions_deployed", "production_authority",
  ], "Production gates");
  if (Object.values(policy.production_gates).some((value) => value !== false)) {
    refuse("policy-invalid", "Repository policy cannot self-approve a production gate");
  }
  return policy;
}

export function loadPolicy() {
  return validatePolicy(JSON.parse(readFileSync(POLICY_PATH, "utf8")));
}

function configurationValidator() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

function validateTargetHost(host, policy) {
  if (typeof host !== "string" || host !== host.toLowerCase()
    || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(host)
    || isIP(host) !== 0) {
    refuse("target-invalid", "Isolated staging requires one canonical DNS custom domain");
  }
  if (policy.production.hosts.includes(host) || host.endsWith(".castingcompass.com")) {
    refuse("production-blocked", "Production and every CastingCompass subdomain are blocked");
  }
  return host;
}

function validateRateLimits(config, policy) {
  const expected = policy.rate_limits.map((entry) => ({
    name: entry.name,
    limit: entry.limit,
    period: entry.period,
  }));
  const actual = config.ratelimits.map((entry) => ({
    name: entry.name,
    limit: entry.simple.limit,
    period: entry.simple.period,
  }));
  exactValue(actual, expected, "Rate-limit contract", "configuration-invalid");
  const namespaceIds = config.ratelimits.map((entry) => entry.namespace_id);
  if (new Set(namespaceIds).size !== namespaceIds.length
    || namespaceIds.some((value) => policy.production.rate_limit_namespace_ids.includes(value))) {
    refuse("production-binding", "Staging rate-limit namespaces must be distinct and non-production");
  }
  return namespaceIds;
}

function validateQueue(config, mode, policy) {
  if (mode === "direct") {
    if (config.vars.AI_REVIEW_QUEUE_ENABLED !== "false" || Object.hasOwn(config, "queues")) {
      refuse("mode-invalid", "Direct mode must disable and omit Queue configuration");
    }
    return;
  }
  if (mode !== "durable_queue" || config.vars.AI_REVIEW_QUEUE_ENABLED !== "true") {
    refuse("mode-invalid", "Durable Queue mode must enable the Queue feature flag");
  }
  const producer = config.queues?.producers?.[0];
  const consumer = config.queues?.consumers?.[0];
  exactValue(producer, { binding: policy.queue.binding, queue: policy.queue.name }, "Queue producer", "configuration-invalid");
  exactValue(consumer, {
    queue: policy.queue.name,
    max_batch_size: policy.queue.max_batch_size,
    max_batch_timeout: policy.queue.max_batch_timeout,
    max_retries: policy.queue.max_retries,
    max_concurrency: policy.queue.max_concurrency,
    dead_letter_queue: policy.queue.dead_letter_name,
  }, "Queue consumer", "configuration-invalid");
}

export function validateConfiguration(config, mode, policy = loadPolicy()) {
  const validate = configurationValidator();
  if (!validate(config)) refuse("configuration-schema", "Resolved Wrangler configuration manifest rejected");
  const app = policy.application;
  if (config.name !== app.worker_name || config.name === policy.production.worker_name
    || config.main !== app.main || config.compatibility_date !== app.compatibility_date) {
    refuse("configuration-invalid", "Application identity is not the locked staging identity");
  }
  exactValue(config.compatibility_flags, app.compatibility_flags, "Compatibility flags", "configuration-invalid");
  exactValue(config.version_metadata, { binding: app.version_metadata_binding }, "Version metadata", "configuration-invalid");
  exactValue(config.rules, [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }], "Module rules", "configuration-invalid");
  exactValue(config.assets, { directory: app.assets_directory, binding: app.assets_binding }, "Assets binding", "configuration-invalid");
  exactValue(config.services, [{ binding: app.exercise_service_binding, service: app.exercise_service_name }], "Exercise service", "configuration-invalid");
  exactValue(config.observability, {
    enabled: true,
    logs: { invocation_logs: false, head_sampling_rate: 1 },
  }, "Observability boundary", "configuration-invalid");

  const host = validateTargetHost(config.routes[0].pattern, policy);
  const database = config.d1_databases[0];
  if (database.database_name === policy.production.database_name
    || database.database_id === policy.production.database_id) {
    refuse("production-binding", "Production D1 identity is blocked");
  }
  for (const [name, value] of Object.entries(policy.feature_flags)) {
    if (config.vars[name] !== value) refuse("configuration-invalid", `${name} does not match staging policy`);
  }
  if (config.vars.AI_REVIEW_EXERCISE_ID !== config.vars.SECURITY_EXERCISE_ID) {
    refuse("exercise-mismatch", "Exercise identifiers must match exactly");
  }
  const namespaceIds = validateRateLimits(config, policy);
  validateQueue(config, mode, policy);
  return {
    config,
    mode,
    targetOrigin: `https://${host}`,
    database,
    namespaceIds,
    exerciseId: config.vars.AI_REVIEW_EXERCISE_ID,
    accountHash: config.vars.AI_REVIEW_EXERCISE_ACCOUNT_HASH,
    exerciseProviderVersionId: config.vars.AI_REVIEW_EXERCISE_PROVIDER_VERSION_ID,
  };
}

export function validateConfigurationPair(directConfig, queueConfig, policy = loadPolicy()) {
  const direct = validateConfiguration(directConfig, "direct", policy);
  const durableQueue = validateConfiguration(queueConfig, "durable_queue", policy);
  const shared = (value) => ({
    name: value.config.name,
    main: value.config.main,
    compatibility_date: value.config.compatibility_date,
    compatibility_flags: value.config.compatibility_flags,
    workers_dev: value.config.workers_dev,
    target_origin: value.targetOrigin,
    rules: value.config.rules,
    assets: value.config.assets,
    d1_databases: value.config.d1_databases,
    services: value.config.services,
    ratelimits: value.config.ratelimits,
    version_metadata: value.config.version_metadata,
    observability: value.config.observability,
    shared_vars: Object.fromEntries(Object.entries(value.config.vars)
      .filter(([name]) => name !== "AI_REVIEW_QUEUE_ENABLED")),
  });
  exactValue(shared(direct), shared(durableQueue), "Shared staging resources", "configuration-mismatch");
  return { direct, durableQueue };
}

export function buildConfigurationReceipt(validatedPair, sourceCommit, policy = loadPolicy()) {
  if (!COMMIT_PATTERN.test(sourceCommit ?? "")) refuse("source-invalid", "Source commit must be full lowercase SHA-1");
  const { direct, durableQueue } = validatedPair;
  const queue = policy.queue;
  return {
    schema_version: ISOLATED_STAGING_CONFIG_RECEIPT_VERSION,
    policy_sha256: sha256(canonicalJson(policy)),
    source_commit: sourceCommit,
    target_origin: direct.targetOrigin,
    config_sha256: {
      direct: sha256(canonicalJson(direct.config)),
      durable_queue: sha256(canonicalJson(durableQueue.config)),
    },
    exercise_id_sha256: sha256(direct.exerciseId),
    synthetic_account_hash: direct.accountHash,
    exercise_provider_version_id: direct.exerciseProviderVersionId,
    resource_identity_sha256: {
      d1: sha256(canonicalJson(direct.config.d1_databases[0])),
      rate_limit_namespaces: sha256(canonicalJson(direct.namespaceIds)),
      exercise_service: sha256(canonicalJson(direct.config.services[0])),
      queue: sha256(queue.name),
      dead_letter_queue: sha256(queue.dead_letter_name),
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
}

export function validateConfigurationReceipt(receipt, policy = loadPolicy()) {
  exactKeys(receipt, [
    "schema_version", "policy_sha256", "source_commit", "target_origin", "config_sha256",
    "exercise_id_sha256", "synthetic_account_hash", "exercise_provider_version_id",
    "resource_identity_sha256", "mode_boundaries", "production_resources_excluded",
    "provider_contacted", "deployment_performed", "production_ready", "production_authority",
  ], "Configuration receipt", "receipt-invalid");
  if (receipt.schema_version !== ISOLATED_STAGING_CONFIG_RECEIPT_VERSION
    || receipt.policy_sha256 !== sha256(canonicalJson(policy))
    || !COMMIT_PATTERN.test(receipt.source_commit ?? "")
    || !HASH_PATTERN.test(receipt.exercise_id_sha256 ?? "")
    || !HASH_PATTERN.test(receipt.synthetic_account_hash ?? "")
    || !WORKER_VERSION_PATTERN.test(receipt.exercise_provider_version_id ?? "")) {
    refuse("receipt-invalid", "Configuration receipt identity is invalid");
  }
  exactKeys(receipt.config_sha256, ["direct", "durable_queue"], "Configuration hashes", "receipt-invalid");
  exactKeys(receipt.resource_identity_sha256, [
    "d1", "rate_limit_namespaces", "exercise_service", "queue", "dead_letter_queue",
  ], "Resource hashes", "receipt-invalid");
  if ([...Object.values(receipt.config_sha256), ...Object.values(receipt.resource_identity_sha256)]
    .some((value) => !HASH_PATTERN.test(value))) refuse("receipt-invalid", "Receipt hashes are invalid");
  if (receipt.config_sha256.direct === receipt.config_sha256.durable_queue) {
    refuse("receipt-invalid", "Direct and Queue configurations must be distinct");
  }
  let receiptTarget;
  try {
    receiptTarget = new URL(receipt.target_origin);
  } catch {
    refuse("receipt-invalid", "Configuration receipt target is invalid");
  }
  if (receiptTarget.protocol !== "https:" || receiptTarget.username || receiptTarget.password
    || receiptTarget.port || receiptTarget.pathname !== "/" || receiptTarget.search || receiptTarget.hash
    || receiptTarget.origin !== receipt.target_origin) {
    refuse("receipt-invalid", "Configuration receipt target is not one canonical HTTPS origin");
  }
  validateTargetHost(receiptTarget.hostname, policy);
  exactValue(receipt.mode_boundaries, [
    { mode: "direct", queue_enabled: false, queue_bindings: 0 },
    { mode: "durable_queue", queue_enabled: true, queue_bindings: 2 },
  ], "Mode boundaries", "receipt-invalid");
  if (receipt.production_resources_excluded !== true || receipt.provider_contacted !== false
    || receipt.deployment_performed !== false || receipt.production_ready !== false
    || receipt.production_authority !== false) {
    refuse("receipt-invalid", "Receipt truth boundaries are invalid");
  }
  return receipt;
}

function pathInsideRepository(path) {
  const fromRoot = relative(ROOT, resolve(path));
  return fromRoot === "" || (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`));
}

function privateJsonRead(path, maximumBytes) {
  if (!isAbsolute(path) || pathInsideRepository(path)) refuse("file-location", "Private input must be an absolute out-of-repository file");
  const resolved = resolve(path);
  const before = lstatSync(resolved, { throwIfNoEntry: false });
  if (!before || before.isSymbolicLink() || !before.isFile() || before.size <= 0 || before.size > maximumBytes
    || before.nlink !== 1 || (before.mode & 0o077) !== 0
    || (typeof process.getuid === "function" && before.uid !== process.getuid())) {
    refuse("file-safety", "Private input must be a current-user-owned bounded 0600 regular file");
  }
  let descriptor;
  try {
    descriptor = openSync(resolved, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch {
    refuse("file-safety", "Private input could not be opened safely");
  }
  try {
    const opened = fstatSync(descriptor);
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size
      || opened.mtimeMs !== before.mtimeMs || opened.ctimeMs !== before.ctimeMs || opened.nlink !== 1) {
      refuse("file-race", "Private input changed while opening");
    }
    const text = readFileSync(descriptor, "utf8");
    const after = fstatSync(descriptor);
    if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs
      || Buffer.byteLength(text) !== opened.size) refuse("file-race", "Private input changed while reading");
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof IsolatedStagingConfigRefusal) throw error;
    refuse("file-json", "Private input is not valid JSON");
  } finally {
    closeSync(descriptor);
  }
}

function privateJsonWrite(path, value, maximumBytes) {
  if (!isAbsolute(path) || pathInsideRepository(path)) refuse("file-location", "Private output must be an absolute out-of-repository file");
  const resolved = resolve(path);
  const parent = lstatSync(dirname(resolved), { throwIfNoEntry: false });
  if (!parent || parent.isSymbolicLink() || !parent.isDirectory() || (parent.mode & 0o077) !== 0
    || (typeof process.getuid === "function" && parent.uid !== process.getuid())) {
    refuse("file-safety", "Private output parent must be a current-user-owned 0700 directory");
  }
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(serialized) > maximumBytes) refuse("file-size", "Private output exceeds its fixed ceiling");
  try {
    writeFileSync(resolved, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
    const written = lstatSync(resolved);
    if (!written.isFile() || written.isSymbolicLink() || written.nlink !== 1
      || written.size !== Buffer.byteLength(serialized) || (written.mode & 0o077) !== 0
      || (typeof process.getuid === "function" && written.uid !== process.getuid())) {
      refuse("file-safety", "Private output did not preserve its locked file identity");
    }
  } catch (error) {
    if (error instanceof IsolatedStagingConfigRefusal) throw error;
    refuse("file-safety", "Private output could not be created exclusively");
  }
}

function template(mode, policy) {
  const vars = {
    ...policy.feature_flags,
    AI_REVIEW_QUEUE_ENABLED: mode === "durable_queue" ? "true" : "false",
    AI_REVIEW_EXERCISE_ID: "sec_00000000000000000000000000000000",
    AI_REVIEW_EXERCISE_ACCOUNT_HASH: "0".repeat(64),
    AI_REVIEW_EXERCISE_PROVIDER_VERSION_ID: "REPLACE-STUB-VERSION",
    SECURITY_EXERCISE_ID: "sec_00000000000000000000000000000000",
  };
  const config = {
    schema_version: ISOLATED_STAGING_CONFIG_VERSION,
    name: policy.application.worker_name,
    main: policy.application.main,
    compatibility_date: policy.application.compatibility_date,
    compatibility_flags: policy.application.compatibility_flags,
    workers_dev: false,
    vars,
    ratelimits: policy.rate_limits.map((entry, index) => ({
      name: entry.name,
      namespace_id: `REPLACE${index + 1}`,
      simple: { limit: entry.limit, period: entry.period },
    })),
    version_metadata: { binding: policy.application.version_metadata_binding },
    routes: [{ pattern: "replace-with-isolated-host.invalid", custom_domain: true }],
    no_bundle: true,
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    assets: { directory: policy.application.assets_directory, binding: policy.application.assets_binding },
    d1_databases: [{
      binding: "DB",
      database_name: "replace-with-database-isolated-staging",
      database_id: "REPLACE-WITH-ISOLATED-D1-ID",
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

function parseArguments(args) {
  const command = args[0];
  const options = {};
  for (let index = 1; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value || !["--mode", "--output", "--direct-config", "--queue-config", "--expected-commit"].includes(flag)) {
      refuse("arguments", `Unknown or incomplete argument: ${flag}`);
    }
    options[flag.slice(2)] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const policy = loadPolicy();
  configurationValidator();
  if (command === "verify-policy") {
    process.stdout.write(`${JSON.stringify({
      policy_version: policy.schema_version,
      policy_sha256: sha256(canonicalJson(policy)),
      deployment_supported: false,
      provider_contacted: false,
      production_authority: false,
    })}\n`);
    return;
  }
  if (command === "write-template") {
    if (!options.output || !["direct", "durable_queue"].includes(options.mode)
      || options["direct-config"] || options["queue-config"] || options["expected-commit"]) {
      refuse("arguments", "write-template requires only --mode direct|durable_queue and --output");
    }
    privateJsonWrite(options.output, template(options.mode, policy), policy.limits.maximum_config_bytes);
    process.stdout.write(`${JSON.stringify({ written: true, private: true, deployable: false })}\n`);
    return;
  }
  if (command === "verify") {
    if (!options["direct-config"] || !options["queue-config"] || !options["expected-commit"] || !options.output
      || options.mode) {
      refuse("arguments", "verify requires --direct-config, --queue-config, --expected-commit, and --output");
    }
    await verifyReleaseCheckout({ root: ROOT, expectedCommit: options["expected-commit"] });
    const direct = privateJsonRead(options["direct-config"], policy.limits.maximum_config_bytes);
    const queue = privateJsonRead(options["queue-config"], policy.limits.maximum_config_bytes);
    const pair = validateConfigurationPair(direct, queue, policy);
    const receipt = buildConfigurationReceipt(pair, options["expected-commit"], policy);
    privateJsonWrite(options.output, receipt, policy.limits.maximum_receipt_bytes);
    process.stdout.write(`${JSON.stringify({
      verified: true,
      receipt_sha256: sha256(canonicalJson(receipt)),
      provider_contacted: false,
      deployment_performed: false,
      production_authority: false,
    })}\n`);
    return;
  }
  refuse("command", "Use verify-policy, write-template, or verify. This tool has no deploy or run command");
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const code = error instanceof IsolatedStagingConfigRefusal ? error.code : "isolated-staging-config-failed";
    process.stderr.write(`${code}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
