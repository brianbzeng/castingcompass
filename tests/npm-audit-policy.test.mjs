import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  npmAuditInvocation,
  verifyNpmAuditPolicy,
  verifyNpmAuditWatchWorkflow,
} from "../scripts/verify-npm-audit-policy.mjs";

const watchWorkflow = await readFile(
  new URL("../.github/workflows/npm-advisory-watch.yml", import.meta.url),
  "utf8",
);

const requiredLockPackages = {
  "node_modules/@cloudflare/vite-plugin": { version: "1.52.1", dev: true },
  "node_modules/@eslint-react/eslint-plugin": { version: "5.18.0", dev: true },
  "node_modules/@next/eslint-plugin-next": { version: "16.3.1", dev: true },
  "node_modules/brace-expansion": { version: "5.0.9", dev: true },
  "node_modules/eslint": { version: "10.8.0", dev: true },
  "node_modules/eslint-plugin-import-x": { version: "4.17.1", dev: true },
  "node_modules/eslint-plugin-jsx-a11y-x": { version: "0.2.0", dev: true },
  "node_modules/eslint-plugin-react-hooks": { version: "7.1.1", dev: true },
  "node_modules/fast-uri": { version: "3.1.5", dev: true },
  "node_modules/globals": { version: "16.4.0", dev: true },
  "node_modules/minimatch": { version: "10.2.5", dev: true },
  "node_modules/nanoid": { version: "3.3.18", dev: false },
  "node_modules/next": { version: "16.3.1", dev: false },
  "node_modules/postcss": { version: "8.5.23", dev: false },
  "node_modules/react": { version: "19.2.8", dev: false },
  "node_modules/react-dom": { version: "19.2.8", dev: false },
  "node_modules/react-server-dom-webpack": { version: "19.2.8", dev: true },
  "node_modules/typescript-eslint": { version: "8.65.0", dev: true },
  "node_modules/vinext": { version: "0.0.45", dev: true },
  "node_modules/wrangler": { version: "4.123.0", dev: true },
};

const forbiddenLockPackages = [
  "node_modules/@eslint/eslintrc",
  "node_modules/eslint-config-next",
  "node_modules/eslint-plugin-import",
  "node_modules/eslint-plugin-jsx-a11y",
  "node_modules/eslint-plugin-react",
];

const zeroCounts = {
  info: 0,
  low: 0,
  moderate: 0,
  high: 0,
  critical: 0,
  total: 0,
};

function fixture() {
  return {
    policy: {
      schemaVersion: "castingcompass.npm-audit-policy/2.0.0",
      reviewedOn: "2026-08-15",
      owner: "dependency-release-owner",
      requiredAuditCounts: {
        complete: { ...zeroCounts },
        production: { ...zeroCounts },
      },
      requiredLockPackages: structuredClone(requiredLockPackages),
      forbiddenLockPackages: [...forbiddenLockPackages],
    },
    lockfile: {
      lockfileVersion: 3,
      packages: Object.fromEntries(Object.entries(requiredLockPackages).map(([path, value]) => [
        path,
        { ...value },
      ])),
    },
    fullReport: {
      vulnerabilities: {},
      metadata: {
        vulnerabilities: { ...zeroCounts },
      },
    },
    productionReport: {
      vulnerabilities: {},
      metadata: {
        vulnerabilities: { ...zeroCounts },
      },
    },
  };
}

test("runs npm audit through the current Node runtime without a command shell", () => {
  const cliPath = "C:\\tools\\node_modules\\npm\\bin\\npm-cli.js";
  assert.deepEqual(npmAuditInvocation({
    environment: { npm_execpath: cliPath },
    nodeExecutable: "C:\\tools\\node.exe",
    fileExists: (candidate) => candidate === cliPath,
    platform: "win32",
  }), {
    command: "C:\\tools\\node.exe",
    argumentsPrefix: [cliPath],
  });
});

test("requires zero vulnerabilities in the complete and production npm graphs", () => {
  assert.deepEqual(verifyNpmAuditPolicy(fixture()), {
    schemaVersion: "castingcompass.npm-audit-verification/2.0.0",
    policyValid: true,
    completeVulnerabilities: 0,
    productionVulnerabilities: 0,
    temporaryExceptions: 0,
  });
});

test("rejects any complete-graph vulnerability", () => {
  const input = fixture();
  input.fullReport.metadata.vulnerabilities.high = 1;
  input.fullReport.metadata.vulnerabilities.total = 1;
  input.fullReport.vulnerabilities["brace-expansion"] = {
    severity: "high",
    via: [],
    effects: [],
    range: "<=5.0.7",
    nodes: ["node_modules/brace-expansion"],
  };
  assert.throws(() => verifyNpmAuditPolicy(input), /complete npm audit must report zero/u);
});

test("rejects any production vulnerability", () => {
  const input = fixture();
  input.productionReport.metadata.vulnerabilities.high = 1;
  input.productionReport.metadata.vulnerabilities.total = 1;
  input.productionReport.vulnerabilities.next = {
    severity: "high",
    via: [],
    effects: [],
    range: "*",
    nodes: ["node_modules/next"],
  };
  assert.throws(() => verifyNpmAuditPolicy(input), /production npm audit must report zero/u);
});

test("rejects a hidden vulnerability inventory even when metadata claims zero", () => {
  const input = fixture();
  input.fullReport.vulnerabilities.minimatch = {
    severity: "high",
    via: [],
    effects: [],
    range: "*",
    nodes: ["node_modules/minimatch"],
  };
  assert.throws(() => verifyNpmAuditPolicy(input), /inventory must be empty/u);
});

test("rejects exact lock-version or dev-classification drift", () => {
  const versionInput = fixture();
  versionInput.lockfile.packages["node_modules/eslint"].version = "10.7.0";
  assert.throws(() => verifyNpmAuditPolicy(versionInput), /must remain 10\.8\.0/u);

  const classificationInput = fixture();
  classificationInput.lockfile.packages["node_modules/react-server-dom-webpack"].dev = false;
  assert.throws(() => verifyNpmAuditPolicy(classificationInput), /dev classification drifted/u);
});

test("rejects restoration of a legacy vulnerable lint package", () => {
  const input = fixture();
  input.lockfile.packages["node_modules/eslint-config-next"] = {
    version: "16.2.11",
    dev: true,
  };
  assert.throws(() => verifyNpmAuditPolicy(input), /restored forbidden legacy lint package/u);
});

test("rejects an exception or weaker count added back to policy", () => {
  const exceptionInput = fixture();
  exceptionInput.policy.exception = { expiresOn: "2026-08-01" };
  assert.throws(() => verifyNpmAuditPolicy(exceptionInput), /policy fields are invalid/u);

  const weakerInput = fixture();
  weakerInput.policy.requiredAuditCounts.complete.high = 1;
  assert.throws(() => verifyNpmAuditPolicy(weakerInput), /must require zero high/u);
});

test("binds a daily read-only no-install advisory watch to the exact verifier", () => {
  assert.deepEqual(verifyNpmAuditWatchWorkflow(watchWorkflow), {
    schemaVersion: "castingcompass.npm-advisory-watch/1.0.0",
    workflow: ".github/workflows/npm-advisory-watch.yml",
    cron: "47 8 * * *",
    maximumScheduleIntervalHours: 24,
    permissions: "contents:read",
    installsDependencies: false,
    productionAuthority: false,
  });
});

test("rejects schedule, permission, action, command, and dependency-authority drift", () => {
  assert.throws(
    () => verifyNpmAuditWatchWorkflow(watchWorkflow.replace("47 8 * * *", "47 8 * * 1")),
    /run daily/u,
  );
  assert.throws(
    () => verifyNpmAuditWatchWorkflow(watchWorkflow.replace("contents: read", "contents: write")),
    /read-only contents permission/u,
  );
  assert.throws(
    () => verifyNpmAuditWatchWorkflow(watchWorkflow.replace(
      "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
      "actions/setup-node@v7",
    )),
    /exact and immutable/u,
  );
  assert.throws(
    () => verifyNpmAuditWatchWorkflow(watchWorkflow.replace(
      "npm run security:dependencies",
      "npm audit",
    )),
    /audit-policy verifier only/u,
  );
  assert.throws(
    () => verifyNpmAuditWatchWorkflow(`${watchWorkflow}\n      - run: npm install\n`),
    /audit-policy verifier only|install/u,
  );
});
