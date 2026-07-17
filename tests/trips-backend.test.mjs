import assert from "node:assert/strict";
import test from "node:test";

import { buildSpeciesObservationContract, handleTripRequest } from "../worker/trips.ts";

const ORIGIN = "https://contourcast.example";
const SITES = [
  { id: "oyster-point", type: "Pier" },
  { id: "crissy-field", type: "Beach" },
];

class MemoryTripStore {
  trips = new Map();
  rateLimited = false;
  initialized = false;

  async initialize() {
    this.initialized = true;
  }

  async assertSubmissionAllowed() {
    if (this.rateLimited) {
      const error = new Error("Too many trip submissions. Please try again later.");
      error.name = "RateLimitError";
      throw error;
    }
  }

  async insertTrip(record) {
    const row = recordToRow(record);
    this.trips.set(row.id, row);
    return row;
  }

  async getTrip(id) {
    return this.trips.get(id) ?? null;
  }

  async completeTrip(id, tokenHash, completion) {
    const row = this.trips.get(id);
    if (!row || row.status !== "active" || row.token_hash !== tokenHash) return null;
    const forecastAttributionCleared = row.mode !== completion.mode;
    Object.assign(row, {
      status: "completed",
      ended_at: completion.endedAt,
      mode: completion.mode,
      fishing_method: completion.fishingMethod,
      gear: completion.gear,
      angler_count: completion.anglerCount,
      angler_hours: completion.anglerHours,
      keeper_count: completion.keeperCount,
      short_released_count: completion.shortReleasedCount,
      halibut_encounters: completion.halibutEncounters,
      no_catch: Number(completion.noCatch),
      other_catch_count: completion.otherCatchCount,
      other_species: completion.otherSpecies,
      observations_json: completion.observationsJson,
      observation_contract_version: completion.observationContractVersion,
      taxon_catalog_version: completion.taxonCatalogVersion,
      target_taxon_id: completion.targetTaxonId,
      contract_status: completion.contractStatus,
      taxon_observations_json: completion.taxonObservationsJson,
      outcome_class: completion.outcomeClass,
      target_encounter_count: completion.targetEncounterCount,
      any_fish_encounter_count: completion.anyFishEncounterCount,
      target_identification_confidence: completion.targetIdentificationConfidence,
      notes: completion.notes,
      consent: 1,
      consent_at: completion.consentAt,
      moderation_status: "pending",
      score_influenced_choice:
        forecastAttributionCleared || completion.scoreInfluencedChoice === null
          ? null
          : Number(completion.scoreInfluencedChoice),
      ...(forecastAttributionCleared ? {
        opportunity_window_id: null,
        opportunity_score: null,
        habitat_score: null,
        seasonality_score: null,
        conditions_score: null,
        fishability_score: null,
        model_version: null,
        prediction_metadata_json: null,
      } : {}),
      photo_key: completion.photoKey,
      photo_content_type: completion.photoContentType,
      photo_size_bytes: completion.photoSizeBytes,
      updated_at: completion.updatedAt,
      completed_at: completion.updatedAt,
      token_hash: null,
    });
    return row;
  }

  async getSummary(now) {
    const rows = [...this.trips.values()].filter(
      (trip) => trip.status === "completed" && trip.consent === 1 && trip.moderation_status !== "rejected"
        && trip.contract_status === "valid"
        && trip.observation_contract_version === "castingcompass.observation/2.0.0"
        && trip.taxon_catalog_version === "castingcompass.taxa/1.0.0"
        && trip.target_taxon_id === "california-halibut",
    );
    const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
    const recentRows = rows.filter((trip) => new Date(trip.completed_at).getTime() >= cutoff);
    const halibutTrips = rows.filter((trip) => trip.halibut_encounters > 0).length;
    const totalHalibut = rows.reduce((sum, trip) => sum + trip.halibut_encounters, 0);
    return {
      completedTrips: rows.length,
      noCatchTrips: rows.filter((trip) => trip.no_catch === 1).length,
      halibutTrips,
      totalHalibut,
      anglerHours: rows.reduce((sum, trip) => sum + trip.angler_hours, 0),
      halibutEncounters: totalHalibut,
      sitesCovered: new Set(rows.map((trip) => trip.site_id)).size,
      lastUpdated: rows.map((trip) => trip.updated_at).sort().at(-1) ?? null,
      past24Hours: {
        completedTrips: recentRows.length,
        anglerHours: recentRows.reduce((sum, trip) => sum + trip.angler_hours, 0),
        halibutEncounters: recentRows.reduce((sum, trip) => sum + trip.halibut_encounters, 0),
        sitesCovered: new Set(recentRows.map((trip) => trip.site_id)).size,
      },
    };
  }
}

function recordToRow(record) {
  return {
    id: record.id,
    status: record.status,
    source: record.source,
    site_id: record.siteId,
    started_at: record.startedAt,
    ended_at: record.endedAt,
    mode: record.mode,
    fishing_method: record.fishingMethod,
    gear: record.gear,
    angler_count: record.anglerCount,
    angler_hours: record.anglerHours,
    keeper_count: record.keeperCount,
    short_released_count: record.shortReleasedCount,
    halibut_encounters: record.halibutEncounters,
    no_catch: record.noCatch === null ? null : Number(record.noCatch),
    other_catch_count: record.otherCatchCount,
    other_species: record.otherSpecies,
    observations_json: record.observationsJson,
    observation_contract_version: record.observationContractVersion,
    taxon_catalog_version: record.taxonCatalogVersion,
    target_taxon_id: record.targetTaxonId,
    contract_status: record.contractStatus,
    taxon_observations_json: record.taxonObservationsJson,
    outcome_class: record.outcomeClass,
    target_encounter_count: record.targetEncounterCount,
    any_fish_encounter_count: record.anyFishEncounterCount,
    target_identification_confidence: record.targetIdentificationConfidence,
    notes: record.notes,
    consent: Number(record.consent),
    consent_at: record.consentAt,
    moderation_status: record.moderationStatus,
    reporter_key_hash: record.reporterKeyHash,
    referral_code: record.referralCode,
    token_hash: record.tokenHash,
    opportunity_window_id: record.opportunityWindowId,
    opportunity_score: record.opportunityScore,
    habitat_score: record.habitatScore,
    seasonality_score: record.seasonalityScore,
    conditions_score: record.conditionsScore,
    model_version: record.modelVersion,
    score_influenced_choice:
      record.scoreInfluencedChoice === null ? null : Number(record.scoreInfluencedChoice),
    prediction_metadata_json: record.predictionMetadataJson,
    photo_key: record.photoKey,
    photo_content_type: record.photoContentType,
    photo_size_bytes: record.photoSizeBytes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    completed_at: record.completedAt,
  };
}

function jsonRequest(path, body, headers = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function multipartRequest(path, form) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { Origin: ORIGIN },
    body: form,
  });
}

test("start validates origin and curated site IDs", async () => {
  const store = new MemoryTripStore();
  const options = { store, now: () => new Date("2026-07-11T18:00:00.000Z") };

  const wrongOrigin = jsonRequest(
    "/api/trips/start",
    { siteId: "oyster-point", consent: true, reporterKey: "a".repeat(32) },
    { Origin: "https://attacker.example" },
  );
  assert.equal((await handleTripRequest(wrongOrigin, {}, SITES, options)).status, 403);

  const unknownSite = jsonRequest("/api/trips/start", {
    siteId: "made-up-coordinate",
    consent: true,
    reporterKey: "a".repeat(32),
  });
  const response = await handleTripRequest(unknownSite, {}, SITES, options);
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "invalid_site");
});

test("start and complete persist privacy-safe validation fields", async () => {
  const store = new MemoryTripStore();
  const reporterKey = "anonymous-device-key-1234567890";
  const start = await handleTripRequest(
    jsonRequest("/api/trips/start", {
      siteId: "oyster-point",
      startedAt: "2026-07-11T16:00:00.000Z",
      consent: true,
      reporterKey,
      method: "bait",
      gear: "Carolina rig",
      anglerCount: 2,
      opportunityWindowId: "window-123",
      opportunityScore: 84,
      modelVersion: "model-0.2",
      scoreInfluencedChoice: true,
      referralCode: "bay-area-anglers",
      website: "",
    }),
    {},
    SITES,
    { store, now: () => new Date("2026-07-11T18:00:00.000Z") },
  );

  assert.equal(start.status, 201);
  const started = await start.json();
  assert.match(started.token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(started.trip.mode, "pier");
  assert.equal(started.trip.fishingMethod, "bait");
  assert.equal(started.trip.referralCode, "bay-area-anglers");
  assert.equal(started.trip.targetTaxonId, "california-halibut");
  assert.equal(started.trip.contractStatus, null);
  assert.equal(started.trip.observationContractVersion, null);
  assert.equal(started.trip.outcomeClass, null);
  assert.equal("reporterKey" in started.trip, false);

  const storedActive = store.trips.get(started.trip.id);
  assert.notEqual(storedActive.reporter_key_hash, reporterKey);
  assert.equal(storedActive.reporter_key_hash.length, 64);
  assert.equal(storedActive.consent, 1);

  const form = new FormData();
  form.set("token", started.token);
  form.set("endedAt", "2026-07-11T18:00:00.000Z");
  form.set("keeperCount", "1");
  form.set("shortReleasedCount", "2");
  form.set("notes", "Three verified encounters.");
  form.set("scoreInfluencedChoice", "true");
  form.set("website", "");

  const completedResponse = await handleTripRequest(
    multipartRequest(`/api/trips/${started.trip.id}/complete`, form),
    {},
    SITES,
    { store, now: () => new Date("2026-07-11T18:01:00.000Z") },
  );
  assert.equal(completedResponse.status, 200);
  const completedPayload = await completedResponse.json();
  const completed = completedPayload.trip;
  assert.equal(completedPayload.forecastAttributionCleared, false);
  assert.equal(completed.opportunityWindowId, "window-123");
  assert.equal(completed.opportunityScore, 84);
  assert.equal(completed.modelVersion, "model-0.2");
  assert.equal(completed.anglerHours, 4);
  assert.equal(completed.halibutEncounters, 3);
  assert.equal(completed.noCatch, false);
  assert.equal(completed.observationContractVersion, "castingcompass.observation/2.0.0");
  assert.equal(completed.taxonCatalogVersion, "castingcompass.taxa/1.0.0");
  assert.equal(completed.targetTaxonId, "california-halibut");
  assert.equal(completed.contractStatus, "valid");
  assert.equal(completed.outcomeClass, "target_encountered");
  assert.equal(completed.targetEncounterCount, 3);
  assert.equal(completed.anyFishEncounterCount, 3);
  assert.equal(completed.targetIdentificationConfidence, "self_reported");
  assert.deepEqual(completed.taxonObservations, [{
    taxon_id: "california-halibut",
    encounter_count: 3,
    retained_count: 1,
    released_count: 2,
    disposition_unknown_count: 0,
    identification_confidence: "self_reported",
    identification_basis: "angler-report",
  }]);
  assert.equal(completed.moderationStatus, "pending");

  const persisted = store.trips.get(started.trip.id);
  assert.equal(persisted.token_hash, null);
  assert.equal("latitude" in persisted, false);
  assert.equal("ip" in persisted, false);
  assert.equal("social_identity" in persisted, false);
});

test("non-target catch is not mislabeled as no-fish and remains taxonomically unresolved", async () => {
  const store = new MemoryTripStore();
  const form = new FormData();
  form.set("siteId", "crissy-field");
  form.set("startedAt", "2026-07-10T15:00:00.000Z");
  form.set("endedAt", "2026-07-10T18:00:00.000Z");
  form.set("keeperCount", "0");
  form.set("shortReleasedCount", "0");
  form.set("otherCatchCount", "2");
  form.set("otherSpecies", "surfperch");
  form.set("consent", "true");
  form.set("reporterKey", "non-target-device-key-1234567890");
  form.set("website", "");

  const response = await handleTripRequest(
    multipartRequest("/api/trips/report", form),
    {},
    SITES,
    { store, now: () => new Date("2026-07-11T18:00:00.000Z") },
  );

  assert.equal(response.status, 201);
  const trip = (await response.json()).trip;
  assert.equal(trip.noCatch, false);
  assert.equal(trip.outcomeClass, "non_target_only");
  assert.equal(trip.targetEncounterCount, 0);
  assert.equal(trip.anyFishEncounterCount, 2);
  assert.equal(trip.targetIdentificationConfidence, "not_observed");
  assert.deepEqual(trip.taxonObservations, [
    {
      taxon_id: "california-halibut",
      encounter_count: 0,
      retained_count: 0,
      released_count: 0,
      disposition_unknown_count: 0,
      identification_confidence: "not_observed",
      identification_basis: "not-observed",
    },
    {
      taxon_id: "unresolved-fish",
      encounter_count: 2,
      retained_count: 0,
      released_count: 0,
      disposition_unknown_count: 2,
      identification_confidence: "unresolved",
      identification_basis: "unresolved",
    },
  ]);
});

test("server controls species target, versions, and structured outcomes", async () => {
  const store = new MemoryTripStore();
  const snakeOverride = await handleTripRequest(
    jsonRequest("/api/trips/start", {
      siteId: "oyster-point",
      consent: true,
      reporterKey: "server-contract-device-key-1234",
      target_taxon_id: "unresolved-fish",
    }),
    {},
    SITES,
    { store },
  );
  assert.equal(snakeOverride.status, 422);
  assert.equal((await snakeOverride.json()).error.code, "observation_contract_override_forbidden");

  const form = new FormData();
  form.set("siteId", "crissy-field");
  form.set("startedAt", "2026-07-10T15:00:00.000Z");
  form.set("endedAt", "2026-07-10T18:00:00.000Z");
  form.set("keeperCount", "0");
  form.set("shortReleasedCount", "0");
  form.set("consent", "true");
  form.set("reporterKey", "server-contract-device-key-5678");
  form.set("taxonObservations", "[]");
  form.set("temporal_precision", "exact");
  const camelOverride = await handleTripRequest(
    multipartRequest("/api/trips/report", form),
    {},
    SITES,
    { store, now: () => new Date("2026-07-11T18:00:00.000Z") },
  );
  assert.equal(camelOverride.status, 422);
  assert.equal((await camelOverride.json()).error.code, "observation_contract_override_forbidden");

  const nestedSourceOverride = await handleTripRequest(
    jsonRequest("/api/trips/start", {
      siteId: "oyster-point",
      consent: true,
      reporterKey: "server-contract-device-key-9012",
      source: { data_kind: "synthetic-fixture", complete_attempt: true },
    }),
    {},
    SITES,
    { store },
  );
  assert.equal(nestedSourceOverride.status, 422);
  assert.equal((await nestedSourceOverride.json()).error.code, "observation_contract_override_forbidden");
  assert.equal(store.trips.size, 0);
});

test("current reports are bounded and exact precision requires an explicit trusted signal", () => {
  const base = {
    tripId: "trip_00000000-0000-4000-8000-000000000001",
    siteId: "crissy-field",
    startedAt: "2026-07-10T15:00:00.000Z",
    endedAt: "2026-07-10T18:00:00.000Z",
    mode: "beach",
    anglerHours: 3,
    keeperCount: 0,
    shortReleasedCount: 0,
    otherCatchCount: 0,
  };
  assert.equal(buildSpeciesObservationContract(base).temporal_support.precision, "bounded");
  assert.equal(buildSpeciesObservationContract({ ...base, temporalPrecision: "exact" }).temporal_support.precision, "exact");
});

test("past reports re-encode photos and the summary exposes validation totals", async () => {
  const store = new MemoryTripStore();
  const storedObjects = new Map();
  const env = {
    TRIP_PHOTO_UPLOADS_ENABLED: "true",
    IMAGES: {
      input() {
        return {
          transform() {
            return {
              async output() {
                return {
                  response: () => new Response(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])),
                };
              },
            };
          },
        };
      },
    },
    TRIP_PHOTOS: {
      async put(key, bytes, options) {
        storedObjects.set(key, { bytes: new Uint8Array(bytes), options });
      },
      async delete(key) {
        storedObjects.delete(key);
      },
    },
  };

  const form = new FormData();
  form.set("siteId", "crissy-field");
  form.set("startedAt", "2026-07-10T15:00:00.000Z");
  form.set("endedAt", "2026-07-10T18:00:00.000Z");
  form.set("keeperCount", "0");
  form.set("shortReleasedCount", "0");
  form.set("consent", "true");
  form.set("reporterKey", "another-anonymous-device-key-1234");
  form.set("contourCastInfluenced", "false");
  form.set("predictionMetadata", JSON.stringify({
    snapshotGeneratedAt: "2026-07-11T17:00:00.000Z",
    forecastStart: "2026-07-11T18:00:00.000Z",
    forecastEnd: "2026-07-11T20:00:00.000Z",
    confidence: "medium",
    latitude: 37.7,
    email: "private@example.com",
    forecastConditions: {
      windMph: 12,
      currentDirection: "SW",
      longitude: -122.4,
      accountId: "private-account",
    },
  }));
  form.set("website", "");
  form.set(
    "photo",
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "catch.png", {
      type: "image/png",
    }),
  );

  const response = await handleTripRequest(
    multipartRequest("/api/trips/report", form),
    env,
    SITES,
    { store, now: () => new Date("2026-07-11T18:00:00.000Z") },
  );
  assert.equal(response.status, 201);
  const reported = (await response.json()).trip;
  assert.equal(reported.noCatch, true);
  assert.equal(reported.outcomeClass, "no_fish");
  assert.equal(reported.targetEncounterCount, 0);
  assert.equal(reported.anyFishEncounterCount, 0);
  assert.equal(reported.targetIdentificationConfidence, "not_observed");
  assert.equal(reported.hasPhoto, true);
  assert.equal(reported.scoreInfluencedChoice, false);
  assert.equal(storedObjects.size, 1);
  const storedPhoto = [...storedObjects.values()][0];
  assert.equal(storedPhoto.options.httpMetadata.contentType, "image/webp");
  assert.equal(storedPhoto.options.customMetadata.privacy, "exif-stripped");
  assert.deepEqual(JSON.parse(store.trips.get(reported.id).prediction_metadata_json), {
    snapshotGeneratedAt: "2026-07-11T17:00:00.000Z",
    forecastStart: "2026-07-11T18:00:00.000Z",
    forecastEnd: "2026-07-11T20:00:00.000Z",
    confidence: "medium",
    forecastConditions: { windMph: 12, currentDirection: "SW" },
  });

  const summaryResponse = await handleTripRequest(
    new Request(`${ORIGIN}/api/trips/summary`),
    env,
    SITES,
    { store, now: () => new Date("2026-07-11T19:00:00.000Z") },
  );
  assert.deepEqual(await summaryResponse.json(), {
    completedTrips: 1,
    noCatchTrips: 1,
    halibutTrips: 0,
    totalHalibut: 0,
    anglerHours: 3,
    halibutEncounters: 0,
    sitesCovered: 1,
    lastUpdated: "2026-07-11T18:00:00.000Z",
    past24Hours: {
      completedTrips: 1,
      anglerHours: 3,
      halibutEncounters: 0,
      sitesCovered: 1,
    },
  });
});

test("photo uploads fail closed at the Worker even when storage bindings exist", async () => {
  const store = new MemoryTripStore();
  let imageCalls = 0;
  let storageCalls = 0;
  const form = new FormData();
  form.set("siteId", "crissy-field");
  form.set("startedAt", "2026-07-10T15:00:00.000Z");
  form.set("endedAt", "2026-07-10T18:00:00.000Z");
  form.set("keeperCount", "0");
  form.set("shortReleasedCount", "0");
  form.set("consent", "true");
  form.set("reporterKey", "server-photo-gate-device-key-1234");
  form.set("website", "");
  form.set("photo", new File([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  ], "catch.png", { type: "image/png" }));

  const response = await handleTripRequest(
    multipartRequest("/api/trips/report", form),
    {
      IMAGES: {
        input() {
          imageCalls += 1;
          throw new Error("disabled uploads must not reach image processing");
        },
      },
      TRIP_PHOTOS: {
        async put() { storageCalls += 1; },
        async delete() { storageCalls += 1; },
      },
    },
    SITES,
    { store, now: () => new Date("2026-07-11T18:00:00.000Z") },
  );

  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "photo_uploads_disabled");
  assert.equal(imageCalls, 0);
  assert.equal(storageCalls, 0);
  assert.equal(store.trips.size, 0);
});

test("prediction metadata enforces its raw 4 KB limit before minimization", async () => {
  const store = new MemoryTripStore();
  const form = new FormData();
  form.set("siteId", "crissy-field");
  form.set("startedAt", "2026-07-10T15:00:00.000Z");
  form.set("endedAt", "2026-07-10T18:00:00.000Z");
  form.set("keeperCount", "0");
  form.set("shortReleasedCount", "0");
  form.set("consent", "true");
  form.set("reporterKey", "oversized-metadata-device-key-1234");
  form.set("predictionMetadata", JSON.stringify({ ignored: "x".repeat(5000) }));
  form.set("website", "");

  const response = await handleTripRequest(
    multipartRequest("/api/trips/report", form),
    {},
    SITES,
    { store, now: () => new Date("2026-07-11T18:00:00.000Z") },
  );

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error.code, "invalid_prediction_metadata");
  assert.equal(store.trips.size, 0);
});

test("honeypot submissions are rejected without persistence", async () => {
  const store = new MemoryTripStore();
  const response = await handleTripRequest(
    jsonRequest("/api/trips/start", {
      siteId: "oyster-point",
      consent: true,
      reporterKey: "a".repeat(32),
      website: "https://spam.example",
    }),
    {},
    SITES,
    { store },
  );
  assert.equal(response.status, 422);
  assert.equal(store.trips.size, 0);
});
