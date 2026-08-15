import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chmod, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  expectedVersionBindings,
  releaseCloudflare,
  validateActivationSecrets,
  verifiedActivationSecretsFile,
  verifyUploadedVersion,
} from "../scripts/release-cloudflare.mjs";

const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const HEAD = "0123456789abcdef0123456789abcdef01234567";
const PRIOR_VERSION = "11111111-1111-4111-8111-111111111111";
const NEW_VERSION = "22222222-2222-4222-8222-222222222222";
const BASE_SECRETS = ["AUTH_EMAIL_FROM", "MIMO_API_KEY", "RESEND_API_KEY"];
const ACTIVATION_SECRETS = ["RATE_LIMIT_KEY_SECRET", "TURNSTILE_SECRET_KEY"];
const ROOT_CONFIG = JSON.parse(await readFile(join(ROOT, "wrangler.jsonc"), "utf8"));

const CONTRACTS = {
  normal: { variables: [] },
  activation: { variables: [] },
  maintenance: {
    variables: [
      "PUBLIC_DISCUSSIONS_ENABLED:false",
      "TRIP_PHOTO_UPLOADS_ENABLED:false",
      "TURNSTILE_ENABLED:false",
      "RELEASE_MAINTENANCE_MODE:true",
    ],
  },
  "safety-floor": { variables: ["PUBLIC_DISCUSSIONS_ENABLED:false"] },
};

function uploadedVersion(config, mode, secretNames = BASE_SECRETS, overrides = {}) {
  const bindings = [...expectedVersionBindings(config, CONTRACTS[mode], secretNames)]
    .map(([name, value]) => ({ name, ...structuredClone(value) }));
  return {
    id: NEW_VERSION,
    resources: {
      script_runtime: {
        compatibility_date: config.compatibility_date,
        compatibility_flags: config.compatibility_flags,
      },
      bindings,
    },
    ...overrides,
  };
}

function versionedRunner(events, {
  config = ROOT_CONFIG,
  mode = "normal",
  secretNames = BASE_SECRETS,
  afterVersions = [{ id: NEW_VERSION }, { id: PRIOR_VERSION }],
  preTrafficVersion = PRIOR_VERSION,
  finalVersion = NEW_VERSION,
  restoredVersion = PRIOR_VERSION,
} = {}) {
  let versionLists = 0;
  let deploymentStatuses = 0;
  return (command, args, options) => {
    events.push({ type: "subprocess", command, args, options });
    if (args.at(-1) === "--version") return "10.9.8";
    const operation = args.slice(1);
    if (operation[0] === "versions" && operation[1] === "list") {
      versionLists += 1;
      return JSON.stringify(versionLists === 1
        ? [{ id: PRIOR_VERSION }]
        : afterVersions);
    }
    if (operation[0] === "versions" && operation[1] === "view") {
      return JSON.stringify(uploadedVersion(config, mode, secretNames));
    }
    if (operation[0] === "deployments" && operation[1] === "status") {
      deploymentStatuses += 1;
      const version = deploymentStatuses === 1
        ? PRIOR_VERSION
        : deploymentStatuses === 2
          ? preTrafficVersion
          : deploymentStatuses === 3
            ? finalVersion
            : restoredVersion;
      return JSON.stringify({ versions: [{ version_id: version, percentage: 100 }] });
    }
    return "";
  };
}

function installingVersionedRunner(releaseRoot, events, options = {}) {
  const delegate = versionedRunner(events, options);
  return (command, args, subprocessOptions) => {
    if (args.includes("ci")) {
      mkdirSync(join(releaseRoot, "node_modules/wrangler/bin"), { recursive: true });
      writeFileSync(join(releaseRoot, "node_modules/wrangler/bin/wrangler.js"), "// installed\n");
      writeFileSync(join(releaseRoot, "node_modules/wrangler/package.json"), `${JSON.stringify({
        name: "wrangler",
        version: "4.123.0",
      })}\n`);
    }
    return delegate(command, args, subprocessOptions);
  };
}

async function fakeNpmCli(directory) {
  const bin = join(directory, "bin");
  await mkdir(bin, { recursive: true });
  const path = join(bin, "npm-cli.js");
  await writeFile(path, "// test-only npm CLI identity\n", { mode: 0o600 });
  await writeFile(join(directory, "package.json"), `${JSON.stringify({
    name: "npm",
    version: "10.9.8",
    bin: { npm: "bin/npm-cli.js" },
  }, null, 2)}\n`, { mode: 0o600 });
  return path;
}

async function freshReleaseRoot(directory, config = ROOT_CONFIG) {
  const root = join(directory, "release");
  await mkdir(root);
  await writeFile(join(root, "wrangler.jsonc"), `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await writeFile(join(root, "package-lock.json"), `${JSON.stringify({
    name: "castingcompass-test",
    version: "0.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { devDependencies: { wrangler: "4.123.0" } },
      "node_modules/wrangler": {
        version: "4.123.0",
        integrity: "sha512-dGVzdA==",
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });
  return root;
}

test("release wrapper authorizes before locked install, build, and exact normal deploy", async () => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-release-wrapper-"));
  try {
    const releaseRoot = await freshReleaseRoot(directory);
    const events = [];
    const receipt = await releaseCloudflare({
      mode: "normal",
      releaseRoot,
      expectedCommit: HEAD,
      expectedGateCommit: HEAD,
      authorizationFile: "/private/authorization.json",
      npmCli: await fakeNpmCli(directory),
      environment: {
        PATH: process.env.PATH,
        NODE_OPTIONS: "--inspect",
        WRANGLER_CONFIG: "/untrusted/config.json",
        WRANGLER_LOG_LEVEL: "debug",
        NEXT_PUBLIC_API_URL: "https://untrusted.invalid",
        npm_config_registry: "https://untrusted.invalid",
        CLOUDFLARE_API_TOKEN: "test-only-not-a-real-token",
        RELEASE_AUTHORIZATION_FILE: "/untrusted/ambient-authorization.json",
        RELEASE_SECRETS_FILE: "/untrusted/ambient-secrets.json",
        RESEND_API_KEY: "test-only-runtime-secret",
      },
      authorizationVerifier: async (options) => {
        events.push({ type: "authorization", options });
        return { authorized: true, action: options.action };
      },
      runner: installingVersionedRunner(releaseRoot, events),
    });
    assert.deepEqual(receipt, { authorized: true, action: "deploy:normal" });
    const authorizations = events.filter(({ type }) => type === "authorization");
    assert.equal(authorizations.length, 3);
    assert.deepEqual(authorizations[0].options, {
      root: await realpath(releaseRoot),
      policyRoot: ROOT,
      expectedCommit: HEAD,
      expectedGateCommit: HEAD,
      authorizationFile: "/private/authorization.json",
      action: "deploy:normal",
    });
    assert.deepEqual(authorizations[1], authorizations[0]);
    assert.deepEqual(authorizations[2], authorizations[0]);
    const subprocesses = events.filter(({ type }) => type === "subprocess");
    assert.equal(subprocesses.length, 11);
    assert.deepEqual(subprocesses[1].args.slice(-2), ["ci", "--ignore-scripts"]);
    assert.deepEqual(subprocesses[2].args.slice(-2), ["run", "build:cloudflare"]);
    assert.deepEqual(subprocesses[3].args.slice(1), [
      "deployments", "status", "--config", "wrangler.jsonc", "--json",
    ]);
    assert.deepEqual(subprocesses[5].args.slice(1, 5), [
      "versions", "upload", "--config", "wrangler.jsonc",
    ]);
    assert.ok(subprocesses[5].args.includes("--strict"));
    assert.deepEqual(subprocesses[9].args.slice(1, 4), [
      "versions", "deploy", `${NEW_VERSION}@100%`,
    ]);
    assert.ok(events.indexOf(authorizations[1]) > events.indexOf(subprocesses[2]));
    assert.ok(events.indexOf(authorizations[1]) < events.indexOf(subprocesses[3]));
    assert.ok(events.indexOf(authorizations[2]) > events.indexOf(subprocesses[7]));
    assert.ok(events.indexOf(authorizations[2]) < events.indexOf(subprocesses[8]));
    assert.deepEqual(subprocesses[8].args.slice(1), [
      "deployments", "status", "--config", "wrangler.jsonc", "--json",
    ]);
    assert.ok(events.indexOf(subprocesses[8]) < events.indexOf(subprocesses[9]));
    for (const event of subprocesses) {
      assert.equal(event.command, process.execPath);
      assert.equal(event.options.cwd, await realpath(releaseRoot));
      assert.equal("NODE_OPTIONS" in event.options.env, false);
      assert.equal("WRANGLER_CONFIG" in event.options.env, false);
      assert.equal("WRANGLER_LOG_LEVEL" in event.options.env, false);
      assert.equal("NEXT_PUBLIC_API_URL" in event.options.env, false);
      assert.equal("npm_config_registry" in event.options.env, false);
      assert.equal("RELEASE_AUTHORIZATION_FILE" in event.options.env, false);
      assert.equal("RELEASE_SECRETS_FILE" in event.options.env, false);
      assert.equal("RESEND_API_KEY" in event.options.env, false);
      const emptyConfig = process.platform === "win32" ? "NUL" : "/dev/null";
      assert.equal(event.options.env.NPM_CONFIG_USERCONFIG, emptyConfig);
      assert.equal(event.options.env.NPM_CONFIG_GLOBALCONFIG, emptyConfig);
      assert.equal(event.options.env.WRANGLER_SEND_METRICS, "false");
    }
    for (const event of subprocesses.slice(0, 3)) {
      assert.equal("CLOUDFLARE_API_TOKEN" in event.options.env, false);
    }
    for (const event of subprocesses.slice(3)) {
      assert.equal(event.options.env.CLOUDFLARE_API_TOKEN, "test-only-not-a-real-token");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release wrapper maps maintenance and safety-floor variables without shell expansion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-release-modes-"));
  try {
    const npmCli = await fakeNpmCli(directory);
    for (const [mode, action, variables] of [
      ["maintenance", "deploy:maintenance", [
        "PUBLIC_DISCUSSIONS_ENABLED:false",
        "TRIP_PHOTO_UPLOADS_ENABLED:false",
        "TURNSTILE_ENABLED:false",
        "RELEASE_MAINTENANCE_MODE:true",
      ]],
      ["safety-floor", "deploy:safety-floor", ["PUBLIC_DISCUSSIONS_ENABLED:false"]],
    ]) {
      const modeDirectory = join(directory, mode);
      await mkdir(modeDirectory);
      const releaseRoot = await freshReleaseRoot(modeDirectory);
      const events = [];
      await releaseCloudflare({
        mode,
        releaseRoot,
        expectedCommit: HEAD,
        expectedGateCommit: HEAD,
        authorizationFile: "/private/authorization.json",
        npmCli,
        environment: { PATH: process.env.PATH },
        authorizationVerifier: async ({ action: received }) => {
          assert.equal(received, action);
          return { authorized: true };
        },
        runner: installingVersionedRunner(releaseRoot, events, { mode }),
      });
      const calls = events.filter(({ type }) => type === "subprocess");
      const upload = calls.find(({ args }) => args[1] === "versions" && args[2] === "upload");
      assert.deepEqual(upload.args.slice(-variables.length * 2),
        variables.flatMap((value) => ["--var", value]));
      const deploy = calls.find(({ args }) => args[1] === "versions" && args[2] === "deploy");
      assert.deepEqual(deploy.args.slice(1, 4), ["versions", "deploy", `${NEW_VERSION}@100%`]);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release wrapper refusal occurs before any install, build, or Wrangler process", async () => {
  let subprocesses = 0;
  await assert.rejects(
    releaseCloudflare({
      mode: "normal",
      releaseRoot: ROOT,
      expectedCommit: HEAD,
      expectedGateCommit: HEAD,
      authorizationFile: "/missing/authorization.json",
      npmCli: "/missing/npm-cli.js",
      authorizationVerifier: async () => { throw new Error("authorization refused"); },
      runner: () => { subprocesses += 1; },
    }),
    /authorization refused/,
  );
  assert.equal(subprocesses, 0);
  await assert.rejects(
    releaseCloudflare({
      mode: "unreviewed",
      releaseRoot: ROOT,
      expectedCommit: HEAD,
      expectedGateCommit: HEAD,
      authorizationFile: "/private/authorization.json",
    }),
    /mode must be normal, activation, maintenance, or safety-floor/,
  );
});

test("release wrapper supports a fresh checkout with no preinstalled Wrangler", async () => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-fresh-release-"));
  try {
    const releaseRoot = await freshReleaseRoot(directory);
    const events = [];
    await releaseCloudflare({
      mode: "normal",
      releaseRoot,
      expectedCommit: HEAD,
      expectedGateCommit: HEAD,
      authorizationFile: "/private/authorization.json",
      npmCli: await fakeNpmCli(join(directory, "npm")),
      environment: { PATH: process.env.PATH },
      authorizationVerifier: async () => ({ authorized: true }),
      runner: installingVersionedRunner(releaseRoot, events),
    });
    const subprocesses = events.filter(({ type }) => type === "subprocess");
    assert.equal(subprocesses.length, 11);
    assert.equal(subprocesses.some(({ args }) => args.includes("ci")), true);
    assert.equal(subprocesses.some(({ args }) => args[1] === "versions" && args[2] === "deploy"), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release wrapper accepts only private evidence output outside every checkout", async () => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-release-evidence-"));
  try {
    let subprocesses = 0;
    await assert.rejects(
      releaseCloudflare({
        mode: "normal",
        releaseRoot: ROOT,
        expectedCommit: HEAD,
        expectedGateCommit: HEAD,
        authorizationFile: "/private/authorization.json",
        npmCli: await fakeNpmCli(join(directory, "npm")),
        environment: {
          PATH: process.env.PATH,
          WRANGLER_OUTPUT_FILE_DIRECTORY: ROOT,
        },
        authorizationVerifier: async () => ({ authorized: true }),
        runner: () => { subprocesses += 1; },
      }),
      /outside every release checkout/,
    );
    assert.equal(subprocesses, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("activation secrets require exact distinct bounded values", () => {
  const valid = {
    RATE_LIMIT_KEY_SECRET: "r".repeat(48),
    TURNSTILE_SECRET_KEY: "t".repeat(48),
  };
  assert.equal(validateActivationSecrets(valid, ACTIVATION_SECRETS), true);
  assert.throws(
    () => validateActivationSecrets({ ...valid, EXTRA_SECRET: "x".repeat(48) }, ACTIVATION_SECRETS),
    /fields or field order/,
  );
  assert.throws(
    () => validateActivationSecrets({ ...valid, RATE_LIMIT_KEY_SECRET: "short" }, ACTIVATION_SECRETS),
    /reviewed bounds/,
  );
  assert.throws(
    () => validateActivationSecrets({
      ...valid,
      RATE_LIMIT_KEY_SECRET: "r".repeat(257),
    }, ACTIVATION_SECRETS),
    /reviewed bounds/,
  );
  assert.throws(
    () => validateActivationSecrets({
      RATE_LIMIT_KEY_SECRET: "z".repeat(48),
      TURNSTILE_SECRET_KEY: "z".repeat(48),
    }, ACTIVATION_SECRETS),
    /must be distinct/,
  );
});

test("activation secrets file enforces the POSIX private-file boundary", {
  skip: process.platform === "win32",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-activation-secrets-"));
  const value = {
    RATE_LIMIT_KEY_SECRET: "r".repeat(48),
    TURNSTILE_SECRET_KEY: "t".repeat(48),
  };
  const source = `${JSON.stringify(value, null, 2)}\n`;
  try {
    const path = join(directory, "activation-secrets.json");
    await writeFile(path, source, { mode: 0o600 });
    await chmod(path, 0o600);
    const verified = await verifiedActivationSecretsFile(ROOT, path, ACTIVATION_SECRETS);
    assert.equal(verified.path, await realpath(path));
    assert.match(verified.fingerprint, /^[a-f0-9]{64}$/u);

    await chmod(path, 0o644);
    await assert.rejects(
      verifiedActivationSecretsFile(ROOT, path, ACTIVATION_SECRETS),
      /inaccessible to other users/,
    );
    await chmod(path, 0o600);

    const linkPath = join(directory, "activation-secrets-link.json");
    await symlink(path, linkPath);
    await assert.rejects(
      verifiedActivationSecretsFile(ROOT, linkPath, ACTIVATION_SECRETS),
      /non-symlink file/,
    );
    await rm(linkPath);

    const hardLinkPath = join(directory, "activation-secrets-hardlink.json");
    await link(path, hardLinkPath);
    await assert.rejects(
      verifiedActivationSecretsFile(ROOT, path, ACTIVATION_SECRETS),
      /metadata is invalid/,
    );
    await rm(hardLinkPath);

    const thirdCheckout = join(directory, "third-checkout");
    await mkdir(thirdCheckout);
    await writeFile(join(thirdCheckout, ".git"), "gitdir: ../private-git-metadata\n", { mode: 0o600 });
    const checkoutSecretPath = join(thirdCheckout, "activation-secrets.json");
    await writeFile(checkoutSecretPath, source, { mode: 0o600 });
    await chmod(checkoutSecretPath, 0o600);
    await assert.rejects(
      verifiedActivationSecretsFile(ROOT, checkoutSecretPath, ACTIVATION_SECRETS),
      /outside every Git checkout/,
    );

    const duplicatePath = join(directory, "activation-secrets-duplicate.json");
    await writeFile(duplicatePath, source.replace(
      '  "RATE_LIMIT_KEY_SECRET":',
      `  "RATE_LIMIT_KEY_SECRET": "${"x".repeat(48)}",\n  "RATE_LIMIT_KEY_SECRET":`,
    ), { mode: 0o600 });
    await chmod(duplicatePath, 0o600);
    await assert.rejects(
      verifiedActivationSecretsFile(ROOT, duplicatePath, ACTIVATION_SECRETS),
      /canonical JSON without duplicate keys/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("uploaded version must exactly match source-derived bindings before traffic", () => {
  const view = uploadedVersion(ROOT_CONFIG, "normal");
  assert.equal(verifyUploadedVersion(
    view,
    NEW_VERSION,
    ROOT_CONFIG,
    CONTRACTS.normal,
    BASE_SECRETS,
  ), true);

  const unexpected = structuredClone(view);
  unexpected.resources.bindings.push({ name: "UNREVIEWED_SECRET", type: "secret_text" });
  assert.throws(
    () => verifyUploadedVersion(unexpected, NEW_VERSION, ROOT_CONFIG, CONTRACTS.normal, BASE_SECRETS),
    /inventory differs/,
  );

  const changedLimit = structuredClone(view);
  changedLimit.resources.bindings.find(({ name }) => name === "AUTH_RATE_LIMITER").simple.limit += 1;
  assert.throws(
    () => verifyUploadedVersion(changedLimit, NEW_VERSION, ROOT_CONFIG, CONTRACTS.normal, BASE_SECRETS),
    /rate-limit binding differs/,
  );
});

test("activation mode binds a stable private secrets file to the inactive version upload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-versioned-activation-"));
  try {
    const config = structuredClone(ROOT_CONFIG);
    config.vars.RATE_LIMITING_ENABLED = "true";
    config.vars.TURNSTILE_ENABLED = "true";
    config.secrets = { required: [...BASE_SECRETS, ...ACTIVATION_SECRETS] };
    const releaseRoot = await freshReleaseRoot(directory, config);
    const events = [];
    const secretChecks = [];
    await releaseCloudflare({
      mode: "activation",
      releaseRoot,
      expectedCommit: HEAD,
      expectedGateCommit: HEAD,
      authorizationFile: "/private/authorization.json",
      secretsFile: "/private/activation-secrets.json",
      npmCli: await fakeNpmCli(join(directory, "npm")),
      environment: { PATH: process.env.PATH },
      authorizationVerifier: async ({ action }) => {
        assert.equal(action, "deploy:activation");
        return { authorized: true };
      },
      secretsFileVerifier: async (...args) => {
        secretChecks.push(args);
        return { path: "/private/activation-secrets.json", fingerprint: "a".repeat(64) };
      },
      runner: installingVersionedRunner(releaseRoot, events, {
        config,
        mode: "activation",
        secretNames: [...BASE_SECRETS, ...ACTIVATION_SECRETS],
      }),
    });
    assert.equal(secretChecks.length, 2);
    assert.deepEqual(secretChecks[0].slice(1), [
      "/private/activation-secrets.json",
      ACTIVATION_SECRETS,
    ]);
    const upload = events.find(({ args }) => args?.[1] === "versions" && args?.[2] === "upload");
    assert.deepEqual(upload.args.slice(-2), ["--secrets-file", "/private/activation-secrets.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("activation mode and enabled controls refuse every missing or misplaced secret path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-activation-refusal-"));
  try {
    const config = structuredClone(ROOT_CONFIG);
    config.vars.RATE_LIMITING_ENABLED = "true";
    config.vars.TURNSTILE_ENABLED = "true";
    config.secrets = { required: [...BASE_SECRETS, ...ACTIVATION_SECRETS] };
    const releaseRoot = await freshReleaseRoot(directory, config);
    const base = {
      releaseRoot,
      expectedCommit: HEAD,
      expectedGateCommit: HEAD,
      authorizationFile: "/private/authorization.json",
      npmCli: "/missing/npm-cli.js",
      authorizationVerifier: async () => ({ authorized: true }),
      runner: () => { throw new Error("subprocess must not run"); },
    };
    await assert.rejects(
      releaseCloudflare({ ...base, mode: "activation" }),
      /requires the reviewed activation secrets file/,
    );
    await assert.rejects(
      releaseCloudflare({ ...base, mode: "normal" }),
      /require both production abuse controls to be exactly false/,
    );
    await assert.rejects(
      releaseCloudflare({
        ...base,
        mode: "normal",
        secretsFile: "/private/activation-secrets.json",
      }),
      /permitted only for the activation release mode/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("provider baseline drift after inactive inspection refuses before traffic", async () => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-versioned-provider-drift-"));
  try {
    const releaseRoot = await freshReleaseRoot(directory);
    const events = [];
    await assert.rejects(
      releaseCloudflare({
        mode: "normal",
        releaseRoot,
        expectedCommit: HEAD,
        expectedGateCommit: HEAD,
        authorizationFile: "/private/authorization.json",
        npmCli: await fakeNpmCli(directory),
        environment: { PATH: process.env.PATH },
        authorizationVerifier: async () => ({ authorized: true }),
        runner: installingVersionedRunner(releaseRoot, events, { preTrafficVersion: NEW_VERSION }),
      }),
      /baseline drifted before the traffic mutation/,
    );
    const deployments = events.filter(
      ({ args }) => args?.[1] === "versions" && args?.[2] === "deploy",
    );
    assert.equal(deployments.length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ambiguous provider version inventory refuses before inspection or traffic", async () => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-versioned-list-ambiguity-"));
  try {
    const releaseRoot = await freshReleaseRoot(directory);
    const events = [];
    await assert.rejects(
      releaseCloudflare({
        mode: "normal",
        releaseRoot,
        expectedCommit: HEAD,
        expectedGateCommit: HEAD,
        authorizationFile: "/private/authorization.json",
        npmCli: await fakeNpmCli(directory),
        environment: { PATH: process.env.PATH },
        authorizationVerifier: async () => ({ authorized: true }),
        runner: installingVersionedRunner(releaseRoot, events, {
          afterVersions: [{ id: NEW_VERSION }, { id: NEW_VERSION }, { id: PRIOR_VERSION }],
        }),
      }),
      /duplicate version identities/,
    );
    assert.equal(events.some(
      ({ args }) => args?.[1] === "versions" && args?.[2] === "view",
    ), false);
    assert.equal(events.some(
      ({ args }) => args?.[1] === "versions" && args?.[2] === "deploy",
    ), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("post-traffic refusal restores the exact prior version at 100 percent", async () => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-versioned-rollback-"));
  try {
    const releaseRoot = await freshReleaseRoot(directory);
    const events = [];
    await assert.rejects(
      releaseCloudflare({
        mode: "normal",
        releaseRoot,
        expectedCommit: HEAD,
        expectedGateCommit: HEAD,
        authorizationFile: "/private/authorization.json",
        npmCli: await fakeNpmCli(directory),
        environment: { PATH: process.env.PATH },
        authorizationVerifier: async () => ({ authorized: true }),
        runner: installingVersionedRunner(releaseRoot, events, { finalVersion: PRIOR_VERSION }),
      }),
      /did not select the inspected Worker version/,
    );
    const deployments = events.filter(({ args }) => args?.[1] === "versions" && args?.[2] === "deploy");
    assert.equal(deployments.length, 2);
    assert.equal(deployments[0].args[3], `${NEW_VERSION}@100%`);
    assert.equal(deployments[1].args[3], `${PRIOR_VERSION}@100%`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
