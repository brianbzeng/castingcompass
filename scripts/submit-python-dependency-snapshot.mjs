#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPOSITORY = "brianbzeng/castingcompass";
const DETECTOR = {
  name: "castingcompass-python-locks",
  version: "1.0.0",
  url: `https://github.com/${REPOSITORY}/blob/main/scripts/submit-python-dependency-snapshot.mjs`,
};
const MANIFESTS = [
  {
    manifest: "services/api/requirements.txt",
    lock: "services/api/requirements-runtime.lock",
    scope: "runtime",
    python: "3.13.14",
  },
  {
    manifest: "services/api/requirements-test.in",
    lock: "services/api/requirements-test.lock",
    scope: "development",
    python: "3.13.14",
  },
  {
    manifest: "pipeline/requirements-ci.in",
    lock: "pipeline/requirements-ci.lock",
    scope: "development",
    python: "3.12.13",
  },
];

function normalizeName(value) {
  return value.toLowerCase().replace(/[._-]+/g, "-");
}

function repositoryPath(path) {
  const absolute = resolve(ROOT, path);
  if (absolute !== ROOT && !absolute.startsWith(`${ROOT}${sep}`)) {
    throw new Error(`Dependency input escapes the repository: ${path}`);
  }
  return absolute;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(repositoryPath(path))).digest("hex");
}

function directRequirements(path, visited = new Set()) {
  const absolute = repositoryPath(path);
  if (visited.has(absolute)) return new Set();
  visited.add(absolute);

  const direct = new Set();
  for (const rawLine of readFileSync(absolute, "utf8").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;
    const included = line.match(/^-r\s+(.+)$/);
    if (included) {
      const nested = relative(ROOT, resolve(dirname(absolute), included[1].trim()));
      for (const name of directRequirements(nested, visited)) direct.add(name);
      continue;
    }
    if (/^-c\s+/.test(line)) continue;
    const requirement = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]+\])?\s*(?:===|==|~=|!=|<=|>=|<|>)/);
    if (!requirement) throw new Error(`${path} contains an unsupported requirement: ${line}`);
    direct.add(normalizeName(requirement[1]));
  }
  return direct;
}

function resolvedLock(path) {
  const packages = new Map();
  for (const line of readFileSync(repositoryPath(path), "utf8").split(/\r?\n/)) {
    const requirement = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s;\\]+)/);
    if (!requirement) continue;
    const name = normalizeName(requirement[1]);
    if (packages.has(name)) throw new Error(`${path} resolves ${name} more than once`);
    packages.set(name, requirement[2]);
  }
  if (packages.size < 2) throw new Error(`${path} has no resolved dependency graph`);
  return packages;
}

function manifestSnapshot({ manifest, lock, scope, python }) {
  const direct = directRequirements(manifest);
  const packages = resolvedLock(lock);
  for (const name of direct) {
    if (!packages.has(name)) throw new Error(`${lock} does not resolve direct dependency ${name}`);
  }

  const resolved = {};
  for (const [name, version] of [...packages].sort(([left], [right]) => left.localeCompare(right))) {
    resolved[name] = {
      package_url: `pkg:pypi/${encodeURIComponent(name)}@${encodeURIComponent(version)}`,
      relationship: direct.has(name) ? "direct" : "indirect",
      scope,
    };
  }

  return {
    name: manifest,
    file: { source_location: manifest },
    metadata: {
      "castingcompass:lock": lock,
      "castingcompass:lock-sha256": sha256(lock),
      "castingcompass:python": python,
    },
    resolved,
  };
}

export function buildSnapshot({ sha, ref, runId, runAttempt, serverUrl, scanned }) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Dependency snapshot requires a full commit SHA");
  if (ref !== "refs/heads/main") throw new Error("Dependency snapshots may describe only refs/heads/main");
  if (!/^\d+$/.test(String(runId)) || !/^\d+$/.test(String(runAttempt))) {
    throw new Error("Dependency snapshot requires numeric GitHub run identity");
  }
  if (!/^https:\/\/github\.com$/.test(serverUrl)) throw new Error("Unexpected GitHub server URL");
  if (!Number.isFinite(Date.parse(scanned))) throw new Error("Dependency snapshot scan time is invalid");

  return {
    version: 0,
    sha,
    ref,
    job: {
      correlator: "castingcompass-python-locks",
      id: `${runId}.${runAttempt}`,
      html_url: `${serverUrl}/${REPOSITORY}/actions/runs/${runId}`,
    },
    detector: DETECTOR,
    scanned,
    manifests: Object.fromEntries(MANIFESTS.map((definition) => [
      definition.manifest,
      manifestSnapshot(definition),
    ])),
  };
}

function workflowSnapshot() {
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY) throw new Error("Unexpected GitHub repository");
  if (process.env.GITHUB_EVENT_NAME !== "push") throw new Error("Dependency submission requires a push event");
  return buildSnapshot({
    sha: process.env.GITHUB_SHA ?? "",
    ref: process.env.GITHUB_REF ?? "",
    runId: process.env.GITHUB_RUN_ID ?? "",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "",
    serverUrl: process.env.GITHUB_SERVER_URL ?? "",
    scanned: new Date().toISOString(),
  });
}

async function submit(snapshot) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is required for dependency submission");
  if (process.env.GITHUB_API_URL !== "https://api.github.com") throw new Error("Unexpected GitHub API URL");

  const response = await fetch(
    `${process.env.GITHUB_API_URL}/repos/${REPOSITORY}/dependency-graph/snapshots`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout(15_000),
    },
  );
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > 65_536) throw new Error("GitHub dependency-submission response is oversized");
  const body = await response.text();
  if (body.length > 65_536) throw new Error("GitHub dependency-submission response is oversized");
  let receipt;
  try {
    receipt = JSON.parse(body);
  } catch {
    throw new Error(`GitHub dependency submission returned unreadable status ${response.status}`);
  }
  if (response.status !== 201 || receipt.result !== "SUCCESS") {
    throw new Error(`GitHub dependency submission failed with status ${response.status}`);
  }
  console.log(`Submitted exact Python dependency snapshot ${receipt.id}.`);
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "--stdout" && mode !== "--submit") {
    throw new Error("Usage: submit-python-dependency-snapshot.mjs [--stdout|--submit]");
  }
  const snapshot = workflowSnapshot();
  if (mode === "--stdout") process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  else await submit(snapshot);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Python dependency submission failed");
    process.exitCode = 1;
  });
}
