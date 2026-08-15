#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_SCHEMA = "castingcompass.npm-audit-policy/2.0.0";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const SEVERITIES = ["info", "low", "moderate", "high", "critical", "total"];
const WATCH_WORKFLOW_PATH = ".github/workflows/npm-advisory-watch.yml";
const WATCH_CHECKOUT_ACTION = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const WATCH_SETUP_NODE_ACTION = "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function plainObject(value, label) {
  invariant(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  return value;
}

function exactKeys(value, expected, label) {
  const object = plainObject(value, label);
  invariant(
    JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...expected].sort()),
    `${label} fields are invalid`,
  );
  return object;
}

function exactStringArray(value, label) {
  invariant(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array`);
  invariant(value.every((item) => typeof item === "string" && item.length > 0),
    `${label} entries must be non-empty strings`);
  invariant(new Set(value).size === value.length, `${label} entries must be unique`);
  invariant(JSON.stringify(value) === JSON.stringify([...value].sort()),
    `${label} entries must be sorted`);
  return value;
}

function utcDate(value, label) {
  invariant(DATE_PATTERN.test(value ?? ""), `${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  invariant(Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value,
    `${label} is invalid`);
}

function exactMatches(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

export function verifyNpmAuditWatchWorkflow(source) {
  invariant(typeof source === "string" && source.length > 0,
    "npm advisory watch workflow is missing");
  invariant(source.startsWith("name: NPM advisory watch\n\n"),
    "npm advisory watch name drifted");
  invariant(source.includes([
    "on:",
    "  schedule:",
    "    - cron: \"47 8 * * *\"",
    "  workflow_dispatch:",
    "",
  ].join("\n")), "npm advisory watch must run daily and on manual dispatch");
  invariant(exactMatches(source, /^\s+- cron:\s+"([^"]+)"$/gmu).length === 1,
    "npm advisory watch must define exactly one schedule");
  invariant(source.includes("permissions:\n  contents: read\n"),
    "npm advisory watch must have read-only contents permission");
  invariant(!/^\s+[A-Za-z-]+:\s*write\s*$/gmu.test(source),
    "npm advisory watch must not have write permission");
  invariant(source.includes([
    "concurrency:",
    "  group: npm-advisory-watch",
    "  cancel-in-progress: true",
    "",
  ].join("\n")), "npm advisory watch concurrency is invalid");
  invariant(source.includes("    runs-on: ubuntu-24.04\n    timeout-minutes: 10\n"),
    "npm advisory watch runner or timeout drifted");

  const actions = exactMatches(source, /^\s+- uses:\s+([^\s#]+)(?:\s+#.*)?$/gmu);
  invariant(JSON.stringify(actions) === JSON.stringify([
    WATCH_CHECKOUT_ACTION,
    WATCH_SETUP_NODE_ACTION,
  ]), "npm advisory watch actions must remain exact and immutable");
  invariant(source.includes("          persist-credentials: false\n"),
    "npm advisory watch checkout credentials must remain disabled");
  invariant(source.includes("          node-version: 22.23.1\n"),
    "npm advisory watch Node version drifted");

  const commands = exactMatches(source, /^\s+run:\s+(.+)$/gmu);
  invariant(JSON.stringify(commands) === JSON.stringify(["npm run security:dependencies"]),
    "npm advisory watch command must remain the audit-policy verifier only");
  invariant(!/\$\{\{\s*secrets\.|^\s+env:|curl\s|wget\s|npm\s+(?:ci|install)|upload-artifact|download-artifact/imu
    .test(source), "npm advisory watch gained secret, install, download, or artifact authority");

  return {
    schemaVersion: "castingcompass.npm-advisory-watch/1.0.0",
    workflow: WATCH_WORKFLOW_PATH,
    cron: "47 8 * * *",
    maximumScheduleIntervalHours: 24,
    permissions: "contents:read",
    installsDependencies: false,
    productionAuthority: false,
  };
}

function vulnerabilityCounts(report, label) {
  const counts = exactKeys(report?.metadata?.vulnerabilities, SEVERITIES,
    `${label} vulnerability counts`);
  for (const severity of SEVERITIES) {
    invariant(Number.isSafeInteger(counts[severity]) && counts[severity] >= 0,
      `${label} ${severity} count is invalid`);
  }
  invariant(counts.total === counts.info + counts.low + counts.moderate + counts.high + counts.critical,
    `${label} vulnerability total is inconsistent`);
  return counts;
}

function validateRequiredCounts(value, label) {
  const counts = exactKeys(value, SEVERITIES, label);
  for (const severity of SEVERITIES) {
    invariant(counts[severity] === 0, `${label} must require zero ${severity} vulnerabilities`);
  }
  return counts;
}

function validatePolicy(policy) {
  exactKeys(
    policy,
    [
      "schemaVersion",
      "reviewedOn",
      "owner",
      "requiredAuditCounts",
      "requiredLockPackages",
      "forbiddenLockPackages",
    ],
    "npm audit policy",
  );
  invariant(policy.schemaVersion === POLICY_SCHEMA, "npm audit policy schema is unsupported");
  utcDate(policy.reviewedOn, "npm audit policy reviewedOn");
  invariant(/^[a-z0-9][a-z0-9-]{2,63}$/u.test(policy.owner ?? ""),
    "npm audit policy owner is invalid");

  const requiredAuditCounts = exactKeys(
    policy.requiredAuditCounts,
    ["complete", "production"],
    "npm audit required counts",
  );
  validateRequiredCounts(requiredAuditCounts.complete, "complete npm audit required counts");
  validateRequiredCounts(requiredAuditCounts.production, "production npm audit required counts");

  const requiredLockPackages = plainObject(
    policy.requiredLockPackages,
    "npm audit required lock packages",
  );
  invariant(Object.keys(requiredLockPackages).length > 0,
    "npm audit required lock packages must not be empty");
  invariant(
    JSON.stringify(Object.keys(requiredLockPackages))
      === JSON.stringify(Object.keys(requiredLockPackages).sort()),
    "npm audit required lock package paths must be sorted",
  );
  for (const [path, requirement] of Object.entries(requiredLockPackages)) {
    invariant(path.startsWith("node_modules/") && !path.includes(".."),
      `npm audit required lock path is invalid: ${path}`);
    exactKeys(requirement, ["version", "dev"], `npm audit lock requirement ${path}`);
    invariant(VERSION_PATTERN.test(requirement.version ?? ""),
      `npm audit lock requirement version is invalid: ${path}`);
    invariant(typeof requirement.dev === "boolean",
      `npm audit lock requirement dev flag is invalid: ${path}`);
  }

  const forbiddenLockPackages = exactStringArray(
    policy.forbiddenLockPackages,
    "npm audit forbidden lock packages",
  );
  invariant(forbiddenLockPackages.every(
    (path) => path.startsWith("node_modules/") && !path.includes(".."),
  ), "npm audit forbidden lock package path is invalid");
  invariant(forbiddenLockPackages.every((path) => !Object.hasOwn(requiredLockPackages, path)),
    "npm audit package cannot be both required and forbidden");

  return { requiredAuditCounts, requiredLockPackages, forbiddenLockPackages };
}

function validateLockfile(lockfile, policy) {
  invariant(lockfile?.lockfileVersion === 3, "npm lockfile version must remain 3");
  const packages = plainObject(lockfile?.packages, "npm lockfile packages");
  for (const [path, requirement] of Object.entries(policy.requiredLockPackages)) {
    const actual = plainObject(packages[path], `npm lock package ${path}`);
    invariant(actual.version === requirement.version,
      `npm lock package ${path} must remain ${requirement.version}`);
    invariant(Boolean(actual.dev) === requirement.dev,
      `npm lock package ${path} dev classification drifted`);
  }
  for (const path of policy.forbiddenLockPackages) {
    invariant(!Object.hasOwn(packages, path),
      `npm lockfile restored forbidden legacy lint package ${path}`);
  }
}

function verifyZeroReport(report, expected, label) {
  const counts = vulnerabilityCounts(report, label);
  invariant(JSON.stringify(counts) === JSON.stringify(expected),
    `${label} must report zero vulnerabilities`);
  const vulnerabilities = plainObject(report?.vulnerabilities, `${label} vulnerabilities`);
  invariant(Object.keys(vulnerabilities).length === 0,
    `${label} vulnerability inventory must be empty`);
}

export function verifyNpmAuditPolicy({
  policy,
  lockfile,
  fullReport,
  productionReport,
}) {
  const validatedPolicy = validatePolicy(policy);
  validateLockfile(lockfile, validatedPolicy);
  verifyZeroReport(
    fullReport,
    validatedPolicy.requiredAuditCounts.complete,
    "complete npm audit",
  );
  verifyZeroReport(
    productionReport,
    validatedPolicy.requiredAuditCounts.production,
    "production npm audit",
  );

  return {
    schemaVersion: "castingcompass.npm-audit-verification/2.0.0",
    policyValid: true,
    completeVulnerabilities: 0,
    productionVulnerabilities: 0,
    temporaryExceptions: 0,
  };
}

function parseReport(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }
}

export function npmAuditInvocation({
  environment = process.env,
  nodeExecutable = process.execPath,
  fileExists = existsSync,
  platform = process.platform,
} = {}) {
  const environmentCli = environment.npm_execpath;
  const candidates = [
    typeof environmentCli === "string" && isAbsolute(environmentCli) ? environmentCli : undefined,
    resolve(dirname(nodeExecutable), "node_modules", "npm", "bin", "npm-cli.js"),
    resolve(dirname(nodeExecutable), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter(Boolean);
  const npmCli = candidates.find((candidate) => fileExists(candidate));
  if (npmCli) {
    return {
      command: nodeExecutable,
      argumentsPrefix: [npmCli],
    };
  }
  return {
    command: platform === "win32" ? "npm.cmd" : "npm",
    argumentsPrefix: [],
  };
}

function runAudit(argumentsList, label) {
  const invocation = npmAuditInvocation();
  const result = spawnSync(invocation.command, [
    ...invocation.argumentsPrefix,
    "audit",
    ...argumentsList,
    "--json",
  ], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
  invariant(!result.error, `${label} failed to start`);
  invariant([0, 1].includes(result.status), `${label} exited unexpectedly`);
  invariant(typeof result.stdout === "string" && result.stdout.length > 0,
    `${label} returned no report`);
  return parseReport(result.stdout, label);
}

function cliReports(argumentsList) {
  if (argumentsList.length === 0) {
    return {
      fullReport: runAudit([], "complete npm audit"),
      productionReport: runAudit(["--omit=dev"], "production npm audit"),
    };
  }
  invariant(argumentsList.length === 4,
    "Usage: node scripts/verify-npm-audit-policy.mjs [--full-report FILE --production-report FILE]");
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const option = argumentsList[index];
    const value = argumentsList[index + 1];
    invariant(["--full-report", "--production-report"].includes(option) && value && !values.has(option),
      "npm audit report arguments are invalid");
    values.set(option, value);
  }
  invariant(values.size === 2, "both npm audit report files are required");
  return {
    fullReport: parseReport(readFileSync(resolve(ROOT, values.get("--full-report")), "utf8"),
      "complete npm audit report file"),
    productionReport: parseReport(
      readFileSync(resolve(ROOT, values.get("--production-report")), "utf8"),
      "production npm audit report file",
    ),
  };
}

async function main() {
  const policy = JSON.parse(readFileSync(resolve(ROOT, "security/npm-audit-policy.json"), "utf8"));
  const lockfile = JSON.parse(readFileSync(resolve(ROOT, "package-lock.json"), "utf8"));
  const watchWorkflow = readFileSync(resolve(ROOT, WATCH_WORKFLOW_PATH), "utf8");
  const scheduledWatch = verifyNpmAuditWatchWorkflow(watchWorkflow);
  const reports = cliReports(process.argv.slice(2));
  const result = verifyNpmAuditPolicy({ policy, lockfile, ...reports });
  process.stdout.write(`${JSON.stringify({ ...result, scheduledWatch }, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "npm audit verification failed"}\n`);
    process.exitCode = 1;
  });
}
