#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_SCHEMA = "castingcompass.npm-audit-policy/1.0.0";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

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
  return parsed;
}

function vulnerabilityCounts(report, label) {
  const counts = plainObject(report?.metadata?.vulnerabilities, `${label} vulnerability counts`);
  for (const severity of ["info", "low", "moderate", "high", "critical", "total"]) {
    invariant(Number.isSafeInteger(counts[severity]) && counts[severity] >= 0,
      `${label} ${severity} count is invalid`);
  }
  invariant(counts.total === counts.info + counts.low + counts.moderate + counts.high + counts.critical,
    `${label} vulnerability total is inconsistent`);
  return counts;
}

function rootAdvisories(name, vulnerabilities, visited = new Set()) {
  invariant(!visited.has(name), `npm audit vulnerability graph contains a cycle at ${name}`);
  const entry = plainObject(vulnerabilities[name], `npm audit vulnerability ${name}`);
  const nextVisited = new Set(visited).add(name);
  const advisories = [];
  invariant(Array.isArray(entry.via), `npm audit vulnerability ${name} via field is invalid`);
  for (const via of entry.via) {
    if (typeof via === "string") {
      invariant(vulnerabilities[via], `npm audit vulnerability ${name} references missing ${via}`);
      advisories.push(...rootAdvisories(via, vulnerabilities, nextVisited));
    } else {
      advisories.push(plainObject(via, `npm audit advisory for ${name}`));
    }
  }
  return advisories;
}

function validatePolicy(policy, now) {
  exactKeys(policy, ["schemaVersion", "reviewedOn", "owner", "exception"], "npm audit policy");
  invariant(policy.schemaVersion === POLICY_SCHEMA, "npm audit policy schema is unsupported");
  const reviewedOn = utcDate(policy.reviewedOn, "npm audit policy reviewedOn");
  invariant(/^[a-z0-9][a-z0-9-]{2,63}$/u.test(policy.owner ?? ""), "npm audit policy owner is invalid");

  const exception = exactKeys(
    policy.exception,
    [
      "expiresOn",
      "reason",
      "advisory",
      "expectedHighVulnerabilities",
      "vulnerableNodes",
      "requiredLockPackages",
    ],
    "npm audit exception",
  );
  const expiresOn = utcDate(exception.expiresOn, "npm audit exception expiresOn");
  const durationDays = (expiresOn.valueOf() - reviewedOn.valueOf()) / 86_400_000;
  invariant(durationDays >= 0 && durationDays <= 14,
    "npm audit exception may cover at most fourteen days");
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  invariant(today <= expiresOn, `npm audit exception expired on ${exception.expiresOn}`);
  invariant(typeof exception.reason === "string" && exception.reason.length >= 120
    && exception.reason.length <= 800, "npm audit exception reason is invalid");

  const advisory = exactKeys(
    exception.advisory,
    ["source", "id", "url", "package", "severity", "affectedRange", "patchedVersion"],
    "npm audit exception advisory",
  );
  invariant(Number.isSafeInteger(advisory.source) && advisory.source > 0,
    "npm audit advisory source is invalid");
  invariant(/^GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/u
    .test(advisory.id ?? ""), "npm audit advisory ID is invalid");
  invariant(advisory.url === `https://github.com/advisories/${advisory.id}`,
    "npm audit advisory URL is invalid");
  invariant(advisory.package === "brace-expansion", "npm audit exception package is invalid");
  invariant(advisory.severity === "high", "npm audit exception severity is invalid");
  invariant(advisory.affectedRange === "<=5.0.7", "npm audit exception affected range is invalid");
  invariant(VERSION_PATTERN.test(advisory.patchedVersion ?? ""),
    "npm audit exception patched version is invalid");

  exactStringArray(exception.expectedHighVulnerabilities,
    "npm audit expected high vulnerabilities");
  exactStringArray(exception.vulnerableNodes, "npm audit vulnerable nodes");
  const requiredLockPackages = plainObject(exception.requiredLockPackages,
    "npm audit required lock packages");
  invariant(Object.keys(requiredLockPackages).length > 0,
    "npm audit required lock packages must not be empty");
  invariant(JSON.stringify(Object.keys(requiredLockPackages))
    === JSON.stringify(Object.keys(requiredLockPackages).sort()),
  "npm audit required lock package paths must be sorted");
  for (const [path, requirement] of Object.entries(requiredLockPackages)) {
    invariant(path.startsWith("node_modules/") && !path.includes(".."),
      `npm audit required lock path is invalid: ${path}`);
    exactKeys(requirement, ["version", "dev"], `npm audit lock requirement ${path}`);
    invariant(VERSION_PATTERN.test(requirement.version ?? ""),
      `npm audit lock requirement version is invalid: ${path}`);
    invariant(typeof requirement.dev === "boolean",
      `npm audit lock requirement dev flag is invalid: ${path}`);
  }
  for (const node of exception.vulnerableNodes) {
    invariant(requiredLockPackages[node]?.dev === true,
      `npm audit vulnerable node is not an exact dev-only lock requirement: ${node}`);
  }
  return exception;
}

function validateLockfile(lockfile, exception) {
  invariant(lockfile?.lockfileVersion === 3, "npm lockfile version must remain 3");
  const packages = plainObject(lockfile?.packages, "npm lockfile packages");
  for (const [path, requirement] of Object.entries(exception.requiredLockPackages)) {
    const actual = plainObject(packages[path], `npm lock package ${path}`);
    invariant(actual.version === requirement.version,
      `npm lock package ${path} must remain ${requirement.version}`);
    invariant(Boolean(actual.dev) === requirement.dev,
      `npm lock package ${path} dev classification drifted`);
  }
  return packages;
}

export function verifyNpmAuditPolicy({
  policy,
  lockfile,
  fullReport,
  productionReport,
  now = new Date(),
}) {
  invariant(now instanceof Date && Number.isFinite(now.valueOf()), "npm audit verification time is invalid");
  const exception = validatePolicy(policy, now);
  const packages = validateLockfile(lockfile, exception);
  const productionCounts = vulnerabilityCounts(productionReport, "production npm audit");
  invariant(productionCounts.total === 0,
    "production npm audit must report zero vulnerabilities");

  const fullCounts = vulnerabilityCounts(fullReport, "complete npm audit");
  invariant(fullCounts.critical === 0, "complete npm audit must report zero critical vulnerabilities");
  const vulnerabilities = plainObject(fullReport?.vulnerabilities, "complete npm audit vulnerabilities");
  const highNames = Object.entries(vulnerabilities)
    .filter(([, entry]) => entry?.severity === "high")
    .map(([name]) => name)
    .sort();
  invariant(fullCounts.high === highNames.length,
    "complete npm audit high count does not match its vulnerability inventory");
  invariant(
    JSON.stringify(highNames) === JSON.stringify(exception.expectedHighVulnerabilities),
    "complete npm audit high vulnerability inventory drifted",
  );

  const advisoryIdentities = new Set();
  for (const name of highNames) {
    const entry = plainObject(vulnerabilities[name], `complete npm audit vulnerability ${name}`);
    invariant(Array.isArray(entry.nodes) && entry.nodes.length > 0,
      `complete npm audit vulnerability ${name} has no nodes`);
    for (const node of entry.nodes) {
      invariant(packages[node], `complete npm audit node is absent from the lockfile: ${node}`);
      invariant(packages[node].dev === true,
        `complete npm audit vulnerability escaped the dev-only graph: ${node}`);
    }
    const advisories = rootAdvisories(name, vulnerabilities);
    invariant(advisories.length > 0, `complete npm audit vulnerability ${name} has no root advisory`);
    for (const advisory of advisories) {
      advisoryIdentities.add(JSON.stringify({
        source: advisory.source,
        name: advisory.name,
        url: advisory.url,
        severity: advisory.severity,
        range: advisory.range,
      }));
    }
  }

  const expectedAdvisory = exception.advisory;
  const expectedIdentity = JSON.stringify({
    source: expectedAdvisory.source,
    name: expectedAdvisory.package,
    url: expectedAdvisory.url,
    severity: expectedAdvisory.severity,
    range: expectedAdvisory.affectedRange,
  });
  invariant(advisoryIdentities.size === 1 && advisoryIdentities.has(expectedIdentity),
    "complete npm audit contains an unreviewed root advisory");
  const vulnerableEntry = plainObject(vulnerabilities[expectedAdvisory.package],
    `complete npm audit vulnerability ${expectedAdvisory.package}`);
  invariant(JSON.stringify([...vulnerableEntry.nodes].sort())
    === JSON.stringify(exception.vulnerableNodes),
  "npm audit vulnerable package nodes drifted");

  return {
    schemaVersion: "castingcompass.npm-audit-verification/1.0.0",
    policyValid: true,
    productionVulnerabilities: 0,
    temporaryDevAdvisory: expectedAdvisory.id,
    affectedDevAuditEntries: highNames.length,
    expiresOn: exception.expiresOn,
  };
}

function parseReport(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} did not return valid JSON`);
  }
}

function runAudit(argumentsList, label) {
  const result = spawnSync("npm", ["audit", ...argumentsList, "--json"], {
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
  const reports = cliReports(process.argv.slice(2));
  const result = verifyNpmAuditPolicy({ policy, lockfile, ...reports });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "npm audit verification failed"}\n`);
    process.exitCode = 1;
  });
}
