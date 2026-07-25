import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  verifyNpmAuditPolicy,
  verifyNpmAuditWatchWorkflow,
} from "../scripts/verify-npm-audit-policy.mjs";

const watchWorkflow = await readFile(
  new URL("../.github/workflows/npm-advisory-watch.yml", import.meta.url),
  "utf8",
);

const highNames = [
  "@eslint/config-array",
  "@eslint/eslintrc",
  "brace-expansion",
  "eslint",
  "eslint-config-next",
  "eslint-plugin-import",
  "eslint-plugin-jsx-a11y",
  "eslint-plugin-react",
  "minimatch",
];
const advisory = {
  source: 1124334,
  name: "brace-expansion",
  dependency: "brace-expansion",
  title: "bounded fixture",
  url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
  severity: "high",
  range: "<=5.0.7",
};
const requiredLockPackages = {
  "node_modules/@typescript-eslint/typescript-estree/node_modules/brace-expansion": {
    version: "5.0.8",
    dev: true,
  },
  "node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch": {
    version: "10.2.5",
    dev: true,
  },
  "node_modules/brace-expansion": { version: "1.1.16", dev: true },
  "node_modules/minimatch": { version: "3.1.5", dev: true },
  "node_modules/postcss": { version: "8.5.18", dev: false },
  "node_modules/react": { version: "19.2.8", dev: false },
  "node_modules/react-dom": { version: "19.2.8", dev: false },
  "node_modules/react-server-dom-webpack": { version: "19.2.8", dev: true },
};

function fixture() {
  const policy = {
    schemaVersion: "castingcompass.npm-audit-policy/1.0.0",
    reviewedOn: "2026-07-25",
    owner: "dependency-release-owner",
    exception: {
      expiresOn: "2026-08-01",
      reason: "The maintained ESLint plugin releases still require minimatch 3, whose CommonJS brace-expansion 1 API is incompatible with patched brace-expansion 5. Production is clean and the exception expires.",
      advisory: {
        source: 1124334,
        id: "GHSA-mh99-v99m-4gvg",
        url: "https://github.com/advisories/GHSA-mh99-v99m-4gvg",
        package: "brace-expansion",
        severity: "high",
        affectedRange: "<=5.0.7",
        patchedVersion: "5.0.8",
      },
      expectedHighVulnerabilities: [...highNames],
      vulnerableNodes: ["node_modules/brace-expansion"],
      requiredLockPackages: structuredClone(requiredLockPackages),
    },
  };
  const packages = Object.fromEntries(Object.entries(requiredLockPackages).map(([path, value]) => [
    path,
    { ...value },
  ]));
  for (const name of highNames) {
    packages[`node_modules/${name}`] ??= { version: "1.0.0", dev: true };
  }
  const vulnerabilities = {};
  for (const name of highNames) {
    vulnerabilities[name] = {
      name,
      severity: "high",
      via: name === "brace-expansion" ? [{ ...advisory }] : ["brace-expansion"],
      effects: [],
      range: "*",
      nodes: [`node_modules/${name}`],
    };
  }
  vulnerabilities["brace-expansion"].nodes = ["node_modules/brace-expansion"];
  return {
    policy,
    lockfile: { lockfileVersion: 3, packages },
    fullReport: {
      vulnerabilities,
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 9, critical: 0, total: 9 },
      },
    },
    productionReport: {
      vulnerabilities: {},
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 },
      },
    },
    now: new Date("2026-07-25T20:00:00.000Z"),
  };
}

test("accepts the exact dev-only advisory graph while production remains clean", () => {
  const result = verifyNpmAuditPolicy(fixture());
  assert.equal(result.productionVulnerabilities, 0);
  assert.equal(result.temporaryDevAdvisory, "GHSA-mh99-v99m-4gvg");
  assert.equal(result.affectedDevAuditEntries, 9);
  assert.equal(result.expiresOn, "2026-08-01");
});

test("rejects any production vulnerability", () => {
  const input = fixture();
  input.productionReport.metadata.vulnerabilities.high = 1;
  input.productionReport.metadata.vulnerabilities.total = 1;
  assert.throws(() => verifyNpmAuditPolicy(input), /production npm audit must report zero/u);
});

test("rejects an additional root advisory", () => {
  const input = fixture();
  input.fullReport.vulnerabilities["brace-expansion"].via.push({
    ...advisory,
    source: 9999999,
    url: "https://github.com/advisories/GHSA-2345-2345-2345",
  });
  assert.throws(() => verifyNpmAuditPolicy(input), /unreviewed root advisory/u);
});

test("rejects a changed high wrapper inventory", () => {
  const input = fixture();
  delete input.fullReport.vulnerabilities["eslint-plugin-react"];
  input.fullReport.metadata.vulnerabilities.high = 8;
  input.fullReport.metadata.vulnerabilities.total = 8;
  assert.throws(() => verifyNpmAuditPolicy(input), /high vulnerability inventory drifted/u);
});

test("rejects an expired exception", () => {
  const input = fixture();
  input.now = new Date("2026-08-02T00:00:00.000Z");
  assert.throws(() => verifyNpmAuditPolicy(input), /expired on 2026-08-01/u);
});

test("rejects a vulnerability node outside the dev-only graph", () => {
  const input = fixture();
  input.lockfile.packages["node_modules/eslint"].dev = false;
  assert.throws(() => verifyNpmAuditPolicy(input), /escaped the dev-only graph/u);
});

test("rejects exact lock-version or dev-classification drift", () => {
  const versionInput = fixture();
  versionInput.lockfile.packages["node_modules/postcss"].version = "8.5.17";
  assert.throws(() => verifyNpmAuditPolicy(versionInput), /must remain 8.5.18/u);

  const classificationInput = fixture();
  classificationInput.lockfile.packages["node_modules/react-server-dom-webpack"].dev = false;
  assert.throws(() => verifyNpmAuditPolicy(classificationInput), /dev classification drifted/u);
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
