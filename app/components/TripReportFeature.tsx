"use client";

import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import type { FishingSite, OpportunitySnapshot, OpportunityWindow, TripReportRequest } from "../types";
import { ArrowIcon, ClockIcon, CloseIcon } from "./icons";
import { SiteCombobox } from "./SiteCombobox";
import { useClientNetworkState } from "../lib/use-client-network-state";
import { useModalDialog } from "../lib/use-modal-dialog";
import {
  ACTIVE_TRIP_KEY,
  LEGACY_ACTIVE_TRIP_KEY,
  LEGACY_REPORTER_KEY,
  REPORTER_KEY,
  TRIP_DRAFT_PREFIX,
  TRIP_PENDING_PREFIX,
  TRIP_REQUEST_PREFIX,
} from "../lib/account-browser-storage";
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 4;
const ACCEPTED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
const PHOTO_UPLOADS_ENABLED = process.env.NEXT_PUBLIC_PHOTO_UPLOADS === "true";
// Keep a slow request pending. If its response is lost, the stable request
// identity below makes an explicit user retry idempotent; nothing auto-replays.
const SLOW_SUBMISSION_NOTICE_MS = 4_000;

type Panel = "start" | "complete" | "past";
type SubmitState = "idle" | "submitting" | "success" | "error" | "ambiguous";
type PhotoTransferState = "idle" | "selected" | "sending" | "confirmed" | "failed" | "ambiguous";
type PhotoAnalysisState = "idle" | "analyzing" | "ready" | "unavailable" | "error";
type TripReceiptOperation = "start" | "complete" | "past";
type CatchResult = "none" | "halibut-kept" | "halibut-released" | "other-fish";
type LocationState = "idle" | "locating" | "selected" | "denied" | "unsupported";

type CatchSpecies = "no-fish" | "california-halibut" | "surfperch" | "striped-bass" | "leopard-shark" | "other";

interface CatchRow {
  id: string;
  count: string;
  species: CatchSpecies;
  notes: string;
}

const CATCH_SPECIES_OPTIONS: ReadonlyArray<{ value: CatchSpecies; label: string }> = [
  { value: "no-fish", label: "No fish" },
  { value: "california-halibut", label: "California halibut" },
  { value: "surfperch", label: "Surfperch" },
  { value: "striped-bass", label: "Striped bass" },
  { value: "leopard-shark", label: "Leopard shark" },
  { value: "other", label: "Other / not sure" },
];

function newCatchRow(species: CatchSpecies = "no-fish", count = "0", notes = ""): CatchRow {
  return { id: `catch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, count, species, notes };
}

interface RejectedPhoto {
  name: string;
  type: string;
  size: number;
  message: string;
}

interface PhotoAnalysis {
  model: string;
  confidence: "low" | "medium" | "high";
  catches: Array<{ species: CatchSpecies; count: number; confidence: "low" | "medium" | "high" }>;
  note: string;
}

interface TripRequestMaterial {
  id: string;
  token: string;
}

interface StoredActiveTrip {
  id: string;
  token: string;
  siteId: string;
  siteName: string;
  startedAt: string;
  anglerCount: number;
  mode: string;
  opportunityWindowId?: string;
  opportunityScore?: number;
  modelVersion?: string;
  fishingMethod: string;
  gearProfileId: string;
  rod: string;
  reel: string;
  baitLure: string;
  rig: string;
  scoreInfluencedChoice: boolean;
}

interface SummaryView {
  completedTrips: number;
  anglerHours: number;
  halibutEncounters: number;
  sitesCovered: number;
  past24Hours: {
    completedTrips: number;
    anglerHours: number;
    halibutEncounters: number;
    sitesCovered: number;
  };
}

interface TripReportFeatureProps {
  sites: FishingSite[];
  snapshot: OpportunitySnapshot;
  forecastReady: boolean;
  forecastUnavailable: boolean;
  request: TripReportRequest | null;
  canSubmit: boolean;
  /**
   * Local preview mode lets an operator inspect the complete flow without
   * creating an account or sending a mutation to the real API.
   */
  previewOnly?: boolean;
  onRequireLogin(): void;
}

interface FormFields {
  siteId: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: string;
  anglerCount: number;
  catchResult: CatchResult;
  catchRows: CatchRow[];
  keeperCount: number;
  shortReleasedCount: number;
  fishingMethod: string;
  gearProfileId: string;
  rod: string;
  reel: string;
  baitLure: string;
  rig: string;
  mode: string;
  scoreInfluencedChoice: "" | "yes" | "no";
  primaryTargetConfirmed: boolean;
  completeAttempt: boolean;
  otherCatchCount: number;
  otherSpecies: string;
  shorebreak: string;
  wadingDepth: string;
  waterClarity: string;
  crowding: string;
  fishabilityRating: string;
  observedWaveHeightFeet: string;
  fishabilityNotes: string;
  notes: string;
  consent: boolean;
}

interface GearProfile {
  id: string;
  name: string;
  rod: string | null;
  reel: string | null;
  bait_lure: string | null;
  rig: string | null;
}

function localDateTimeValue(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function isoFromLocalInput(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid date and time.");
  return parsed.toISOString();
}

function modeForSite(site: FishingSite | undefined) {
  const type = site?.type.toLowerCase();
  return type === "beach" || type === "pier" || type === "jetty" ? type : "shore";
}

// Kept for recovery of drafts created by the previous duration-only form. New
// reports always collect explicit start and end times instead.
function estimatedEndLocal(startedAt: string, durationMinutes: string) {
  const start = new Date(startedAt);
  const minutes = Number.parseInt(durationMinutes, 10);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(minutes) || minutes < 1) {
    throw new Error("Choose when the trip started and ended.");
  }
  return localDateTimeValue(new Date(start.getTime() + Math.min(minutes, 24 * 60) * 60_000));
}

function nearestSite(sites: FishingSite[], latitude: number, longitude: number) {
  let nearest: { site: FishingSite; miles: number } | null = null;
  for (const site of sites) {
    const latDelta = (site.latitude - latitude) * Math.PI / 180;
    const lonDelta = (site.longitude - longitude) * Math.PI / 180;
    const a = Math.sin(latDelta / 2) ** 2
      + Math.cos(latitude * Math.PI / 180) * Math.cos(site.latitude * Math.PI / 180) * Math.sin(lonDelta / 2) ** 2;
    const miles = 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    if (!nearest || miles < nearest.miles) nearest = { site, miles };
  }
  return nearest;
}

function catchRowsFromResult(result: CatchResult): CatchRow[] {
  if (result === "halibut-kept" || result === "halibut-released") return [newCatchRow("california-halibut", "1")];
  if (result === "other-fish") return [newCatchRow("other", "1")];
  return [newCatchRow()];
}

function normalizeCatchRows(value: unknown, fallbackResult: CatchResult): CatchRow[] {
  if (!Array.isArray(value)) return catchRowsFromResult(fallbackResult);
  const rows = value.flatMap((entry): CatchRow[] => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    const species = CATCH_SPECIES_OPTIONS.some((option) => option.value === source.species)
      ? source.species as CatchSpecies
      : null;
    const count = typeof source.count === "string" || typeof source.count === "number"
      ? String(source.count)
      : null;
    if (!species || count === null || !/^\d{1,3}$/.test(count)) return [];
    return [{
      id: typeof source.id === "string" && source.id ? source.id : newCatchRow().id,
      count,
      species,
      notes: typeof source.notes === "string" ? source.notes.slice(0, 240) : "",
    }];
  });
  return rows.length ? rows.slice(0, 12) : catchRowsFromResult(fallbackResult);
}

function catchNotesFromRows(rows: CatchRow[]) {
  return rows
    .map((row) => {
      const note = row.notes.trim().slice(0, 240);
      if (!note) return "";
      const count = Math.max(0, Math.min(100, Number.parseInt(row.count, 10) || 0));
      const species = CATCH_SPECIES_OPTIONS.find((option) => option.value === row.species)?.label ?? "Other / not sure";
      return `${count} × ${species}: ${note}`;
    })
    .filter(Boolean)
    .join("\n")
    .slice(0, 1_000);
}

function catchCountsFromRows(rows: CatchRow[]) {
  let keeperCount = 0;
  let otherCatchCount = 0;
  const speciesLabels: string[] = [];
  for (const row of rows) {
    const count = Math.max(0, Math.min(100, Number.parseInt(row.count, 10) || 0));
    if (count === 0 || row.species === "no-fish") continue;
    if (row.species === "california-halibut") keeperCount += count;
    else {
      otherCatchCount += count;
      const label = CATCH_SPECIES_OPTIONS.find((option) => option.value === row.species)?.label ?? "Other / not sure";
      if (!speciesLabels.includes(label)) speciesLabels.push(label);
    }
  }
  return {
    keeperCount,
    shortReleasedCount: 0,
    otherCatchCount,
    otherSpecies: speciesLabels.join(", "),
  };
}

function freshFields(siteId = ""): FormFields {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  return {
    siteId,
    startedAt: localDateTimeValue(twoHoursAgo),
    endedAt: localDateTimeValue(now),
    durationMinutes: "120",
    anglerCount: 1,
    catchResult: "none",
    catchRows: [newCatchRow()],
    keeperCount: 0,
    shortReleasedCount: 0,
    fishingMethod: "bait",
    gearProfileId: "",
    rod: "",
    reel: "",
    baitLure: "",
    rig: "",
    mode: "shore",
    scoreInfluencedChoice: "yes",
    primaryTargetConfirmed: false,
    completeAttempt: false,
    otherCatchCount: 0,
    otherSpecies: "",
    shorebreak: "",
    wadingDepth: "",
    waterClarity: "",
    crowding: "",
    fishabilityRating: "",
    observedWaveHeightFeet: "",
    fishabilityNotes: "",
    notes: "",
    consent: false,
  };
}

function parseFormDraft(raw: string | null, fallback: FormFields) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<FormFields>;
    return {
      ...fallback,
      ...parsed,
      durationMinutes: typeof parsed.durationMinutes === "string" ? parsed.durationMinutes : fallback.durationMinutes,
      endedAt: typeof parsed.endedAt === "string" && parsed.endedAt
        ? parsed.endedAt
        : estimatedEndLocal(typeof parsed.startedAt === "string" ? parsed.startedAt : fallback.startedAt, typeof parsed.durationMinutes === "string" ? parsed.durationMinutes : fallback.durationMinutes),
      catchResult: parsed.catchResult === "none" || parsed.catchResult === "halibut-kept" || parsed.catchResult === "halibut-released" || parsed.catchResult === "other-fish"
        ? parsed.catchResult
        : Number(parsed.keeperCount ?? 0) > 0
          ? "halibut-kept"
          : Number(parsed.shortReleasedCount ?? 0) > 0
            ? "halibut-released"
            : Number(parsed.otherCatchCount ?? 0) > 0
              ? "other-fish"
              : fallback.catchResult,
      catchRows: normalizeCatchRows(
        parsed.catchRows,
        parsed.catchResult === "none" || parsed.catchResult === "halibut-kept" || parsed.catchResult === "halibut-released" || parsed.catchResult === "other-fish"
          ? parsed.catchResult
          : fallback.catchResult,
      ),
      anglerCount: Number(parsed.anglerCount ?? fallback.anglerCount),
      keeperCount: Number(parsed.keeperCount ?? fallback.keeperCount),
      shortReleasedCount: Number(parsed.shortReleasedCount ?? fallback.shortReleasedCount),
      otherCatchCount: Number(parsed.otherCatchCount ?? fallback.otherCatchCount),
      consent: Boolean(parsed.consent),
      primaryTargetConfirmed: Boolean(parsed.primaryTargetConfirmed),
      completeAttempt: Boolean(parsed.completeAttempt),
      mode: typeof parsed.mode === "string" && parsed.mode ? parsed.mode : fallback.mode,
      scoreInfluencedChoice:
        parsed.scoreInfluencedChoice === "yes" || parsed.scoreInfluencedChoice === "no"
          ? parsed.scoreInfluencedChoice
          : fallback.scoreInfluencedChoice,
    };
  } catch {
    return fallback;
  }
}

function findForecastWindow(snapshot: OpportunitySnapshot, siteId: string, startedAt: string, endedAt?: string) {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const midpoint = (start + end) / 2;
  const candidates = snapshot.windows.filter((window) => window.siteId === siteId);
  const overlapping = candidates.filter((window) => {
    const windowStart = new Date(window.start).getTime();
    const windowEnd = new Date(window.end).getTime();
    return windowStart <= end && windowEnd >= start;
  });
  const pool = overlapping.length ? overlapping : candidates;
  const matched = pool.sort((left, right) => {
    const leftMidpoint = (new Date(left.start).getTime() + new Date(left.end).getTime()) / 2;
    const rightMidpoint = (new Date(right.start).getTime() + new Date(right.end).getTime()) / 2;
    return Math.abs(leftMidpoint - midpoint) - Math.abs(rightMidpoint - midpoint);
  })[0];
  if (!matched) return null;
  const matchedMidpoint = (new Date(matched.start).getTime() + new Date(matched.end).getTime()) / 2;
  return Math.abs(matchedMidpoint - midpoint) <= 6 * 60 * 60 * 1000 ? matched : null;
}

function forecastFields(window: OpportunityWindow | null) {
  if (!window) return {};
  return { opportunityWindowId: window.id };
}

function parseStoredTrip(raw: string | null): StoredActiveTrip | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredActiveTrip>;
    if (
      typeof value.id !== "string" ||
      typeof value.token !== "string" ||
      typeof value.siteId !== "string" ||
      typeof value.siteName !== "string" ||
      typeof value.startedAt !== "string"
    ) return null;
    return {
      id: value.id,
      token: value.token,
      siteId: value.siteId,
      siteName: value.siteName,
      startedAt: value.startedAt,
      anglerCount: typeof value.anglerCount === "number" ? value.anglerCount : 1,
      mode: typeof value.mode === "string" ? value.mode : "shore",
      opportunityWindowId: value.opportunityWindowId,
      opportunityScore: value.opportunityScore,
      modelVersion: value.modelVersion,
      fishingMethod: typeof value.fishingMethod === "string" ? value.fishingMethod : "bait",
      gearProfileId: typeof value.gearProfileId === "string" ? value.gearProfileId : "",
      rod: typeof value.rod === "string" ? value.rod : "",
      reel: typeof value.reel === "string" ? value.reel : "",
      baitLure: typeof value.baitLure === "string" ? value.baitLure : "",
      rig: typeof value.rig === "string" ? value.rig : "",
      scoreInfluencedChoice:
        typeof value.scoreInfluencedChoice === "boolean"
          ? value.scoreInfluencedChoice
          : typeof (value as { contourCastInfluenced?: unknown }).contourCastInfluenced === "boolean"
            ? Boolean((value as { contourCastInfluenced: boolean }).contourCastInfluenced)
            : false,
    };
  } catch {
    return null;
  }
}

function readCount(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") return 0;
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeSummary(payload: unknown): SummaryView {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const source = root.summary && typeof root.summary === "object" ? root.summary : root;
  const recent = source && typeof source === "object" && (source as Record<string, unknown>).past24Hours && typeof (source as Record<string, unknown>).past24Hours === "object"
    ? (source as Record<string, unknown>).past24Hours
    : {};
  return {
    completedTrips: readCount(source, ["completedTrips", "completed_trips", "totalTrips", "total_trips"]),
    anglerHours: readCount(source, ["anglerHours", "angler_hours"]),
    halibutEncounters: readCount(source, ["halibutEncounters", "halibut_encounters", "totalHalibut", "total_halibut"]),
    sitesCovered: readCount(source, ["sitesCovered", "sites_covered"]),
    past24Hours: {
      completedTrips: readCount(recent, ["completedTrips", "completed_trips"]),
      anglerHours: readCount(recent, ["anglerHours", "angler_hours"]),
      halibutEncounters: readCount(recent, ["halibutEncounters", "halibut_encounters"]),
      sitesCovered: readCount(recent, ["sitesCovered", "sites_covered"]),
    },
  };
}

function RecentDelta({ value, decimals = 0 }: { value: number; decimals?: number }) {
  if (!(value > 0)) return null;
  return <small className="recent-delta" aria-label={`${value.toFixed(decimals)} added in the past 24 hours`}>↗ +{value.toFixed(decimals)} · 24h</small>;
}

function anonymousReporterKey() {
  const existing =
    window.localStorage.getItem(REPORTER_KEY) ??
    window.localStorage.getItem(LEGACY_REPORTER_KEY);
  if (existing) return existing;
  const key = typeof window.crypto?.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(REPORTER_KEY, key);
  return key;
}

async function responsePayload(response: Response) {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const nestedError = payload.error && typeof payload.error === "object"
      ? (payload.error as Record<string, unknown>).message
      : payload.error;
    const detail = nestedError ?? payload.message ?? payload.detail;
    throw new Error(typeof detail === "string" ? detail : "The report could not be saved. Please try again.");
  }
  return payload;
}

class AmbiguousTripSubmissionError extends Error {
  constructor() {
    super("The server response did not provide an exact trip receipt.");
    this.name = "AmbiguousTripSubmissionError";
  }
}

async function tripSubmissionPayload(response: Response) {
  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    if (response.ok || response.status >= 500) throw new AmbiguousTripSubmissionError();
    throw new Error("The report was rejected without a readable explanation. Review it and try again.");
  }
  if (!response.ok) {
    if (response.status >= 500) throw new AmbiguousTripSubmissionError();
    const nestedError = payload.error && typeof payload.error === "object"
      ? (payload.error as Record<string, unknown>).message
      : payload.error;
    const detail = nestedError ?? payload.message ?? payload.detail;
    throw new Error(typeof detail === "string" ? detail : "The report was not accepted. Review it and try again.");
  }
  return payload;
}

function exactTripReceipt(
  payload: Record<string, unknown>,
  operation: TripReceiptOperation,
  tripId: string,
  status: "active" | "completed",
  source: "live" | "past_report",
  expectedHasPhoto?: boolean,
) {
  const receipt = payload.receipt && typeof payload.receipt === "object"
    ? payload.receipt as Record<string, unknown>
    : {};
  const trip = payload.trip && typeof payload.trip === "object"
    ? payload.trip as Record<string, unknown>
    : {};
  if (
    receipt.operation !== operation || receipt.tripId !== tripId ||
    trip.id !== tripId || trip.status !== status || trip.source !== source ||
    (typeof expectedHasPhoto === "boolean" && trip.hasPhoto !== expectedHasPhoto)
  ) throw new AmbiguousTripSubmissionError();
  return trip;
}

function secureTripRequestMaterial(operation: "start" | "past") {
  const storageKey = `${TRIP_REQUEST_PREFIX}${operation}`;
  const stored = window.localStorage.getItem(storageKey);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<TripRequestMaterial>;
      if (
        typeof parsed.id === "string" && /^trip_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(parsed.id) &&
        typeof parsed.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(parsed.token)
      ) return { id: parsed.id, token: parsed.token };
    } catch {
      // Replace corrupt local request material with a new cryptographic identity.
    }
  }
  if (typeof window.crypto?.randomUUID !== "function" || typeof window.crypto?.getRandomValues !== "function") {
    throw new Error("This browser cannot create a secure trip recovery identity. Update the browser before submitting.");
  }
  const bytes = window.crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const material = {
    id: `trip_${window.crypto.randomUUID()}`,
    token: window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  };
  window.localStorage.setItem(storageKey, JSON.stringify(material));
  return material;
}

function tripPendingKey(operation: "start" | "past" | `complete.${string}`) {
  return `${TRIP_PENDING_PREFIX}${operation}`;
}

function markTripPending(operation: "start" | "past" | `complete.${string}`) {
  window.localStorage.setItem(tripPendingKey(operation), new Date().toISOString());
}

function clearTripPending(operation: "start" | "past" | `complete.${string}`) {
  window.localStorage.removeItem(tripPendingKey(operation));
}

function isAmbiguousSubmission(error: unknown) {
  return error instanceof TypeError || error instanceof AmbiguousTripSubmissionError;
}

function ambiguousSubmissionMessage(operation: "start" | "complete" | "past") {
  if (operation === "start") {
    return "No exact server receipt arrived. This device kept the draft and recovery identity. Do not assume the trip started; retrying here is safe and cannot create a duplicate.";
  }
  return "No exact server receipt arrived. This device kept the draft and recovery identity. The server may already have accepted it, but retrying here is safe and cannot create a duplicate.";
}

function TripFormStatus({ state, message }: { state: SubmitState; message: string }) {
  return (
    <div
      className={`trip-form-status ${state}`}
      role={state === "error" || state === "ambiguous" ? "alert" : "status"}
      aria-live={state === "error" || state === "ambiguous" ? undefined : "polite"}
    >
      <span>{message}</span>
      {state === "submitting" ? <i aria-hidden="true" /> : null}
    </div>
  );
}

async function refreshSummary(
  setSummary: (summary: SummaryView) => void,
  setUnavailable: (unavailable: boolean) => void,
) {
  try {
    const response = await fetch("/api/trips/summary", { headers: { Accept: "application/json" } });
    setSummary(normalizeSummary(await responsePayload(response)));
    setUnavailable(false);
  } catch {
    setUnavailable(true);
  }
}

function validatePhoto(file: File | null) {
  if (!file) return;
  const filename = file.name.toLowerCase();
  const extensionAccepted = filename.endsWith(".heic") || filename.endsWith(".heif");
  if (!ACCEPTED_PHOTO_TYPES.has(file.type) && !extensionAccepted) throw new Error("Use a JPEG, PNG, WebP, HEIC, or HEIF photo.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo must be 5 MB or smaller.");
}

function normalizePhotoFileType(file: File) {
  if (file.type) return file;
  const filename = file.name.toLowerCase();
  const type = filename.endsWith(".heic") ? "image/heic" : filename.endsWith(".heif") ? "image/heif" : "";
  return type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file;
}

function appendCompletionFields(
  formData: FormData,
  fields: FormFields,
  photo: File | null,
  includeClientTimes = true,
) {
  if (!fields.consent) throw new Error("Confirm the trip report before submitting.");
  if (!fields.primaryTargetConfirmed) {
    throw new Error("Confirm that California halibut was the primary target for the whole trip.");
  }
  if (!fields.completeAttempt) {
    throw new Error("Confirm that this report covers the whole fishing attempt.");
  }
  const counts = catchCountsFromRows(fields.catchRows);
  if (counts.keeperCount > 25 || counts.shortReleasedCount > 25 || counts.keeperCount + counts.shortReleasedCount > 40) {
    throw new Error("Halibut counts must be 25 or fewer per field and 40 or fewer combined.");
  }
  validatePhoto(photo);

  if (includeClientTimes) {
    const startedAt = isoFromLocalInput(fields.startedAt);
    const endedAt = isoFromLocalInput(fields.endedAt);
    if (new Date(endedAt) <= new Date(startedAt)) throw new Error("End time must be after the start time.");
    formData.set("startedAt", startedAt);
    formData.set("endedAt", endedAt);
  }
  formData.set("keeperCount", String(counts.keeperCount));
  formData.set("shortReleasedCount", String(counts.shortReleasedCount));
  formData.set("gearProfileId", fields.gearProfileId);
  formData.set("rod", fields.rod.trim());
  formData.set("reel", fields.reel.trim());
  formData.set("baitLure", fields.baitLure.trim());
  formData.set("rig", fields.rig.trim());
  formData.set("otherCatchCount", String(counts.otherCatchCount));
  formData.set("otherSpecies", counts.otherSpecies);
  formData.set("shorebreak", fields.shorebreak);
  formData.set("wadingDepth", fields.wadingDepth);
  formData.set("waterClarity", fields.waterClarity);
  formData.set("crowding", fields.crowding);
  formData.set("fishabilityRating", fields.fishabilityRating);
  formData.set("observedWaveHeightFeet", fields.observedWaveHeightFeet);
  formData.set("fishabilityNotes", "");
  formData.set("notes", catchNotesFromRows(fields.catchRows));
  formData.set("consent", "true");
  formData.set("primaryTargetConfirmed", "true");
  formData.set("completeAttempt", "true");
  formData.set("website", "");
  if (photo) formData.set("photo", photo);
}

function elapsedLabel(startedAt: string) {
  const start = new Date(startedAt);
  const minutes = Math.max(0, Math.round((Date.now() - start.getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m underway`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder}m underway`;
}

export function TripReportFeature({
  sites,
  snapshot,
  forecastReady,
  forecastUnavailable,
  request,
  canSubmit,
  previewOnly = false,
  onRequireLogin,
}: TripReportFeatureProps) {
  const openerRef = useRef<HTMLElement | null>(null);
  const lastRequestKeyRef = useRef<number | null>(null);
  const handledInitialQueryRef = useRef(false);
  const restoredClientStateRef = useRef(false);
  const referralCodeRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoAnalysisRequestRef = useRef(0);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [activeTrip, setActiveTrip] = useState<StoredActiveTrip | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<OpportunityWindow | null>(null);
  const [fields, setFields] = useState<FormFields>(() => freshFields());
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [gearProfiles, setGearProfiles] = useState<GearProfile[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [rejectedPhotos, setRejectedPhotos] = useState<RejectedPhoto[]>([]);
  const [photoTransferState, setPhotoTransferState] = useState<PhotoTransferState>("idle");
  const [photoAnalysisState, setPhotoAnalysisState] = useState<PhotoAnalysisState>("idle");
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysis | null>(null);
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<SummaryView | null>(null);
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);
  const networkState = useClientNetworkState();

  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const photo = photos[0] ?? null;
  const selectedCounts = catchCountsFromRows(fields.catchRows);
  const targetEncounters = selectedCounts.keeperCount + selectedCounts.shortReleasedCount;
  const anyFishEncounters = targetEncounters + selectedCounts.otherCatchCount;
  const currentStartWindow = panel === "start"
    ? findForecastWindow(snapshot, fields.siteId, new Date().toISOString())
    : null;
  const displayedSubmitState = submitState === "idle" && networkState === "offline" ? "error" : submitState;
  const displayedSubmitMessage = submitState === "idle" && networkState === "offline"
    ? "This device appears offline. Drafts stay on this device, and trip submissions are paused."
    : submitState === "idle" && networkState === "restored"
      ? "This device reports that its connection is back. Nothing was resubmitted automatically; review any earlier status before trying again."
      : message;
  const photoStorageEnabled = PHOTO_UPLOADS_ENABLED && canSubmit;
  const tripEntryDisabledTitle = forecastUnavailable
    ? "Forecast verification failed. Retry the forecast before logging a trip."
    : !forecastReady || sites.length === 0
      ? "Wait for the fishing-location catalog and forecast snapshot to load"
      : undefined;
  const pastLocationAndTimeReady = Boolean(
    fields.siteId &&
    fields.startedAt &&
    fields.endedAt &&
    Number.isFinite(new Date(fields.startedAt).getTime()) &&
    Number.isFinite(new Date(fields.endedAt).getTime()) &&
    new Date(fields.endedAt) > new Date(fields.startedAt),
  );

  const resetFeedback = useCallback(() => {
    setSubmitState("idle");
    setMessage("");
    setPhotos([]);
    setRejectedPhotos([]);
    setPhotoTransferState("idle");
    setPhotoAnalysisState("idle");
    setPhotoAnalysis(null);
    photoAnalysisRequestRef.current += 1;
    setLocationState("idle");
    setLocationMessage("");
    if (photoInputRef.current) photoInputRef.current.value = "";
  }, []);

  const openPanel = useCallback((nextPanel: Panel, siteId?: string, forecastWindow?: OpportunityWindow) => {
    // Finishing a previously started trip must remain possible during a forecast outage.
    // Starting or backfilling a location-bound trip requires the verified catalog and snapshot.
    if (nextPanel !== "complete" && (!forecastReady || sites.length === 0)) return;
    if (!canSubmit && !previewOnly) {
      onRequireLogin();
      return;
    }
    handledInitialQueryRef.current = true;
    const activeElement = document.activeElement;
    openerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    resetFeedback();
    setFormStep(1);
    setSelectedWindow(forecastWindow ?? null);

    if (nextPanel === "complete" && activeTrip) {
      const fallback = {
        ...freshFields(activeTrip.siteId),
        startedAt: localDateTimeValue(new Date(activeTrip.startedAt)),
        endedAt: localDateTimeValue(new Date()),
        anglerCount: activeTrip.anglerCount,
        fishingMethod: activeTrip.fishingMethod,
        gearProfileId: activeTrip.gearProfileId,
        rod: activeTrip.rod,
        reel: activeTrip.reel,
        baitLure: activeTrip.baitLure,
        rig: activeTrip.rig,
        mode: activeTrip.mode,
        scoreInfluencedChoice: "" as const,
        primaryTargetConfirmed: false,
        completeAttempt: false,
      };
      setFields(parseFormDraft(window.localStorage.getItem(`${TRIP_DRAFT_PREFIX}complete.${activeTrip.id}`), fallback));
    } else if (nextPanel === "start") {
      const fallback = {
        ...freshFields(siteId ?? sites[0]?.id ?? ""),
        startedAt: localDateTimeValue(new Date()),
        endedAt: localDateTimeValue(new Date()),
      };
      setFields(parseFormDraft(window.localStorage.getItem(`${TRIP_DRAFT_PREFIX}start`), fallback));
    } else {
      const fallback = {
        ...freshFields(siteId ?? ""),
        startedAt: "",
        endedAt: "",
      };
      setFields(parseFormDraft(window.localStorage.getItem(`${TRIP_DRAFT_PREFIX}past`), fallback));
    }

    const pendingOperation = nextPanel === "complete"
      ? activeTrip ? `complete.${activeTrip.id}` as const : null
      : nextPanel;
    if (pendingOperation && window.localStorage.getItem(tripPendingKey(pendingOperation))) {
      setFormStep(2);
      setSubmitState("ambiguous");
      setMessage(ambiguousSubmissionMessage(nextPanel));
    }

    if (nextPanel === "past") {
      const url = new URL(window.location.href);
      url.searchParams.set("report", "trip");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
    setPanel(nextPanel);
  }, [activeTrip, canSubmit, forecastReady, onRequireLogin, previewOnly, resetFeedback, sites]);

  const closePanel = useCallback(() => {
    setPanel(null);
    resetFeedback();
    const url = new URL(window.location.href);
    if (url.searchParams.get("report") === "trip") {
      url.searchParams.delete("report");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [resetFeedback]);

  const dialogRef = useModalDialog<HTMLElement>({
    open: Boolean(panel),
    onClose: closePanel,
    openerRef,
  });

  useEffect(() => {
    if (panel && panel !== "complete" && (!forecastReady || sites.length === 0)) {
      const frame = window.requestAnimationFrame(closePanel);
      return () => window.cancelAnimationFrame(frame);
    }
  }, [closePanel, forecastReady, panel, sites.length]);

  useEffect(() => {
    if (restoredClientStateRef.current) return;
    restoredClientStateRef.current = true;
    const stored = parseStoredTrip(
      window.localStorage.getItem(ACTIVE_TRIP_KEY) ??
        window.localStorage.getItem(LEGACY_ACTIVE_TRIP_KEY),
    );
    const restoreFrame = window.requestAnimationFrame(() => setActiveTrip(stored));

    const query = new URL(window.location.href).searchParams;
    const referralCode = query.get("ref");
    referralCodeRef.current = referralCode && /^[a-z0-9_-]{1,64}$/i.test(referralCode) ? referralCode : null;
    if (query.get("report") !== "trip") handledInitialQueryRef.current = true;
    return () => window.cancelAnimationFrame(restoreFrame);
  }, []);

  useEffect(() => {
    const query = new URL(window.location.href).searchParams;
    if (
      !handledInitialQueryRef.current &&
      query.get("report") === "trip" &&
      forecastReady &&
      sites.length > 0
    ) {
      handledInitialQueryRef.current = true;
      const frame = window.requestAnimationFrame(() => openPanel("past"));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [forecastReady, openPanel, sites.length]);

  useEffect(() => {
    if (
      !request ||
      request.key === lastRequestKeyRef.current ||
      !forecastReady ||
      sites.length === 0
    ) return;
    lastRequestKeyRef.current = request.key;
    openPanel(request.mode, request.siteId, request.window);
  }, [forecastReady, openPanel, request, sites.length]);

  useEffect(() => {
    let active = true;
    void refreshSummary(
      (nextSummary) => {
        if (active) setSummary(nextSummary);
      },
      (unavailable) => {
        if (active) setSummaryUnavailable(unavailable);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!canSubmit) return;
    let active = true;
    const controller = new AbortController();
    void fetch("/api/gear-profiles", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : { gearProfiles: [] })
      .then((body: { gearProfiles?: GearProfile[] }) => {
        if (active) setGearProfiles(body.gearProfiles ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      controller.abort();
    };
  }, [canSubmit, panel]);

  useEffect(() => {
    if (!panel) return;
    const suffix = panel === "complete" && activeTrip ? `complete.${activeTrip.id}` : panel;
    window.localStorage.setItem(`${TRIP_DRAFT_PREFIX}${suffix}`, JSON.stringify(fields));
  }, [activeTrip, fields, panel]);

  const handlePhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length) return;
    const accepted: File[] = [];
    const rejected: RejectedPhoto[] = [];
    for (const candidate of selected) {
      try {
        validatePhoto(candidate);
        accepted.push(normalizePhotoFileType(candidate));
      } catch (error) {
        rejected.push({
          name: candidate.name,
          type: candidate.type,
          size: candidate.size,
          message: error instanceof Error ? error.message : "That photo cannot be used.",
        });
      }
    }
    setPhotos((current) => [...current, ...accepted].slice(0, MAX_PHOTOS));
    setRejectedPhotos(rejected);
    if (accepted.length) {
      setPhotoTransferState("selected");
      setPhotoAnalysisState("idle");
      setPhotoAnalysis(null);
      photoAnalysisRequestRef.current += 1;
    }
  };

  const removePhoto = (index?: number) => {
    if (typeof index === "number") {
      setPhotos((current) => current.filter((_, candidateIndex) => candidateIndex !== index));
    } else {
      setPhotos([]);
      setRejectedPhotos([]);
    }
    setPhotoTransferState("idle");
    setPhotoAnalysisState("idle");
    setPhotoAnalysis(null);
    photoAnalysisRequestRef.current += 1;
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const updateCatchRows = (catchRows: CatchRow[]) => {
    const counts = catchCountsFromRows(catchRows);
    const catchResult: CatchResult = counts.keeperCount > 0
      ? "halibut-kept"
      : counts.otherCatchCount > 0
        ? "other-fish"
        : "none";
    setFields((current) => ({ ...current, catchRows, catchResult, ...counts }));
  };

  const analyzePhotos = async () => {
    if (!photos.length) return;
    const requestId = ++photoAnalysisRequestRef.current;
    setPhotoAnalysisState("analyzing");
    setPhotoAnalysis(null);
    try {
      const analyses: PhotoAnalysis[] = [];
      for (const file of photos) {
        const formData = new FormData();
        formData.set("photo", file);
        const response = await fetch("/api/trips/analyze-photo", { method: "POST", body: formData, headers: { Accept: "application/json" } });
        const payload = await response.json().catch(() => ({})) as { analysis?: PhotoAnalysis; error?: { message?: string } };
        if (!response.ok || !payload.analysis) {
          if (requestId !== photoAnalysisRequestRef.current) return;
          setPhotoAnalysisState(response.status === 401 || response.status === 503 ? "unavailable" : "error");
          return;
        }
        analyses.push(payload.analysis);
      }
      if (requestId !== photoAnalysisRequestRef.current) return;
      const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
      const merged = new Map<CatchSpecies, { species: CatchSpecies; count: number; confidence: "low" | "medium" | "high" }>();
      for (const analysis of analyses) {
        for (const entry of analysis.catches) {
          const existing = merged.get(entry.species);
          merged.set(entry.species, {
            species: entry.species,
            count: (existing?.count ?? 0) + entry.count,
            confidence: existing && confidenceRank[existing.confidence] >= confidenceRank[entry.confidence]
              ? existing.confidence
              : entry.confidence,
          });
        }
      }
      const catches = [...merged.values()]
        .filter((entry) => entry.species !== "no-fish" || entry.count === 0)
        .sort((left, right) => right.count - left.count)
        .slice(0, 8);
      const analysis: PhotoAnalysis = {
        model: analyses[0]?.model ?? "MiMo",
        confidence: analyses.some((entry) => entry.confidence === "low")
          ? "low"
          : analyses.some((entry) => entry.confidence === "medium")
            ? "medium"
            : "high",
        catches: catches.length ? catches : [{ species: "no-fish", count: 0, confidence: "low" }],
        note: [...new Set(analyses.map((entry) => entry.note.trim()).filter(Boolean))].join(" ").slice(0, 240),
      };
      setPhotoAnalysis(analysis);
      setPhotoAnalysisState("ready");
      updateCatchRows(analysis.catches.map((entry) => newCatchRow(entry.species, String(entry.count))));
    } catch {
      if (requestId !== photoAnalysisRequestRef.current) return;
      setPhotoAnalysisState("unavailable");
    }
  };

  const updateTripConsent = (consent: boolean) => {
    setFields((current) => ({
      ...current,
      consent,
      primaryTargetConfirmed: consent,
      completeAttempt: consent,
    }));
  };

  const applyGearProfile = (profileId: string) => {
    const profile = gearProfiles.find((candidate) => candidate.id === profileId);
    setFields((current) => profile ? {
      ...current,
      gearProfileId: profile.id,
      rod: profile.rod ?? "",
      reel: profile.reel ?? "",
      baitLure: profile.bait_lure ?? "",
      rig: profile.rig ?? "",
    } : { ...current, gearProfileId: "" });
  };

  const updateSite = (siteId: string) => {
    setFields((current) => ({ ...current, siteId, mode: modeForSite(siteMap.get(siteId)) }));
    if (selectedWindow && selectedWindow.siteId !== siteId) setSelectedWindow(null);
  };

  const requestCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationState("unsupported");
      setLocationMessage("Location is not available in this browser. Choose a catalog location instead.");
      return;
    }
    setLocationState("locating");
    setLocationMessage("Finding the closest catalog location…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const match = nearestSite(sites, coords.latitude, coords.longitude);
        if (!match) {
          setLocationState("denied");
          setLocationMessage("No catalog locations are available yet. Choose one manually.");
          return;
        }
        updateSite(match.site.id);
        setLocationState("selected");
        setLocationMessage(`Using ${match.site.name} · about ${match.miles < 0.1 ? "less than 0.1" : match.miles.toFixed(1)} mi away. Only the catalog location is saved.`);
      },
      () => {
        setLocationState("denied");
        setLocationMessage("Location permission was unavailable. Choose a catalog location instead.");
      },
      { enableHighAccuracy: false, maximumAge: 5 * 60_000, timeout: 10_000 },
    );
  };

  const startTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (previewOnly) {
      setSubmitState("error");
      setMessage("Preview only: sign in to submit a trip from the live app. No data was sent.");
      return;
    }
    if (!forecastReady || sites.length === 0) {
      setSubmitState("error");
      setMessage("The trip was not started because the location catalog or forecast snapshot is no longer verified.");
      return;
    }
    if (networkState === "offline") {
      setSubmitState("error");
      setMessage("This device appears offline. The trip was not submitted; reconnect before starting it.");
      return;
    }
    const site = siteMap.get(fields.siteId);
    if (!site) {
      setSubmitState("error");
      setMessage("Choose a fishing location.");
      return;
    }
    if (!fields.consent) {
      setSubmitState("error");
      setMessage("Confirm the collection and evaluation consent before starting.");
      return;
    }
    setSubmitState("submitting");
    setMessage("Sending the trip start to the server. No trip is confirmed yet.");
    const slowNotice = window.setTimeout(() => {
      setMessage("Still waiting for the server. Keep this page open; no trip start has been confirmed yet.");
    }, SLOW_SUBMISSION_NOTICE_MS);
    try {
      const requestMaterial = secureTripRequestMaterial("start");
      const startedAt = new Date().toISOString();
      const forecastWindow = findForecastWindow(snapshot, site.id, startedAt);
      markTripPending("start");
      const response = await fetch("/api/trips/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          clientTripId: requestMaterial.id,
          requestToken: requestMaterial.token,
          siteId: site.id,
          startedAt,
          anglerCount: fields.anglerCount,
          mode: modeForSite(site),
          fishingMethod: fields.fishingMethod,
          method: fields.fishingMethod,
          gearProfileId: fields.gearProfileId,
          rod: fields.rod,
          reel: fields.reel,
          baitLure: fields.baitLure,
          rig: fields.rig,
          scoreInfluencedChoice: true,
          primaryTargetConfirmed: true,
          reporterKey: anonymousReporterKey(),
          consent: fields.consent,
          website: "",
          ...(referralCodeRef.current ? { referralCode: referralCodeRef.current } : {}),
          ...forecastFields(forecastWindow),
        }),
      });
      const payload = await tripSubmissionPayload(response);
      const trip = exactTripReceipt(payload, "start", requestMaterial.id, "active", "live");
      const id = requestMaterial.id;
      const token = typeof payload.token === "string" ? payload.token : null;
      if (token !== requestMaterial.token) throw new AmbiguousTripSubmissionError();
      const authoritativeStartedAt = typeof trip.startedAt === "string" ? trip.startedAt : startedAt;
      const stored: StoredActiveTrip = {
        id,
        token,
        siteId: site.id,
        siteName: site.name,
        startedAt: authoritativeStartedAt,
        anglerCount: fields.anglerCount,
        mode: modeForSite(site),
        opportunityWindowId: forecastWindow?.id,
        opportunityScore: forecastWindow?.score,
        modelVersion: forecastWindow?.modelVersion ?? snapshot.modelVersion,
        fishingMethod: fields.fishingMethod,
        gearProfileId: fields.gearProfileId,
        rod: fields.rod,
        reel: fields.reel,
        baitLure: fields.baitLure,
        rig: fields.rig,
        scoreInfluencedChoice: true,
      };
      window.localStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(stored));
      window.localStorage.removeItem(LEGACY_ACTIVE_TRIP_KEY);
      window.localStorage.removeItem(`${TRIP_DRAFT_PREFIX}start`);
      window.localStorage.removeItem(`${TRIP_REQUEST_PREFIX}start`);
      clearTripPending("start");
      setActiveTrip(stored);
      setSubmitState("success");
      setMessage("Trip started. Return here when you finish—even if the result is zero fish.");
    } catch (error) {
      const ambiguous = isAmbiguousSubmission(error);
      if (!ambiguous) {
        window.localStorage.removeItem(`${TRIP_REQUEST_PREFIX}start`);
        clearTripPending("start");
      }
      setSubmitState(ambiguous ? "ambiguous" : "error");
      setMessage(ambiguous
        ? ambiguousSubmissionMessage("start")
        : error instanceof Error ? error.message : "The trip could not be started.");
    } finally {
      window.clearTimeout(slowNotice);
    }
  };

  const completeTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeTrip) return;
    if (previewOnly) {
      setSubmitState("error");
      setMessage("Preview only: sign in to submit a trip from the live app. No data was sent.");
      return;
    }
    if (networkState === "offline") {
      setSubmitState("error");
      setMessage("This device appears offline. The report was not submitted and its draft remains on this device.");
      return;
    }
    if (photo && !photoStorageEnabled) {
      setSubmitState("error");
      setMessage("MiMo reviewed the photo, but private photo storage is not enabled in this release. Remove the photo to save only the reviewed result.");
      return;
    }
    setSubmitState("submitting");
    setMessage("Saving the complete trip report. Keep this page open until the server confirms it.");
    const slowNotice = window.setTimeout(() => {
      setMessage("Still saving. The draft remains on this device, and no completed report is confirmed yet.");
    }, SLOW_SUBMISSION_NOTICE_MS);
    try {
      const formData = new FormData();
      appendCompletionFields(formData, fields, photo, false);
      formData.set("endedAt", new Date().toISOString());
      formData.set("token", activeTrip.token);
      formData.set("reporterKey", anonymousReporterKey());
      formData.set("anglerCount", String(fields.anglerCount));
      formData.set("mode", activeTrip.mode || "shore");
      formData.set("fishingMethod", fields.fishingMethod);
      formData.set("method", fields.fishingMethod);
      if (photo) setPhotoTransferState("sending");
      markTripPending(`complete.${activeTrip.id}`);
      const response = await fetch(`/api/trips/${encodeURIComponent(activeTrip.id)}/complete`, {
        method: "POST",
        body: formData,
      });
      const payload = await tripSubmissionPayload(response);
      exactTripReceipt(payload, "complete", activeTrip.id, "completed", "live", Boolean(photo));
      window.localStorage.removeItem(ACTIVE_TRIP_KEY);
      window.localStorage.removeItem(LEGACY_ACTIVE_TRIP_KEY);
      window.localStorage.removeItem(`${TRIP_DRAFT_PREFIX}complete.${activeTrip.id}`);
      clearTripPending(`complete.${activeTrip.id}`);
      setActiveTrip(null);
      void refreshSummary(setSummary, setSummaryUnavailable);
      if (photo) setPhotoTransferState("confirmed");
      setSubmitState("success");
      const photoConfirmation = photo ? " The verification photo is stored privately with the trip." : "";
      setMessage((anyFishEncounters === 0
        ? "No-fish trip recorded. That result is essential for an honest evaluation backlog and is pending review."
        : targetEncounters === 0
          ? "Non-target fish recorded with zero California halibut. The complete result is pending review."
        : "Trip recorded and pending review. Thanks for helping build the evaluation backlog.") + photoConfirmation);
    } catch (error) {
      const ambiguous = isAmbiguousSubmission(error);
      if (!ambiguous) clearTripPending(`complete.${activeTrip.id}`);
      if (photo) setPhotoTransferState(ambiguous ? "ambiguous" : "failed");
      setSubmitState(ambiguous ? "ambiguous" : "error");
      setMessage(ambiguous
        ? ambiguousSubmissionMessage("complete")
        : error instanceof Error ? error.message : "The trip could not be completed.");
    } finally {
      window.clearTimeout(slowNotice);
    }
  };

  const reportPastTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (previewOnly) {
      setSubmitState("error");
      setMessage("Preview only: sign in to submit a trip from the live app. No data was sent.");
      return;
    }
    if (!forecastReady || sites.length === 0) {
      setSubmitState("error");
      setMessage("The report was not submitted because the location catalog or forecast snapshot is no longer verified.");
      return;
    }
    if (networkState === "offline") {
      setSubmitState("error");
      setMessage("This device appears offline. The report was not submitted and its draft remains on this device.");
      return;
    }
    if (photo && !photoStorageEnabled) {
      setSubmitState("error");
      setMessage("MiMo reviewed the photo, but private photo storage is not enabled in this release. Remove the photo to save only the reviewed result.");
      return;
    }
    const site = siteMap.get(fields.siteId);
    if (!site) {
      setSubmitState("error");
      setMessage("Choose a fishing location.");
      return;
    }
    setSubmitState("submitting");
    setMessage("Saving the past trip report. Keep this page open until the server confirms it.");
    const slowNotice = window.setTimeout(() => {
      setMessage("Still saving. The draft remains on this device, and no report is confirmed yet.");
    }, SLOW_SUBMISSION_NOTICE_MS);
    try {
      const requestMaterial = secureTripRequestMaterial("past");
      const formData = new FormData();
      const reportFields = fields;
      appendCompletionFields(formData, reportFields, photo);
      formData.set("clientTripId", requestMaterial.id);
      formData.set("requestToken", requestMaterial.token);
      formData.set("siteId", site.id);
      formData.set("anglerCount", String(fields.anglerCount));
      formData.set("mode", modeForSite(site));
      formData.set("fishingMethod", fields.fishingMethod);
      formData.set("method", fields.fishingMethod);
      formData.set("scoreInfluencedChoice", "true");
      const forecastWindow = findForecastWindow(snapshot, site.id, reportFields.startedAt, reportFields.endedAt);
      if (forecastWindow) formData.set("opportunityWindowId", forecastWindow.id);
      formData.set("reporterKey", anonymousReporterKey());
      if (referralCodeRef.current) formData.set("referralCode", referralCodeRef.current);
      if (photo) setPhotoTransferState("sending");
      markTripPending("past");
      const response = await fetch("/api/trips/report", { method: "POST", body: formData });
      const payload = await tripSubmissionPayload(response);
      exactTripReceipt(payload, "past", requestMaterial.id, "completed", "past_report", Boolean(photo));
      window.localStorage.removeItem(`${TRIP_DRAFT_PREFIX}past`);
      window.localStorage.removeItem(`${TRIP_REQUEST_PREFIX}past`);
      clearTripPending("past");
      void refreshSummary(setSummary, setSummaryUnavailable);
      if (photo) setPhotoTransferState("confirmed");
      setSubmitState("success");
      const photoConfirmation = photo ? " The verification photo is stored privately with the trip." : "";
      setMessage((anyFishEncounters === 0
        ? "No-fish trip recorded and pending review. Past reports provide descriptive context and stay outside prospective evidence."
        : targetEncounters === 0
          ? "Non-target fish recorded with zero California halibut. The complete result is pending review."
        : "Past trip recorded and pending review. Thank you.") + photoConfirmation);
    } catch (error) {
      const ambiguous = isAmbiguousSubmission(error);
      if (!ambiguous) {
        window.localStorage.removeItem(`${TRIP_REQUEST_PREFIX}past`);
        clearTripPending("past");
      }
      if (photo) setPhotoTransferState(ambiguous ? "ambiguous" : "failed");
      setSubmitState(ambiguous ? "ambiguous" : "error");
      setMessage(ambiguous
        ? ambiguousSubmissionMessage("past")
        : error instanceof Error ? error.message : "The trip could not be reported.");
    } finally {
      window.clearTimeout(slowNotice);
    }
  };

  const openShareableReport = () => openPanel("past");

  const continuePastStep = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!fields.siteId) {
      setSubmitState("error");
      setMessage("Choose a fishing location before opening results.");
      return;
    }
    if (!fields.startedAt || !fields.endedAt || !Number.isFinite(new Date(fields.startedAt).getTime()) || !Number.isFinite(new Date(fields.endedAt).getTime())) {
      setSubmitState("error");
      setMessage("Choose when the trip started and ended before opening results.");
      return;
    }
    if (new Date(fields.endedAt) <= new Date(fields.startedAt)) {
      setSubmitState("error");
      setMessage("End time must be after the start time.");
      return;
    }
    setSubmitState("idle");
    setMessage("");
    setFormStep(2);
  };

  return (
    <>
      {activeTrip ? (
        <aside className="active-trip-banner" aria-label="Active fishing trip">
          <div>
            <span><i /> Active trip</span>
            <strong>{activeTrip.siteName}</strong>
            <small><ClockIcon /> {elapsedLabel(activeTrip.startedAt)}</small>
          </div>
          <button type="button" onClick={() => openPanel("complete")}>Finish trip <ArrowIcon /></button>
        </aside>
      ) : null}

      <section className="validation-section" id="validation">
        <div className="validation-copy">
          <span className="eyebrow"><span /> Community trip log beta</span>
          <h2>The skunks<br />count, too.</h2>
          <p>
            Any complete trip helps build a structured backlog for future evaluation. Location,
            time, effort, method, catches, whether it’s a skunk or not are useful and genuinely appreciated.
          </p>
          <div className="validation-actions">
            <button
              type="button"
              disabled={!forecastReady || sites.length === 0}
              title={tripEntryDisabledTitle}
              onClick={() => openPanel("start", sites[0]?.id)}
            >
              Start a trip <ArrowIcon />
            </button>
            <button
              type="button"
              disabled={!forecastReady || sites.length === 0}
              title={tripEntryDisabledTitle}
              onClick={openShareableReport}
            >
              Log a past trip
            </button>
          </div>
          <small>
            Beta · a separate validation protocol decides whether a report can become model evidence; nothing enters training automatically. This public ledger shows aggregate totals only;
            any separate discussion summary requires human approval and additional safety checks.
          </small>
        </div>
        <div className="validation-ledger" aria-label="Community trip summary">
          <div className="ledger-heading">
            <span>Community trip log</span>
            <em>Totals only</em>
          </div>
          {summary ? (
            <div className="ledger-grid">
              <div><strong>{summary.completedTrips}</strong><span>Completed trips</span><RecentDelta value={summary.past24Hours.completedTrips} /></div>
              <div><strong>{summary.anglerHours.toFixed(summary.anglerHours % 1 === 0 ? 0 : 1)}</strong><span>Angler-hours</span><RecentDelta value={summary.past24Hours.anglerHours} decimals={summary.past24Hours.anglerHours % 1 === 0 ? 0 : 1} /></div>
              <div><strong>{summary.halibutEncounters}</strong><span>Halibut encounters</span><RecentDelta value={summary.past24Hours.halibutEncounters} /></div>
              <div><strong>{summary.sitesCovered}</strong><span>Sites covered</span><RecentDelta value={summary.past24Hours.sitesCovered} /></div>
            </div>
          ) : (
            <div className="ledger-empty">
              <strong>{summaryUnavailable ? "Trip totals coming online" : "Loading trip totals…"}</strong>
              <p>Community totals appear here. Trip reports do not change the current score; any future model use requires the separate validation protocol.</p>
            </div>
          )}
          <p className="ledger-method">
            The future accuracy measure compares catch per angler-hour in highly ranked windows against lower-ranked windows—not anecdotes alone.
          </p>
        </div>
      </section>

      {panel ? (
        <div className="trip-modal-layer" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) closePanel();
        }}>
          <section
            ref={dialogRef}
            className="trip-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trip-modal-title"
            tabIndex={-1}
          >
            <button className="sheet-close" type="button" onClick={closePanel} aria-label="Close trip report"><CloseIcon /></button>
            <span className="eyebrow"><span /> Evaluation trip log</span>

            {panel === "start" ? (
              <form onSubmit={formStep === 1 ? (event) => { event.preventDefault(); setFormStep(2); } : startTrip}>
                <fieldset className="trip-write-fields" disabled={submitState === "submitting" || submitState === "ambiguous"}>
                <header className="trip-form-heading">
                  <h2 id="trip-modal-title">Start fishing.</h2>
                  <p>Choose where you are. We record the exact start now and estimate the rest from time and location.</p>
                </header>
                <TripStepTabs step={formStep} firstLabel="1 · Location" secondLabel="2 · Optional setup" secondDisabled={!fields.siteId} onStepChange={(nextStep) => setFormStep(nextStep)} />
                {formStep === 1 ? <>
                  <TripLocationFields sites={sites} siteId={fields.siteId} onSiteChange={updateSite} onUseCurrentLocation={requestCurrentLocation} locationState={locationState} locationMessage={locationMessage} />
                  <div className="trip-privacy-note">
                    <strong>Time is automatic</strong>
                    <p>Tap Start trip when you begin. The server records the exact time; no extra timing survey is needed.</p>
                  </div>
                </> : <>
                <TripGearFields fields={fields} gearProfiles={gearProfiles} applyGearProfile={applyGearProfile} />
                {currentStartWindow ? (
                  <div className="captured-forecast">
                    <span>Forecast captured</span>
                    <strong>{Math.round(currentStartWindow.score)}</strong>
                    <p>The server verifies the published window and stores its authoritative score identity with this trip when they match.</p>
                  </div>
                ) : null}
                <div className="trip-privacy-note">
                  <strong>What is stored</strong>
                  <p>The selected catalog location, time, forecast metadata, and eventual outcome. If you use GPS, only the matched catalog location is saved; raw coordinates are discarded.</p>
                </div>
                <label className="consent-field">
                  <input type="checkbox" checked={fields.consent} onChange={(event) => updateTripConsent(event.target.checked)} required />
                  <span>I confirm California halibut is my primary target, this is my whole fishing attempt, and I consent to the private use described in the <Link href="/terms" target="_blank">Terms</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span>
                </label>
                </>}
                </fieldset>
                <button className="trip-submit" type="submit" disabled={submitState === "submitting" || Boolean(activeTrip) || (formStep === 1 && !fields.siteId) || (formStep === 2 && networkState === "offline")}>
                  {activeTrip ? "Finish the active trip first" : submitState === "ambiguous" ? "Retry start safely" : formStep === 1 ? "Continue to optional setup" : submitState === "submitting" ? "Starting…" : networkState === "offline" ? "Reconnect to start trip" : "Start trip"}
                  {!activeTrip && submitState !== "submitting" ? <ArrowIcon /> : null}
                </button>
                <TripFormStatus state={displayedSubmitState} message={displayedSubmitMessage} />
              </form>
            ) : null}

            {panel === "complete" && activeTrip ? (
              <form onSubmit={completeTrip}>
                <fieldset className="trip-write-fields" disabled={submitState === "submitting" || submitState === "ambiguous"}>
                <header className="trip-form-heading">
                  <h2 id="trip-modal-title">Finish the trip.</h2>
                  <p>{activeTrip.siteName} · Take a fish photo, choose the simple result, and finish. The server records the finish time and estimates effort.</p>
                </header>
                <TripPhotoField photos={photos} rejectedPhotos={rejectedPhotos} transferState={photoTransferState} analysisState={photoAnalysisState} analysis={photoAnalysis} storageEnabled={photoStorageEnabled} inputRef={photoInputRef} onPhotos={handlePhotos} onAnalyze={analyzePhotos} onRemove={removePhoto} />
                {/* The old invocation was <TripCompletionFields fields={fields} setFields={setFields} onCatchResult={updateCatchResult} hideTimes />; rows now replace the single quick-result control. */}
                <TripCompletionFields catchRows={fields.catchRows} onCatchRows={updateCatchRows} fields={fields} setFields={setFields} hideTimes />
                <TripGearFields fields={fields} gearProfiles={gearProfiles} applyGearProfile={applyGearProfile} />
                </fieldset>
                <button className="trip-submit" type="submit" disabled={submitState === "submitting" || submitState === "success" || networkState === "offline"}>
                  {submitState === "submitting"
                    ? "Saving…"
                    : networkState === "offline"
                      ? "Reconnect to save report"
                    : submitState === "success"
                      ? "Report saved"
                    : submitState === "ambiguous"
                      ? "Retry safely"
                      : anyFishEncounters === 0
                        ? "Record no-fish trip"
                        : targetEncounters > 0
                          ? `Record ${targetEncounters} halibut`
                          : `Record ${selectedCounts.otherCatchCount} non-target fish`}
                  {submitState === "idle" || submitState === "error" || submitState === "ambiguous" ? <ArrowIcon /> : null}
                </button>
                <TripFormStatus state={displayedSubmitState} message={displayedSubmitMessage} />
              </form>
            ) : null}

            {panel === "complete" && !activeTrip && submitState === "success" ? (
              <div className="trip-success-panel">
                <h2 id="trip-modal-title">Trip recorded.</h2>
                <p>{message}</p>
                <button className="trip-submit" type="button" onClick={closePanel}>Done</button>
              </div>
            ) : null}

            {panel === "past" ? (
              <form onSubmit={formStep === 1 ? continuePastStep : reportPastTrip}>
                <fieldset className="trip-write-fields" disabled={submitState === "submitting" || submitState === "ambiguous"}>
                <header className="trip-form-heading">
                  <h2 id="trip-modal-title">Log a past trip.</h2>
                  <p>Start with a fish photo. We use it to suggest the catch, then estimate conditions from the date, time, and location.</p>
                </header>
                <TripStepTabs step={formStep} firstLabel="1 · Photo + location" secondLabel="2 · Result" secondDisabled={!pastLocationAndTimeReady} onStepChange={(nextStep) => {
                  if (nextStep === 2 && !pastLocationAndTimeReady) {
                    setSubmitState("error");
                    setMessage("Choose a fishing location and valid start and end times before opening results.");
                    return;
                  }
                  setSubmitState("idle");
                  setMessage("");
                  setFormStep(nextStep);
                }} />
                {formStep === 1 ? <>
                  <TripPhotoField photos={photos} rejectedPhotos={rejectedPhotos} transferState={photoTransferState} analysisState={photoAnalysisState} analysis={photoAnalysis} storageEnabled={photoStorageEnabled} inputRef={photoInputRef} onPhotos={handlePhotos} onAnalyze={analyzePhotos} onRemove={removePhoto} />
                  <TripLocationFields sites={sites} siteId={fields.siteId} onSiteChange={updateSite} onUseCurrentLocation={requestCurrentLocation} locationState={locationState} locationMessage={locationMessage} />
                  <div className="trip-field-grid">
                  <label className="trip-field">
                    <span>Start</span>
                    <input type="datetime-local" value={fields.startedAt} onChange={(event) => setFields((current) => ({ ...current, startedAt: event.target.value }))} required />
                  </label>
                  <label className="trip-field">
                    <span>End</span>
                    <input type="datetime-local" value={fields.endedAt} onChange={(event) => setFields((current) => ({ ...current, endedAt: event.target.value }))} required />
                  </label>
                  </div>
                  <div className="trip-privacy-note"><strong>Conditions are automatic</strong><p>We estimate opportunity and conditions from this time and catalog location. No extra survey questions.</p></div>
                </> : <>
                <TripCompletionFields catchRows={fields.catchRows} onCatchRows={updateCatchRows} fields={fields} setFields={setFields} hideTimes />
                <TripGearFields fields={fields} gearProfiles={gearProfiles} applyGearProfile={applyGearProfile} />
                </>}
                </fieldset>
                <button className="trip-submit" type="submit" disabled={submitState === "submitting" || submitState === "success" || (formStep === 1 && !pastLocationAndTimeReady) || (formStep === 2 && networkState === "offline")}>
                  {submitState === "ambiguous" ? "Retry safely" : formStep === 1 ? "Continue to result" : submitState === "submitting" ? "Saving…" : networkState === "offline" ? "Reconnect to save report" : submitState === "success" ? "Report saved" : anyFishEncounters === 0 ? "Record no-fish trip" : "Submit trip report"}
                  {submitState === "idle" || submitState === "error" || submitState === "ambiguous" ? <ArrowIcon /> : null}
                </button>
                <TripFormStatus state={displayedSubmitState} message={displayedSubmitMessage} />
              </form>
            ) : null}

            <p className="trip-beta-note">Beta · trip data is saved immediately. Automated review may prepare a private draft, but no discussion summary is posted automatically; human approval is required. A separate validation protocol decides whether a report can become model evidence; trip reports do not change the current score.</p>
            <p className="trip-draft-note">Draft saved on this device as you type.</p>
          </section>
        </div>
      ) : null}
    </>
  );
}

interface TripCompletionFieldsProps {
  catchRows: CatchRow[];
  onCatchRows: (rows: CatchRow[]) => void;
  fields: FormFields;
  setFields: (updater: (current: FormFields) => FormFields) => void;
  hideTimes?: boolean;
}

function TripStepTabs({
  step,
  firstLabel,
  secondLabel,
  secondDisabled,
  onStepChange,
}: {
  step: 1 | 2;
  firstLabel: string;
  secondLabel: string;
  secondDisabled: boolean;
  onStepChange(nextStep: 1 | 2): void;
}) {
  return (
    <div className="trip-step-indicator" role="tablist" aria-label="Trip report sections">
      <button type="button" role="tab" aria-selected={step === 1} className={step === 1 ? "active" : ""} onClick={() => onStepChange(1)}>{firstLabel}</button>
      <button type="button" role="tab" aria-selected={step === 2} className={step === 2 ? "active" : ""} disabled={secondDisabled} onClick={() => onStepChange(2)}>{secondLabel}</button>
    </div>
  );
}

function TripLocationFields({
  sites,
  siteId,
  onSiteChange,
  onUseCurrentLocation,
  locationState,
  locationMessage,
}: {
  sites: FishingSite[];
  siteId: string;
  onSiteChange(siteId: string): void;
  onUseCurrentLocation(): void;
  locationState: LocationState;
  locationMessage: string;
}) {
  return (
    <section className="trip-location-fields" aria-label="Trip location">
      <SiteCombobox className="trip-field wide" sites={sites} value={siteId} onChange={onSiteChange} />
      <div className="trip-location-actions">
        <button className="trip-location-button" type="button" onClick={onUseCurrentLocation} disabled={locationState === "locating"}>
          {locationState === "locating" ? "Finding location…" : "Use my current location"}
        </button>
        <small>GPS is used once to choose the closest catalog location; raw coordinates are never submitted.</small>
      </div>
      {locationMessage ? <p className={`trip-location-status trip-location-status-${locationState}`} role={locationState === "denied" || locationState === "unsupported" ? "status" : undefined}>{locationMessage}</p> : null}
    </section>
  );
}

function TripGearFields({
  fields,
  gearProfiles,
  applyGearProfile,
}: {
  fields: FormFields;
  gearProfiles: GearProfile[];
  applyGearProfile(profileId: string): void;
}) {
  return (
    <section className="trip-gear-section">
      <div className="trip-subsection-heading"><strong>Gear + bait</strong><span>Optional. Set it up once in your profile instead of filling this out every trip.</span></div>
      <label className="trip-field wide"><span>Saved gear preset <em>optional</em></span>
        <select value={fields.gearProfileId} onChange={(event) => applyGearProfile(event.target.value)}>
          <option value="">No preset selected</option>
          {gearProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
        </select>
      </label>
      <Link className="trip-profile-link" href="/profile#gear">NOT HERE? CLICK HERE TO ADD A PRESET <ArrowIcon /></Link>
      <small className="gear-catalog-note">The selected preset supplies your method, bait, and setup. There are no gear text boxes in the trip flow.</small>
    </section>
  );
}

function TripCompletionFields({
  catchRows,
  onCatchRows,
  fields,
  setFields,
  hideTimes = false,
}: TripCompletionFieldsProps) {
  void hideTimes;
  return (
    <>
      <fieldset className="catch-fieldset">
        <legend>Catch results · What happened?</legend>
        <p>Review the camera estimate. The camera is the path to future fish identification; adjust the count or species before saving. Add another row for a mixed catch.</p>
        <div className="catch-result-rows" aria-label="Catch results">
          {catchRows.map((row, index) => (
            <div className="catch-result-row" key={row.id}>
              <label className="trip-field"><span>{index === 0 ? "Number caught" : `Catch ${index + 1}`}</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  inputMode="numeric"
                  value={row.count}
                  onChange={(event) => onCatchRows(catchRows.map((candidate) => candidate.id === row.id ? { ...candidate, count: event.target.value.replace(/[^0-9]/g, "").slice(0, 3) } : candidate))}
                />
              </label>
              <label className="trip-field"><span>Species</span>
                <select value={row.species} onChange={(event) => onCatchRows(catchRows.map((candidate) => candidate.id === row.id ? { ...candidate, species: event.target.value as CatchSpecies } : candidate))}>
                  {CATCH_SPECIES_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="trip-field catch-result-notes"><span>Notes <em>optional</em></span>
                <input
                  type="text"
                  maxLength={240}
                  placeholder="Length / weight"
                  value={row.notes}
                  onChange={(event) => onCatchRows(catchRows.map((candidate) => candidate.id === row.id ? { ...candidate, notes: event.target.value.slice(0, 240) } : candidate))}
                />
              </label>
              {catchRows.length > 1 ? <button className="catch-result-remove" type="button" onClick={() => onCatchRows(catchRows.filter((candidate) => candidate.id !== row.id))} aria-label={`Remove catch ${index + 1}`}>Remove</button> : null}
            </div>
          ))}
        </div>
        {catchRows.length < 12 ? <button className="catch-result-add" type="button" onClick={() => onCatchRows([...catchRows, newCatchRow("california-halibut", "1")])}>+ Add another catch</button> : null}
      </fieldset>
      <label className="consent-field">
        <input type="checkbox" checked={fields.consent} onChange={(event) => {
          const consent = event.target.checked;
          setFields((current) => ({ ...current, consent, primaryTargetConfirmed: consent, completeAttempt: consent }));
        }} required />
        <span>I confirm this covers the whole fishing attempt and I consent to the private uses described in the <Link href="/terms" target="_blank">Terms</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span>
      </label>
    </>
  );
}

function formatPhotoSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function photoTypeLabel(type: string) {
  if (type === "image/jpeg") return "JPEG";
  if (type === "image/png") return "PNG";
  if (type === "image/webp") return "WebP";
  if (type === "image/heic" || type === "image/heic-sequence") return "HEIC";
  if (type === "image/heif" || type === "image/heif-sequence") return "HEIF";
  return type || "Unknown type";
}

function TripPhotoField({
  photos,
  rejectedPhotos,
  transferState,
  analysisState,
  analysis,
  storageEnabled,
  inputRef,
  onPhotos,
  onAnalyze,
  onRemove,
}: {
  photos: File[];
  rejectedPhotos: RejectedPhoto[];
  transferState: PhotoTransferState;
  analysisState: PhotoAnalysisState;
  analysis: PhotoAnalysis | null;
  storageEnabled: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPhotos: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze(): void;
  onRemove(index?: number): void;
}) {
  const [previews, setPreviews] = useState<Array<{ file: File; url: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const readers = photos.map((file) => new Promise<{ file: File; url: string } | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? { file, url: reader.result } : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    }));
    void Promise.all(readers).then((next) => {
      if (!cancelled) setPreviews(next.filter((value): value is { file: File; url: string } => Boolean(value)));
    });
    return () => {
      cancelled = true;
    };
  }, [photos]);

  const state = rejectedPhotos.length && !photos.length ? "invalid" : transferState;
  const statusCopy = rejectedPhotos.length && !photos.length
    ? rejectedPhotos[0].message
    : transferState === "selected"
      ? `${photos.length} photo${photos.length === 1 ? "" : "s"} selected. Nothing has uploaded yet.`
      : transferState === "sending"
        ? "Sending with the trip report. No attachment is confirmed yet."
        : transferState === "confirmed"
          ? "The exact trip receipt confirms a private stored photo."
          : transferState === "failed"
            ? "Not confirmed. Correct any report error, then retry the whole report explicitly."
            : transferState === "ambiguous"
              ? "Outcome unknown. Keep this file selected and use the same safe report retry."
      : storageEnabled
        ? "Choose photos, confirm the selection, and MiMo will suggest the species and count before you submit."
        : "Choose photos, confirm the selection, and MiMo will suggest the species and count. Private storage is currently off.";

  return (
    <section className={`photo-field photo-field-${state}`} aria-labelledby="trip-photo-label">
      <div className="photo-field-heading">
        <span id="trip-photo-label">Fish photo for MiMo review <em>recommended</em></span>
        <small aria-live="polite">{statusCopy}</small>
      </div>
      {!photos.length ? (
        <label className="photo-picker">
          <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} multiple capture="environment" onChange={onPhotos} />
          <strong>Take or add fish photos</strong>
          <small>Confirm the selection before MiMo scans it · JPEG, PNG, WebP, HEIC, or HEIF · up to {MAX_PHOTOS} photos · 5 MB each</small>
        </label>
      ) : (
        <>
          <div className="photo-file-list">
            {photos.map((file, index) => {
              const preview = previews.find((candidate) => candidate.file === file);
              return <div className="photo-file-card" data-state={state} key={`${file.name}-${file.lastModified}-${file.size}-${file.type}`}>
                {preview ? (
                  // A local data URL is deliberately not routed through the image optimizer or a provider.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.url} alt={`Selected verification photo ${index + 1}`} />
                ) : <span className="photo-file-placeholder" aria-hidden="true">IMG</span>}
                <div>
                  <strong>{file.name}</strong>
                  <span>{photoTypeLabel(file.type || (file.name.toLowerCase().endsWith(".heic") ? "image/heic" : file.name.toLowerCase().endsWith(".heif") ? "image/heif" : ""))} · {formatPhotoSize(file.size)}</span>
                  <small>{index === 0 ? "Primary photo · this is the one stored with the trip today." : "Additional photo · used for MiMo review in this release."}</small>
                </div>
                {state === "selected" || state === "failed" ? <button type="button" onClick={() => onRemove(index)}>Remove</button> : null}
              </div>;
            })}
          </div>
          {photos.length < MAX_PHOTOS ? <label className="photo-add-more">
            <input ref={inputRef} type="file" accept={PHOTO_ACCEPT} multiple capture="environment" onChange={onPhotos} />
            + Add more photos
          </label> : null}
          {state === "failed" ? <button type="button" onClick={onAnalyze}>Analyze again</button> : null}
        </>
      )}
      {rejectedPhotos.map((rejected) => <small className="photo-analysis-status" role="alert" key={`${rejected.name}-${rejected.size}`}>{rejected.name}: {rejected.message}</small>)}
      {photos.length && analysisState !== "analyzing" && analysisState !== "ready" ? <button className="photo-analyze-button" type="button" onClick={onAnalyze}>Confirm photos &amp; analyze with MiMo</button> : null}
      {state === "sending" ? (
        <span
          className="photo-indeterminate-progress"
          role="progressbar"
          aria-label="Sending verification photo with trip report"
          aria-valuetext="Sending with the report; byte progress is unavailable"
        />
      ) : null}
      {state === "sending" || state === "ambiguous" ? (
        <small className="photo-no-cancel-note">A cancel control is intentionally unavailable after submission starts because the server may already have committed the report or photo.</small>
      ) : null}
      {analysisState === "analyzing" ? <small className="photo-analysis-status" role="status">MiMo is checking the photo…</small> : null}
      {analysisState === "ready" && analysis ? <small className="photo-analysis-status" role="status">MiMo suggested {analysis.catches.map((entry) => `${entry.count} ${entry.species.replaceAll("-", " ")}`).join(", ") || "no fish"}. Review the rows before saving.{analysis.note ? ` ${analysis.note}` : ""}</small> : null}
      {analysisState === "unavailable" ? <small className="photo-analysis-status">MiMo is unavailable right now. You can still enter the catch rows yourself.</small> : null}
      {analysisState === "error" ? <small className="photo-analysis-status">MiMo returned an unusable suggestion. Enter the catch rows yourself.</small> : null}
      <small className="photo-contract-note">Photos stay local until you confirm analysis. Review and correct every result; nothing is submitted automatically. The first photo is stored privately with the trip today; additional selected photos are used for analysis only until multi-photo storage is enabled. The server strips metadata and re-encodes accepted files before storage.</small>
    </section>
  );
}
