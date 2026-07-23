import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const fixturePath = "tests/fixtures/california-beachwatch-east-bay-parks-stations.html";

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("East Bay Parks audit is deterministic, exact-identity-bound, and review-only", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-east-bay-parks-audit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "audit.json");
  const result = spawnSync(
    "python3",
    [
      "scripts/audit_east_bay_parks_beachwatch_station_mappings.py",
      "--as-of", "2026-07-21T15:10:00Z",
      "--source-file", fixturePath,
      "--output", output,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(await readFile(output, "utf8"));
  assert.equal(payload.schemaVersion, "castingcompass.water-quality-mapping-audit/1.1.0");
  assert.equal(payload.generatedAt, "2026-07-21T15:10:00Z");
  assert.equal(payload.sourceId, "california-beachwatch-east-bay-parks");
  assert.equal(payload.automaticMappingAllowed, false);
  assert.equal(payload.independentReviewRequired, true);
  assert.equal(payload.source.stationCount, 8);
  assert.deepEqual(payload.source.globalStationIds, []);
  assert.deepEqual(payload.mappedSites.map((site) => site.siteId), [
    "keller-beach", "crown-memorial-state-beach",
  ]);
  assert.equal(payload.unmappedSites.length, 11);
  assert.ok(payload.mappedSites.every((site) => site.policyMapped));
  assert.ok(payload.mappedSites.every((site) => site.automaticMappingAllowed === false));
  assert.equal(
    payload.unmappedSites.find((site) => site.siteId === "ferry-point-pier")
      .rejectedCandidate.rejectionReason,
    "different-public-location-identity",
  );
  assert.equal(
    payload.unmappedSites.find((site) => site.siteId === "alameda-south-shore-rockwall")
      .rejectedCandidate.rejectionReason,
    "different-public-location-identity",
  );
});

test("East Bay Parks audit rejects a missing reviewed station", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-east-bay-parks-invalid-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "stations.html");
  const output = join(directory, "audit.json");
  const fixture = await readFile(
    new URL("fixtures/california-beachwatch-east-bay-parks-stations.html", import.meta.url),
    "utf8",
  );
  await writeFile(source, fixture.replace('<option value="552">Keller North Beach</option>\n', ""));
  const result = spawnSync(
    "python3",
    [
      "scripts/audit_east_bay_parks_beachwatch_station_mappings.py",
      "--source-file", source,
      "--output", output,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  await assert.rejects(readFile(output));
});

test("East Bay Parks audit rejects unfinished registry markup", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-east-bay-parks-malformed-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "stations.html");
  const output = join(directory, "audit.json");
  const fixture = await readFile(
    new URL("fixtures/california-beachwatch-east-bay-parks-stations.html", import.meta.url),
    "utf8",
  );
  await writeFile(source, `${fixture}<option value="999">UNFINISHED`);
  const result = spawnSync(
    "python3",
    [
      "scripts/audit_east_bay_parks_beachwatch_station_mappings.py",
      "--source-file", source,
      "--output", output,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  await assert.rejects(readFile(output));
});

test("checked-in East Bay Parks receipt binds two mappings and eleven unsupported sites", async () => {
  const [audit, policy, overlay, auditTool, policyBytes, siteBytes] = await Promise.all([
    readJson("water-quality/audits/east-bay-parks-beachwatch-station-mappings.json"),
    readJson("water-quality/policy.json"),
    readJson("public/data/water-quality.json"),
    readFile(new URL("scripts/audit_east_bay_parks_beachwatch_station_mappings.py", root)),
    readFile(new URL("water-quality/policy.json", root)),
    readFile(new URL("data/sites.json", root)),
  ]);
  assert.equal(audit.auditToolSha256, createHash("sha256").update(auditTool).digest("hex"));
  assert.equal(audit.policySha256, createHash("sha256").update(policyBytes).digest("hex"));
  assert.equal(audit.siteCatalogSha256, createHash("sha256").update(siteBytes).digest("hex"));
  for (const site of audit.mappedSites) {
    assert.equal(
      policy.site_mappings[site.siteId].source_id,
      "california-beachwatch-east-bay-parks",
    );
    assert.deepEqual(
      site.stationSupport.map((station) => station.stationName),
      policy.site_mappings[site.siteId].station_ids,
    );
    assert.equal(overlay.sites[site.siteId].scoreDelta, null);
  }
  for (const site of audit.unmappedSites) {
    assert.equal(policy.site_mappings[site.siteId], undefined);
    assert.equal(overlay.sites[site.siteId].status, "not-covered");
    assert.equal(overlay.sites[site.siteId].recommendationEffect, "unknown");
    assert.equal(overlay.sites[site.siteId].scoreDelta, null);
  }
});
