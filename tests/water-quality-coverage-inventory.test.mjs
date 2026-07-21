import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const fixedArguments = [
  "scripts/audit_water_quality_coverage_inventory.py",
  "--as-of", "2026-07-21T16:20:00Z",
  "--directory-source-file", "tests/fixtures/california-beachwatch-county-directory.html",
  "--east-bay-source-file", "tests/fixtures/california-beachwatch-east-bay-parks-stations.html",
  "--water-boards-source-file", "tests/fixtures/california-beachwatch-water-boards-stations.html",
];

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("launch-catalog coverage inventory is deterministic, complete, and review-only", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-water-coverage-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "audit.json");
  const result = spawnSync("python3", [...fixedArguments, "--output", output], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(await readFile(output, "utf8"));
  assert.equal(payload.schemaVersion, "castingcompass.water-quality-coverage-inventory/1.0.0");
  assert.equal(payload.generatedAt, "2026-07-21T16:20:00Z");
  assert.equal(payload.automaticMappingAllowed, false);
  assert.equal(payload.independentReviewRequired, true);
  assert.deepEqual(payload.counts, {
    catalogSites: 61,
    mappedSites: 39,
    notCoveredSites: 22,
    priorAuditedNotCoveredSites: 21,
    remainingAfterThisAudit: 0,
  });
  assert.equal(payload.officialDirectory.countyPrograms.length, 17);
  assert.equal(payload.officialDirectory.alamedaCountyProgramPresent, false);
  assert.deepEqual(
    payload.officialDirectory.relevantRegistries.map((source) => [source.programId, source.stationCount]),
    [["19", 8], ["20", 0]],
  );
  assert.ok(payload.officialDirectory.relevantRegistries.every((source) => source.dumbartonMatches.length === 0));
  assert.equal(payload.dumbartonReview.siteId, "dumbarton-pier");
  assert.equal(payload.dumbartonReview.policyMapped, false);
  assert.equal(payload.dumbartonReview.automaticMappingAllowed, false);
  assert.equal(payload.reviewedNotCoveredSites.length, 22);
});

test("coverage inventory refuses to preserve negative evidence after a Dumbarton candidate appears", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-water-candidate-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "east-bay.html");
  const output = join(directory, "audit.json");
  const fixture = await readFile(
    new URL("fixtures/california-beachwatch-east-bay-parks-stations.html", import.meta.url),
    "utf8",
  );
  await writeFile(source, `${fixture}<option value="999">Dumbarton Fishing Pier</option>\n`);
  const argumentsWithCandidate = [...fixedArguments];
  const sourceIndex = argumentsWithCandidate.indexOf("tests/fixtures/california-beachwatch-east-bay-parks-stations.html");
  argumentsWithCandidate[sourceIndex] = source;
  const result = spawnSync("python3", [...argumentsWithCandidate, "--output", output], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /dumbarton-candidate-requires-review/);
  await assert.rejects(readFile(output));
});

test("checked-in inventory binds every not-covered site without changing policy or score", async () => {
  const [audit, policy, overlay, tool, policyBytes, siteBytes, overlayBytes] = await Promise.all([
    readJson("water-quality/audits/launch-catalog-coverage.json"),
    readJson("water-quality/policy.json"),
    readJson("public/data/water-quality.json"),
    readFile(new URL("scripts/audit_water_quality_coverage_inventory.py", root)),
    readFile(new URL("water-quality/policy.json", root)),
    readFile(new URL("data/sites.json", root)),
    readFile(new URL("public/data/water-quality.json", root)),
  ]);
  const notCoveredSiteIds = Object.entries(overlay.sites)
    .filter(([, site]) => site.status === "not-covered")
    .map(([siteId]) => siteId)
    .sort();
  assert.deepEqual(
    audit.reviewedNotCoveredSites.map((site) => site.siteId),
    notCoveredSiteIds,
  );
  assert.equal(audit.auditToolSha256, createHash("sha256").update(tool).digest("hex"));
  assert.equal(audit.policySha256, createHash("sha256").update(policyBytes).digest("hex"));
  assert.equal(audit.siteCatalogSha256, createHash("sha256").update(siteBytes).digest("hex"));
  assert.equal(audit.overlaySha256, createHash("sha256").update(overlayBytes).digest("hex"));
  for (const receipt of audit.negativeEvidenceReceipts) {
    const bytes = await readFile(new URL(receipt.path, root));
    assert.equal(receipt.sha256, createHash("sha256").update(bytes).digest("hex"));
  }
  for (const siteId of notCoveredSiteIds) {
    assert.equal(policy.site_mappings[siteId], undefined);
    assert.equal(overlay.sites[siteId].recommendationEffect, "unknown");
    assert.equal(overlay.sites[siteId].scoreDelta, null);
  }
});
