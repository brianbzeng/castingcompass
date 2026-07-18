import { createHash } from "node:crypto";

export const OPERATIONAL_RESTORE_FIXTURE_ACTIVATION_ID = "activation-storage-drill-test";
export const OPERATIONAL_RESTORE_FIXTURE_ACCOUNT_ID = "user-deleted-before-restore";
export const OPERATIONAL_RESTORE_FIXTURE_TRIP_ID = "trip-deleted-before-restore";
export const OPERATIONAL_RESTORE_FIXTURE_OBJECT_KEY = "private/deleted-before-restore.webp";
export const OPERATIONAL_RESTORE_FIXTURE_PRIVATE_SUMMARY = "private fixture summary";
export const OPERATIONAL_RESTORE_FIXTURE_PROHIBITED_EVIDENCE_VALUES = Object.freeze([
  OPERATIONAL_RESTORE_FIXTURE_ACCOUNT_ID,
  OPERATIONAL_RESTORE_FIXTURE_TRIP_ID,
  OPERATIONAL_RESTORE_FIXTURE_OBJECT_KEY,
  OPERATIONAL_RESTORE_FIXTURE_PRIVATE_SUMMARY,
]);

const ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureIdentifier(value, name) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`${name} must be a lowercase fixture identifier`);
  }
  return value;
}

function fixtureTimestamp(value, name) {
  if (typeof value !== "string" || new Date(value).toISOString() !== value) {
    throw new Error(`${name} must be a canonical UTC timestamp`);
  }
  return value;
}

export function operationalRestoreSnapshotSql({
  activationId = OPERATIONAL_RESTORE_FIXTURE_ACTIVATION_ID,
} = {}) {
  fixtureIdentifier(activationId, "Fixture activation ID");
  return `
PRAGMA foreign_keys = ON;
CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
INSERT INTO d1_migrations (id, name) VALUES (14, '0014_validation_feasibility_recruitment_and_corrections.sql');
CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE trips (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE site_discussion_posts (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  summary TEXT NOT NULL
);
CREATE TABLE privacy_deletion_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  receipt_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  owner_subject_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  objects_total INTEGER NOT NULL,
  objects_deleted INTEGER NOT NULL,
  last_error_code TEXT,
  requested_at TEXT NOT NULL,
  active_data_removed_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE privacy_deletion_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES privacy_deletion_jobs(id) ON DELETE CASCADE,
  object_key TEXT,
  object_key_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  available_at TEXT NOT NULL,
  lease_expires_at TEXT,
  lease_token TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE TABLE validation_feasibility_activations (id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE validation_feasibility_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT, activation_id TEXT, trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE, event_type TEXT,
  event_contract_version TEXT, source_record_sha256 TEXT, participant_group_id TEXT,
  recruitment_frame_id TEXT, recruitment_source_id TEXT, selection_method TEXT,
  score_influenced_choice INTEGER, study_consent_version TEXT, study_consented_at TEXT,
  target_taxon_id TEXT, site_id TEXT, geographic_panel TEXT, mode TEXT,
  segment_start_at TEXT, segment_end_at TEXT, angler_count INTEGER, effort_minutes REAL,
  target_encountered INTEGER, target_encounter_count INTEGER, target_retained_count INTEGER,
  target_released_count INTEGER, identification_confidence TEXT, scoring_system_kind TEXT,
  scoring_system_version TEXT, scoring_system_sha256 TEXT, opportunity_score INTEGER,
  opportunity_window_id TEXT, snapshot_sha256 TEXT, terminal_reason TEXT,
  previous_event_sha256 TEXT, event_at TEXT, event_sha256 TEXT,
  snapshot_suppression_sha256 TEXT
);
CREATE TABLE validation_feasibility_corrections (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  correction_id TEXT, activation_id TEXT, trip_id TEXT REFERENCES trips(id) ON DELETE CASCADE,
  correction_contract_version TEXT,
  root_completion_event_sha256 TEXT, previous_event_sha256 TEXT, correction_reason TEXT,
  analytical_status TEXT, site_id TEXT, geographic_panel TEXT, mode TEXT,
  segment_start_at TEXT, segment_end_at TEXT, angler_count INTEGER, effort_minutes REAL,
  target_encountered INTEGER, target_encounter_count INTEGER, target_retained_count INTEGER,
  target_released_count INTEGER, identification_confidence TEXT, corrected_at TEXT,
  event_sha256 TEXT
);
CREATE TABLE validation_feasibility_recruitment_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE validation_feasibility_privacy_removals (
  activation_id TEXT,
  removed_started_attempt_count INTEGER,
  removed_completed_attempt_count INTEGER,
  removed_safe_canceled_attempt_count INTEGER
);
INSERT INTO validation_feasibility_activations (id) VALUES ('${activationId}');
INSERT INTO users (id) VALUES ('${OPERATIONAL_RESTORE_FIXTURE_ACCOUNT_ID}');
INSERT INTO trips (id, user_id) VALUES ('${OPERATIONAL_RESTORE_FIXTURE_TRIP_ID}', '${OPERATIONAL_RESTORE_FIXTURE_ACCOUNT_ID}');
INSERT INTO site_discussion_posts (id, trip_id, summary)
VALUES ('discussion-deleted-before-restore', '${OPERATIONAL_RESTORE_FIXTURE_TRIP_ID}', '${OPERATIONAL_RESTORE_FIXTURE_PRIVATE_SUMMARY}');
INSERT INTO validation_feasibility_events (event_id, activation_id, trip_id, event_type)
VALUES ('event-restored-start', '${activationId}', '${OPERATIONAL_RESTORE_FIXTURE_TRIP_ID}', 'started');
INSERT INTO validation_feasibility_events (event_id, activation_id, trip_id, event_type)
VALUES ('event-restored-complete', '${activationId}', '${OPERATIONAL_RESTORE_FIXTURE_TRIP_ID}', 'completed');
INSERT INTO validation_feasibility_corrections (correction_id, activation_id, trip_id)
VALUES ('correction-restored', '${activationId}', '${OPERATIONAL_RESTORE_FIXTURE_TRIP_ID}');
INSERT INTO validation_feasibility_recruitment_events (user_id) VALUES ('${OPERATIONAL_RESTORE_FIXTURE_ACCOUNT_ID}');
`;
}

export function operationalRestoreCurrentLedgerSql({
  requestedAt = "2026-07-17T08:00:00.000Z",
} = {}) {
  fixtureTimestamp(requestedAt, "Fixture deletion request time");
  const accountHash = sha256(`account:${OPERATIONAL_RESTORE_FIXTURE_ACCOUNT_ID}`);
  return `
PRAGMA foreign_keys = ON;
CREATE TABLE privacy_deletion_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  receipt_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  owner_subject_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  objects_total INTEGER NOT NULL,
  objects_deleted INTEGER NOT NULL,
  last_error_code TEXT,
  requested_at TEXT NOT NULL,
  active_data_removed_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE privacy_deletion_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES privacy_deletion_jobs(id) ON DELETE CASCADE,
  object_key TEXT,
  object_key_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  available_at TEXT NOT NULL,
  lease_expires_at TEXT,
  lease_token TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
INSERT INTO privacy_deletion_jobs (
  id, receipt_hash, scope, subject_hash, owner_subject_hash, state,
  objects_total, objects_deleted, last_error_code, requested_at,
  active_data_removed_at, completed_at, updated_at
) VALUES (
  'deletion-current-account', '${"a".repeat(64)}', 'account', '${accountHash}', '${accountHash}',
  'active_data_removed', 2, 1, NULL, '${requestedAt}', '${requestedAt}', NULL, '${requestedAt}'
);
INSERT INTO privacy_deletion_tasks (
  id, job_id, object_key, object_key_hash, state, attempts, available_at,
  lease_expires_at, lease_token, last_error_code, created_at, updated_at, completed_at
) VALUES (
  'task-current-pending', 'deletion-current-account', '${OPERATIONAL_RESTORE_FIXTURE_OBJECT_KEY}', '${sha256(OPERATIONAL_RESTORE_FIXTURE_OBJECT_KEY)}',
  'pending', 1, '${requestedAt}', NULL, NULL, NULL, '${requestedAt}', '${requestedAt}', NULL
);
INSERT INTO privacy_deletion_tasks (
  id, job_id, object_key, object_key_hash, state, attempts, available_at,
  lease_expires_at, lease_token, last_error_code, created_at, updated_at, completed_at
) VALUES (
  'task-current-completed', 'deletion-current-account', NULL, '${"b".repeat(64)}',
  'completed', 1, '${requestedAt}', NULL, NULL, NULL, '${requestedAt}', '${requestedAt}', '${requestedAt}'
);
`;
}
