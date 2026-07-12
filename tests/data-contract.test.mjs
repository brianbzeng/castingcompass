import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("curates the required number of reachable Bay Area access sites", async () => {
  const [sites, publicSites] = await Promise.all([
    readJson("data/sites.json"),
    readJson("public/data/sites.json"),
  ]);

  assert.ok(sites.length >= 30 && sites.length <= 50, `expected 30–50 sites, received ${sites.length}`);
  assert.equal(new Set(sites.map((site) => site.id)).size, sites.length);
  assert.deepEqual(publicSites, sites);

  for (const site of sites) {
    assert.match(site.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(site.latitude >= 37.35 && site.latitude <= 38.25, `${site.id} latitude outside launch geography`);
    assert.ok(site.longitude >= -123.1 && site.longitude <= -121.9, `${site.id} longitude outside launch geography`);
    assert.ok(["Shore", "Beach", "Jetty", "Pier"].includes(site.type));
    assert.ok(site.regulationUrl.startsWith("https://wildlife.ca.gov/"));
    assert.ok(site.structureTags.length > 0);
    assert.ok(site.castingZone?.radiusMeters > 0);
    assert.ok(Number.isFinite(site.streetViewLatitude));
    assert.ok(Number.isFinite(site.streetViewLongitude));
    if (site.accessStatus === "closed") {
      assert.match(site.accessSourceUrl ?? "", /^https:\/\//);
      assert.ok(site.accessStatusNote?.length > 20);
    }
  }
});

test("publishes every two-hour window across the 72-hour snapshot", async () => {
  const [sites, snapshot] = await Promise.all([
    readJson("data/sites.json"),
    readJson("public/data/opportunities.json"),
  ]);
  const activeSites = sites.filter((site) => site.accessStatus !== "closed");
  const closedIds = new Set(sites.filter((site) => site.accessStatus === "closed").map((site) => site.id));
  const bySite = new Map();
  let windowsWithPressure = 0;

  for (const window of snapshot.windows) {
    bySite.set(window.siteId, (bySite.get(window.siteId) ?? 0) + 1);
    assert.equal(new Date(window.end).getTime() - new Date(window.start).getTime(), 2 * 60 * 60 * 1000);
    for (const value of [window.score, window.habitatScore, window.seasonalityScore, window.dynamicScore]) {
      assert.ok(value >= 0 && value <= 100);
    }
    assert.ok(["low", "medium", "high"].includes(window.confidence));
    assert.ok(window.explanationFactors.length >= 3);
    assert.ok(Number.isFinite(window.conditions?.waterTempF), `${window.id} must include modeled SST`);
    assert.ok(Number.isFinite(window.conditions?.cloudCoverPct), `${window.id} must include NWS sky cover`);
    assert.ok(Number.isFinite(window.conditions?.moonIlluminationPct), `${window.id} must include lunar illumination`);
    assert.equal(window.conditions?.tideLevelsFeet?.length, 4, `${window.id} must include the tide-chart window`);
    if (Number.isFinite(window.conditions?.pressureHpa)) windowsWithPressure += 1;
    assert.equal(closedIds.has(window.siteId), false, `${window.siteId} is closed and must not be ranked`);
  }

  assert.equal(snapshot.windows.length, activeSites.length * 36);
  for (const site of activeSites) assert.equal(bySite.get(site.id), 36, `${site.id} must have 36 windows`);
  assert.match(snapshot.scoreDefinition, /not an 80% catch probability/i);
  assert.ok(snapshot.sources.some((source) => source.status.startsWith("fresh")));
  assert.ok(snapshot.sources.some((source) => /not integrated|excluded/i.test(source.status)));
  assert.ok(snapshot.sources.some((source) => /Open-Meteo Marine SST/i.test(source.name)));
  assert.ok(snapshot.sources.some((source) => /moon phase/i.test(source.name)));
  assert.ok(windowsWithPressure > 0, "near-term windows must use fresh buoy pressure when available");
});

test("publishes original community context separately from the score", async () => {
  const [community, publicCommunity] = await Promise.all([
    readJson("data/community-pulse.json"),
    readJson("public/data/community-pulse.json"),
  ]);
  const pulses = Array.isArray(community) ? community : community.pulses;

  assert.deepEqual(publicCommunity, community);
  assert.ok(Array.isArray(pulses) && pulses.length >= 7);
  for (const pulse of pulses) {
    assert.match(pulse.siteId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(["low", "medium", "high"].includes(pulse.confidence));
    assert.ok(pulse.summary.length >= 80);
    assert.ok(pulse.themes.length >= 2);
    assert.ok(pulse.sources.every((source) => /^https:\/\//.test(source.url)));
  }
});
