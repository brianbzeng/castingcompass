import {
  assertObservationContract,
  CALIFORNIA_HALIBUT_TAXON_ID,
  deriveObservationOutcomeClass,
  OBSERVATION_CONTRACT_VERSION,
  TAXON_CATALOG_VERSION,
  UNRESOLVED_FISH_TAXON_ID,
} from "../shared/species-contract.ts";

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_PHOTO_BYTES + 1024 * 1024;
const REPORTER_COOKIE = "cc_reporter";
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_MODES = new Set(["shore", "beach", "pier", "jetty", "kayak", "boat", "other"]);

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<{ success?: boolean; meta?: { changes?: number } }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>;
}

interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

interface ImageBindingLike {
  input(stream: ReadableStream): {
    transform(options: Record<string, unknown>): {
      output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
    };
  };
}

export interface TripApiEnv {
  DB?: D1DatabaseLike;
  TRIP_PHOTOS?: R2BucketLike;
  IMAGES?: ImageBindingLike;
  TRIP_PHOTO_UPLOADS_ENABLED?: string;
}

export interface CuratedSite {
  id: string;
  type?: string;
}

export interface TripRow {
  id: string;
  user_id: string | null;
  status: "active" | "completed";
  source: "live" | "past_report";
  site_id: string;
  started_at: string;
  ended_at: string | null;
  mode: string;
  fishing_method: string | null;
  gear: string | null;
  gear_profile_id: string | null;
  rod: string | null;
  reel: string | null;
  bait_lure: string | null;
  rig: string | null;
  angler_count: number;
  angler_hours: number | null;
  keeper_count: number | null;
  short_released_count: number | null;
  halibut_encounters: number | null;
  no_catch: number | null;
  other_catch_count: number | null;
  other_species: string | null;
  observations_json: string | null;
  observation_contract_version: string | null;
  taxon_catalog_version: string | null;
  target_taxon_id: string;
  contract_status: "valid" | "legacy_unverified" | "rejected" | null;
  taxon_observations_json: string | null;
  outcome_class: "target_encountered" | "non_target_only" | "no_fish" | null;
  target_encounter_count: number | null;
  any_fish_encounter_count: number | null;
  target_identification_confidence: string | null;
  notes: string | null;
  consent: number;
  consent_at: string | null;
  moderation_status: "pending" | "approved" | "rejected";
  reporter_key_hash: string;
  referral_code: string | null;
  token_hash: string | null;
  opportunity_window_id: string | null;
  opportunity_score: number | null;
  habitat_score: number | null;
  seasonality_score: number | null;
  conditions_score: number | null;
  fishability_score: number | null;
  model_version: string | null;
  score_influenced_choice: number | null;
  prediction_metadata_json: string | null;
  photo_key: string | null;
  photo_content_type: string | null;
  photo_size_bytes: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  ai_review_status: string | null;
  ai_review_json: string | null;
  ai_review_model: string | null;
  ai_reviewed_at: string | null;
}

interface NewTripRecord {
  id: string;
  userId: string | null;
  status: "active" | "completed";
  source: "live" | "past_report";
  siteId: string;
  startedAt: string;
  endedAt: string | null;
  mode: string;
  fishingMethod: string | null;
  gear: string | null;
  gearProfileId: string | null;
  rod: string | null;
  reel: string | null;
  baitLure: string | null;
  rig: string | null;
  anglerCount: number;
  anglerHours: number | null;
  keeperCount: number | null;
  shortReleasedCount: number | null;
  halibutEncounters: number | null;
  noCatch: boolean | null;
  otherCatchCount: number | null;
  otherSpecies: string | null;
  observationsJson: string | null;
  observationContractVersion: string | null;
  taxonCatalogVersion: string | null;
  targetTaxonId: string;
  contractStatus: "valid" | "legacy_unverified" | "rejected" | null;
  taxonObservationsJson: string | null;
  outcomeClass: "target_encountered" | "non_target_only" | "no_fish" | null;
  targetEncounterCount: number | null;
  anyFishEncounterCount: number | null;
  targetIdentificationConfidence: string | null;
  notes: string | null;
  consent: boolean;
  consentAt: string | null;
  moderationStatus: "pending";
  reporterKeyHash: string;
  referralCode: string | null;
  tokenHash: string | null;
  opportunityWindowId: string | null;
  opportunityScore: number | null;
  habitatScore: number | null;
  seasonalityScore: number | null;
  conditionsScore: number | null;
  fishabilityScore: number | null;
  modelVersion: string | null;
  scoreInfluencedChoice: boolean | null;
  predictionMetadataJson: string | null;
  photoKey: string | null;
  photoContentType: string | null;
  photoSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface CompletionRecord {
  endedAt: string;
  mode: string;
  fishingMethod: string | null;
  gear: string | null;
  gearProfileId: string | null;
  rod: string | null;
  reel: string | null;
  baitLure: string | null;
  rig: string | null;
  anglerCount: number;
  anglerHours: number;
  keeperCount: number;
  shortReleasedCount: number;
  halibutEncounters: number;
  noCatch: boolean;
  otherCatchCount: number;
  otherSpecies: string | null;
  observationsJson: string | null;
  observationContractVersion: string;
  taxonCatalogVersion: string;
  targetTaxonId: string;
  contractStatus: "valid";
  taxonObservationsJson: string;
  outcomeClass: "target_encountered" | "non_target_only" | "no_fish";
  targetEncounterCount: number;
  anyFishEncounterCount: number;
  targetIdentificationConfidence: string;
  notes: string | null;
  consentAt: string;
  scoreInfluencedChoice: boolean | null;
  photoKey: string | null;
  photoContentType: string | null;
  photoSizeBytes: number | null;
  updatedAt: string;
}

interface TripSummary {
  completedTrips: number;
  noCatchTrips: number;
  halibutTrips: number;
  totalHalibut: number;
  anglerHours: number;
  halibutEncounters: number;
  sitesCovered: number;
  lastUpdated: string | null;
  past24Hours: {
    completedTrips: number;
    anglerHours: number;
    halibutEncounters: number;
    sitesCovered: number;
  };
}

export interface TripStore {
  initialize(): Promise<void>;
  assertSubmissionAllowed(reporterKeyHash: string, now: Date): Promise<void>;
  insertTrip(record: NewTripRecord): Promise<TripRow>;
  getTrip(id: string): Promise<TripRow | null>;
  completeTrip(id: string, tokenHash: string, completion: CompletionRecord): Promise<TripRow | null>;
  getSummary(now: Date): Promise<TripSummary>;
}

export interface TripHandlerOptions {
  store?: TripStore;
  now?: () => Date;
  accountId?: string | null;
  onTripCompleted?: (trip: TripRow) => void;
}

const CREATE_TRIPS_SQL = `CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  site_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  mode TEXT NOT NULL,
  fishing_method TEXT,
  gear TEXT,
  gear_profile_id TEXT,
  rod TEXT,
  reel TEXT,
  bait_lure TEXT,
  rig TEXT,
  angler_count INTEGER NOT NULL,
  angler_hours REAL,
  keeper_count INTEGER,
  short_released_count INTEGER,
  halibut_encounters INTEGER,
  no_catch INTEGER,
  other_catch_count INTEGER,
  other_species TEXT,
  observations_json TEXT,
  observation_contract_version TEXT,
  taxon_catalog_version TEXT,
  target_taxon_id TEXT NOT NULL DEFAULT 'california-halibut',
  contract_status TEXT,
  taxon_observations_json TEXT,
  outcome_class TEXT,
  target_encounter_count INTEGER,
  any_fish_encounter_count INTEGER,
  target_identification_confidence TEXT,
  notes TEXT,
  consent INTEGER NOT NULL,
  consent_at TEXT,
  moderation_status TEXT NOT NULL,
  reporter_key_hash TEXT NOT NULL,
  referral_code TEXT,
  token_hash TEXT,
  opportunity_window_id TEXT,
  opportunity_score REAL,
  habitat_score REAL,
  seasonality_score REAL,
  conditions_score REAL,
  fishability_score REAL,
  model_version TEXT,
  score_influenced_choice INTEGER,
  prediction_metadata_json TEXT,
  photo_key TEXT,
  photo_content_type TEXT,
  photo_size_bytes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  ai_review_status TEXT,
  ai_review_json TEXT,
  ai_review_model TEXT,
  ai_reviewed_at TEXT,
  CONSTRAINT trips_status_check CHECK (status in ('active', 'completed')),
  CONSTRAINT trips_source_check CHECK (source in ('live', 'past_report')),
  CONSTRAINT trips_moderation_status_check CHECK (moderation_status in ('pending', 'approved', 'rejected')),
  CONSTRAINT trips_angler_count_check CHECK (angler_count between 1 and 12),
  CONSTRAINT trips_contract_status_check CHECK (contract_status IS NULL OR contract_status in ('valid', 'legacy_unverified', 'rejected')),
  CONSTRAINT trips_outcome_class_check CHECK (outcome_class IS NULL OR outcome_class in ('target_encountered', 'non_target_only', 'no_fish')),
  CONSTRAINT trips_target_encounter_count_check CHECK (target_encounter_count IS NULL OR target_encounter_count >= 0),
  CONSTRAINT trips_any_fish_encounter_count_check CHECK (any_fish_encounter_count IS NULL OR any_fish_encounter_count >= 0),
  CONSTRAINT trips_target_identification_confidence_check CHECK (target_identification_confidence IS NULL OR target_identification_confidence in ('verified', 'self_reported', 'uncertain', 'unresolved', 'not_observed')),
  CONSTRAINT trips_target_taxon_check CHECK (target_taxon_id = 'california-halibut'),
  CONSTRAINT trips_species_contract_coherence_check CHECK (
    (status != 'completed' OR contract_status IS NOT NULL)
    AND (contract_status IS NOT NULL OR (
      observation_contract_version IS NULL
      AND taxon_catalog_version IS NULL
      AND taxon_observations_json IS NULL
      AND outcome_class IS NULL
      AND target_encounter_count IS NULL
      AND any_fish_encounter_count IS NULL
      AND target_identification_confidence IS NULL
    ))
    AND (contract_status != 'legacy_unverified' OR (
      observation_contract_version IS NULL
      AND taxon_catalog_version IS NULL
      AND taxon_observations_json IS NULL
      AND outcome_class IS NULL
      AND target_encounter_count IS NULL
      AND any_fish_encounter_count IS NULL
      AND target_identification_confidence IS NULL
    ))
    AND (contract_status != 'valid' OR (
      status = 'completed'
      AND observation_contract_version = 'castingcompass.observation/2.0.0'
      AND taxon_catalog_version = 'castingcompass.taxa/1.0.0'
      AND target_taxon_id = 'california-halibut'
      AND typeof(angler_count) = 'integer'
      AND angler_count BETWEEN 1 AND 12
      AND typeof(angler_hours) IN ('integer', 'real')
      AND angler_hours > 0
      AND angler_hours <= 432
      AND typeof(keeper_count) = 'integer'
      AND typeof(short_released_count) = 'integer'
      AND typeof(halibut_encounters) = 'integer'
      AND typeof(no_catch) = 'integer'
      AND typeof(other_catch_count) = 'integer'
      AND typeof(target_encounter_count) = 'integer'
      AND typeof(any_fish_encounter_count) = 'integer'
      AND keeper_count BETWEEN 0 AND 25
      AND short_released_count BETWEEN 0 AND 25
      AND keeper_count + short_released_count <= 40
      AND other_catch_count BETWEEN 0 AND 100
      AND no_catch IN (0, 1)
      AND typeof(mode) = 'text'
      AND mode IN ('shore', 'beach', 'pier', 'jetty', 'kayak', 'boat', 'other')
      AND typeof(started_at) = 'text'
      AND typeof(ended_at) = 'text'
      AND length(started_at) = 24
      AND length(ended_at) = 24
      AND strftime('%Y-%m-%dT%H:%M:%fZ', started_at) = started_at
      AND strftime('%Y-%m-%dT%H:%M:%fZ', ended_at) = ended_at
      AND julianday(ended_at) > julianday(started_at)
      AND taxon_observations_json IS NOT NULL
      AND json_valid(taxon_observations_json) = 1
      AND outcome_class IS NOT NULL
      AND target_encounter_count IS NOT NULL
      AND any_fish_encounter_count IS NOT NULL
      AND target_identification_confidence IS NOT NULL
      AND target_encounter_count = keeper_count + short_released_count
      AND halibut_encounters = target_encounter_count
      AND any_fish_encounter_count = target_encounter_count + other_catch_count
      AND target_encounter_count <= any_fish_encounter_count
      AND target_identification_confidence = CASE
        WHEN target_encounter_count > 0 THEN 'self_reported'
        ELSE 'not_observed'
      END
      AND no_catch = CASE WHEN any_fish_encounter_count = 0 THEN 1 ELSE 0 END
      AND outcome_class = CASE
        WHEN target_encounter_count > 0 THEN 'target_encountered'
        WHEN any_fish_encounter_count > 0 THEN 'non_target_only'
        ELSE 'no_fish'
      END
      AND taxon_observations_json = CASE
        WHEN other_catch_count > 0 THEN json_array(
          json_object(
            'taxon_id', 'california-halibut',
            'encounter_count', target_encounter_count,
            'retained_count', keeper_count,
            'released_count', short_released_count,
            'disposition_unknown_count', 0,
            'identification_confidence', target_identification_confidence,
            'identification_basis', CASE WHEN target_encounter_count > 0 THEN 'angler-report' ELSE 'not-observed' END
          ),
          json_object(
            'taxon_id', 'unresolved-fish',
            'encounter_count', other_catch_count,
            'retained_count', 0,
            'released_count', 0,
            'disposition_unknown_count', other_catch_count,
            'identification_confidence', 'unresolved',
            'identification_basis', 'unresolved'
          )
        )
        ELSE json_array(json_object(
          'taxon_id', 'california-halibut',
          'encounter_count', target_encounter_count,
          'retained_count', keeper_count,
          'released_count', short_released_count,
          'disposition_unknown_count', 0,
          'identification_confidence', target_identification_confidence,
          'identification_basis', CASE WHEN target_encounter_count > 0 THEN 'angler-report' ELSE 'not-observed' END
        ))
      END
    ))
  ),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
)`;

const CREATE_INDEX_STATEMENTS = [
  "CREATE INDEX IF NOT EXISTS trips_status_started_idx ON trips (status, started_at)",
  "CREATE INDEX IF NOT EXISTS trips_site_started_idx ON trips (site_id, started_at)",
  "CREATE INDEX IF NOT EXISTS trips_reporter_created_idx ON trips (reporter_key_hash, created_at)",
  "CREATE INDEX IF NOT EXISTS trips_referral_created_idx ON trips (referral_code, created_at)",
  "CREATE INDEX IF NOT EXISTS trips_user_completed_idx ON trips (user_id, completed_at)",
  "CREATE INDEX IF NOT EXISTS trips_contract_target_completed_idx ON trips (contract_status, target_taxon_id, completed_at)",
  `CREATE TRIGGER IF NOT EXISTS trips_completed_contract_insert_guard
    BEFORE INSERT ON trips
    WHEN NEW.status = 'completed' AND NEW.contract_status IS NULL
    BEGIN SELECT RAISE(ABORT, 'completed trips require an explicit contract status'); END`,
  `CREATE TRIGGER IF NOT EXISTS trips_completed_contract_update_guard
    BEFORE UPDATE OF status, contract_status ON trips
    WHEN NEW.status = 'completed' AND NEW.contract_status IS NULL
    BEGIN SELECT RAISE(ABORT, 'completed trips require an explicit contract status'); END`,
];

const INSERT_TRIP_SQL = `INSERT INTO trips (
  id, user_id, status, source, site_id, started_at, ended_at, mode, fishing_method, gear,
  gear_profile_id, rod, reel, bait_lure, rig,
  angler_count, angler_hours, keeper_count, short_released_count, halibut_encounters,
  no_catch, other_catch_count, other_species, observations_json, observation_contract_version,
  taxon_catalog_version, target_taxon_id, contract_status, taxon_observations_json, outcome_class,
  target_encounter_count, any_fish_encounter_count, target_identification_confidence,
  notes, consent, consent_at, moderation_status, reporter_key_hash, referral_code, token_hash,
  opportunity_window_id, opportunity_score, habitat_score, seasonality_score, conditions_score,
  fishability_score, model_version, score_influenced_choice, prediction_metadata_json, photo_key,
  photo_content_type, photo_size_bytes, created_at, updated_at, completed_at
) VALUES (
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?, ?
)`;

const initializedDatabases = new WeakMap<object, Promise<void>>();

export class RateLimitError extends Error {
  constructor() {
    super("Too many trip submissions. Please try again later.");
    this.name = "RateLimitError";
  }
}

class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const SERVER_CONTROLLED_OBSERVATION_FIELDS = [
  "observationContract",
  "observation_contract",
  "observationContractVersion",
  "observation_contract_version",
  "contractVersion",
  "contract_version",
  "contractStatus",
  "contract_status",
  "taxonCatalogVersion",
  "taxon_catalog_version",
  "targetTaxonId",
  "target_taxon_id",
  "primaryTargetTaxonId",
  "primary_target_taxon_id",
  "targetSpecies",
  "target_species",
  "taxonId",
  "taxon_id",
  "speciesId",
  "species_id",
  "species",
  "target",
  "taxonObservations",
  "taxon_observations",
  "taxonObservationsJson",
  "taxon_observations_json",
  "outcomeClass",
  "outcome_class",
  "targetEncounterCount",
  "target_encounter_count",
  "anyFishEncounterCount",
  "any_fish_encounter_count",
  "targetIdentificationConfidence",
  "target_identification_confidence",
  "identificationConfidence",
  "identification_confidence",
  "identificationBasis",
  "identification_basis",
  "encounterCount",
  "encounter_count",
  "retainedCount",
  "retained_count",
  "releasedCount",
  "released_count",
  "dispositionUnknownCount",
  "disposition_unknown_count",
  "observationId",
  "observation_id",
  "effortSegmentId",
  "effort_segment_id",
  "targetEffort",
  "target_effort",
  "targetEffortValue",
  "target_effort_value",
  "temporalPrecision",
  "temporal_precision",
  "temporalSupport",
  "temporal_support",
  "spatialSupport",
  "spatial_support",
  "supportId",
  "support_id",
  "crs",
  "x",
  "y",
  "source",
  "sourceId",
  "source_id",
  "sourceRecordId",
  "source_record_id",
  "dataKind",
  "data_kind",
  "completeAttempt",
  "complete_attempt",
  "expandedEstimate",
  "expanded_estimate",
] as const;

export function hasServerControlledObservationFields(source: Record<string, unknown> | FormData) {
  return SERVER_CONTROLLED_OBSERVATION_FIELDS.some((field) =>
    source instanceof FormData
      ? source.has(field)
      : Object.prototype.hasOwnProperty.call(source, field));
}

interface SpeciesObservationInput {
  tripId: string;
  siteId: string;
  startedAt: string;
  endedAt: string;
  mode: string;
  anglerHours: number;
  keeperCount: number;
  shortReleasedCount: number;
  otherCatchCount: number;
  temporalPrecision?: "exact" | "bounded";
}

export function buildSpeciesObservationContract(input: SpeciesObservationInput) {
  const targetEncounterCount = input.keeperCount + input.shortReleasedCount;
  const targetIdentificationConfidence = targetEncounterCount > 0 ? "self_reported" : "not_observed";
  const taxonObservations = [
    {
      taxon_id: CALIFORNIA_HALIBUT_TAXON_ID,
      encounter_count: targetEncounterCount,
      retained_count: input.keeperCount,
      released_count: input.shortReleasedCount,
      disposition_unknown_count: 0,
      identification_confidence: targetIdentificationConfidence,
      identification_basis: targetEncounterCount > 0 ? "angler-report" : "not-observed",
    },
    ...(input.otherCatchCount > 0
      ? [{
          taxon_id: UNRESOLVED_FISH_TAXON_ID,
          encounter_count: input.otherCatchCount,
          retained_count: 0,
          released_count: 0,
          disposition_unknown_count: input.otherCatchCount,
          identification_confidence: "unresolved",
          identification_basis: "unresolved",
        }]
      : []),
  ];
  const outcomeClass = deriveObservationOutcomeClass(taxonObservations, CALIFORNIA_HALIBUT_TAXON_ID);
  const observation = {
    contract_version: OBSERVATION_CONTRACT_VERSION,
    taxon_catalog_version: TAXON_CATALOG_VERSION,
    contract_status: "valid",
    observation_id: input.tripId,
    effort_segment_id: `${input.tripId}:full-trip`,
    primary_target_taxon_id: CALIFORNIA_HALIBUT_TAXON_ID,
    source: {
      source_id: "castingcompass-trip-log",
      source_record_id: input.tripId,
      data_kind: "complete-effort-segment",
      complete_attempt: true,
      expanded_estimate: false,
    },
    target_effort: {
      value: input.anglerHours,
      unit: "angler-hours",
      mode: input.mode,
    },
    temporal_support: {
      start_at: input.startedAt,
      end_at: input.endedAt,
      precision: input.temporalPrecision ?? "bounded",
    },
    spatial_support: {
      kind: "site",
      support_id: input.siteId,
    },
    taxon_observations: taxonObservations,
    outcome_class: outcomeClass,
  } as const;

  assertObservationContract(observation, { environment: "production" });
  return observation;
}

export function buildSpeciesObservationFields(input: SpeciesObservationInput) {
  const observation = buildSpeciesObservationContract(input);
  const targetObservation = observation.taxon_observations.find(
    (row) => row.taxon_id === CALIFORNIA_HALIBUT_TAXON_ID,
  );
  if (!targetObservation) throw new Error("Validated observation is missing its target row");
  const anyFishEncounterCount = observation.taxon_observations.reduce(
    (total, row) => total + row.encounter_count,
    0,
  );
  return {
    observationContractVersion: OBSERVATION_CONTRACT_VERSION,
    taxonCatalogVersion: TAXON_CATALOG_VERSION,
    targetTaxonId: CALIFORNIA_HALIBUT_TAXON_ID,
    contractStatus: "valid" as const,
    taxonObservationsJson: JSON.stringify(observation.taxon_observations),
    outcomeClass: observation.outcome_class,
    targetEncounterCount: targetObservation.encounter_count,
    anyFishEncounterCount,
    targetIdentificationConfidence: targetObservation.identification_confidence,
  };
}

export function createTripStore(db: D1DatabaseLike): TripStore {
  const initialize = async () => {
    let pending = initializedDatabases.get(db as object);
    if (!pending) {
      pending = (async () => {
        await db.batch([db.prepare(CREATE_TRIPS_SQL)]);
        await db.batch(CREATE_INDEX_STATEMENTS.map((statement) => db.prepare(statement)));
      })().catch((error) => {
        initializedDatabases.delete(db as object);
        throw error;
      });
      initializedDatabases.set(db as object, pending);
    }
    await pending;
  };

  const getTrip = async (id: string) =>
    db.prepare("SELECT * FROM trips WHERE id = ? LIMIT 1").bind(id).first<TripRow>();

  return {
    initialize,

    async assertSubmissionAllowed(reporterKeyHash, now) {
      const hourCutoff = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const dayCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const activeCutoff = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
      const [hour, day, active] = await Promise.all([
        db
          .prepare("SELECT COUNT(*) AS count FROM trips WHERE reporter_key_hash = ? AND created_at >= ?")
          .bind(reporterKeyHash, hourCutoff)
          .first<{ count: number }>(),
        db
          .prepare("SELECT COUNT(*) AS count FROM trips WHERE reporter_key_hash = ? AND created_at >= ?")
          .bind(reporterKeyHash, dayCutoff)
          .first<{ count: number }>(),
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM trips WHERE reporter_key_hash = ? AND status = 'active' AND created_at >= ?",
          )
          .bind(reporterKeyHash, activeCutoff)
          .first<{ count: number }>(),
      ]);

      if (Number(hour?.count ?? 0) >= 8 || Number(day?.count ?? 0) >= 30 || Number(active?.count ?? 0) >= 3) {
        throw new RateLimitError();
      }
    },

    async insertTrip(record) {
      await db
        .prepare(INSERT_TRIP_SQL)
        .bind(
          record.id,
          record.userId,
          record.status,
          record.source,
          record.siteId,
          record.startedAt,
          record.endedAt,
          record.mode,
          record.fishingMethod,
          record.gear,
          record.gearProfileId,
          record.rod,
          record.reel,
          record.baitLure,
          record.rig,
          record.anglerCount,
          record.anglerHours,
          record.keeperCount,
          record.shortReleasedCount,
          record.halibutEncounters,
          record.noCatch === null ? null : Number(record.noCatch),
          record.otherCatchCount,
          record.otherSpecies,
          record.observationsJson,
          record.observationContractVersion,
          record.taxonCatalogVersion,
          record.targetTaxonId,
          record.contractStatus,
          record.taxonObservationsJson,
          record.outcomeClass,
          record.targetEncounterCount,
          record.anyFishEncounterCount,
          record.targetIdentificationConfidence,
          record.notes,
          Number(record.consent),
          record.consentAt,
          record.moderationStatus,
          record.reporterKeyHash,
          record.referralCode,
          record.tokenHash,
          record.opportunityWindowId,
          record.opportunityScore,
          record.habitatScore,
          record.seasonalityScore,
          record.conditionsScore,
          record.fishabilityScore,
          record.modelVersion,
          record.scoreInfluencedChoice === null ? null : Number(record.scoreInfluencedChoice),
          record.predictionMetadataJson,
          record.photoKey,
          record.photoContentType,
          record.photoSizeBytes,
          record.createdAt,
          record.updatedAt,
          record.completedAt,
        )
        .run();

      const inserted = await getTrip(record.id);
      if (!inserted) throw new Error("Trip insert did not return a record");
      return inserted;
    },

    getTrip,

    async completeTrip(id, tokenHash, completion) {
      const result = await db
        .prepare(`UPDATE trips SET
          status = 'completed',
          opportunity_window_id = CASE WHEN mode = ? THEN opportunity_window_id ELSE NULL END,
          opportunity_score = CASE WHEN mode = ? THEN opportunity_score ELSE NULL END,
          habitat_score = CASE WHEN mode = ? THEN habitat_score ELSE NULL END,
          seasonality_score = CASE WHEN mode = ? THEN seasonality_score ELSE NULL END,
          conditions_score = CASE WHEN mode = ? THEN conditions_score ELSE NULL END,
          fishability_score = CASE WHEN mode = ? THEN fishability_score ELSE NULL END,
          model_version = CASE WHEN mode = ? THEN model_version ELSE NULL END,
          prediction_metadata_json = CASE WHEN mode = ? THEN prediction_metadata_json ELSE NULL END,
          score_influenced_choice = CASE WHEN mode = ? THEN ? ELSE NULL END,
          ended_at = ?, mode = ?, fishing_method = ?, gear = ?,
          gear_profile_id = ?, rod = ?, reel = ?, bait_lure = ?, rig = ?,
          angler_count = ?, angler_hours = ?, keeper_count = ?, short_released_count = ?,
          halibut_encounters = ?, no_catch = ?, other_catch_count = ?, other_species = ?, observations_json = ?,
          observation_contract_version = ?, taxon_catalog_version = ?, target_taxon_id = ?,
          contract_status = ?, taxon_observations_json = ?, outcome_class = ?,
          target_encounter_count = ?, any_fish_encounter_count = ?, target_identification_confidence = ?,
          notes = ?, consent = 1, consent_at = ?,
          moderation_status = 'pending', photo_key = ?,
          photo_content_type = ?, photo_size_bytes = ?, updated_at = ?, completed_at = ?, token_hash = NULL
        WHERE id = ? AND status = 'active' AND token_hash = ?`)
        .bind(
          completion.mode,
          completion.mode,
          completion.mode,
          completion.mode,
          completion.mode,
          completion.mode,
          completion.mode,
          completion.mode,
          completion.mode,
          completion.scoreInfluencedChoice === null ? null : Number(completion.scoreInfluencedChoice),
          completion.endedAt,
          completion.mode,
          completion.fishingMethod,
          completion.gear,
          completion.gearProfileId,
          completion.rod,
          completion.reel,
          completion.baitLure,
          completion.rig,
          completion.anglerCount,
          completion.anglerHours,
          completion.keeperCount,
          completion.shortReleasedCount,
          completion.halibutEncounters,
          Number(completion.noCatch),
          completion.otherCatchCount,
          completion.otherSpecies,
          completion.observationsJson,
          completion.observationContractVersion,
          completion.taxonCatalogVersion,
          completion.targetTaxonId,
          completion.contractStatus,
          completion.taxonObservationsJson,
          completion.outcomeClass,
          completion.targetEncounterCount,
          completion.anyFishEncounterCount,
          completion.targetIdentificationConfidence,
          completion.notes,
          completion.consentAt,
          completion.photoKey,
          completion.photoContentType,
          completion.photoSizeBytes,
          completion.updatedAt,
          completion.updatedAt,
          id,
          tokenHash,
        )
        .run();

      if (Number(result.meta?.changes ?? 0) !== 1) return null;
      return getTrip(id);
    },

    async getSummary(now) {
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const row = await db
        .prepare(`SELECT
          COUNT(*) AS completed_trips,
          COALESCE(SUM(CASE WHEN no_catch = 1 THEN 1 ELSE 0 END), 0) AS no_catch_trips,
          COALESCE(SUM(CASE WHEN halibut_encounters > 0 THEN 1 ELSE 0 END), 0) AS halibut_trips,
          COALESCE(SUM(angler_hours), 0) AS angler_hours,
          COALESCE(SUM(halibut_encounters), 0) AS halibut_encounters,
          COUNT(DISTINCT site_id) AS sites_covered,
          MAX(updated_at) AS last_updated,
          COALESCE(SUM(CASE WHEN completed_at >= ? THEN 1 ELSE 0 END), 0) AS recent_completed_trips,
          COALESCE(SUM(CASE WHEN completed_at >= ? THEN angler_hours ELSE 0 END), 0) AS recent_angler_hours,
          COALESCE(SUM(CASE WHEN completed_at >= ? THEN halibut_encounters ELSE 0 END), 0) AS recent_halibut_encounters,
          COUNT(DISTINCT CASE WHEN completed_at >= ? THEN site_id END) AS recent_sites_covered
        FROM trips
        WHERE status = 'completed' AND consent = 1 AND moderation_status != 'rejected'
          AND contract_status = 'valid' AND observation_contract_version = ?
          AND taxon_catalog_version = ? AND target_taxon_id = ?`)
        .bind(
          cutoff,
          cutoff,
          cutoff,
          cutoff,
          OBSERVATION_CONTRACT_VERSION,
          TAXON_CATALOG_VERSION,
          CALIFORNIA_HALIBUT_TAXON_ID,
        )
        .first<{
          completed_trips: number;
          no_catch_trips: number;
          halibut_trips: number;
          angler_hours: number;
          halibut_encounters: number;
          sites_covered: number;
          last_updated: string | null;
          recent_completed_trips: number;
          recent_angler_hours: number;
          recent_halibut_encounters: number;
          recent_sites_covered: number;
        }>();

      return {
        completedTrips: Number(row?.completed_trips ?? 0),
        noCatchTrips: Number(row?.no_catch_trips ?? 0),
        halibutTrips: Number(row?.halibut_trips ?? 0),
        totalHalibut: Number(row?.halibut_encounters ?? 0),
        anglerHours: round(Number(row?.angler_hours ?? 0), 2),
        halibutEncounters: Number(row?.halibut_encounters ?? 0),
        sitesCovered: Number(row?.sites_covered ?? 0),
        lastUpdated: row?.last_updated ?? null,
        past24Hours: {
          completedTrips: Number(row?.recent_completed_trips ?? 0),
          anglerHours: round(Number(row?.recent_angler_hours ?? 0), 2),
          halibutEncounters: Number(row?.recent_halibut_encounters ?? 0),
          sitesCovered: Number(row?.recent_sites_covered ?? 0),
        },
      };
    },
  };
}

export async function handleTripRequest(
  request: Request,
  env: TripApiEnv,
  curatedSites: readonly CuratedSite[],
  options: TripHandlerOptions = {},
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/trips")) return null;

  const now = options.now?.() ?? new Date();
  const siteMap = new Map(curatedSites.map((site) => [site.id, site]));

  try {
    const store = options.store ?? (env.DB ? createTripStore(env.DB) : null);
    if (!store) throw new ApiError(503, "storage_unavailable", "Trip storage is temporarily unavailable.");
    await store.initialize();

    if (url.pathname === "/api/trips/summary") {
      if (request.method !== "GET") return methodNotAllowed("GET");
      return jsonResponse(await store.getSummary(now));
    }

    if (request.method !== "POST") return methodNotAllowed("POST");
    assertSameOrigin(request);

    if (url.pathname === "/api/trips/start") {
      assertContentType(request, "application/json");
      assertBodySize(request, 64 * 1024);
      const body = await readJsonObject(request);
      assertHoneypot(body.website);
      assertConsent(body.consent);
      assertNoObservationContractOverride(body);

      const reporter = await getOrCreateReporter(request, body.reporterKey);
      await store.assertSubmissionAllowed(reporter.hash, now);
      const site = getSite(siteMap, body.siteId);
      const startedAt = parseStartDate(body.startedAt, now, 48);
      const token = randomSecret();
      const timestamp = now.toISOString();
      const prediction = parsePrediction(body);

      const trip = await store.insertTrip({
        id: `trip_${crypto.randomUUID()}`,
        userId: options.accountId ?? null,
        status: "active",
        source: "live",
        siteId: site.id,
        startedAt,
        endedAt: null,
        mode: parseMode(body.mode, defaultMode(site)),
        fishingMethod: optionalText(body.method ?? body.fishingMethod, "method", 80),
        ...parseTripDetails(body),
        anglerCount: parseInteger(body.anglerCount, "anglerCount", 1, 12, 1),
        anglerHours: null,
        keeperCount: null,
        shortReleasedCount: null,
        halibutEncounters: null,
        noCatch: null,
        observationContractVersion: null,
        taxonCatalogVersion: null,
        targetTaxonId: CALIFORNIA_HALIBUT_TAXON_ID,
        contractStatus: null,
        taxonObservationsJson: null,
        outcomeClass: null,
        targetEncounterCount: null,
        anyFishEncounterCount: null,
        targetIdentificationConfidence: null,
        notes: null,
        consent: true,
        consentAt: timestamp,
        moderationStatus: "pending",
        reporterKeyHash: reporter.hash,
        referralCode: parseReferralCode(body.referralCode),
        tokenHash: await sha256(token),
        ...prediction,
        photoKey: null,
        photoContentType: null,
        photoSizeBytes: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null,
      });

      return jsonResponse({ trip: publicTrip(trip), token }, 201, reporter.setCookie);
    }

    const completionMatch = url.pathname.match(/^\/api\/trips\/([^/]+)\/complete$/);
    if (completionMatch) {
      assertContentType(request, "multipart/form-data");
      assertBodySize(request, MAX_MULTIPART_BYTES);
      const form = await request.formData();
      assertHoneypot(form.get("website"));
      assertNoObservationContractOverride(form);
      const id = completionMatch[1];
      if (!/^trip_[a-f0-9-]{36}$/.test(id)) {
        throw new ApiError(404, "trip_not_found", "The active trip could not be found.");
      }
      const token = requiredText(form.get("token"), "token", 160);
      if (!/^[A-Za-z0-9_-]{40,160}$/.test(token)) {
        throw new ApiError(404, "trip_not_found", "The active trip could not be found.");
      }

      const existing = await store.getTrip(id);
      if (!existing || existing.status !== "active") {
        throw new ApiError(404, "trip_not_found", "The active trip could not be found.");
      }

      const endedAt = parseEndDate(form.get("endedAt"), now);
      const durationHours = validateDuration(existing.started_at, endedAt, 36);
      const anglerCount = parseInteger(form.get("anglerCount"), "anglerCount", 1, 12, existing.angler_count);
      const keeperCount = parseInteger(form.get("keeperCount"), "keeperCount", 0, 25, 0);
      const shortReleasedCount = parseInteger(
        form.get("shortReleasedCount"),
        "shortReleasedCount",
        0,
        25,
        0,
      );
      if (keeperCount + shortReleasedCount > 40) {
        throw new ApiError(422, "invalid_counts", "Combined halibut encounters cannot exceed 40.");
      }
      const details = parseTripDetails(form, existing);
      assertOtherSpeciesCountConsistency(details.otherCatchCount, details.otherSpecies);
      const mode = parseMode(form.get("mode"), existing.mode);
      const forecastAttributionCleared = mode !== existing.mode;
      const anglerHours = round(durationHours * anglerCount, 2);
      const speciesObservation = buildSpeciesObservationFields({
        tripId: existing.id,
        siteId: existing.site_id,
        startedAt: existing.started_at,
        endedAt,
        mode,
        anglerHours,
        keeperCount,
        shortReleasedCount,
        otherCatchCount: details.otherCatchCount,
      });
      if (form.has("consent")) assertConsent(form.get("consent"));
      const uploaded = await processPhoto(form.get("photo"), id, env);

      try {
        const completed = await store.completeTrip(id, await sha256(token), {
          endedAt,
          mode,
          fishingMethod:
            optionalText(form.get("method") ?? form.get("fishingMethod"), "method", 80) ??
            existing.fishing_method,
          ...details,
          anglerCount,
          anglerHours,
          keeperCount,
          shortReleasedCount,
          halibutEncounters: keeperCount + shortReleasedCount,
          noCatch: speciesObservation.anyFishEncounterCount === 0,
          ...speciesObservation,
          notes: optionalText(form.get("notes"), "notes", 1000),
          consentAt: now.toISOString(),
          scoreInfluencedChoice:
            optionalBoolean(
              form.get("scoreInfluencedChoice") ?? form.get("contourCastInfluenced"),
              "scoreInfluencedChoice",
            ) ??
            (existing.score_influenced_choice === null
              ? null
              : Boolean(existing.score_influenced_choice)),
          photoKey: uploaded?.key ?? null,
          photoContentType: uploaded?.contentType ?? null,
          photoSizeBytes: uploaded?.size ?? null,
          updatedAt: now.toISOString(),
        });

        if (!completed) {
          throw new ApiError(404, "trip_not_found", "The active trip could not be found.");
        }
        options.onTripCompleted?.(completed);
        return jsonResponse({ trip: publicTrip(completed), forecastAttributionCleared });
      } catch (error) {
        if (uploaded) await env.TRIP_PHOTOS?.delete(uploaded.key).catch(() => undefined);
        throw error;
      }
    }

    if (url.pathname === "/api/trips/report") {
      assertContentType(request, "multipart/form-data");
      assertBodySize(request, MAX_MULTIPART_BYTES);
      const form = await request.formData();
      assertHoneypot(form.get("website"));
      assertConsent(form.get("consent"));
      assertNoObservationContractOverride(form);

      const reporter = await getOrCreateReporter(request, form.get("reporterKey"));
      await store.assertSubmissionAllowed(reporter.hash, now);
      const site = getSite(siteMap, form.get("siteId"));
      const startedAt = parseHistoricalStartDate(form.get("startedAt"), now);
      const endedAt = parseEndDate(form.get("endedAt"), now);
      const durationHours = validateDuration(startedAt, endedAt, 36);
      const anglerCount = parseInteger(form.get("anglerCount"), "anglerCount", 1, 12, 1);
      const keeperCount = parseInteger(form.get("keeperCount"), "keeperCount", 0, 25, 0);
      const shortReleasedCount = parseInteger(
        form.get("shortReleasedCount"),
        "shortReleasedCount",
        0,
        25,
        0,
      );
      if (keeperCount + shortReleasedCount > 40) {
        throw new ApiError(422, "invalid_counts", "Combined halibut encounters cannot exceed 40.");
      }

      const id = `trip_${crypto.randomUUID()}`;
      const timestamp = now.toISOString();
      const mode = parseMode(form.get("mode"), defaultMode(site));
      const details = parseTripDetails(form);
      assertOtherSpeciesCountConsistency(details.otherCatchCount, details.otherSpecies);
      const anglerHours = round(durationHours * anglerCount, 2);
      const speciesObservation = buildSpeciesObservationFields({
        tripId: id,
        siteId: site.id,
        startedAt,
        endedAt,
        mode,
        anglerHours,
        keeperCount,
        shortReleasedCount,
        otherCatchCount: details.otherCatchCount,
      });
      const uploaded = await processPhoto(form.get("photo"), id, env);

      try {
        const trip = await store.insertTrip({
          id,
          userId: options.accountId ?? null,
          status: "completed",
          source: "past_report",
          siteId: site.id,
          startedAt,
          endedAt,
          mode,
          fishingMethod: optionalText(form.get("method") ?? form.get("fishingMethod"), "method", 80),
          ...details,
          anglerCount,
          anglerHours,
          keeperCount,
          shortReleasedCount,
          halibutEncounters: keeperCount + shortReleasedCount,
          noCatch: speciesObservation.anyFishEncounterCount === 0,
          ...speciesObservation,
          notes: optionalText(form.get("notes"), "notes", 1000),
          consent: true,
          consentAt: timestamp,
          moderationStatus: "pending",
          reporterKeyHash: reporter.hash,
          referralCode: parseReferralCode(form.get("referralCode")),
          tokenHash: null,
          ...parsePrediction(form),
          photoKey: uploaded?.key ?? null,
          photoContentType: uploaded?.contentType ?? null,
          photoSizeBytes: uploaded?.size ?? null,
          createdAt: timestamp,
          updatedAt: timestamp,
          completedAt: timestamp,
        });
        options.onTripCompleted?.(trip);
        return jsonResponse({ trip: publicTrip(trip) }, 201, reporter.setCookie);
      } catch (error) {
        if (uploaded) await env.TRIP_PHOTOS?.delete(uploaded.key).catch(() => undefined);
        throw error;
      }
    }

    return jsonResponse({ error: { code: "not_found", message: "API route not found." } }, 404);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return jsonResponse(
        { error: { code: "rate_limited", message: error.message } },
        429,
        undefined,
        { "Retry-After": "3600" },
      );
    }
    if (error instanceof ApiError) {
      return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
    }
    console.error("Trip API request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonResponse(
      { error: { code: "internal_error", message: "The trip could not be saved right now." } },
      500,
    );
  }
}

function publicTrip(row: TripRow) {
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    siteId: row.site_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    mode: row.mode,
    fishingMethod: row.fishing_method,
    gear: row.gear,
    gearProfileId: row.gear_profile_id,
    rod: row.rod,
    reel: row.reel,
    baitLure: row.bait_lure,
    rig: row.rig,
    anglerCount: row.angler_count,
    anglerHours: row.angler_hours,
    keeperCount: row.keeper_count,
    shortReleasedCount: row.short_released_count,
    halibutEncounters: row.halibut_encounters,
    noCatch: row.no_catch === null ? null : Boolean(row.no_catch),
    otherCatchCount: row.other_catch_count,
    otherSpecies: row.other_species,
    observations: safeJsonValue(row.observations_json),
    observationContractVersion: row.observation_contract_version,
    taxonCatalogVersion: row.taxon_catalog_version,
    targetTaxonId: row.target_taxon_id,
    contractStatus: row.contract_status,
    taxonObservations: safeJsonValue(row.taxon_observations_json),
    outcomeClass: row.outcome_class,
    targetEncounterCount: row.target_encounter_count,
    anyFishEncounterCount: row.any_fish_encounter_count,
    targetIdentificationConfidence: row.target_identification_confidence,
    notes: row.notes,
    consent: Boolean(row.consent),
    moderationStatus: row.moderation_status,
    referralCode: row.referral_code,
    opportunityWindowId: row.opportunity_window_id,
    opportunityScore: row.opportunity_score,
    habitatScore: row.habitat_score,
    seasonalityScore: row.seasonality_score,
    conditionsScore: row.conditions_score,
    fishabilityScore: row.fishability_score,
    modelVersion: row.model_version,
    scoreInfluencedChoice:
      row.score_influenced_choice === null ? null : Boolean(row.score_influenced_choice),
    hasPhoto: Boolean(row.photo_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseTripDetails(source: Record<string, unknown> | FormData, existing?: TripRow) {
  const value = (key: string) => (source instanceof FormData ? source.get(key) : source[key]);
  const observations = {
    shorebreak: optionalText(value("shorebreak"), "shorebreak", 40),
    wadingDepth: optionalText(value("wadingDepth"), "wadingDepth", 40),
    waterClarity: optionalText(value("waterClarity"), "waterClarity", 40),
    crowding: optionalText(value("crowding"), "crowding", 40),
    fishabilityRating: optionalNumber(value("fishabilityRating"), "fishabilityRating", 1, 5),
    observedWaveHeightFeet: optionalNumber(value("observedWaveHeightFeet"), "observedWaveHeightFeet", 0, 30),
    fishabilityNotes: optionalText(value("fishabilityNotes"), "fishabilityNotes", 500),
  };
  const hasObservations = Object.values(observations).some((entry) => entry !== null);
  return {
    gear: optionalText(value("gear"), "gear", 300) ?? existing?.gear ?? null,
    gearProfileId: optionalText(value("gearProfileId"), "gearProfileId", 80) ?? existing?.gear_profile_id ?? null,
    rod: optionalText(value("rod"), "rod", 160) ?? existing?.rod ?? null,
    reel: optionalText(value("reel"), "reel", 160) ?? existing?.reel ?? null,
    baitLure: optionalText(value("baitLure"), "baitLure", 200) ?? existing?.bait_lure ?? null,
    rig: optionalText(value("rig"), "rig", 200) ?? existing?.rig ?? null,
    otherCatchCount: parseInteger(value("otherCatchCount"), "otherCatchCount", 0, 100, existing?.other_catch_count ?? 0),
    otherSpecies: optionalText(value("otherSpecies"), "otherSpecies", 200) ?? existing?.other_species ?? null,
    observationsJson: hasObservations ? JSON.stringify(observations) : existing?.observations_json ?? null,
  };
}

function parsePrediction(source: Record<string, unknown> | FormData) {
  const value = (key: string) => (source instanceof FormData ? source.get(key) : source[key]);
  const metadata = value("predictionMetadata");
  let predictionMetadataJson: string | null = null;
  if (metadata !== null && metadata !== undefined && metadata !== "") {
    try {
      const rawMetadata = typeof metadata === "string" ? metadata : JSON.stringify(metadata);
      if (typeof rawMetadata !== "string" || rawMetadata.length > 4096) throw new Error("too long");
      const parsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
      const minimized = minimizeForecastMetadata(parsed);
      if (!minimized) throw new Error("invalid shape");
      predictionMetadataJson = JSON.stringify(minimized);
    } catch {
      throw new ApiError(422, "invalid_prediction_metadata", "predictionMetadata must be valid JSON under 4 KB.");
    }
  }

  return {
    opportunityWindowId: optionalText(value("opportunityWindowId"), "opportunityWindowId", 120),
    opportunityScore: optionalNumber(value("opportunityScore"), "opportunityScore", 0, 100),
    habitatScore: optionalNumber(value("habitatScore"), "habitatScore", 0, 100),
    seasonalityScore: optionalNumber(value("seasonalityScore"), "seasonalityScore", 0, 100),
    conditionsScore: optionalNumber(value("conditionsScore"), "conditionsScore", 0, 100),
    fishabilityScore: optionalNumber(value("fishabilityScore"), "fishabilityScore", 0, 100),
    modelVersion: optionalText(value("modelVersion"), "modelVersion", 120),
    scoreInfluencedChoice: optionalBoolean(
      value("scoreInfluencedChoice") ?? value("contourCastInfluenced"),
      "scoreInfluencedChoice",
    ),
    predictionMetadataJson,
  };
}

function safeJsonValue(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

async function processPhoto(entry: FormDataEntryValue | null, tripId: string, env: TripApiEnv) {
  if (entry === null || entry === "") return null;
  if (env.TRIP_PHOTO_UPLOADS_ENABLED?.trim().toLowerCase() !== "true") {
    throw new ApiError(503, "photo_uploads_disabled", "Photo uploads are not enabled.");
  }
  if (typeof entry === "string") {
    throw new ApiError(422, "invalid_photo", "photo must be an uploaded image.");
  }
  if (entry.size === 0) return null;
  if (entry.size > MAX_PHOTO_BYTES) {
    throw new ApiError(413, "photo_too_large", "Photos must be 5 MB or smaller.");
  }
  if (!ALLOWED_IMAGE_TYPES.has(entry.type)) {
    throw new ApiError(415, "invalid_photo_type", "Photos must be JPEG, PNG, or WebP.");
  }

  const signature = new Uint8Array(await entry.slice(0, 16).arrayBuffer());
  if (!matchesImageSignature(signature, entry.type)) {
    throw new ApiError(415, "invalid_photo_type", "The uploaded file does not match its image type.");
  }
  if (!env.IMAGES || !env.TRIP_PHOTOS) {
    throw new ApiError(503, "photo_storage_unavailable", "Photo uploads are temporarily unavailable.");
  }

  let transformed: Response;
  try {
    const output = await env.IMAGES.input(entry.stream()).transform({
      width: 2048,
      height: 2048,
      fit: "scale-down",
    }).output({ format: "image/webp", quality: 82 });
    transformed = output.response();
  } catch {
    throw new ApiError(422, "photo_processing_failed", "The photo could not be processed.");
  }

  if (!transformed.ok) {
    throw new ApiError(422, "photo_processing_failed", "The photo could not be processed.");
  }
  const bytes = await transformed.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new ApiError(422, "photo_processing_failed", "The processed photo is invalid or too large.");
  }

  const date = new Date();
  const key = `trip-photos/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${tripId}/${crypto.randomUUID()}.webp`;
  await env.TRIP_PHOTOS.put(key, bytes, {
    httpMetadata: { contentType: "image/webp" },
    customMetadata: { tripId, privacy: "exif-stripped" },
  });
  return { key, contentType: "image/webp", size: bytes.byteLength };
}

export function minimizeForecastMetadata(value: unknown) {
  if (!isRecord(value)) return null;

  const minimized: Record<string, unknown> = {};
  addBoundedText(minimized, "snapshotGeneratedAt", value.snapshotGeneratedAt, 40);
  addBoundedText(minimized, "forecastStart", value.forecastStart, 40);
  addBoundedText(minimized, "forecastEnd", value.forecastEnd, 40);
  if (value.confidence === "low" || value.confidence === "medium" || value.confidence === "high") {
    minimized.confidence = value.confidence;
  }

  if (isRecord(value.forecastConditions)) {
    const source = value.forecastConditions;
    const conditions: Record<string, unknown> = {};
    addBoundedText(conditions, "tideStage", source.tideStage, 40);
    addNumber(conditions, "tideChangeFeet", source.tideChangeFeet, -20, 20);
    if (Array.isArray(source.tideLevelsFeet)) {
      const levels = source.tideLevelsFeet
        .filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry))
        .slice(0, 4)
        .map((entry) => Math.max(-20, Math.min(30, entry)));
      if (levels.length) conditions.tideLevelsFeet = levels;
    }
    addNumber(conditions, "currentKnots", source.currentKnots, 0, 20);
    addNumber(conditions, "currentDirectionDegrees", source.currentDirectionDegrees, 0, 360);
    addBoundedText(conditions, "currentDirection", source.currentDirection, 12);
    addNumber(conditions, "windMph", source.windMph, 0, 200);
    addBoundedText(conditions, "windDirection", source.windDirection, 12);
    addNumber(conditions, "swellFeet", source.swellFeet, 0, 100);
    addNumber(conditions, "swellPeriodSeconds", source.swellPeriodSeconds, 0, 60);
    addNumber(conditions, "swellDirectionDegrees", source.swellDirectionDegrees, 0, 360);
    addBoundedText(conditions, "swellDirection", source.swellDirection, 12);
    addNumber(conditions, "wavePowerKwM", source.wavePowerKwM, 0, 1_000);
    addBoundedText(conditions, "breakingIntensity", source.breakingIntensity, 24);
    addNumber(conditions, "breakingWaveHeightFeet", source.breakingWaveHeightFeet, 0, 100);
    addBoundedText(conditions, "fishabilityLabel", source.fishabilityLabel, 30);
    if (Array.isArray(source.fishabilityReasons)) {
      const reasons = source.fishabilityReasons
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim().slice(0, 240))
        .filter(Boolean)
        .slice(0, 6);
      if (reasons.length) conditions.fishabilityReasons = reasons;
    }
    addNumber(conditions, "waterTempF", source.waterTempF, -20, 150);
    addBoundedText(conditions, "waterTempSource", source.waterTempSource, 80);
    addNumber(conditions, "ndbcObservedWaterTempF", source.ndbcObservedWaterTempF, -20, 150);
    addBoundedText(conditions, "ndbcObservedAt", source.ndbcObservedAt, 40);
    if (typeof source.daylight === "boolean") conditions.daylight = source.daylight;
    addNumber(conditions, "cloudCoverPct", source.cloudCoverPct, 0, 100);
    addNumber(conditions, "pressureHpa", source.pressureHpa, 800, 1_200);
    addNumber(conditions, "pressureTrendHpa3h", source.pressureTrendHpa3h, -100, 100);
    addBoundedText(conditions, "pressureObservedAt", source.pressureObservedAt, 40);
    addBoundedText(conditions, "moonPhase", source.moonPhase, 40);
    addNumber(conditions, "moonIlluminationPct", source.moonIlluminationPct, 0, 100);
    addBoundedText(conditions, "fishingPressure", source.fishingPressure, 24);
    addNumber(conditions, "fishingPressurePct", source.fishingPressurePct, 0, 100);
    addNumber(conditions, "accessAdjustmentPoints", source.accessAdjustmentPoints, -100, 100);
    addBoundedText(conditions, "fishingPressureBasis", source.fishingPressureBasis, 160);
    addBoundedText(conditions, "summary", source.summary, 300);
    minimized.forecastConditions = conditions;
  }

  return minimized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function addBoundedText(target: Record<string, unknown>, key: string, value: unknown, maximum: number) {
  if (typeof value !== "string") return;
  const text = value.trim().slice(0, maximum);
  if (text) target[key] = text;
}

function addNumber(target: Record<string, unknown>, key: string, value: unknown, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  target[key] = Math.max(minimum, Math.min(maximum, value));
}

function matchesImageSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  let normalizedOrigin: string;
  try {
    normalizedOrigin = origin ? new URL(origin).origin : "";
  } catch {
    normalizedOrigin = "";
  }
  if (!normalizedOrigin || normalizedOrigin !== new URL(request.url).origin) {
    throw new ApiError(403, "invalid_origin", "Trip submissions must come from CastingCompass.");
  }
}

function assertContentType(request: Request, expected: string) {
  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith(expected)) {
    throw new ApiError(415, "unsupported_media_type", `Expected ${expected}.`);
  }
}

function assertBodySize(request: Request, maximum: number) {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximum) {
    throw new ApiError(413, "payload_too_large", "The trip submission is too large.");
  }
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "invalid_json", "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

function assertHoneypot(value: unknown) {
  if (value !== null && value !== undefined && String(value).trim() !== "") {
    throw new ApiError(422, "invalid_submission", "The trip submission could not be accepted.");
  }
}

function assertNoObservationContractOverride(source: Record<string, unknown> | FormData) {
  if (hasServerControlledObservationFields(source)) {
    throw new ApiError(
      422,
      "observation_contract_override_forbidden",
      "The trip target and observation contract are controlled by CastingCompass.",
    );
  }
}

function assertOtherSpeciesCountConsistency(otherCatchCount: number, otherSpecies: string | null) {
  if (otherCatchCount === 0 && otherSpecies) {
    throw new ApiError(
      422,
      "invalid_other_species",
      "Enter an other-fish count when describing a non-halibut catch.",
    );
  }
}

function getSite(siteMap: Map<string, CuratedSite>, value: unknown) {
  const id = requiredText(value, "siteId", 120);
  const site = siteMap.get(id);
  if (!site) throw new ApiError(422, "invalid_site", "Choose a current CastingCompass location.");
  return site;
}

function defaultMode(site: CuratedSite) {
  const type = site.type?.toLowerCase() ?? "shore";
  if (type.includes("pier")) return "pier";
  if (type.includes("beach")) return "beach";
  if (type.includes("jetty")) return "jetty";
  return "shore";
}

function parseMode(value: unknown, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback;
  const mode = String(value).trim().toLowerCase();
  if (!ALLOWED_MODES.has(mode)) {
    throw new ApiError(422, "invalid_mode", "Choose a supported fishing mode.");
  }
  return mode;
}

function parseStartDate(value: unknown, now: Date, maximumPastHours: number) {
  const date = value === null || value === undefined || value === "" ? now : parseDate(value, "startedAt");
  if (date.getTime() > now.getTime() + 15 * 60 * 1000) {
    throw new ApiError(422, "invalid_started_at", "startedAt cannot be in the future.");
  }
  if (date.getTime() < now.getTime() - maximumPastHours * 60 * 60 * 1000) {
    throw new ApiError(422, "invalid_started_at", "Use Log a past trip for an older trip.");
  }
  return date.toISOString();
}

function parseHistoricalStartDate(value: unknown, now: Date) {
  const date = parseDate(value, "startedAt");
  if (date.getTime() > now.getTime() + 15 * 60 * 1000) {
    throw new ApiError(422, "invalid_started_at", "startedAt cannot be in the future.");
  }
  if (date.getTime() < now.getTime() - 5 * 365.25 * 24 * 60 * 60 * 1000) {
    throw new ApiError(422, "invalid_started_at", "Past reports are limited to the last five years.");
  }
  return date.toISOString();
}

function parseEndDate(value: unknown, now: Date) {
  const date = value === null || value === undefined || value === "" ? now : parseDate(value, "endedAt");
  if (date.getTime() > now.getTime() + 15 * 60 * 1000) {
    throw new ApiError(422, "invalid_ended_at", "endedAt cannot be in the future.");
  }
  return date.toISOString();
}

function parseDate(value: unknown, field: string) {
  if (typeof value !== "string" || value.length > 80) {
    throw new ApiError(422, `invalid_${field}`, `${field} must be an ISO date and time.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new ApiError(422, `invalid_${field}`, `${field} must be an ISO date and time.`);
  }
  return date;
}

function validateDuration(startedAt: string, endedAt: string, maximumHours: number) {
  const durationHours = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / (60 * 60 * 1000);
  if (!Number.isFinite(durationHours) || durationHours < 1 / 60 || durationHours > maximumHours) {
    throw new ApiError(422, "invalid_duration", `Trip duration must be between 1 minute and ${maximumHours} hours.`);
  }
  return durationHours;
}

function requiredText(value: unknown, field: string, maximum: number) {
  if (typeof value !== "string" || value.trim() === "" || value.trim().length > maximum) {
    throw new ApiError(422, `invalid_${field}`, `${field} is required and must be under ${maximum} characters.`);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > maximum) {
    throw new ApiError(422, `invalid_${field}`, `${field} must be under ${maximum} characters.`);
  }
  return value.trim() || null;
}

function parseInteger(value: unknown, field: string, minimum: number, maximum: number, fallback: number) {
  if (value === null || value === undefined || value === "") return fallback;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new ApiError(422, `invalid_${field}`, `${field} must be a whole number from ${minimum} to ${maximum}.`);
  }
  return number;
}

function optionalNumber(value: unknown, field: string, minimum: number, maximum: number) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new ApiError(422, `invalid_${field}`, `${field} must be from ${minimum} to ${maximum}.`);
  }
  return number;
}

function optionalBoolean(value: unknown, field: string): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === "on") return true;
  if (value === "false" || value === "0" || value === "off") return false;
  throw new ApiError(422, `invalid_${field}`, `${field} must be true or false.`);
}

function assertConsent(value: unknown) {
  if (optionalBoolean(value, "consent") !== true) {
    throw new ApiError(422, "consent_required", "Consent is required to contribute a trip report.");
  }
}

function parseReferralCode(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value.trim())) {
    throw new ApiError(
      422,
      "invalid_referral_code",
      "referralCode must be a short link code using letters, numbers, hyphens, or underscores.",
    );
  }
  return value.trim().toLowerCase();
}

async function getOrCreateReporter(request: Request, suppliedKey?: unknown) {
  const cookies = parseCookies(request.headers.get("Cookie") ?? "");
  let raw: string | undefined;
  let setCookie: string | undefined;
  let supplied = false;
  if (suppliedKey !== null && suppliedKey !== undefined && suppliedKey !== "") {
    if (typeof suppliedKey !== "string" || !/^[A-Za-z0-9_-]{20,200}$/.test(suppliedKey)) {
      throw new ApiError(422, "invalid_reporter_key", "reporterKey is not a valid anonymous device key.");
    }
    raw = suppliedKey;
    supplied = true;
  } else {
    raw = cookies.get(REPORTER_COOKIE);
  }
  if (!supplied && (!raw || !/^[A-Za-z0-9_-]{40,160}$/.test(raw))) {
    raw = randomSecret();
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    setCookie = `${REPORTER_COOKIE}=${raw}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict${secure}`;
  }
  if (!raw) throw new Error("Anonymous reporter key generation failed");
  return { hash: await sha256(raw), setCookie };
}

function parseCookies(header: string) {
  const cookies = new Map<string, string>();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function methodNotAllowed(allow: string) {
  return jsonResponse(
    { error: { code: "method_not_allowed", message: `Use ${allow} for this endpoint.` } },
    405,
    undefined,
    { Allow: allow },
  );
}

function jsonResponse(
  body: unknown,
  status = 200,
  setCookie?: string,
  extraHeaders: Record<string, string> = {},
) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  if (setCookie) headers.set("Set-Cookie", setCookie);
  return new Response(JSON.stringify(body), { status, headers });
}
