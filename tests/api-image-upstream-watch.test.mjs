import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateApiImageUpstream,
  verifyApiImageUpstreamPolicy,
} from "../scripts/audit-api-image-upstream.mjs";

const root = new URL("../", import.meta.url);
const policy = JSON.parse(await readFile(new URL("security/api-image-policy.json", root), "utf8"));
const workflow = await readFile(new URL(".github/workflows/api-image-upstream-watch.yml", root), "utf8");
const ciWorkflow = await readFile(new URL(".github/workflows/ci.yml", root), "utf8");
const releaseWorkflow = await readFile(new URL(".github/workflows/release-provenance.yml", root), "utf8");
const packageManifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));

function acceptedSources() {
  const sourceSha256 = "1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76";
  return {
    versionsText: JSON.stringify({
      "3.13": {
        version: "3.13.15",
        checksums: { source: { sha256: sourceSha256 } },
        variants: ["trixie", "alpine3.24", "alpine3.23"],
      },
    }),
    dockerfileText: [
      "FROM alpine:3.24",
      "ENV PYTHON_VERSION 3.13.15",
      `ENV PYTHON_SHA256 ${sourceSha256}`,
      "CMD [\"python3\"]",
      "",
    ].join("\n"),
    officialImagesText: [
      "Maintainers: Python Docker maintainers",
      "GitRepo: https://github.com/docker-library/python.git",
      "",
      "Tags: 3.13.15-alpine3.24, 3.13-alpine3.24, 3.13.15-alpine, 3.13-alpine",
      "Architectures: amd64, arm32v6, arm64v8, riscv64",
      "GitCommit: 3cb2fbae63fab2184343a01e4bd63a7540462999",
      "Directory: 3.13/alpine3.24",
      "",
    ].join("\n"),
  };
}

test("upstream watch policy binds reviewed sources, a daily read-only workflow, and the next patch", () => {
  const result = verifyApiImageUpstreamPolicy(policy, workflow);
  assert.equal(result.policyValid, true);
  assert.equal(result.maximumScheduleIntervalHours, 24);
  assert.equal(result.expectedNextVersion, "3.13.16");
  assert.equal(result.expectedReleaseOn, "2026-10-06");
  assert.equal(result.exceptionsExpire, "2026-10-10");
  assert.equal(result.liveQueryPerformed, false);
  assert.match(packageManifest.scripts.security, /security:api-image-upstream-watch/u);
  assert.equal(
    packageManifest.scripts["security:api-image-upstream-watch"],
    "node scripts/audit-api-image-upstream.mjs verify-policy",
  );
  assert.match(ciWorkflow, /npm run security:api-image-upstream-watch/u);
  assert.match(releaseWorkflow, /npm run security:api-image-upstream-watch/u);
});

test("upstream watch accepts only matching official release, checksum, source, and architectures", () => {
  const result = evaluateApiImageUpstream({
    policy,
    ...acceptedSources(),
    checkedAt: new Date("2026-08-15T04:00:00Z"),
  });
  assert.deepEqual(result, {
    schemaVersion: "castingcompass.api-image-upstream-watch/1.0.0",
    checkedAt: "2026-08-15T04:00:00.000Z",
    status: "current",
    currentVersion: "3.13.15",
    upstreamVersion: "3.13.15",
    expectedNextVersion: "3.13.16",
    expectedReleaseOn: "2026-10-06",
    exceptionsExpire: "2026-10-10",
    variant: "alpine3.24",
    sourceSha256: "1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76",
    sourceRevision: "3cb2fbae63fab2184343a01e4bd63a7540462999",
    architectures: ["linux/amd64", "linux/arm64"],
    liveQueryPerformed: true,
  });
});

test("upstream watch fails immediately when the maintained series advances", () => {
  const sources = acceptedSources();
  const versions = JSON.parse(sources.versionsText);
  versions["3.13"].version = "3.13.16";
  sources.versionsText = JSON.stringify(versions);
  assert.throws(() => evaluateApiImageUpstream({ policy, ...sources }),
    /advanced from 3\.13\.15 to 3\.13\.16; replace or re-review/u);
});

test("upstream watch rejects checksum, source-revision, architecture, and duplicate-tag drift", () => {
  const checksum = acceptedSources();
  checksum.dockerfileText = checksum.dockerfileText.replace(
    "1e66a7945a48390ee4c2a4268a0e4185884059a13c4aab6d148aa208deea4a76",
    "a".repeat(64),
  );
  assert.throws(() => evaluateApiImageUpstream({ policy, ...checksum }), /checksum disagrees/u);

  const revision = acceptedSources();
  revision.officialImagesText = revision.officialImagesText.replace(policy.baseImage.sourceRevision, "b".repeat(40));
  assert.throws(() => evaluateApiImageUpstream({ policy, ...revision }), /source revision drifted/u);

  const architecture = acceptedSources();
  architecture.officialImagesText = architecture.officialImagesText.replace(", arm64v8", "");
  assert.throws(() => evaluateApiImageUpstream({ policy, ...architecture }), /lacks reviewed AMD64\/ARM64/u);

  const duplicate = acceptedSources();
  duplicate.officialImagesText += `\n${duplicate.officialImagesText.split("\n\n")[1]}\n`;
  assert.throws(() => evaluateApiImageUpstream({ policy, ...duplicate }), /must appear exactly once/u);
});

test("upstream watch rejects unreviewed sources and workflow write or dependency authority", () => {
  const redirected = structuredClone(policy);
  redirected.upstreamWatch.sources.versions = "https://example.com/versions.json";
  assert.throws(() => verifyApiImageUpstreamPolicy(redirected, workflow), /not the reviewed primary source/u);

  assert.throws(() => verifyApiImageUpstreamPolicy(policy, workflow.replace("contents: read", "contents: write")),
    /lacks read-only contents permission/u);
  assert.throws(() => verifyApiImageUpstreamPolicy(policy, `${workflow}\n      - run: npm install\n`),
    /executes dependency code/u);
});
