import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { getAuthenticatedUser } from "../worker/auth.ts";
import { handleDiscussionRequest } from "../worker/discussions.ts";
import { createTripStore } from "../worker/trips.ts";

class D1StatementAdapter {
  constructor(statement) {
    this.statement = statement;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    return this.statement.get(...this.values) ?? null;
  }

  async all() {
    return { results: this.statement.all(...this.values) };
  }

  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class D1Adapter {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(query) {
    return new D1StatementAdapter(this.sqlite.prepare(query));
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

const migrationDirectory = new URL("../drizzle/", import.meta.url);

async function migrationFiles() {
  return (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

async function applyMigration(sqlite, file) {
  const sql = (await readFile(new URL(file, migrationDirectory), "utf8"))
    .replaceAll("--> statement-breakpoint", "");
  sqlite.exec(`BEGIN IMMEDIATE;\n${sql}\nCOMMIT;`);
}

function columns(sqlite, table) {
  return sqlite.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
}

function schemaVersion(sqlite) {
  return sqlite.prepare("PRAGMA schema_version").get().schema_version;
}

function insertValidObservationTrip(sqlite, id, overrides = {}) {
  const input = {
    startedAt: "2026-07-01T10:00:00.000Z",
    endedAt: "2026-07-01T12:00:00.000Z",
    mode: "beach",
    anglerCount: 1,
    anglerHours: 2.5,
    keeperCount: 0,
    shortReleasedCount: 0,
    otherCatchCount: 0,
    ...overrides,
  };
  const targetEncounterCount = Object.hasOwn(overrides, "targetEncounterCount")
    ? overrides.targetEncounterCount
    : Number(input.keeperCount) + Number(input.shortReleasedCount);
  const anyFishEncounterCount = Object.hasOwn(overrides, "anyFishEncounterCount")
    ? overrides.anyFishEncounterCount
    : Number(targetEncounterCount) + Number(input.otherCatchCount);
  const halibutEncounters = Object.hasOwn(overrides, "halibutEncounters")
    ? overrides.halibutEncounters
    : targetEncounterCount;
  const noCatch = Object.hasOwn(overrides, "noCatch")
    ? overrides.noCatch
    : Number(anyFishEncounterCount === 0);
  const targetIdentificationConfidence = Number(targetEncounterCount) > 0 ? "self_reported" : "not_observed";
  const taxonObservations = [
    {
      taxon_id: "california-halibut",
      encounter_count: targetEncounterCount,
      retained_count: input.keeperCount,
      released_count: input.shortReleasedCount,
      disposition_unknown_count: 0,
      identification_confidence: targetIdentificationConfidence,
      identification_basis: Number(targetEncounterCount) > 0 ? "angler-report" : "not-observed",
    },
    ...(Number(input.otherCatchCount) > 0 ? [{
      taxon_id: "unresolved-fish",
      encounter_count: input.otherCatchCount,
      retained_count: 0,
      released_count: 0,
      disposition_unknown_count: input.otherCatchCount,
      identification_confidence: "unresolved",
      identification_basis: "unresolved",
    }] : []),
  ];
  const outcomeClass = Number(targetEncounterCount) > 0
    ? "target_encountered"
    : Number(anyFishEncounterCount) > 0 ? "non_target_only" : "no_fish";
  const timestamp = "2026-07-01T12:00:00.000Z";
  return sqlite.prepare(`INSERT INTO trips (
      id, status, source, site_id, started_at, ended_at, mode, angler_count, angler_hours,
      keeper_count, short_released_count, halibut_encounters, no_catch, other_catch_count,
      consent, moderation_status, reporter_key_hash, created_at, updated_at, completed_at,
      observation_contract_version, taxon_catalog_version, target_taxon_id, contract_status,
      taxon_observations_json, outcome_class, target_encounter_count, any_fish_encounter_count,
      target_identification_confidence
    ) VALUES (?, 'completed', 'past_report', 'ocean-beach', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      1, 'pending', 'reporter', ?, ?, ?, 'castingcompass.observation/2.0.0',
      'castingcompass.taxa/1.0.0', 'california-halibut', 'valid', ?, ?, ?, ?, ?)`)
    .run(
      id,
      input.startedAt,
      input.endedAt,
      input.mode,
      input.anglerCount,
      input.anglerHours,
      input.keeperCount,
      input.shortReleasedCount,
      halibutEncounters,
      noCatch,
      input.otherCatchCount,
      timestamp,
      timestamp,
      timestamp,
      JSON.stringify(taxonObservations),
      outcomeClass,
      targetEncounterCount,
      anyFishEncounterCount,
      targetIdentificationConfidence,
    );
}

function assertObservationStorageGuards(sqlite, prefix) {
  insertValidObservationTrip(sqlite, `${prefix}_fractional_effort`);
  assert.equal(
    sqlite.prepare("SELECT angler_hours FROM trips WHERE id = ?").get(`${prefix}_fractional_effort`).angler_hours,
    2.5,
  );
  insertValidObservationTrip(sqlite, `${prefix}_max_effort`, { anglerHours: 432 });

  const invalidCases = [
    ["fractional_angler_count", { anglerCount: 1.5 }],
    ["fractional_keeper", { keeperCount: 0.5 }],
    ["text_short", { shortReleasedCount: "many" }],
    ["fractional_halibut", { halibutEncounters: 0.5 }],
    ["text_no_catch", { noCatch: "none" }],
    ["fractional_other", { otherCatchCount: 0.5 }],
    ["text_target_count", { targetEncounterCount: "zero" }],
    ["fractional_any_count", { anyFishEncounterCount: 0.5 }],
    ["keeper_bound", { keeperCount: 26 }],
    ["released_bound", { shortReleasedCount: 26 }],
    ["combined_bound", { keeperCount: 21, shortReleasedCount: 20 }],
    ["other_bound", { otherCatchCount: 101 }],
    ["no_catch_bound", { noCatch: 2 }],
    ["zero_effort", { anglerHours: 0 }],
    ["excess_effort", { anglerHours: 432.01 }],
    ["bogus_effort", { anglerHours: "bogus" }],
    ["empty_mode", { mode: "" }],
    ["unknown_mode", { mode: "submarine" }],
    ["null_end", { endedAt: null }],
    ["malformed_start", { startedAt: "not-a-date" }],
    ["noncanonical_start", { startedAt: "2026-07-01T10:00:00Z" }],
    ["invalid_calendar_date", { startedAt: "2026-02-31T10:00:00.000Z" }],
    ["reversed_time", { endedAt: "2026-07-01T09:59:59.999Z" }],
  ];
  for (const [suffix, overrides] of invalidCases) {
    assert.throws(() => insertValidObservationTrip(sqlite, `${prefix}_${suffix}`, overrides), suffix);
  }
}

test("the complete migration chain applies atomically and produces the runtime schema", async () => {
  const files = await migrationFiles();
  assert.deepEqual(files, [
    "0000_unique_tusk.sql",
    "0001_accounts_and_saved_sites.sql",
    "0002_profile_trip_ownership.sql",
    "0003_email_verification_and_recovery.sql",
    "0004_advisory_trip_review.sql",
    "0005_fishability_and_gear.sql",
    "0006_moderated_location_discussions.sql",
    "0007_legal_acceptance.sql",
    "0009_human_discussion_approval.sql",
    "0010_privacy_durability.sql",
    "0011_species_aware_observations.sql",
  ]);

  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  for (const file of files) await applyMigration(sqlite, file);

  assert.deepEqual(
    sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      .map((row) => row.name),
    ["auth_attempts", "auth_sessions", "email_challenges", "gear_profiles", "privacy_deletion_jobs", "privacy_deletion_tasks", "saved_sites", "signup_age_proofs", "site_discussion_posts", "trips", "users"],
  );
  assert.ok(columns(sqlite, "trips").includes("user_id"));
  assert.ok(columns(sqlite, "trips").includes("ai_reviewed_at"));
  assert.ok(columns(sqlite, "trips").includes("fishability_score"));
  assert.ok(columns(sqlite, "email_challenges").includes("resend_count"));
  assert.ok(columns(sqlite, "email_challenges").includes("privacy_version"));
  assert.deepEqual(
    columns(sqlite, "site_discussion_posts").slice(-3),
    ["approved_at", "approved_by", "source_ai_reviewed_at"],
  );
  assert.ok(columns(sqlite, "signup_age_proofs").includes("consumed_at"));
  assert.ok(columns(sqlite, "privacy_deletion_jobs").includes("owner_subject_hash"));
  assert.ok(columns(sqlite, "privacy_deletion_tasks").includes("object_key_hash"));
  assert.ok(columns(sqlite, "trips").includes("observation_contract_version"));
  assert.ok(columns(sqlite, "trips").includes("taxon_observations_json"));
  assert.ok(columns(sqlite, "trips").includes("outcome_class"));
  const tripOwnershipForeignKeys = sqlite.prepare(`SELECT COUNT(*) AS count
    FROM pragma_foreign_key_list('trips')
    WHERE "table" = 'users' AND "from" = 'user_id' AND upper(on_delete) = 'SET NULL'`).get().count;
  assert.equal(tripOwnershipForeignKeys, 1);
  const privacyAudit = await readFile(new URL("../scripts/privacy-post-migration-audit.sql", import.meta.url), "utf8");
  assert.match(privacyAudit, /trip_user_ownership_foreign_keys/);
  assert.equal(sqlite.prepare("PRAGMA foreign_key_check").all().length, 0);
  assert.equal(sqlite.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assertObservationStorageGuards(sqlite, "migrated");
  assert.throws(() => sqlite.prepare(`INSERT INTO trips (
      id, status, source, site_id, started_at, mode, angler_count, consent,
      moderation_status, reporter_key_hash, created_at, updated_at
    ) VALUES ('trip_missing_contract_status', 'completed', 'past_report', 'ocean-beach',
      '2026-07-01T10:00:00.000Z', 'beach', 1, 1, 'pending', 'reporter',
      '2026-07-01T10:00:00.000Z', '2026-07-01T10:00:00.000Z')`).run());
});

test("the approval migration quarantines a legacy discussion row", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  for (const file of await migrationFiles()) {
    if (file === "0009_human_discussion_approval.sql") {
      sqlite.prepare(`INSERT INTO trips (
        id, status, source, site_id, started_at, mode, angler_count, consent,
        moderation_status, reporter_key_hash, created_at, updated_at
      ) VALUES ('trip_legacy', 'completed', 'past_report', 'ocean-beach',
        '2026-07-01T10:00:00.000Z', 'shore', 1, 1, 'approved', 'hash',
        '2026-07-01T10:00:00.000Z', '2026-07-01T12:00:00.000Z')`).run();
      sqlite.prepare(`INSERT INTO site_discussion_posts (
        id, trip_id, site_id, summary, observed_at, created_at, updated_at
      ) VALUES ('legacy', 'trip_legacy', 'ocean-beach', 'Legacy text',
        '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z',
        '2026-07-01T12:00:00.000Z')`).run();
    }
    await applyMigration(sqlite, file);
  }

  assert.deepEqual(
    { ...sqlite.prepare("SELECT approved_at, approved_by, source_ai_reviewed_at FROM site_discussion_posts WHERE id = 'legacy'").get() },
    { approved_at: null, approved_by: null, source_ai_reviewed_at: null },
  );
  assert.deepEqual(
    { ...sqlite.prepare(`SELECT observation_contract_version, taxon_catalog_version,
      target_taxon_id, contract_status, taxon_observations_json, outcome_class,
      target_encounter_count, any_fish_encounter_count, target_identification_confidence
      FROM trips WHERE id = 'trip_legacy'`).get() },
    {
      observation_contract_version: null,
      taxon_catalog_version: null,
      target_taxon_id: "california-halibut",
      contract_status: "legacy_unverified",
      taxon_observations_json: null,
      outcome_class: null,
      target_encounter_count: null,
      any_fish_encounter_count: null,
      target_identification_confidence: null,
    },
  );
  assert.throws(() => sqlite.prepare(`UPDATE trips SET contract_status = 'valid' WHERE id = 'trip_legacy'`).run());
  assert.throws(() => sqlite.prepare(`UPDATE trips SET
    observation_contract_version = 'castingcompass.observation/2.0.0',
    taxon_catalog_version = 'castingcompass.taxa/1.0.0',
    contract_status = 'valid', keeper_count = 0, short_released_count = 0,
    halibut_encounters = 0, no_catch = 1, other_catch_count = 0,
    taxon_observations_json = '[{"taxon_id":"california-halibut","encounter_count":99}]',
    outcome_class = 'no_fish', target_encounter_count = 0, any_fish_encounter_count = 0,
    target_identification_confidence = 'not_observed'
    WHERE id = 'trip_legacy'`).run());
});

test("runtime initializers do not mutate a fully migrated schema", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  for (const file of await migrationFiles()) await applyMigration(sqlite, file);
  const d1 = new D1Adapter(sqlite);
  const before = schemaVersion(sqlite);

  await createTripStore(d1).initialize();
  assert.equal(await getAuthenticatedUser(new Request("https://castingcompass.com/api/auth/session"), { DB: d1 }), null);
  const response = await handleDiscussionRequest(
    new Request("https://castingcompass.com/api/discussions/ocean-beach"),
    { DB: d1, PUBLIC_DISCUSSIONS_ENABLED: "true" },
    [{ id: "ocean-beach" }],
  );

  assert.equal(response?.status, 200);
  assert.deepEqual(await response?.json(), { posts: [] });
  assert.equal(schemaVersion(sqlite), before);
});

test("fresh runtime schema rejects malformed valid-contract evidence", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);");
  await createTripStore(new D1Adapter(sqlite)).initialize();
  assertObservationStorageGuards(sqlite, "fresh");

  const insert = sqlite.prepare(`INSERT INTO trips (
      id, status, source, site_id, started_at, ended_at, mode, angler_count, angler_hours,
      keeper_count, short_released_count, halibut_encounters, no_catch, other_catch_count,
      consent, moderation_status, reporter_key_hash, created_at, updated_at, completed_at,
      observation_contract_version, taxon_catalog_version, target_taxon_id, contract_status,
      taxon_observations_json, outcome_class, target_encounter_count, any_fish_encounter_count,
      target_identification_confidence
    ) VALUES (
      'trip_invalid_json', 'completed', 'past_report', 'ocean-beach',
      '2026-07-01T10:00:00.000Z', '2026-07-01T12:00:00.000Z', 'beach', 1, 2,
      0, 0, 0, 1, 0, 1, 'pending', 'reporter',
      '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z',
      'castingcompass.observation/2.0.0', 'castingcompass.taxa/1.0.0',
      'california-halibut', 'valid', 'not-json', 'no_fish', 0, 0, 'not_observed'
    )`);
  assert.throws(() => insert.run());
  assert.throws(() => sqlite.prepare(`INSERT INTO trips (
      id, status, source, site_id, started_at, ended_at, mode, angler_count, angler_hours,
      keeper_count, short_released_count, halibut_encounters, no_catch, other_catch_count,
      consent, moderation_status, reporter_key_hash, created_at, updated_at, completed_at,
      observation_contract_version, taxon_catalog_version, target_taxon_id, contract_status,
      taxon_observations_json, outcome_class, target_encounter_count, any_fish_encounter_count,
      target_identification_confidence
    ) VALUES (
      'trip_semantically_incoherent', 'completed', 'past_report', 'ocean-beach',
      '2026-07-01T10:00:00.000Z', '2026-07-01T12:00:00.000Z', 'beach', 1, 2,
      0, 0, 0, 1, 0, 1, 'pending', 'reporter',
      '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z', '2026-07-01T12:00:00.000Z',
      'castingcompass.observation/2.0.0', 'castingcompass.taxa/1.0.0',
      'california-halibut', 'valid', '[{"taxon_id":"california-halibut","encounter_count":99}]',
      'no_fish', 0, 0, 'not_observed'
    )`).run());
  assert.throws(() => sqlite.prepare(`INSERT INTO trips (
      id, status, source, site_id, started_at, mode, angler_count, consent,
      moderation_status, reporter_key_hash, created_at, updated_at
    ) VALUES ('trip_completed_without_contract', 'completed', 'past_report', 'ocean-beach',
      '2026-07-01T10:00:00.000Z', 'beach', 1, 1, 'pending', 'reporter',
      '2026-07-01T10:00:00.000Z', '2026-07-01T10:00:00.000Z')`).run());
  assert.throws(() => sqlite.prepare(`INSERT INTO trips (
      id, status, source, site_id, started_at, mode, angler_count, consent,
      moderation_status, reporter_key_hash, target_taxon_id, created_at, updated_at
    ) VALUES ('trip_wrong_target', 'active', 'live', 'ocean-beach',
      '2026-07-01T10:00:00.000Z', 'beach', 1, 1, 'pending', 'reporter',
      'unresolved-fish', '2026-07-01T10:00:00.000Z', '2026-07-01T10:00:00.000Z')`).run());
});
