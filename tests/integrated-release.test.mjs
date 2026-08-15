import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  ALL_RELEASE_MIGRATIONS,
  BASE_APPLIED_MIGRATIONS,
  RECONCILED_LEGAL_MIGRATION,
  STAGED_MIGRATIONS,
  authorizeProductionMutation,
  createStagedWranglerConfig,
  expectedMigrationsBefore,
  verifyFinalPostflight,
  verifyInitialPreflight,
  verifyLedgerPayload,
  verifyLocalMigrationSet,
  verifyPrivacyPreservationPayload,
  productionMutationAction,
  verifyReconciliationResult,
  verifyStageBoundaryPayload,
} from "../scripts/integrated-release.mjs";

const migrationDirectory = new URL("../drizzle/", import.meta.url);
const HEAD = "0123456789abcdef0123456789abcdef01234567";

async function applyMigration(sqlite, name) {
  const source = await readFile(new URL(name, migrationDirectory), "utf8");
  sqlite.exec(source.replaceAll("--> statement-breakpoint", ""));
}

function createLedger(sqlite) {
  sqlite.exec(`CREATE TABLE d1_migrations(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
}

function recordMigration(sqlite, name) {
  sqlite.prepare("INSERT INTO d1_migrations(name) VALUES (?)").run(name);
}

function readEnvelope(row) {
  return [{
    results: [row],
    success: true,
    meta: { served_by_primary: true, changed_db: false, changes: 0, rows_written: 0 },
  }];
}

function mutationEnvelope(rows) {
  return [{
    results: rows,
    success: true,
    meta: { served_by_primary: true, changed_db: true, changes: 1, rows_written: 1 },
  }];
}

async function legalSchemaWithUnrecordedMigration() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  createLedger(sqlite);
  for (const name of [...BASE_APPLIED_MIGRATIONS, RECONCILED_LEGAL_MIGRATION]) {
    await applyMigration(sqlite, name);
    if (name !== RECONCILED_LEGAL_MIGRATION) recordMigration(sqlite, name);
  }
  await applyMigration(sqlite, "0010_privacy_durability.sql");
  const validationSource = await readFile(new URL("0012_validation_protocol.sql", migrationDirectory), "utf8");
  const validationStatements = validationSource.split("--> statement-breakpoint");
  sqlite.exec(validationStatements[0]);
  sqlite.exec(validationStatements[2]);
  return sqlite;
}

const preledgerSchemaFields = [
  "preledger_signup_age_proofs_schema",
  "preledger_privacy_deletion_jobs_schema",
  "preledger_privacy_deletion_tasks_schema",
  "preledger_forecast_impressions_schema",
  "preledger_trip_validation_provenance_schema",
  "preledger_signup_age_proofs_expiry_index_schema",
  "preledger_privacy_deletion_jobs_state_index_schema",
  "preledger_privacy_deletion_jobs_owner_index_schema",
  "preledger_privacy_deletion_tasks_retry_index_schema",
];

function fixturePreledgerPolicy(row) {
  return {
    schemaHashes: Object.fromEntries(preledgerSchemaFields.map((field) => [
      field,
      createHash("sha256").update(row[field]).digest("hex"),
    ])),
    privacyIndexes: JSON.parse(row.preledger_privacy_indexes_json),
    validationIndexes: JSON.parse(row.preledger_validation_indexes_json),
  };
}

test("integrated preflight recognizes only the exact observed pre-ledger schema drift", async () => {
  const sqlite = await legalSchemaWithUnrecordedMigration();
  const source = await readFile(new URL("../scripts/integrated-release-preflight.sql", import.meta.url), "utf8");
  const row = sqlite.prepare(source).get();
  const preledgerPolicy = fixturePreledgerPolicy(row);
  const result = verifyInitialPreflight(readEnvelope(row), BASE_APPLIED_MIGRATIONS, preledgerPolicy);
  assert.deepEqual(result.appliedMigrations, BASE_APPLIED_MIGRATIONS);
  assert.deepEqual(result.aggregates, {
    users: 0,
    usersMissingAgeEligibility: 0,
    usersMissingLegalAcceptance: 0,
    trips: 0,
    discussionRows: 0,
    tripPhotoLocators: 0,
    signupAgeProofRows: 0,
  });

  sqlite.exec("ALTER TABLE site_discussion_posts ADD COLUMN approved_at TEXT");
  const drifted = sqlite.prepare(source).get();
  assert.throws(
    () => verifyInitialPreflight(readEnvelope(drifted), BASE_APPLIED_MIGRATIONS, preledgerPolicy),
    /approval_columns_found/,
  );

  const schemaDrifted = { ...row, preledger_forecast_impressions_schema: `${row.preledger_forecast_impressions_schema} ` };
  assert.throws(
    () => verifyInitialPreflight(readEnvelope(schemaDrifted), BASE_APPLIED_MIGRATIONS, preledgerPolicy),
    /preledger_forecast_impressions_schema/,
  );

  const idempotencyDrift = await legalSchemaWithUnrecordedMigration();
  idempotencyDrift.exec("ALTER TABLE trips ADD COLUMN idempotency_key_hash TEXT");
  assert.throws(
    () => verifyInitialPreflight(
      readEnvelope(idempotencyDrift.prepare(source).get()),
      BASE_APPLIED_MIGRATIONS,
      preledgerPolicy,
    ),
    /later_trip_columns_found/,
  );

  const indexDrift = await legalSchemaWithUnrecordedMigration();
  indexDrift.exec("CREATE INDEX auth_sessions_expires_idx ON auth_sessions(expires_at)");
  assert.throws(
    () => verifyInitialPreflight(
      readEnvelope(indexDrift.prepare(source).get()),
      BASE_APPLIED_MIGRATIONS,
      preledgerPolicy,
    ),
    /later_indexes_found/,
  );
});

test("0007 reconciliation is one guarded ledger insert and refuses replay", async () => {
  const sqlite = await legalSchemaWithUnrecordedMigration();
  const reconciliation = await readFile(
    new URL("../scripts/reconcile-0007-legal-migration.sql", import.meta.url),
    "utf8",
  );
  const first = sqlite.prepare(reconciliation).all();
  assert.deepEqual(first.map((row) => ({ ...row })), [{ reconciled_migration: RECONCILED_LEGAL_MIGRATION }]);
  assert.deepEqual(verifyReconciliationResult(mutationEnvelope(first)), {
    reconciledMigration: RECONCILED_LEGAL_MIGRATION,
  });
  assert.deepEqual(
    sqlite.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => row.name),
    [...BASE_APPLIED_MIGRATIONS, RECONCILED_LEGAL_MIGRATION],
  );
  assert.deepEqual(sqlite.prepare(reconciliation).all(), []);
});

test("final postflight proves the complete additive schema and empty default-off ledgers", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  createLedger(sqlite);
  for (const name of ALL_RELEASE_MIGRATIONS) {
    await applyMigration(sqlite, name);
    recordMigration(sqlite, name);
  }
  const source = await readFile(new URL("../scripts/integrated-release-postflight.sql", import.meta.url), "utf8");
  const result = verifyFinalPostflight(readEnvelope(sqlite.prepare(source).get()));
  assert.deepEqual(result.appliedMigrations, ALL_RELEASE_MIGRATIONS);
  assert.equal(result.aggregates.trips, 0);
});

test("the pinned pre-ledger drift converges through the complete additive migration chain", async () => {
  const sqlite = await legalSchemaWithUnrecordedMigration();
  sqlite.prepare(`INSERT INTO signup_age_proofs(
    token_hash, confirmed_at, gate_version, expires_at, consumed_at, created_at
  ) VALUES (?, ?, ?, ?, ?, ?)`).run(
    "a".repeat(64),
    "2026-08-15T00:00:00.000Z",
    "castingcompass.age-gate/1.0.0",
    "2026-08-15T00:15:00.000Z",
    null,
    "2026-08-15T00:00:00.000Z",
  );
  const reconciliation = await readFile(
    new URL("../scripts/reconcile-0007-legal-migration.sql", import.meta.url),
    "utf8",
  );
  assert.equal(sqlite.prepare(reconciliation).all().length, 1);
  for (const name of STAGED_MIGRATIONS) {
    await applyMigration(sqlite, name);
    recordMigration(sqlite, name);
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM signup_age_proofs").get().count, 1);
  const postflight = await readFile(
    new URL("../scripts/integrated-release-postflight.sql", import.meta.url),
    "utf8",
  );
  assert.deepEqual(
    verifyFinalPostflight(readEnvelope(sqlite.prepare(postflight).get())).appliedMigrations,
    ALL_RELEASE_MIGRATIONS,
  );
});

test("ledger verifier binds read-only primary results to an exact ordered prefix", () => {
  const row = {
    applied_migrations_json: JSON.stringify(BASE_APPLIED_MIGRATIONS),
    foreign_key_violations: 0,
  };
  assert.deepEqual(verifyLedgerPayload(readEnvelope(row), BASE_APPLIED_MIGRATIONS), {
    appliedMigrations: BASE_APPLIED_MIGRATIONS,
  });
  assert.throws(
    () => verifyLedgerPayload(readEnvelope(row), [...BASE_APPLIED_MIGRATIONS, RECONCILED_LEGAL_MIGRATION]),
    /remote migration ledger/,
  );
  const nonPrimary = readEnvelope(row);
  nonPrimary[0].meta.served_by_primary = false;
  assert.throws(() => verifyLedgerPayload(nonPrimary, BASE_APPLIED_MIGRATIONS), /primary D1 execution/);
});

test("privacy preservation verifier binds the retained age-proof aggregate", () => {
  const row = {
    signup_age_proof_rows: 2,
    privacy_deletion_job_rows: 0,
    privacy_deletion_task_rows: 0,
    foreign_key_violations: 0,
  };
  assert.deepEqual(verifyPrivacyPreservationPayload(readEnvelope(row), 2), {
    signupAgeProofRows: 2,
  });
  assert.throws(
    () => verifyPrivacyPreservationPayload(readEnvelope({ ...row, signup_age_proof_rows: 1 }), 2),
    /signup_age_proof_rows/,
  );
  assert.throws(
    () => verifyPrivacyPreservationPayload(readEnvelope({ ...row, privacy_deletion_job_rows: 1 }), 2),
    /privacy_deletion_job_rows/,
  );
});

test("stage-boundary verifier rejects any pre-existing target artifact", () => {
  assert.deepEqual(verifyStageBoundaryPayload(readEnvelope({ target_artifacts_found: 0 })), {
    targetArtifactsFound: 0,
  });
  assert.throws(
    () => verifyStageBoundaryPayload(readEnvelope({ target_artifacts_found: 1 })),
    /target_artifacts_found/,
  );
});

test("stage-boundary verifier preserves only the pinned pre-ledger tables", async () => {
  const sqlite = await legalSchemaWithUnrecordedMigration();
  const preflightSource = await readFile(
    new URL("../scripts/integrated-release-preflight.sql", import.meta.url),
    "utf8",
  );
  const row = sqlite.prepare(preflightSource).get();
  const preledgerPolicy = fixturePreledgerPolicy(row);
  assert.deepEqual(
    verifyStageBoundaryPayload(readEnvelope(row), "0010_privacy_durability.sql", preledgerPolicy),
    { targetArtifactsFound: 3, signupAgeProofRows: 0 },
  );
  assert.deepEqual(
    verifyStageBoundaryPayload(readEnvelope(row), "0012_validation_protocol.sql", preledgerPolicy),
    { targetArtifactsFound: 2 },
  );
  sqlite.exec("CREATE INDEX forecast_impressions_window_idx ON forecast_impressions(window_id, site_id, window_start)");
  const changed = sqlite.prepare(preflightSource).get();
  assert.throws(
    () => verifyStageBoundaryPayload(
      readEnvelope(changed),
      "0012_validation_protocol.sql",
      preledgerPolicy,
    ),
    /preledger_validation_indexes_json/,
  );
});

test("staged migration configuration can expose only the exact next reviewed file", () => {
  assert.deepEqual(expectedMigrationsBefore(STAGED_MIGRATIONS[0]), [
    ...BASE_APPLIED_MIGRATIONS,
    RECONCILED_LEGAL_MIGRATION,
  ]);
  assert.deepEqual(expectedMigrationsBefore(STAGED_MIGRATIONS.at(-1)), ALL_RELEASE_MIGRATIONS.slice(0, -1));
  assert.throws(() => expectedMigrationsBefore(RECONCILED_LEGAL_MIGRATION), /one exact staged filename/);

  const config = createStagedWranglerConfig({
    compatibility_date: "2026-05-15",
    d1_databases: [{
      binding: "DB",
      database_name: "contourcast-trips",
      database_id: "database-id",
      migrations_dir: "drizzle",
    }],
  }, STAGED_MIGRATIONS[2]);
  assert.equal(config.d1_databases[0].migrations_pattern, `drizzle/${STAGED_MIGRATIONS[2]}`);
  assert.equal(config.d1_databases.length, 1);
});

test("release migration allowlist matches every checked-in migration file", async () => {
  const diskFiles = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  assert.deepEqual(diskFiles, ALL_RELEASE_MIGRATIONS);
  assert.deepEqual(await verifyLocalMigrationSet(), ALL_RELEASE_MIGRATIONS);
});

test("the operator runbook enumerates the exact guarded migration sequence", async () => {
  const [runbook, operations] = await Promise.all([
    readFile(new URL("../docs/INTEGRATED-RELEASE.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRODUCTION-OPERATIONS.md", import.meta.url), "utf8"),
  ]);
  const documentedMigrations = [...runbook.matchAll(/export RELEASE_MIGRATION=(\d{4}_[A-Za-z0-9_]+\.sql)/g)]
    .map((match) => match[1]);
  assert.deepEqual(documentedMigrations, STAGED_MIGRATIONS);
  assert.match(runbook, /`0009` through `0020`/);
  assert.match(runbook, /exact nullable\s+text trip-idempotency column/);
  assert.match(operations, /Migration `0017_trip_idempotency\.sql` completed before normal traffic resumed/);
  assert.match(operations, /Migration `0018_ai_review_queue\.sql` completed before any Queue binding/);
  assert.match(operations, /Migration `0019_async_privacy_exports\.sql` completed before any privacy-export Queue or\s+private R2 binding/);
  assert.match(operations, /Migration `0020_trip_photo_upload_reservations\.sql` completed before trip-photo uploads are\s+activated/);
});

test("every D1 mutation maps to one exact private authorization action before Wrangler", async () => {
  assert.equal(productionMutationAction({ command: "preflight" }), null);
  assert.equal(productionMutationAction({ command: "postflight" }), null);
  assert.equal(productionMutationAction({ command: "reconcile-0007" }), "migrate:reconcile-0007");
  for (const migration of STAGED_MIGRATIONS) {
    assert.equal(
      productionMutationAction({ command: "apply", migration }),
      `migrate:${migration}`,
    );
  }
  assert.throws(
    () => productionMutationAction({ command: "apply", migration: "9999_unreviewed.sql" }),
    /one exact staged filename/,
  );

  let calls = 0;
  const result = await authorizeProductionMutation(
    "/reviewed/root",
    {
      command: "apply",
      migration: STAGED_MIGRATIONS[0],
      confirmPrimary: "contourcast-trips",
      confirmBookmarkRecorded: true,
    },
    async (options) => {
      calls += 1;
      assert.deepEqual(options, {
        root: "/reviewed/root",
        expectedCommit: HEAD,
        authorizationFile: "/private/authorization.json",
        action: `migrate:${STAGED_MIGRATIONS[0]}`,
      });
      return { authorized: true };
    },
    {
      RELEASE_COMMIT: HEAD,
      RELEASE_AUTHORIZATION_FILE: "/private/authorization.json",
    },
  );
  assert.deepEqual(result, { authorized: true });
  assert.equal(calls, 1);
  await assert.rejects(
    authorizeProductionMutation(
      "/reviewed/root",
      { command: "reconcile-0007", confirmPrimary: "wrong", confirmBookmarkRecorded: true },
      async () => { throw new Error("must not be called"); },
      {},
    ),
    /--confirm-primary/,
  );
});
