#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { verifyProductionChangeAuthorization } from "./verify-production-change-authorization.mjs";

const POLICY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_NPM_VERSION = "10.9.8";
const EXPECTED_WRANGLER_VERSION = "4.123.0";
const SECRET_BINDING_POLICY_PATH = "security/production-worker-secret-bindings.json";
const MAX_SECRETS_BYTES = 64 * 1024;
const RUNTIME_SECRET_NAMES = Object.freeze([
  "AUTH_EMAIL_FROM",
  "MIMO_API_KEY",
  "OBSERVABILITY_PSEUDONYM_SECRET",
  "RATE_LIMIT_KEY_SECRET",
  "RESEND_API_KEY",
  "TURNSTILE_SECRET_KEY",
  "VALIDATION_PARTICIPANT_HMAC_SECRET",
  "VALIDATION_RECRUITMENT_HMAC_SECRET",
]);
const VERSION_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const MODES = Object.freeze({
  normal: Object.freeze({
    action: "deploy:normal",
    variables: Object.freeze([]),
  }),
  activation: Object.freeze({
    action: "deploy:activation",
    variables: Object.freeze([]),
  }),
  maintenance: Object.freeze({
    action: "deploy:maintenance",
    variables: Object.freeze([
      "PUBLIC_DISCUSSIONS_ENABLED:false",
      "TRIP_PHOTO_UPLOADS_ENABLED:false",
      "TURNSTILE_ENABLED:false",
      "RELEASE_MAINTENANCE_MODE:true",
    ]),
  }),
  "safety-floor": Object.freeze({
    action: "deploy:safety-floor",
    variables: Object.freeze(["PUBLIC_DISCUSSIONS_ENABLED:false"]),
  }),
});

function isInside(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === ""
    || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

async function assertOutsideGitCheckout(candidate, { candidateIsDirectory = false } = {}) {
  let directory = candidateIsDirectory ? candidate : dirname(candidate);
  while (true) {
    let marker = null;
    try {
      marker = await lstat(resolve(directory, ".git"));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new Error("Production activation secrets Git-checkout boundary could not be verified.");
      }
    }
    if (marker) {
      throw new Error("Production activation secrets must be outside every Git checkout.");
    }
    const parent = dirname(directory);
    if (parent === directory) return;
    directory = parent;
  }
}

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(expected)) {
    throw new Error(`${label} fields or field order are invalid.`);
  }
}

function exactStringArray(value, expected, label) {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new Error(`${label} is invalid.`);
  }
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`${label} was not valid JSON.`);
  }
}

async function loadSecretBindingPolicy() {
  const source = await readFile(resolve(POLICY_ROOT, SECRET_BINDING_POLICY_PATH), "utf8");
  const policy = parseJsonOutput(source, "Production Worker secret-binding policy");
  exactKeys(policy, [
    "schema_version",
    "worker",
    "base_secret_names",
    "activation_secret_names",
  ], "Production Worker secret-binding policy");
  if (policy.schema_version !== "castingcompass.production-worker-secret-bindings/1.0.0"
    || policy.worker !== "contourcast-halibut") {
    throw new Error("Production Worker secret-binding policy identity is invalid.");
  }
  exactStringArray(policy.base_secret_names, [
    "AUTH_EMAIL_FROM",
    "MIMO_API_KEY",
    "RESEND_API_KEY",
  ], "Production Worker base secret names");
  exactStringArray(policy.activation_secret_names, [
    "RATE_LIMIT_KEY_SECRET",
    "TURNSTILE_SECRET_KEY",
  ], "Production Worker activation secret names");
  return policy;
}

export function validateActivationSecrets(payload, expectedNames) {
  exactKeys(payload, expectedNames, "Production activation secrets");
  for (const name of expectedNames) {
    const value = payload[name];
    const maximumLength = name === "RATE_LIMIT_KEY_SECRET" ? 256 : 4096;
    if (typeof value !== "string" || value.length < 32 || value.length > maximumLength) {
      throw new Error("Production activation secret values do not satisfy the reviewed bounds.");
    }
  }
  if (new Set(expectedNames.map((name) => payload[name])).size !== expectedNames.length) {
    throw new Error("Production activation secrets must be distinct.");
  }
  return true;
}

export async function verifiedActivationSecretsFile(releaseRoot, secretsFile, expectedNames) {
  if (!isAbsolute(secretsFile ?? "")) {
    throw new Error("Production activation secrets must use an absolute private file path.");
  }
  const requestedPath = resolve(secretsFile);
  const symbolicMetadata = await lstat(requestedPath).catch(() => null);
  if (!symbolicMetadata || symbolicMetadata.isSymbolicLink()) {
    throw new Error("Production activation secrets must be a non-symlink file.");
  }
  const pathBeforeOpen = await realpath(requestedPath);
  if (isInside(releaseRoot, pathBeforeOpen) || isInside(POLICY_ROOT, pathBeforeOpen)) {
    throw new Error("Production activation secrets must be outside every release checkout.");
  }
  await assertOutsideGitCheckout(pathBeforeOpen);
  let handle;
  try {
    handle = await open(requestedPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new Error("Production activation secrets could not be opened safely.");
  }
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size < 2
      || metadata.size > MAX_SECRETS_BYTES) {
      throw new Error("Production activation secrets file metadata is invalid.");
    }
    if (metadata.dev !== symbolicMetadata.dev || metadata.ino !== symbolicMetadata.ino) {
      throw new Error("Production activation secrets file changed while it was being opened.");
    }
    if ((metadata.mode & 0o077) !== 0 || (metadata.mode & 0o400) === 0
      || (typeof process.getuid === "function" && metadata.uid !== process.getuid())) {
      throw new Error("Production activation secrets must be owner-readable and inaccessible to other users.");
    }
    const source = await handle.readFile({ encoding: "utf8" });
    const pathMetadataAfterRead = await lstat(requestedPath).catch(() => null);
    if (!pathMetadataAfterRead || pathMetadataAfterRead.isSymbolicLink()
      || pathMetadataAfterRead.dev !== metadata.dev || pathMetadataAfterRead.ino !== metadata.ino
      || await realpath(requestedPath) !== pathBeforeOpen) {
      throw new Error("Production activation secrets file changed while it was being read.");
    }
    const payload = parseJsonOutput(source, "Production activation secrets");
    if (source !== `${JSON.stringify(payload, null, 2)}\n`) {
      throw new Error("Production activation secrets must use canonical JSON without duplicate keys.");
    }
    validateActivationSecrets(payload, expectedNames);
    return {
      path: pathBeforeOpen,
      fingerprint: createHash("sha256").update(source).digest("hex"),
    };
  } finally {
    await handle.close();
  }
}

async function loadReleaseConfiguration(root) {
  const source = await readFile(resolve(root, "wrangler.jsonc"), "utf8");
  const config = parseJsonOutput(source, "Reviewed Wrangler configuration");
  if (config.name !== "contourcast-halibut" || config.workers_dev !== false
    || config.preview_urls !== false || config.vars?.DEPLOYMENT_ENVIRONMENT !== "production") {
    throw new Error("Reviewed Wrangler production identity is invalid.");
  }
  return config;
}

function modeVariables(config, contract) {
  const variables = { ...(config.vars ?? {}) };
  for (const entry of contract.variables) {
    const separator = entry.indexOf(":");
    if (separator < 1) throw new Error("Release variable override is invalid.");
    variables[entry.slice(0, separator)] = entry.slice(separator + 1);
  }
  return variables;
}

export function expectedVersionBindings(config, contract, secretNames) {
  const expected = new Map();
  const add = (name, value) => {
    if (!name || expected.has(name)) throw new Error("Reviewed Wrangler bindings are not unique.");
    expected.set(name, value);
  };
  if (config.assets?.binding) add(config.assets.binding, { type: "assets" });
  if (config.version_metadata?.binding) {
    add(config.version_metadata.binding, { type: "version_metadata" });
  }
  for (const binding of config.d1_databases ?? []) {
    add(binding.binding, { type: "d1", database_id: binding.database_id });
  }
  for (const binding of config.ratelimits ?? []) {
    add(binding.name, {
      type: "ratelimit",
      namespace_id: binding.namespace_id,
      simple: { limit: binding.simple?.limit, period: binding.simple?.period },
    });
  }
  for (const [name, text] of Object.entries(modeVariables(config, contract))) {
    add(name, { type: "plain_text", text });
  }
  for (const name of secretNames) add(name, { type: "secret_text" });
  return expected;
}

export function verifyUploadedVersion(view, expectedId, config, contract, secretNames) {
  if (!view || view.id !== expectedId || !Array.isArray(view.resources?.bindings)) {
    throw new Error("Uploaded Worker version identity is invalid.");
  }
  const runtime = view.resources.script_runtime;
  if (runtime?.compatibility_date !== config.compatibility_date
    || JSON.stringify(runtime?.compatibility_flags ?? [])
      !== JSON.stringify(config.compatibility_flags ?? [])) {
    throw new Error("Uploaded Worker runtime compatibility is invalid.");
  }
  const expected = expectedVersionBindings(config, contract, secretNames);
  const actual = new Map();
  for (const binding of view.resources.bindings) {
    if (!binding?.name || actual.has(binding.name)) {
      throw new Error("Uploaded Worker bindings are not uniquely identifiable.");
    }
    actual.set(binding.name, binding);
  }
  if (actual.size !== expected.size
    || [...expected.keys()].some((name) => !actual.has(name))) {
    throw new Error("Uploaded Worker binding inventory differs from reviewed source.");
  }
  for (const [name, required] of expected) {
    const binding = actual.get(name);
    if (binding.type !== required.type) {
      throw new Error("Uploaded Worker binding type differs from reviewed source.");
    }
    if (required.type === "plain_text" && binding.text !== required.text) {
      throw new Error("Uploaded Worker variable differs from reviewed source.");
    }
    if (required.type === "d1" && binding.database_id !== required.database_id) {
      throw new Error("Uploaded Worker D1 identity differs from reviewed source.");
    }
    if (required.type === "ratelimit"
      && (binding.namespace_id !== required.namespace_id
        || binding.simple?.limit !== required.simple.limit
        || binding.simple?.period !== required.simple.period)) {
      throw new Error("Uploaded Worker rate-limit binding differs from reviewed source.");
    }
    if (required.type === "secret_text" && Object.hasOwn(binding, "text")) {
      throw new Error("Uploaded Worker secret binding exposed plaintext metadata.");
    }
  }
  return true;
}

function singleDeploymentVersion(deployment, label) {
  const versions = deployment?.versions;
  if (!Array.isArray(versions) || versions.length !== 1
    || !VERSION_ID_PATTERN.test(versions[0]?.version_id ?? "")
    || Number(versions[0]?.percentage) !== 100) {
    throw new Error(`${label} is not one exact version at 100 percent.`);
  }
  return versions[0].version_id;
}

function versionList(output) {
  const versions = parseJsonOutput(output, "Worker version list");
  if (!Array.isArray(versions) || versions.some(({ id }) => !VERSION_ID_PATTERN.test(id ?? ""))) {
    throw new Error("Worker version list is invalid.");
  }
  if (new Set(versions.map(({ id }) => id)).size !== versions.length) {
    throw new Error("Worker version list contains duplicate version identities.");
  }
  return versions;
}

function childEnvironment(environment, outputDirectory, { providerAuth = false } = {}) {
  const child = { ...environment };
  for (const name of Object.keys(child)) {
    if ([
      "NODE_OPTIONS",
      "NODE_PATH",
      "CASTINGCOMPASS_CLOUDFLARE_BUILD",
      "NEXT_PUBLIC_API_URL",
      "NEXT_PUBLIC_PHOTO_UPLOADS",
    ].includes(name) || RUNTIME_SECRET_NAMES.includes(name) || /^RELEASE_/u.test(name)
      || (!providerAuth && /^CLOUDFLARE_/u.test(name))
      || /^WRANGLER_/u.test(name) || /^npm_config_/iu.test(name)) {
      delete child[name];
    }
  }
  const emptyConfig = process.platform === "win32" ? "NUL" : "/dev/null";
  child.NPM_CONFIG_USERCONFIG = emptyConfig;
  child.NPM_CONFIG_GLOBALCONFIG = emptyConfig;
  child.NPM_CONFIG_AUDIT = "false";
  child.NPM_CONFIG_FUND = "false";
  child.NPM_CONFIG_UPDATE_NOTIFIER = "false";
  child.WRANGLER_SEND_METRICS = "false";
  if (outputDirectory) child.WRANGLER_OUTPUT_FILE_DIRECTORY = outputDirectory;
  return child;
}

async function verifiedOutputDirectory(releaseRoot, requestedDirectory) {
  if (requestedDirectory === undefined) return null;
  if (!isAbsolute(requestedDirectory)) {
    throw new Error("Wrangler evidence output must use an absolute private directory.");
  }
  const symbolicMetadata = await lstat(requestedDirectory).catch(() => null);
  if (!symbolicMetadata || symbolicMetadata.isSymbolicLink() || !symbolicMetadata.isDirectory()) {
    throw new Error("Wrangler evidence output must be an existing non-symlink directory.");
  }
  const directory = await realpath(requestedDirectory);
  if (isInside(releaseRoot, directory) || isInside(POLICY_ROOT, directory)) {
    throw new Error("Wrangler evidence output must be outside every release checkout.");
  }
  await assertOutsideGitCheckout(directory, { candidateIsDirectory: true });
  const metadata = await stat(directory);
  if ((metadata.mode & 0o077) !== 0
    || (typeof process.getuid === "function" && metadata.uid !== process.getuid())) {
    throw new Error("Wrangler evidence output must be private and owned by the current operator.");
  }
  return directory;
}

function defaultRunner(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    shell: false,
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw new Error(`Release subprocess could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = options.inherit ? "" : `: ${(result.stderr || result.stdout || "").trim()}`;
    throw new Error(`Release subprocess exited ${result.status}${detail}`);
  }
  return options.inherit ? "" : (result.stdout ?? "").trim();
}

async function verifiedNpmCli(releaseRoot, npmCli) {
  if (!isAbsolute(npmCli ?? "")) {
    throw new Error("Release must run through the locked npm CLI so npm_execpath is absolute.");
  }
  const npmPath = await realpath(npmCli).catch(() => null);
  if (!npmPath || !(await stat(npmPath)).isFile()) {
    throw new Error("Locked npm CLI could not be resolved.");
  }
  if (isInside(releaseRoot, npmPath)) {
    throw new Error("Locked npm CLI must be outside the release checkout.");
  }
  const npmPackageRoot = resolve(dirname(npmPath), "..");
  const npmPackage = JSON.parse(await readFile(resolve(npmPackageRoot, "package.json"), "utf8"));
  const declaredCli = await realpath(resolve(npmPackageRoot, npmPackage.bin?.npm ?? "")).catch(() => null);
  if (npmPackage.name !== "npm" || npmPackage.version !== EXPECTED_NPM_VERSION
    || declaredCli !== npmPath) {
    throw new Error(`Release npm must be exact package version ${EXPECTED_NPM_VERSION}.`);
  }
  return npmPath;
}

async function verifyLockedWrangler(releaseRoot) {
  const lock = JSON.parse(await readFile(resolve(releaseRoot, "package-lock.json"), "utf8"));
  const rootEntry = lock.packages?.[""];
  const wranglerEntry = lock.packages?.["node_modules/wrangler"];
  if (lock.lockfileVersion !== 3 || rootEntry?.devDependencies?.wrangler !== EXPECTED_WRANGLER_VERSION
    || wranglerEntry?.version !== EXPECTED_WRANGLER_VERSION
    || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(wranglerEntry?.integrity ?? "")) {
    throw new Error(`Release lock must bind Wrangler ${EXPECTED_WRANGLER_VERSION} with integrity.`);
  }
}

async function verifiedInstalledWrangler(releaseRoot) {
  const wranglerPath = await realpath(
    resolve(releaseRoot, "node_modules/wrangler/bin/wrangler.js"),
  ).catch(() => null);
  if (!wranglerPath || !isInside(releaseRoot, wranglerPath) || !(await stat(wranglerPath)).isFile()) {
    throw new Error("Release checkout does not contain its locked Wrangler CLI.");
  }
  const wranglerPackage = JSON.parse(await readFile(
    resolve(releaseRoot, "node_modules/wrangler/package.json"),
    "utf8",
  ));
  if (wranglerPackage.name !== "wrangler" || wranglerPackage.version !== EXPECTED_WRANGLER_VERSION) {
    throw new Error(`Release Wrangler must be exact version ${EXPECTED_WRANGLER_VERSION}.`);
  }
  return wranglerPath;
}

export async function releaseCloudflare({
  mode,
  releaseRoot,
  expectedCommit,
  expectedGateCommit = expectedCommit,
  authorizationFile,
  secretsFile,
  environment = process.env,
  npmCli = environment.npm_execpath,
  runner = defaultRunner,
  authorizationVerifier = verifyProductionChangeAuthorization,
  secretsFileVerifier = verifiedActivationSecretsFile,
  wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)),
}) {
  const contract = MODES[mode];
  if (!contract) throw new Error("Release mode must be normal, activation, maintenance, or safety-floor.");
  const root = await realpath(resolve(releaseRoot));
  const authorizationOptions = {
    root,
    policyRoot: POLICY_ROOT,
    expectedCommit,
    expectedGateCommit,
    authorizationFile,
    action: contract.action,
  };
  const receipt = await authorizationVerifier(authorizationOptions);
  const config = await loadReleaseConfiguration(root);
  const secretPolicy = await loadSecretBindingPolicy();
  let secretNames = [...secretPolicy.base_secret_names];
  let verifiedSecretFile = null;
  if (secretsFile !== undefined) {
    if (mode !== "activation") {
      throw new Error("Production activation secrets are permitted only for the activation release mode.");
    }
    if (config.vars?.RATE_LIMITING_ENABLED !== "true"
      || config.vars?.TURNSTILE_ENABLED !== "true") {
      throw new Error("Production activation secrets require an immutable config with both controls enabled.");
    }
    secretNames = [...secretNames, ...secretPolicy.activation_secret_names];
    verifiedSecretFile = await secretsFileVerifier(
      root,
      secretsFile,
      secretPolicy.activation_secret_names,
    );
  } else if (mode === "activation") {
    throw new Error("The production activation release requires the reviewed activation secrets file.");
  } else if (config.vars?.RATE_LIMITING_ENABLED !== "false"
    || config.vars?.TURNSTILE_ENABLED !== "false") {
    throw new Error("Non-activation releases require both production abuse controls to be exactly false.");
  }
  if (root === POLICY_ROOT) {
    exactKeys(config.secrets, ["required"], "Reviewed Wrangler secrets configuration");
    exactStringArray(
      config.secrets.required,
      secretNames,
      "Reviewed Wrangler required secret names",
    );
  }
  const npmPath = await verifiedNpmCli(root, npmCli);
  await verifyLockedWrangler(root);
  const outputDirectory = await verifiedOutputDirectory(
    root,
    environment.WRANGLER_OUTPUT_FILE_DIRECTORY,
  );
  const buildEnv = childEnvironment(environment, outputDirectory);
  const providerEnv = childEnvironment(environment, outputDirectory, { providerAuth: true });
  const npmVersion = runner(process.execPath, [npmPath, "--version"], { cwd: root, env: buildEnv });
  if (npmVersion !== EXPECTED_NPM_VERSION) {
    throw new Error(`Release npm must be exact version ${EXPECTED_NPM_VERSION}.`);
  }
  runner(process.execPath, [npmPath, "ci", "--ignore-scripts"], {
    cwd: root,
    env: buildEnv,
    inherit: true,
  });
  if (await verifiedNpmCli(root, npmCli) !== npmPath) {
    throw new Error("Release npm identity changed during the locked install.");
  }
  const wranglerPath = await verifiedInstalledWrangler(root);
  runner(process.execPath, [npmPath, "run", "build:cloudflare"], {
    cwd: root,
    env: buildEnv,
    inherit: true,
  });
  const finalOutputDirectory = await verifiedOutputDirectory(
    root,
    environment.WRANGLER_OUTPUT_FILE_DIRECTORY,
  );
  if (finalOutputDirectory !== outputDirectory) {
    throw new Error("Wrangler evidence output identity changed during the release build.");
  }
  const finalReceipt = await authorizationVerifier(authorizationOptions);
  if (JSON.stringify(finalReceipt) !== JSON.stringify(receipt)) {
    throw new Error("Production authorization changed between build and deployment.");
  }
  if (verifiedSecretFile) {
    const finalSecretFile = await secretsFileVerifier(
      root,
      secretsFile,
      secretPolicy.activation_secret_names,
    );
    if (finalSecretFile.path !== verifiedSecretFile.path
      || finalSecretFile.fingerprint !== verifiedSecretFile.fingerprint) {
      throw new Error("Production activation secrets changed during the release build.");
    }
    verifiedSecretFile = finalSecretFile;
  }

  const wranglerOptions = { cwd: root, env: providerEnv };
  const jsonCommand = (args, label) => parseJsonOutput(
    runner(process.execPath, [wranglerPath, ...args], wranglerOptions),
    label,
  );
  const baselineDeployment = jsonCommand(
    ["deployments", "status", "--config", "wrangler.jsonc", "--json"],
    "Production deployment baseline",
  );
  const priorVersion = singleDeploymentVersion(baselineDeployment, "Production deployment baseline");
  const beforeVersions = versionList(runner(process.execPath, [
    wranglerPath,
    "versions",
    "list",
    "--config",
    "wrangler.jsonc",
    "--json",
  ], wranglerOptions));
  const beforeIds = new Set(beforeVersions.map(({ id }) => id));
  const uploadArguments = [
    wranglerPath,
    "versions",
    "upload",
    "--config",
    "wrangler.jsonc",
    "--strict",
    "--message",
    `Exact ${mode} release ${expectedCommit}`,
  ];
  for (const variable of contract.variables) uploadArguments.push("--var", variable);
  if (verifiedSecretFile) uploadArguments.push("--secrets-file", verifiedSecretFile.path);
  runner(process.execPath, uploadArguments, { ...wranglerOptions, inherit: true });

  let newIds = [];
  for (let attempt = 0; attempt < 12 && newIds.length !== 1; attempt += 1) {
    const afterVersions = versionList(runner(process.execPath, [
      wranglerPath,
      "versions",
      "list",
      "--config",
      "wrangler.jsonc",
      "--json",
    ], wranglerOptions));
    newIds = [...new Set(afterVersions
      .map(({ id }) => id)
      .filter((id) => !beforeIds.has(id)))];
    if (newIds.length !== 1 && attempt < 11) await wait(5_000);
  }
  if (newIds.length !== 1) {
    throw new Error("Versioned upload did not create exactly one identifiable Worker version.");
  }
  const newVersion = newIds[0];
  const view = jsonCommand(
    ["versions", "view", newVersion, "--config", "wrangler.jsonc", "--json"],
    "Uploaded Worker version",
  );
  verifyUploadedVersion(view, newVersion, config, contract, secretNames);

  const trafficReceipt = await authorizationVerifier(authorizationOptions);
  if (JSON.stringify(trafficReceipt) !== JSON.stringify(receipt)) {
    throw new Error("Production authorization changed before the traffic mutation.");
  }
  const preTrafficDeployment = jsonCommand(
    ["deployments", "status", "--config", "wrangler.jsonc", "--json"],
    "Pre-traffic production deployment",
  );
  if (singleDeploymentVersion(preTrafficDeployment, "Pre-traffic production deployment")
    !== priorVersion) {
    throw new Error("Production deployment baseline drifted before the traffic mutation.");
  }
  let trafficMayHaveChanged = false;
  try {
    trafficMayHaveChanged = true;
    runner(process.execPath, [
      wranglerPath,
      "versions",
      "deploy",
      `${newVersion}@100%`,
      "--config",
      "wrangler.jsonc",
      "--yes",
      "--message",
      `Exact ${mode} release ${expectedCommit}`,
    ], { ...wranglerOptions, inherit: true });
    const finalDeployment = jsonCommand(
      ["deployments", "status", "--config", "wrangler.jsonc", "--json"],
      "Final production deployment",
    );
    if (singleDeploymentVersion(finalDeployment, "Final production deployment") !== newVersion) {
      throw new Error("Final production deployment did not select the inspected Worker version.");
    }
    trafficMayHaveChanged = false;
  } catch (error) {
    if (trafficMayHaveChanged) {
      try {
        runner(process.execPath, [
          wranglerPath,
          "versions",
          "deploy",
          `${priorVersion}@100%`,
          "--config",
          "wrangler.jsonc",
          "--yes",
          "--message",
          `Automatic rollback after refused ${mode} release ${expectedCommit}`,
        ], { ...wranglerOptions, inherit: true });
        const restored = jsonCommand(
          ["deployments", "status", "--config", "wrangler.jsonc", "--json"],
          "Restored production deployment",
        );
        if (singleDeploymentVersion(restored, "Restored production deployment") !== priorVersion) {
          throw new Error("the prior version was not restored");
        }
      } catch {
        throw new Error("Versioned production release failed and automatic rollback was not verified.");
      }
    }
    throw error;
  }
  return finalReceipt;
}

function parseArguments(args) {
  const options = {
    mode: undefined,
    releaseRoot: undefined,
    expectedCommit: undefined,
    expectedGateCommit: undefined,
    authorizationFile: undefined,
    secretsFile: undefined,
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (["--mode", "--release-root", "--expected-commit", "--expected-gate-commit", "--authorization-file", "--secrets-file"].includes(value)) {
      const argument = args[index + 1];
      if (!argument) throw new Error(`${value} requires a value.`);
      const field = {
        "--mode": "mode",
        "--release-root": "releaseRoot",
        "--expected-commit": "expectedCommit",
        "--expected-gate-commit": "expectedGateCommit",
        "--authorization-file": "authorizationFile",
        "--secrets-file": "secretsFile",
      }[value];
      options[field] = argument;
      index += 1;
    } else if (value === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      "Usage: node scripts/release-cloudflare.mjs --mode normal|activation|maintenance|safety-floor --release-root /ABSOLUTE/REVIEWED/WORKTREE --expected-commit COMMIT --expected-gate-commit GATE_COMMIT --authorization-file /PRIVATE/AUTHORIZATION.json [--secrets-file /PRIVATE/ACTIVATION-SECRETS.json]\n",
    );
    return;
  }
  const receipt = await releaseCloudflare(options);
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
