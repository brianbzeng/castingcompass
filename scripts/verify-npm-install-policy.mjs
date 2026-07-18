#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = parseRoot(process.argv.slice(2));
const manifest = readJson("package.json");
const lock = readJson("package-lock.json");
const policy = readJson("security/npm-install-policy.json");

invariant(readText(".npmrc") === "engine-strict=true\nignore-scripts=true\n",
  ".npmrc must fail closed on engine drift and dependency lifecycle scripts");
invariant(policy.schemaVersion === 1, "npm install policy schema is unsupported");
invariant(/^\d{4}-\d{2}-\d{2}$/u.test(policy.reviewedAt), "npm install policy review date is invalid");
invariant(policy.packageManager?.name === "npm", "npm install policy package manager is invalid");
invariant(/^\d+\.\d+\.\d+$/u.test(policy.packageManager.version), "npm policy version must be exact");
invariant(/^\d+\.\d+\.\d+$/u.test(policy.packageManager.nodeVersion), "Node policy version must be exact");
invariant(manifest.packageManager === `npm@${policy.packageManager.version}`,
  "package.json packageManager does not match the npm policy");
invariant(manifest.engines?.npm === policy.packageManager.version,
  "package.json must require the exact reviewed npm version");
invariant(manifest.engines?.node === `>=${policy.packageManager.nodeVersion} <23`,
  "package.json Node engine does not match the npm policy");
invariant(lock.packages?.[""]?.engines?.npm === manifest.engines.npm,
  "package-lock.json does not mirror the exact npm engine");
invariant(lock.packages?.[""]?.engines?.node === manifest.engines.node,
  "package-lock.json does not mirror the Node engine");
invariant(policy.installScripts?.default === "disabled", "Dependency install scripts must default off");
invariant(policy.installScripts?.configuration === ".npmrc", "Install-script configuration is invalid");

const rootLifecycleScripts = new Set([
  "preinstall",
  "install",
  "postinstall",
  "prepublish",
  "preprepare",
  "prepare",
  "postprepare",
]);
for (const name of Object.keys(manifest.scripts ?? {})) {
  invariant(!rootLifecycleScripts.has(name), `Root lifecycle script ${name} is forbidden`);
}

const actual = Object.entries(lock.packages ?? {})
  .filter(([, entry]) => entry?.hasInstallScript === true)
  .map(([path, entry]) => ({
    path,
    name: packageName(path),
    version: entry.version,
    integrity: entry.integrity,
    development: entry.dev === true,
    optional: entry.optional === true,
    execution: "disabled",
  }))
  .sort(comparePath);
const reviewed = policy.installScripts.reviewedScriptBearingPackages;
invariant(Array.isArray(reviewed), "Reviewed script-bearing package list is missing");
invariant(reviewed.every((entry) => entry.execution === "disabled"),
  "No dependency lifecycle script may be approved for execution");
invariant(JSON.stringify(reviewed) === JSON.stringify([...reviewed].sort(comparePath)),
  "Reviewed script-bearing packages must be sorted by exact lock path");
invariant(JSON.stringify(actual) === JSON.stringify(reviewed),
  "Script-bearing dependency set changed; review the exact lock paths before continuing");

for (const workflow of workflowFiles(resolve(root, ".github/workflows"))) {
  const source = readFileSync(workflow, "utf8");
  invariant(!/--ignore-scripts(?:=|\s+)false|NPM_CONFIG_IGNORE_SCRIPTS\s*:\s*false|npm_config_ignore_scripts\s*=\s*false|npm\s+config\s+set\s+ignore-scripts\s+false/iu.test(source),
    `${basename(workflow)} re-enables dependency lifecycle scripts`);
  for (const command of source.matchAll(/npm\s+ci[^\n]*/gu)) {
    invariant(/--ignore-scripts(?:\s|$)/u.test(command[0]),
      `${basename(workflow)} must pass --ignore-scripts explicitly to npm ci`);
  }
}

console.log(`npm ${policy.packageManager.version} install policy verified (${actual.length} reviewed hooks, 0 executed)`);

function parseRoot(args) {
  if (args.length === 0) return defaultRoot;
  if (args.length === 2 && args[0] === "--root") return resolve(args[1]);
  console.error("Usage: verify-npm-install-policy.mjs [--root PATH]");
  process.exit(2);
}

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function readJson(path) {
  try {
    return JSON.parse(readText(path));
  } catch (error) {
    throw new Error(`${path} is not valid JSON`, { cause: error });
  }
}

function packageName(path) {
  const tail = path.split("node_modules/").at(-1);
  invariant(tail && !tail.includes("/node_modules/"), `Invalid npm lock path: ${path}`);
  return tail;
}

function comparePath(left, right) {
  return left.path.localeCompare(right.path);
}

function workflowFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
    .map((entry) => join(directory, entry.name));
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}
