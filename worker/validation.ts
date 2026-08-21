import {
  CALIFORNIA_HALIBUT_TAXON_ID,
  MODEL_RUN_CONTRACT_VERSION,
  OBSERVATION_CONTRACT_VERSION,
  OPPORTUNITY_CONTRACT_VERSION,
  TAXON_CATALOG_VERSION,
} from "../shared/species-contract.ts";

export const OPPORTUNITY_ATTESTATION_INDEX_VERSION =
  "castingcompass.opportunity-attestation-index/1.0.0" as const;
export const VALIDATION_COLLECTION_CONTRACT_VERSION =
  "castingcompass.validation-collection/1.0.0" as const;
export const TRIP_VALIDATION_CONSENT_VERSION =
  "castingcompass.trip-validation-consent/1.0.0" as const;
export const DEFAULT_INCENTIVE_POLICY_ID = "none-v1" as const;
export const DEFAULT_VALIDATION_COHORT_ID = "predeployment-context" as const;

const ATTESTATION_PATH = "/data/opportunity-attestations.json";
const OPPORTUNITY_SNAPSHOT_PATH = "/data/opportunities.json";
const MAX_ATTESTATION_BYTES = 512 * 1024;
const MAX_OPPORTUNITY_SNAPSHOT_BYTES = 5 * 1024 * 1024;
const MAX_ATTESTATION_WINDOWS = 5_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SITE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WINDOW_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*--\d{8}T\d{4}Z$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SUPPORTED_SCORING_SYSTEM_KIND = "heuristic-configuration";

export interface AssetFetcherLike {
  fetch(request: Request): Promise<Response>;
}

export interface AttestedOpportunity {
  snapshotSha256: string;
  siteCatalogSha256: string;
  targetTaxonId: typeof CALIFORNIA_HALIBUT_TAXON_ID;
  taxonCatalogVersion: typeof TAXON_CATALOG_VERSION;
  observationContractVersion: typeof OBSERVATION_CONTRACT_VERSION;
  modelRunContractVersion: typeof MODEL_RUN_CONTRACT_VERSION;
  opportunityContractVersion: typeof OPPORTUNITY_CONTRACT_VERSION;
  scoringSystemKind: string;
  scoringSystemVersion: string;
  scoringSystemSha256: string;
  generatedAt: string;
  windowId: string;
  siteId: string;
  windowStart: string;
  windowEnd: string;
  opportunityScore: number;
  habitatScore: number;
  seasonalityScore: number;
  conditionsScore: number;
  fishabilityScore: number;
  /** A bounded, immutable copy of the published conditions for this window. */
  conditions?: OpportunityConditionsSnapshot;
}

export interface OpportunityConditionsSnapshot {
  tideStage?: string;
  tideLevelsFeet?: number[];
  currentKnots?: number;
  currentDirectionDegrees?: number;
  currentDirection?: string;
  windMph?: number;
  fishabilityLabel?: string;
  fishabilityReasons?: string[];
  waterTempF?: number;
  daylight?: boolean;
  cloudCoverPct?: number;
  pressureHpa?: number;
  pressureTrendHpa3h?: number;
  moonPhase?: string;
  moonIlluminationPct?: number;
  fishingPressure?: string;
  fishingPressurePct?: number;
  accessAdjustmentPoints?: number;
  swellFeet?: number;
  swellPeriodSeconds?: number;
  swellDirectionDegrees?: number;
  swellDirection?: string;
  wavePowerKwM?: number;
  breakingIntensity?: string;
  breakingWaveHeightFeet?: number;
}

export type OpportunityAttestationStatus =
  | "verified"
  | "unverified_missing"
  | "unverified_mismatch"
  | "unverified_asset";

export interface OpportunityAttestationResult {
  status: OpportunityAttestationStatus;
  opportunity: AttestedOpportunity | null;
}

interface ParsedAttestationIndex {
  windows: Map<string, AttestedOpportunity>;
}

const attestationCache = new WeakMap<object, Promise<ParsedAttestationIndex>>();
const opportunitySnapshotCache = new WeakMap<object, Promise<{
  snapshotSha256: string;
  windows: Map<string, Record<string, unknown>>;
}>>();

export async function verifyOpportunityAttestation(
  assets: AssetFetcherLike | undefined,
  requestUrl: string,
  input: { windowId: unknown; siteId: string; startedAt: string },
): Promise<OpportunityAttestationResult> {
  if (typeof input.windowId !== "string" || !WINDOW_ID_PATTERN.test(input.windowId)) {
    return { status: "unverified_missing", opportunity: null };
  }
  if (!assets) return { status: "unverified_asset", opportunity: null };

  let index: ParsedAttestationIndex;
  try {
    index = await loadAttestationIndex(assets, requestUrl);
  } catch {
    return { status: "unverified_asset", opportunity: null };
  }
  const opportunity = index.windows.get(input.windowId);
  if (!opportunity) return { status: "unverified_missing", opportunity: null };
  const startedAt = Date.parse(input.startedAt);
  const windowStart = Date.parse(opportunity.windowStart);
  const windowEnd = Date.parse(opportunity.windowEnd);
  if (
    opportunity.siteId !== input.siteId ||
    !Number.isFinite(startedAt) ||
    startedAt < windowStart ||
    startedAt >= windowEnd
  ) {
    return { status: "unverified_mismatch", opportunity: null };
  }
  return { status: "verified", opportunity };
}

export function clearAttestationCacheForTests(assets?: AssetFetcherLike) {
  if (assets) {
    attestationCache.delete(assets as object);
    opportunitySnapshotCache.delete(assets as object);
  }
}

/**
 * Bind the full conditions to the already-verified compact attestation. The
 * attestation index intentionally stays small; this second read is cached by
 * the platform asset layer and is only needed when a trip is actually logged.
 * If the snapshot is unavailable, scores remain valid and no untrusted client
 * conditions are accepted.
 */
export async function hydrateOpportunityConditions(
  assets: AssetFetcherLike | undefined,
  requestUrl: string,
  opportunity: AttestedOpportunity | null,
): Promise<AttestedOpportunity | null> {
  if (!opportunity || !assets) return opportunity;
  try {
    let snapshotPromise = opportunitySnapshotCache.get(assets as object);
    if (!snapshotPromise) {
      snapshotPromise = fetchOpportunitySnapshot(assets, requestUrl).catch((error) => {
        opportunitySnapshotCache.delete(assets as object);
        throw error;
      });
      opportunitySnapshotCache.set(assets as object, snapshotPromise);
    }
    const snapshot = await snapshotPromise;
    if (snapshot.snapshotSha256 !== opportunity.snapshotSha256) return opportunity;
    const window = snapshot.windows.get(opportunity.windowId);
    const snapshotStart = isRecord(window) ? canonicalUtcTimestamp(window.start) : null;
    const snapshotEnd = isRecord(window) ? canonicalUtcTimestamp(window.end) : null;
    if (!isRecord(window) || window.siteId !== opportunity.siteId ||
      snapshotStart !== opportunity.windowStart || snapshotEnd !== opportunity.windowEnd ||
      window.score !== opportunity.opportunityScore ||
      window.habitatScore !== opportunity.habitatScore ||
      window.seasonalityScore !== opportunity.seasonalityScore ||
      window.dynamicScore !== opportunity.conditionsScore ||
      window.fishabilityScore !== opportunity.fishabilityScore) return opportunity;
    const conditions = normalizeOpportunityConditions(window.conditions);
    return conditions ? { ...opportunity, conditions } : opportunity;
  } catch {
    return opportunity;
  }
}

async function fetchOpportunitySnapshot(assets: AssetFetcherLike, requestUrl: string) {
  const response = await assets.fetch(new Request(new URL(OPPORTUNITY_SNAPSHOT_PATH, requestUrl)));
  if (!response.ok) throw new Error("opportunity snapshot unavailable");
  const declaredLength = Number(response.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_OPPORTUNITY_SNAPSHOT_BYTES) {
    throw new Error("opportunity snapshot too large");
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_OPPORTUNITY_SNAPSHOT_BYTES) {
    throw new Error("opportunity snapshot size invalid");
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const snapshotSha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const snapshot = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  if (!isRecord(snapshot) || !Array.isArray(snapshot.windows)) throw new Error("opportunity snapshot is invalid");
  const windows = new Map<string, Record<string, unknown>>();
  for (const entry of snapshot.windows) {
    if (isRecord(entry) && typeof entry.id === "string" && !windows.has(entry.id)) windows.set(entry.id, entry);
  }
  return { snapshotSha256, windows };
}

async function loadAttestationIndex(assets: AssetFetcherLike, requestUrl: string) {
  let pending = attestationCache.get(assets as object);
  if (!pending) {
    pending = fetchAndParseAttestationIndex(assets, requestUrl).catch((error) => {
      attestationCache.delete(assets as object);
      throw error;
    });
    attestationCache.set(assets as object, pending);
  }
  return pending;
}

async function fetchAndParseAttestationIndex(assets: AssetFetcherLike, requestUrl: string) {
  const response = await assets.fetch(new Request(new URL(ATTESTATION_PATH, requestUrl)));
  if (!response.ok) throw new Error("opportunity attestation asset unavailable");
  const declaredLength = Number(response.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTESTATION_BYTES) {
    throw new Error("opportunity attestation asset too large");
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ATTESTATION_BYTES) {
    throw new Error("opportunity attestation asset size invalid");
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("opportunity attestation asset is not JSON");
  }
  return parseAttestationIndex(value);
}

function parseAttestationIndex(value: unknown): ParsedAttestationIndex {
  if (!isRecord(value)) throw new Error("opportunity attestation index must be an object");
  assertExactKeys(value, [
    "schema_version",
    "generated_at",
    "snapshot_sha256",
    "site_catalog_sha256",
    "target_taxon_id",
    "taxon_catalog_version",
    "observation_contract_version",
    "model_run_contract_version",
    "opportunity_contract_version",
    "scoring_system_kind",
    "scoring_system_version",
    "scoring_system_sha256",
    "windows",
  ]);
  if (value.schema_version !== OPPORTUNITY_ATTESTATION_INDEX_VERSION) throw new Error("unsupported attestation index");
  const generatedAt = strictUtcTimestamp(value.generated_at, "generated_at");
  const snapshotSha256 = sha256(value.snapshot_sha256, "snapshot_sha256");
  const siteCatalogSha256 = sha256(value.site_catalog_sha256, "site_catalog_sha256");
  if (value.target_taxon_id !== CALIFORNIA_HALIBUT_TAXON_ID) throw new Error("attestation target mismatch");
  if (value.taxon_catalog_version !== TAXON_CATALOG_VERSION) throw new Error("attestation taxon catalog mismatch");
  if (value.observation_contract_version !== OBSERVATION_CONTRACT_VERSION) throw new Error("attestation observation contract mismatch");
  if (value.model_run_contract_version !== MODEL_RUN_CONTRACT_VERSION) throw new Error("attestation model-run contract mismatch");
  if (value.opportunity_contract_version !== OPPORTUNITY_CONTRACT_VERSION) throw new Error("attestation opportunity contract mismatch");
  const scoringSystemKind = boundedText(value.scoring_system_kind, "scoring_system_kind", 80);
  if (scoringSystemKind !== SUPPORTED_SCORING_SYSTEM_KIND) throw new Error("attestation scoring kind is unsupported");
  const scoringSystemSha256 = sha256(value.scoring_system_sha256, "scoring_system_sha256");
  const scoringSystemVersion = boundedText(value.scoring_system_version, "scoring_system_version", 160);
  if (scoringSystemVersion !== `heuristic-${CALIFORNIA_HALIBUT_TAXON_ID}-${scoringSystemSha256}`) {
    throw new Error("attestation scoring version is not bound to its SHA");
  }
  if (!Array.isArray(value.windows) || value.windows.length === 0 || value.windows.length > MAX_ATTESTATION_WINDOWS) {
    throw new Error("attestation windows array has invalid size");
  }

  const windows = new Map<string, AttestedOpportunity>();
  for (const entry of value.windows) {
    if (!Array.isArray(entry) || entry.length !== 9) throw new Error("attestation window tuple has invalid shape");
    const [windowId, siteId, startAt, endAt, opportunityScore, habitatScore, seasonalityScore, conditionsScore, fishabilityScore] = entry;
    if (typeof windowId !== "string" || !WINDOW_ID_PATTERN.test(windowId) || windows.has(windowId)) {
      throw new Error("attestation window ID is invalid or duplicated");
    }
    if (typeof siteId !== "string" || !SITE_ID_PATTERN.test(siteId)) throw new Error("attestation site ID is invalid");
    const windowStart = strictUtcTimestamp(startAt, "window_start");
    const windowEnd = strictUtcTimestamp(endAt, "window_end");
    if (Date.parse(windowEnd) - Date.parse(windowStart) !== 2 * 60 * 60 * 1_000) {
      throw new Error("attestation window must be exactly two hours");
    }
    const scores = [opportunityScore, habitatScore, seasonalityScore, conditionsScore, fishabilityScore]
      .map((score) => boundedScore(score));
    windows.set(windowId, {
      snapshotSha256,
      siteCatalogSha256,
      targetTaxonId: CALIFORNIA_HALIBUT_TAXON_ID,
      taxonCatalogVersion: TAXON_CATALOG_VERSION,
      observationContractVersion: OBSERVATION_CONTRACT_VERSION,
      modelRunContractVersion: MODEL_RUN_CONTRACT_VERSION,
      opportunityContractVersion: OPPORTUNITY_CONTRACT_VERSION,
      scoringSystemKind,
      scoringSystemVersion,
      scoringSystemSha256,
      generatedAt,
      windowId,
      siteId,
      windowStart,
      windowEnd,
      opportunityScore: scores[0],
      habitatScore: scores[1],
      seasonalityScore: scores[2],
      conditionsScore: scores[3],
      fishabilityScore: scores[4],
    });
  }
  return { windows };
}

const CONDITION_KEYS = [
  "tideStage", "tideLevelsFeet", "currentKnots", "currentDirectionDegrees", "currentDirection",
  "windMph", "fishabilityLabel", "fishabilityReasons", "waterTempF", "daylight", "cloudCoverPct",
  "pressureHpa", "pressureTrendHpa3h", "moonPhase", "moonIlluminationPct", "fishingPressure",
  "fishingPressurePct", "accessAdjustmentPoints", "swellFeet", "swellPeriodSeconds",
  "swellDirectionDegrees", "swellDirection", "wavePowerKwM", "breakingIntensity", "breakingWaveHeightFeet",
] as const;

function normalizeOpportunityConditions(value: unknown): OpportunityConditionsSnapshot | null {
  if (!isRecord(value)) return null;
  const output: OpportunityConditionsSnapshot = {};
  for (const key of CONDITION_KEYS) {
    const candidate = value[key];
    if (candidate === undefined || candidate === null) continue;
    if (key === "daylight") {
      if (typeof candidate === "boolean") output.daylight = candidate;
      continue;
    }
    if (key === "tideLevelsFeet") {
      if (Array.isArray(candidate) && candidate.length <= 8 && candidate.every((entry) => boundedConditionNumber(entry, -100, 100))) {
        output.tideLevelsFeet = candidate.map(Number);
      }
      continue;
    }
    if (key === "fishabilityReasons") {
      if (Array.isArray(candidate) && candidate.length <= 4 && candidate.every((entry) => typeof entry === "string" && entry.length <= 240)) {
        output.fishabilityReasons = candidate.map((entry) => entry as string);
      }
      continue;
    }
    if (typeof candidate === "string") {
      if (candidate.length <= 160 && candidate.trim() === candidate) (output as Record<string, unknown>)[key] = candidate;
      continue;
    }
    if (boundedConditionNumber(candidate, -10_000, 10_000)) (output as Record<string, unknown>)[key] = Number(candidate);
  }
  return Object.keys(output).length ? output : null;
}

function boundedConditionNumber(value: unknown, minimum: number, maximum: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function assertExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error("opportunity attestation index keys are not canonical");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function strictUtcTimestamp(value: unknown, field: string) {
  if (typeof value !== "string" || !UTC_TIMESTAMP_PATTERN.test(value) || value.startsWith("0000-")) {
    throw new Error(`${field} must be a canonical UTC timestamp`);
  }
  const parsed = new Date(value);
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== normalized) {
    throw new Error(`${field} must be a real Gregorian UTC timestamp`);
  }
  return parsed.toISOString();
}

function canonicalUtcTimestamp(value: unknown) {
  if (typeof value !== "string" || !UTC_TIMESTAMP_PATTERN.test(value) || value.startsWith("0000-")) return null;
  const parsed = new Date(value);
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === normalized ? parsed.toISOString() : null;
}

function sha256(value: unknown, field: string) {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new Error(`${field} must be SHA-256`);
  return value;
}

function boundedText(value: unknown, field: string, maximum: number) {
  if (typeof value !== "string" || !value || value.length > maximum || value.trim() !== value) {
    throw new Error(`${field} is invalid`);
  }
  return value;
}

function boundedScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("attestation score is invalid");
  }
  return value;
}
