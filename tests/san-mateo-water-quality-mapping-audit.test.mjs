import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("San Mateo mapping audit is deterministic, bounded, and review-only", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-san-mateo-audit-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, "audit.json");
  const result = spawnSync(
    "python3",
    [
      "scripts/audit_san_mateo_station_mappings.py",
      "--as-of", "2026-07-21T13:40:00Z",
      "--source-file", "tests/fixtures/san-mateo-station-registry.json",
      "--output", output,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(await readFile(output, "utf8"));
  assert.equal(payload.schemaVersion, "castingcompass.water-quality-mapping-audit/1.0.0");
  assert.equal(payload.generatedAt, "2026-07-21T13:40:00Z");
  assert.equal(payload.automaticMappingAllowed, false);
  assert.equal(payload.independentReviewRequired, true);
  assert.equal(payload.source.stationCount, 17);
  assert.equal(payload.source.registryUse, "station identity and spatial context only; never current status");
  assert.equal(payload.mappedSites.length, 11);
  assert.deepEqual(payload.unmappedSites.map((site) => site.siteId), ["poplar-beach"]);
  assert.ok(payload.mappedSites.every((site) => site.policyMapped));
  assert.ok(payload.mappedSites.every((site) => site.reviewStatus === "local-preliminary-independent-review-required"));
  assert.ok(payload.mappedSites.every((site) => site.stationSupport.every((station) => station.distanceMeters <= 995)));
  assert.equal(payload.unmappedSites[0].nearestReviewedStation.distanceMeters, 1944);
});

test("San Mateo mapping audit rejects malformed registry coordinates", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-san-mateo-audit-invalid-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, "registry.json");
  const output = join(directory, "audit.json");
  const fixture = await readFile(new URL("fixtures/san-mateo-station-registry.json", import.meta.url), "utf8");
  await writeFile(source, fixture.replace("37.66398817111321", '"not-a-coordinate"'));
  const result = spawnSync(
    "python3",
    [
      "scripts/audit_san_mateo_station_mappings.py",
      "--source-file", source,
      "--output", output,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  await assert.rejects(readFile(output));
});

test("checked-in San Mateo receipt binds every provisional mapping and preserves Poplar unknown", async () => {
  const [audit, policy, overlay, auditTool, policyBytes, siteBytes] = await Promise.all([
    readJson("water-quality/audits/san-mateo-station-mappings.json"),
    readJson("water-quality/policy.json"),
    readJson("public/data/water-quality.json"),
    readFile(new URL("scripts/audit_san_mateo_station_mappings.py", root)),
    readFile(new URL("water-quality/policy.json", root)),
    readFile(new URL("data/sites.json", root)),
  ]);
  const expectedMappedSiteIds = [
    "pacifica-municipal-pier", "sharp-park-beach", "rockaway-beach",
    "pacifica-state-beach", "montara-state-beach", "pillar-point-west-jetty",
    "pillar-point-east-jetty", "surfers-beach", "francis-state-beach",
    "coyote-point-jetty", "oyster-point-fishing-pier",
  ];
  assert.deepEqual(audit.mappedSites.map((site) => site.siteId), expectedMappedSiteIds);
  assert.equal(audit.auditToolSha256, createHash("sha256").update(auditTool).digest("hex"));
  assert.equal(audit.policySha256, createHash("sha256").update(policyBytes).digest("hex"));
  assert.equal(audit.siteCatalogSha256, createHash("sha256").update(siteBytes).digest("hex"));
  for (const site of audit.mappedSites) {
    assert.equal(site.automaticMappingAllowed, false);
    assert.equal(policy.site_mappings[site.siteId].source_id, "san-mateo-county-health");
    assert.deepEqual(
      site.stationSupport.map((station) => station.stationId),
      policy.site_mappings[site.siteId].station_ids,
    );
    assert.equal(overlay.sites[site.siteId].scoreDelta, null);
  }
  assert.equal(policy.site_mappings["poplar-beach"], undefined);
  assert.equal(overlay.sites["poplar-beach"].status, "not-covered");
  assert.equal(overlay.sites["poplar-beach"].recommendationEffect, "unknown");
  assert.equal(overlay.sites["poplar-beach"].scoreDelta, null);
});
