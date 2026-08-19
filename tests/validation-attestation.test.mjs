import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAttestationCacheForTests,
  hydrateOpportunityConditions,
  verifyOpportunityAttestation,
} from "../worker/validation.ts";

const scoringSha = "c".repeat(64);

function validIndex() {
  return {
    schema_version: "castingcompass.opportunity-attestation-index/1.0.0",
    generated_at: "2026-07-31T20:00:00Z",
    snapshot_sha256: "a".repeat(64),
    site_catalog_sha256: "b".repeat(64),
    target_taxon_id: "california-halibut",
    taxon_catalog_version: "castingcompass.taxa/1.0.0",
    observation_contract_version: "castingcompass.observation/2.0.0",
    model_run_contract_version: "castingcompass.model-run/2.0.0",
    opportunity_contract_version: "castingcompass.opportunity/2.0.0",
    scoring_system_kind: "heuristic-configuration",
    scoring_system_version: `heuristic-california-halibut-${scoringSha}`,
    scoring_system_sha256: scoringSha,
    windows: [[
      "ocean-beach--20260801T1000Z",
      "ocean-beach",
      "2026-08-01T10:00:00Z",
      "2026-08-01T12:00:00Z",
      67,
      55,
      66,
      77,
      88,
    ]],
  };
}

function assetsFor(value, headers = {}) {
  return {
    async fetch() {
      return new Response(typeof value === "string" ? value : JSON.stringify(value), {
        status: 200,
        headers: { "Content-Type": "application/json", ...headers },
      });
    },
  };
}

test("attestation accepts only an exact authoritative site-window tuple", async () => {
  const assets = assetsFor(validIndex());
  const verified = await verifyOpportunityAttestation(assets, "https://castingcompass.com/api/trips/start", {
    windowId: "ocean-beach--20260801T1000Z",
    siteId: "ocean-beach",
    startedAt: "2026-08-01T10:30:00.000Z",
  });
  assert.equal(verified.status, "verified");
  assert.equal(verified.opportunity?.scoringSystemSha256, scoringSha);
  assert.equal(verified.opportunity?.opportunityScore, 67);

  const wrongSite = await verifyOpportunityAttestation(assets, "https://castingcompass.com/api/trips/start", {
    windowId: "ocean-beach--20260801T1000Z",
    siteId: "another-site",
    startedAt: "2026-08-01T10:30:00.000Z",
  });
  assert.deepEqual(wrongSite, { status: "unverified_mismatch", opportunity: null });
  const atExclusiveEnd = await verifyOpportunityAttestation(assets, "https://castingcompass.com/api/trips/start", {
    windowId: "ocean-beach--20260801T1000Z",
    siteId: "ocean-beach",
    startedAt: "2026-08-01T12:00:00.000Z",
  });
  assert.deepEqual(atExclusiveEnd, { status: "unverified_mismatch", opportunity: null });
  clearAttestationCacheForTests(assets);
});

test("attestation parsing fails closed for malformed identity, dates, shape, and size", async () => {
  const cases = [
    { ...validIndex(), scoring_system_kind: "machine-learning-model" },
    { ...validIndex(), scoring_system_version: "heuristic-california-halibut-unbound" },
    { ...validIndex(), generated_at: "2026-02-31T20:00:00Z" },
    { ...validIndex(), unexpected: true },
    { ...validIndex(), windows: [["too-short"]] },
  ];
  for (const value of cases) {
    const assets = assetsFor(value);
    const result = await verifyOpportunityAttestation(assets, "https://castingcompass.com/api/trips/start", {
      windowId: "ocean-beach--20260801T1000Z",
      siteId: "ocean-beach",
      startedAt: "2026-08-01T10:30:00.000Z",
    });
    assert.deepEqual(result, { status: "unverified_asset", opportunity: null });
  }

  const oversized = assetsFor("{}", { "Content-Length": String(512 * 1024 + 1) });
  const oversizedResult = await verifyOpportunityAttestation(
    oversized,
    "https://castingcompass.com/api/trips/start",
    {
      windowId: "ocean-beach--20260801T1000Z",
      siteId: "ocean-beach",
      startedAt: "2026-08-01T10:30:00.000Z",
    },
  );
  assert.deepEqual(oversizedResult, { status: "unverified_asset", opportunity: null });
});

test("verified windows can bind a bounded conditions snapshot to the exact published bytes", async () => {
  const snapshot = {
    windows: [{
      id: "ocean-beach--20260801T1000Z",
      siteId: "ocean-beach",
      start: "2026-08-01T10:00:00Z",
      end: "2026-08-01T12:00:00Z",
      score: 67,
      habitatScore: 55,
      seasonalityScore: 66,
      dynamicScore: 77,
      fishabilityScore: 88,
      conditions: {
        tideStage: "falling",
        tideLevelsFeet: [4.1, 2.2, 1.3, 1.8],
        currentKnots: 0.6,
        currentDirection: "SW",
        windMph: 12,
        waterTempF: 62.4,
        daylight: true,
        fishabilityReasons: ["Manageable conditions."],
      },
    }],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const snapshotSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const opportunity = {
    snapshotSha256,
    siteCatalogSha256: "b".repeat(64),
    targetTaxonId: "california-halibut",
    taxonCatalogVersion: "castingcompass.taxa/1.0.0",
    observationContractVersion: "castingcompass.observation/2.0.0",
    modelRunContractVersion: "castingcompass.model-run/2.0.0",
    opportunityContractVersion: "castingcompass.opportunity/2.0.0",
    scoringSystemKind: "heuristic-configuration",
    scoringSystemVersion: `heuristic-california-halibut-${scoringSha}`,
    scoringSystemSha256: scoringSha,
    generatedAt: "2026-08-01T00:00:00.000Z",
    windowId: "ocean-beach--20260801T1000Z",
    siteId: "ocean-beach",
    windowStart: "2026-08-01T10:00:00.000Z",
    windowEnd: "2026-08-01T12:00:00.000Z",
    opportunityScore: 67,
    habitatScore: 55,
    seasonalityScore: 66,
    conditionsScore: 77,
    fishabilityScore: 88,
  };
  const assets = {
    async fetch() {
      return new Response(bytes, { status: 200, headers: { "Content-Type": "application/json" } });
    },
  };
  const hydrated = await hydrateOpportunityConditions(assets, "https://castingcompass.com/api/trips/start", opportunity);
  assert.equal(hydrated?.conditions?.tideStage, "falling");
  assert.deepEqual(hydrated?.conditions?.tideLevelsFeet, [4.1, 2.2, 1.3, 1.8]);
  assert.deepEqual(hydrated?.conditions?.fishabilityReasons, ["Manageable conditions."]);
  clearAttestationCacheForTests(assets);
});
