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
  }
});

test("publishes every two-hour window across the 72-hour snapshot", async () => {
  const [sites, snapshot] = await Promise.all([
    readJson("data/sites.json"),
    readJson("public/data/opportunities.json"),
  ]);
  const bySite = new Map();

  for (const window of snapshot.windows) {
    bySite.set(window.siteId, (bySite.get(window.siteId) ?? 0) + 1);
    assert.equal(new Date(window.end).getTime() - new Date(window.start).getTime(), 2 * 60 * 60 * 1000);
    for (const value of [window.score, window.habitatScore, window.seasonalityScore, window.dynamicScore]) {
      assert.ok(value >= 0 && value <= 100);
    }
    assert.ok(["low", "medium", "high"].includes(window.confidence));
    assert.ok(window.explanationFactors.length >= 3);
  }

  assert.equal(snapshot.windows.length, sites.length * 36);
  for (const site of sites) assert.equal(bySite.get(site.id), 36, `${site.id} must have 36 windows`);
  assert.match(snapshot.scoreDefinition, /not an 80% catch probability/i);
  assert.ok(snapshot.sources.some((source) => source.status.startsWith("fresh")));
  assert.ok(snapshot.sources.some((source) => /not integrated|excluded/i.test(source.status)));
});
