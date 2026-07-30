import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TARGET_SPECIES,
  TARGET_TAXON_IDS,
  isTargetTaxonId,
  rankSnapshotForSpecies,
} from "../app/lib/species-ranking.ts";

const root = new URL("../", import.meta.url);

test("shared profiles are closed, normalized, sourced, and keep rockfish deferred", async () => {
  const document = JSON.parse(await readFile(
    new URL("model/hybrid/species-profiles-v1.json", root),
    "utf8",
  ));
  assert.equal(document.schema_version, "castingcompass.hybrid-species-profiles/1.0.0");
  assert.equal(document.training_status, "expert-configured-untrained");
  assert.equal(document.rockfish_status, "deferred-behaviorally-heterogeneous");
  assert.deepEqual(Object.keys(document.profiles), TARGET_TAXON_IDS);
  assert.equal(document.profiles.surfperch.target_kind, "family-profile");
  assert.equal(new Set(document.profiles.jacksmelt.seasonality_by_month).size, 1);
  for (const profile of Object.values(document.profiles)) {
    assert.equal(
      Object.values(profile.component_weights).reduce((sum, value) => sum + value, 0),
      1,
    );
    assert.equal(profile.seasonality_by_month.length, 12);
    assert.ok(profile.source_notes.every((source) => source.url.startsWith("https://wildlife.ca.gov/")));
  }
  assert.equal(TARGET_SPECIES.length, 4);
  assert.equal(isTargetTaxonId("rockfish"), false);
});

test("one shared ranker swaps target profiles deterministically without probability claims", () => {
  const sites = [
    {
      id: "beach",
      name: "Beach",
      latitude: 0,
      longitude: 0,
      region: "Coast",
      type: "Beach",
      access: "Public",
      regulationUrl: "https://example.test",
      habitatPrior: 70,
      structureTags: ["sand-trough", "sand-bar"],
      castingZone: {
        radiusMeters: 100,
        bearingDegrees: 270,
        targetDepthMeters: [1, 5],
        exposure: "open-coast",
      },
    },
    {
      id: "pier",
      name: "Pier",
      latitude: 0,
      longitude: 0,
      region: "Bay",
      type: "Pier",
      access: "Public",
      regulationUrl: "https://example.test",
      habitatPrior: 55,
      structureTags: ["pier-pilings", "current-seam"],
      castingZone: {
        radiusMeters: 100,
        bearingDegrees: 0,
        targetDepthMeters: [1, 5],
        exposure: "bay",
      },
    },
  ];
  const snapshot = {
    generatedAt: "2026-10-01T00:00:00Z",
    modelVersion: "fixture",
    sources: [],
    windows: sites.map((site) => ({
      id: `${site.id}-window`,
      siteId: site.id,
      start: "2026-10-01T08:00:00Z",
      end: "2026-10-01T10:00:00Z",
      score: 50,
      habitatScore: 50,
      seasonalityScore: 50,
      dynamicScore: 65,
      fishabilityScore: 80,
      confidence: "medium",
      explanationFactors: [],
      conditions: { tideStage: "rising" },
    })),
  };
  const surfperch = rankSnapshotForSpecies(snapshot, sites, "surfperch");
  const jacksmelt = rankSnapshotForSpecies(snapshot, sites, "jacksmelt");
  assert.deepEqual(surfperch, rankSnapshotForSpecies(snapshot, sites, "surfperch"));
  assert.ok(surfperch.windows[0].score > surfperch.windows[1].score);
  assert.ok(jacksmelt.windows[1].score > jacksmelt.windows[0].score);
  assert.match(surfperch.methodology, /untrained/u);
  assert.match(surfperch.windows[0].explanationFactors.at(-1), /not catch probability/u);
});
