#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const POLICY_SCHEMA_VERSION =
  "castingcompass.cloudflare-provider-state-policy/1.0.0";
export const RECEIPT_SCHEMA_VERSION =
  "castingcompass.cloudflare-provider-state-receipt/1.0.0";
export const READ_ONLY_CONFIRMATION = "contourcast-halibut";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = join(ROOT, "security", "cloudflare-provider-state-policy.json");
const CONFIG_PATH = join(ROOT, "wrangler.jsonc");
const PACKAGE_PATH = join(ROOT, "package.json");
const WRANGLER_PATH = join(ROOT, "node_modules", ".bin", "wrangler");
const VERSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const BINDING_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/u;
const COMPATIBILITY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const BLOCKER_CODES = [
  "binding-drift",
  "compatibility-drift",
  "live-host-verification-missing",
  "maintenance-mode-inactive",
  "provider-config-not-evaluated",
  "reviewed-commit-unbound",
  "traffic-not-single-100",
];
const EXPECTED_TOP_LEVEL_RECEIPT_FIELDS = [
  "schema_version",
  "observed_at",
  "worker",
  "read_only",
  "provider_mutation_performed",
  "traffic",
  "maintenance",
  "configuration",
  "source_identity",
  "production_hold_proven",
  "release_ready",
  "blockers",
];
const FORBIDDEN_IDENTIFIER_KEYS = [
  "account_id",
  "author_email",
  "author_id",
  "database_id",
  "deployment_id",
  "etag",
  "namespace_id",
  "secret",
  "token",
  "version_id",
];
const EXPECTED_COMMANDS = {
  deployment_status: [
    "deployments", "status", "--name", "{worker}", "--config", "wrangler.jsonc", "--json",
  ],
  version_view: [
    "versions", "view", "{version}", "--name", "{worker}", "--config", "wrangler.jsonc", "--json",
  ],
};

export class ProviderStateRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProviderStateRefusal";
    this.code = code;
  }
}

function refuse(code, message) {
  throw new ProviderStateRefusal(code, message);
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    refuse("policy-invalid", `${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    refuse("policy-invalid", `${label} has unexpected fields`);
  }
}

function exactArray(value, expected, label) {
  if (!Array.isArray(value)
    || value.length !== expected.length
    || value.some((item, index) => item !== expected[index])) {
    refuse("policy-invalid", `${label} disagrees with the locked policy`);
  }
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "number"
    || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") refuse("policy-invalid", "Unsupported JSON value");
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(",")}}`;
}

function readJson(path, maximumBytes, label) {
  const bytes = readFileSync(path);
  if (bytes.length === 0 || bytes.length > maximumBytes) {
    refuse("file-invalid", `${label} is empty or exceeds its byte limit`);
  }
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    refuse("file-invalid", `${label} is not valid JSON`);
  }
}

export function parseBoundedJson(value, maximumBytes, label) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") === 0
    || Buffer.byteLength(value, "utf8") > maximumBytes) {
    refuse("provider-output-invalid", `${label} is empty or exceeds its byte limit`);
  }
  try {
    return JSON.parse(value);
  } catch {
    refuse("provider-output-invalid", `${label} is not valid JSON`);
  }
}

export function validatePolicy(policy) {
  exactKeys(policy, [
    "schema_version", "policy_id", "worker", "production_hold", "source_binding",
    "commands", "limits", "public_receipt",
  ], "Cloudflare provider-state policy");
  if (policy.schema_version !== POLICY_SCHEMA_VERSION
    || policy.policy_id !== "castingcompass-cloudflare-provider-state-v1") {
    refuse("policy-invalid", "Cloudflare provider-state policy identity is invalid");
  }

  exactKeys(policy.worker, ["name", "config_path", "wrangler_version"], "Worker policy");
  if (policy.worker.name !== "contourcast-halibut"
    || policy.worker.config_path !== "wrangler.jsonc"
    || policy.worker.wrangler_version !== "4.112.0") {
    refuse("policy-invalid", "Worker identity is not locked");
  }

  exactKeys(policy.production_hold, [
    "required", "variable_name", "candidate_default_value", "expected_deployed_value",
    "live_host_verification_required",
  ], "Production-hold policy");
  if (policy.production_hold.required !== true
    || policy.production_hold.variable_name !== "RELEASE_MAINTENANCE_MODE"
    || policy.production_hold.candidate_default_value !== "false"
    || policy.production_hold.expected_deployed_value !== "true"
    || policy.production_hold.live_host_verification_required !== true) {
    refuse("policy-invalid", "Production-hold policy was weakened");
  }

  exactKeys(policy.source_binding, [
    "required", "provider_metadata_is_sufficient", "private_exact_identity_evidence_required",
  ], "Source-binding policy");
  if (policy.source_binding.required !== true
    || policy.source_binding.provider_metadata_is_sufficient !== false
    || policy.source_binding.private_exact_identity_evidence_required !== true) {
    refuse("policy-invalid", "Source-binding policy was weakened");
  }

  exactKeys(policy.commands, ["deployment_status", "version_view"], "Command policy");
  exactArray(policy.commands.deployment_status, EXPECTED_COMMANDS.deployment_status,
    "Deployment-status command");
  exactArray(policy.commands.version_view, EXPECTED_COMMANDS.version_view,
    "Version-view command");

  exactKeys(policy.limits, [
    "maximum_output_bytes", "maximum_versions", "maximum_bindings",
  ], "Provider-output limits");
  if (policy.limits.maximum_output_bytes !== 1_048_576
    || policy.limits.maximum_versions !== 32
    || policy.limits.maximum_bindings !== 128) {
    refuse("policy-invalid", "Provider-output limits were weakened");
  }

  exactKeys(policy.public_receipt, [
    "schema_version", "allowed_top_level_fields", "forbidden_identifier_keys",
  ], "Public-receipt policy");
  if (policy.public_receipt.schema_version !== RECEIPT_SCHEMA_VERSION) {
    refuse("policy-invalid", "Public-receipt identity is invalid");
  }
  exactArray(policy.public_receipt.allowed_top_level_fields,
    EXPECTED_TOP_LEVEL_RECEIPT_FIELDS, "Public-receipt field allowlist");
  exactArray(policy.public_receipt.forbidden_identifier_keys,
    FORBIDDEN_IDENTIFIER_KEYS, "Public-receipt identifier denylist");
  return policy;
}

export function loadPolicy() {
  return validatePolicy(readJson(POLICY_PATH, 256 * 1024, "Cloudflare provider-state policy"));
}

function validateRepositoryContract(policy, config, packageManifest) {
  if (config.name !== policy.worker.name
    || packageManifest.devDependencies?.wrangler !== policy.worker.wrangler_version
    || config.vars?.[policy.production_hold.variable_name]
      !== policy.production_hold.candidate_default_value) {
    refuse("repository-contract-invalid", "Worker identity, Wrangler version, or hold default drifted");
  }
  if (config.workers_dev !== true
    || !Array.isArray(config.compatibility_flags)
    || !COMPATIBILITY_DATE_PATTERN.test(config.compatibility_date ?? "")
    || config.compatibility_flags.length === 0
    || config.compatibility_flags.some((flag) => typeof flag !== "string" || flag.length === 0)
    || new Set(config.compatibility_flags).size !== config.compatibility_flags.length
    || !config.assets?.binding
    || !config.version_metadata?.binding
    || !Array.isArray(config.d1_databases)
    || config.d1_databases.length !== 1
    || !Array.isArray(config.ratelimits)
    || config.ratelimits.length !== 6) {
    refuse("repository-contract-invalid", "Required Worker configuration is incomplete");
  }
  for (const [name, value] of Object.entries(config.vars ?? {})) {
    if (!BINDING_NAME_PATTERN.test(name) || typeof value !== "string") {
      refuse("repository-contract-invalid", "Worker variables must be named strings");
    }
  }
  for (const database of config.d1_databases) {
    if (!BINDING_NAME_PATTERN.test(database.binding ?? "")
      || !VERSION_ID_PATTERN.test(database.database_id ?? "")) {
      refuse("repository-contract-invalid", "D1 binding identity is invalid");
    }
  }
  for (const rateLimit of config.ratelimits) {
    if (!BINDING_NAME_PATTERN.test(rateLimit.name ?? "")
      || typeof rateLimit.namespace_id !== "string"
      || !/^\d{1,32}$/u.test(rateLimit.namespace_id)
      || !rateLimit.simple || typeof rateLimit.simple !== "object"
      || Array.isArray(rateLimit.simple)
      || Object.keys(rateLimit.simple).sort().join(",") !== "limit,period"
      || !Number.isInteger(rateLimit.simple.limit) || rateLimit.simple.limit <= 0
      || !Number.isInteger(rateLimit.simple.period) || rateLimit.simple.period <= 0) {
      refuse("repository-contract-invalid", "Rate-limit binding contract is invalid");
    }
  }
  return { policy, config, packageManifest };
}

export function loadRepositoryContract() {
  const policy = loadPolicy();
  const config = readJson(CONFIG_PATH, policy.limits.maximum_output_bytes, "Wrangler configuration");
  const packageManifest = readJson(
    PACKAGE_PATH, policy.limits.maximum_output_bytes, "Package manifest",
  );
  return validateRepositoryContract(policy, config, packageManifest);
}

function expectedBinding(name, type, properties = {}) {
  if (!BINDING_NAME_PATTERN.test(name ?? "")) {
    refuse("repository-contract-invalid", "A configured binding name is invalid");
  }
  return { name, type, ...properties };
}

export function buildExpectedBindings(config, policy) {
  const bindings = [];
  for (const [name, configuredValue] of Object.entries(config.vars ?? {})) {
    const text = name === policy.production_hold.variable_name
      ? policy.production_hold.expected_deployed_value
      : configuredValue;
    bindings.push(expectedBinding(name, "plain_text", { text }));
  }
  bindings.push(expectedBinding(config.assets.binding, "assets"));
  bindings.push(expectedBinding(config.version_metadata.binding, "version_metadata"));
  for (const database of config.d1_databases) {
    bindings.push(expectedBinding(database.binding, "d1", { database_id: database.database_id }));
  }
  for (const rateLimit of config.ratelimits) {
    bindings.push(expectedBinding(rateLimit.name, "ratelimit", {
      namespace_id: rateLimit.namespace_id,
      simple: rateLimit.simple,
    }));
  }
  const names = new Set();
  for (const binding of bindings) {
    if (names.has(binding.name)) {
      refuse("repository-contract-invalid", "Configured binding names must be unique");
    }
    names.add(binding.name);
  }
  return bindings;
}

function compareBinding(expected, observed) {
  if (observed.type !== expected.type) return false;
  if (expected.type === "plain_text") return observed.text === expected.text;
  if (expected.type === "d1") return observed.database_id === expected.database_id;
  if (expected.type === "ratelimit") {
    return observed.namespace_id === expected.namespace_id
      && observed.simple?.limit === expected.simple?.limit
      && observed.simple?.period === expected.simple?.period;
  }
  return true;
}

function analyzeTraffic(status, policy) {
  if (!status || typeof status !== "object" || Array.isArray(status)
    || !Array.isArray(status.versions)
    || status.versions.length === 0
    || status.versions.length > policy.limits.maximum_versions) {
    refuse("provider-output-invalid", "Deployment status has an invalid version inventory");
  }
  const versionIds = new Set();
  for (const version of status.versions) {
    if (!version || typeof version !== "object" || Array.isArray(version)
      || !VERSION_ID_PATTERN.test(version.version_id ?? "")
      || !Number.isFinite(version.percentage)
      || version.percentage < 0 || version.percentage > 100
      || versionIds.has(version.version_id)) {
      refuse("provider-output-invalid", "Deployment traffic data is invalid");
    }
    versionIds.add(version.version_id);
  }
  const active = status.versions.filter(({ percentage }) => percentage === 100);
  const accepted = status.versions.length === 1 && active.length === 1;
  return { accepted, versionId: accepted ? active[0].version_id : null };
}

function analyzeVersion(version, versionId, expectedBindings, config, policy) {
  if (!version || typeof version !== "object" || Array.isArray(version)
    || version.id !== versionId
    || !version.resources || typeof version.resources !== "object"
    || !Array.isArray(version.resources.bindings)
    || version.resources.bindings.length > policy.limits.maximum_bindings) {
    refuse("provider-output-invalid", "Worker version output is invalid or unbound");
  }
  const runtime = version.resources.script_runtime;
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    refuse("provider-output-invalid", "Worker runtime output is missing");
  }
  const observedByName = new Map();
  for (const binding of version.resources.bindings) {
    if (!binding || typeof binding !== "object" || Array.isArray(binding)
      || typeof binding.name !== "string" || binding.name.length === 0
      || typeof binding.type !== "string" || binding.type.length === 0
      || observedByName.has(binding.name)) {
      refuse("provider-output-invalid", "Worker bindings contain an invalid or duplicate name");
    }
    observedByName.set(binding.name, binding);
  }

  const missing = [];
  const mismatched = [];
  for (const expected of expectedBindings) {
    const observed = observedByName.get(expected.name);
    if (!observed) missing.push(expected.name);
    else if (!compareBinding(expected, observed)) mismatched.push(expected.name);
  }
  const expectedNames = new Set(expectedBindings.map(({ name }) => name));
  const unexpectedNonSecretCount = [...observedByName.values()].filter((binding) => (
    binding.type !== "secret_text" && !expectedNames.has(binding.name)
  )).length;
  const compatibilityMatches = runtime.compatibility_date === config.compatibility_date
    && Array.isArray(runtime.compatibility_flags)
    && canonicalJson([...runtime.compatibility_flags].sort())
      === canonicalJson([...config.compatibility_flags].sort());
  const maintenanceBinding = observedByName.get(policy.production_hold.variable_name);
  const maintenanceMatches = maintenanceBinding?.type === "plain_text"
    && maintenanceBinding.text === policy.production_hold.expected_deployed_value;
  return {
    providerMetadataPresent: typeof version.resources.script?.last_deployed_from === "string",
    compatibilityMatches,
    maintenanceMatches,
    missing,
    mismatched,
    unexpectedNonSecretCount,
    bindingsMatch: missing.length === 0 && mismatched.length === 0
      && unexpectedNonSecretCount === 0,
  };
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function isCanonicalTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function buildReceipt({ policy, observedAt, trafficAccepted, versionAnalysis = null }) {
  const blockers = [];
  if (!trafficAccepted) blockers.push("traffic-not-single-100");
  if (!versionAnalysis) blockers.push("provider-config-not-evaluated");
  if (versionAnalysis && !versionAnalysis.maintenanceMatches) {
    blockers.push("maintenance-mode-inactive");
  }
  if (versionAnalysis && !versionAnalysis.compatibilityMatches) {
    blockers.push("compatibility-drift");
  }
  if (versionAnalysis && !versionAnalysis.bindingsMatch) blockers.push("binding-drift");
  blockers.push("reviewed-commit-unbound", "live-host-verification-missing");
  const receipt = {
    schema_version: RECEIPT_SCHEMA_VERSION,
    observed_at: observedAt,
    worker: policy.worker.name,
    read_only: true,
    provider_mutation_performed: false,
    traffic: {
      one_version_at_100_percent: trafficAccepted,
    },
    maintenance: {
      required: true,
      configured_value_matches: versionAnalysis?.maintenanceMatches ?? false,
      live_host_verified: false,
    },
    configuration: {
      evaluated: versionAnalysis !== null,
      compatibility_matches: versionAnalysis?.compatibilityMatches ?? false,
      bindings_match: versionAnalysis?.bindingsMatch ?? false,
      missing_binding_names: versionAnalysis?.missing ?? [],
      mismatched_binding_names: versionAnalysis?.mismatched ?? [],
      unexpected_non_secret_binding_count: versionAnalysis?.unexpectedNonSecretCount ?? 0,
    },
    source_identity: {
      provider_metadata_present: versionAnalysis?.providerMetadataPresent ?? false,
      provider_metadata_is_sufficient: false,
      reviewed_commit_bound: false,
    },
    production_hold_proven: false,
    release_ready: false,
    blockers: sortedUnique(blockers),
  };
  return assertPublicReceipt(receipt, policy);
}

function assertNoForbiddenKeys(value, forbidden, path = "receipt") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key.toLowerCase())) {
      refuse("receipt-unsafe", `${path} contains a forbidden identifier field`);
    }
    assertNoForbiddenKeys(child, forbidden, `${path}.${key}`);
  }
}

export function assertPublicReceipt(receipt, policy) {
  exactKeys(receipt, policy.public_receipt.allowed_top_level_fields, "Public receipt");
  exactKeys(receipt.traffic, ["one_version_at_100_percent"], "Public receipt traffic");
  exactKeys(receipt.maintenance, [
    "required", "configured_value_matches", "live_host_verified",
  ], "Public receipt maintenance");
  exactKeys(receipt.configuration, [
    "evaluated", "compatibility_matches", "bindings_match", "missing_binding_names",
    "mismatched_binding_names", "unexpected_non_secret_binding_count",
  ], "Public receipt configuration");
  exactKeys(receipt.source_identity, [
    "provider_metadata_present", "provider_metadata_is_sufficient", "reviewed_commit_bound",
  ], "Public receipt source identity");
  assertNoForbiddenKeys(receipt, new Set(policy.public_receipt.forbidden_identifier_keys));
  const expectedBindingNames = new Set(buildExpectedBindings(
    readJson(CONFIG_PATH, policy.limits.maximum_output_bytes, "Wrangler configuration"), policy,
  ).map(({ name }) => name));
  const receiptBindingNames = [
    ...(receipt.configuration.missing_binding_names ?? []),
    ...(receipt.configuration.mismatched_binding_names ?? []),
  ];
  if (receipt.schema_version !== RECEIPT_SCHEMA_VERSION
    || receipt.worker !== policy.worker.name
    || !isCanonicalTimestamp(receipt.observed_at)
    || receipt.read_only !== true
    || receipt.provider_mutation_performed !== false
    || typeof receipt.traffic.one_version_at_100_percent !== "boolean"
    || receipt.maintenance.required !== true
    || typeof receipt.maintenance.configured_value_matches !== "boolean"
    || receipt.maintenance.live_host_verified !== false
    || typeof receipt.configuration.evaluated !== "boolean"
    || typeof receipt.configuration.compatibility_matches !== "boolean"
    || typeof receipt.configuration.bindings_match !== "boolean"
    || !Array.isArray(receipt.configuration.missing_binding_names)
    || !Array.isArray(receipt.configuration.mismatched_binding_names)
    || receiptBindingNames.some((name) => !expectedBindingNames.has(name))
    || !Number.isInteger(receipt.configuration.unexpected_non_secret_binding_count)
    || receipt.configuration.unexpected_non_secret_binding_count < 0
    || typeof receipt.source_identity.provider_metadata_present !== "boolean"
    || receipt.source_identity.provider_metadata_is_sufficient !== false
    || receipt.source_identity.reviewed_commit_bound !== false
    || receipt.production_hold_proven !== false
    || receipt.release_ready !== false
    || !Array.isArray(receipt.blockers)
    || receipt.blockers.length === 0
    || receipt.blockers.some((blocker) => !BLOCKER_CODES.includes(blocker))) {
    refuse("receipt-unsafe", "Public receipt overstates provider or release readiness");
  }
  return receipt;
}

function substituteCommand(template, policy, versionId = null) {
  return template.map((argument) => {
    if (argument === "{worker}") return policy.worker.name;
    if (argument === "{version}") {
      if (!VERSION_ID_PATTERN.test(versionId ?? "")) {
        refuse("provider-output-invalid", "Active Worker version identity is invalid");
      }
      return versionId;
    }
    return argument;
  });
}

function defaultCommandRunner(command, args, options) {
  return spawnSync(command, args, options);
}

function readOnlyEnvironment(environment) {
  const allowed = [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_EMAIL",
    "HOME",
    "LANG",
    "LC_ALL",
    "LOGNAME",
    "PATH",
    "SHELL",
    "TERM",
    "TMPDIR",
    "USER",
  ];
  return {
    ...Object.fromEntries(allowed
      .filter((name) => typeof environment[name] === "string")
      .map((name) => [name, environment[name]])),
    NO_COLOR: "1",
    WRANGLER_SEND_METRICS: "false",
  };
}

function runReadOnlyCommand(args, policy, runCommand) {
  const result = runCommand(WRANGLER_PATH, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: readOnlyEnvironment(process.env),
    maxBuffer: policy.limits.maximum_output_bytes,
    shell: false,
  });
  if (result.error || result.signal || result.status !== 0) {
    refuse("provider-command-failed", "A read-only Cloudflare query failed");
  }
  return parseBoundedJson(result.stdout, policy.limits.maximum_output_bytes,
    "Cloudflare command output");
}

export function analyzeProviderState(status, version, contract, options = {}) {
  const { policy, config } = contract;
  const observedAt = (options.now ?? new Date()).toISOString();
  const traffic = analyzeTraffic(status, policy);
  if (!traffic.accepted) {
    return buildReceipt({ policy, observedAt, trafficAccepted: false });
  }
  const expectedBindings = buildExpectedBindings(config, policy);
  const versionAnalysis = analyzeVersion(version, traffic.versionId, expectedBindings, config, policy);
  return buildReceipt({
    policy,
    observedAt,
    trafficAccepted: true,
    versionAnalysis,
  });
}

export function runLiveAudit(options = {}) {
  if (options.confirmation !== READ_ONLY_CONFIRMATION) {
    refuse("confirmation-required",
      "Pass the exact Worker name through --confirm-read-only before any provider query");
  }
  const contract = options.contract ?? loadRepositoryContract();
  const { policy } = contract;
  const runCommand = options.runCommand ?? defaultCommandRunner;
  const statusArgs = substituteCommand(policy.commands.deployment_status, policy);
  const status = runReadOnlyCommand(statusArgs, policy, runCommand);
  const traffic = analyzeTraffic(status, policy);
  if (!traffic.accepted) {
    return buildReceipt({
      policy,
      observedAt: (options.now ?? new Date()).toISOString(),
      trafficAccepted: false,
    });
  }
  const versionArgs = substituteCommand(policy.commands.version_view, policy, traffic.versionId);
  const version = runReadOnlyCommand(versionArgs, policy, runCommand);
  return analyzeProviderState(status, version, contract, options);
}

function parseCli(argv) {
  const [mode, ...args] = argv;
  if (mode === "verify-policy" && args.length === 0) return { mode };
  if (mode === "audit-live"
    && args.length === 2
    && args[0] === "--confirm-read-only"
    && args[1] === READ_ONLY_CONFIRMATION) {
    return { mode, confirmation: args[1] };
  }
  refuse("arguments-invalid",
    "Usage: audit-cloudflare-provider-state.mjs verify-policy | audit-live --confirm-read-only contourcast-halibut");
}

function publicRefusal(error) {
  return {
    schema_version: "castingcompass.cloudflare-provider-state-refusal/1.0.0",
    read_only: true,
    provider_mutation_performed: false,
    blocker: error instanceof ProviderStateRefusal ? error.code : "unexpected-failure",
  };
}

async function main(argv) {
  const cli = parseCli(argv);
  if (cli.mode === "verify-policy") {
    const contract = loadRepositoryContract();
    buildExpectedBindings(contract.config, contract.policy);
    console.log("Cloudflare provider-state policy verified (offline; no provider query performed)");
    return 0;
  }
  const receipt = runLiveAudit({ confirmation: cli.confirmation });
  console.log(JSON.stringify(receipt, null, 2));
  return receipt.blockers.length === 0 ? 0 : 2;
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(JSON.stringify(publicRefusal(error)));
    process.exitCode = 2;
  }
}
