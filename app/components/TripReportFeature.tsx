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
const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_UPLOADS_ENABLED = process.env.NEXT_PUBLIC_PHOTO_UPLOADS === "true";
// Keep a slow request pending. If its response is lost, the stable request
// identity below makes an explicit user retry idempotent; nothing auto-replays.
const SLOW_SUBMISSION_NOTICE_MS = 4_000;

type Panel = "start" | "complete" | "past";
type SubmitState = "idle" | "submitting" | "success" | "error" | "ambiguous";
type PhotoTransferState = "idle" | "selected" | "sending" | "confirmed" | "failed" | "ambiguous";
type TripReceiptOperation = "start" | "complete" | "past";
type CatchResult = "none" | "halibut-kept" | "halibut-released" | "other-fish";
type LocationState = "idle" | "locating" | "selected" | "denied" | "unsupported";

interface RejectedPhoto {
  name: string;
  type: string;
  size: number;
  message: string;
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
  onRequireLogin(): void;
}

interface FormFields {
  siteId: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: string;
  anglerCount: number;
  catchResult: CatchResult;
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

function estimatedEndLocal(startedAt: string, durationMinutes: string) {
  const start = new Date(startedAt);
  const minutes = Number.parseInt(durationMinutes, 10);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(minutes) || minutes < 1) {
    throw new Error("Choose when the trip started and about how long it lasted.");
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

function catchCounts(result: CatchResult) {
  return {
    keeperCount: result === "halibut-kept" ? 1 : 0,
    shortReleasedCount: result === "halibut-released" ? 1 : 0,
    otherCatchCount: result === "other-fish" ? 1 : 0,
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
    keeperCount: 0,
    shortReleasedCount: 0,
    fishingMethod: "bait",
    gearProfileId: "",
    rod: "",
    reel: "",
    baitLure: "",
    rig: "",
    mode: "shore",
    scoreInfluencedChoice: "no",
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
      catchResult: parsed.catchResult === "none" || parsed.catchResult === "halibut-kept" || parsed.catchResult === "halibut-released" || parsed.catchResult === "other-fish"
        ? parsed.catchResult
        : Number(parsed.keeperCount ?? 0) > 0
          ? "halibut-kept"
          : Number(parsed.shortReleasedCount ?? 0) > 0
            ? "halibut-released"
            : Number(parsed.otherCatchCount ?? 0) > 0
              ? "other-fish"
              : fallback.catchResult,
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
  if (!ACCEPTED_PHOTO_TYPES.has(file.type)) throw new Error("Use a JPEG, PNG, or WebP photo.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Photo must be 5 MB or smaller.");
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
  if (!fields.mode) throw new Error("Choose the fishing mode used for the whole trip.");
  const counts = catchCounts(fields.catchResult);
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
  formData.set("otherSpecies", "");
  formData.set("shorebreak", fields.shorebreak);
  formData.set("wadingDepth", fields.wadingDepth);
  formData.set("waterClarity", fields.waterClarity);
  formData.set("crowding", fields.crowding);
  formData.set("fishabilityRating", fields.fishabilityRating);
  formData.set("observedWaveHeightFeet", fields.observedWaveHeightFeet);
  formData.set("fishabilityNotes", "");
  formData.set("notes", "");
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
  onRequireLogin,
}: TripReportFeatureProps) {
  const openerRef = useRef<HTMLElement | null>(null);
  const lastRequestKeyRef = useRef<number | null>(null);
  const handledInitialQueryRef = useRef(false);
  const restoredClientStateRef = useRef(false);
  const referralCodeRef = useRef<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [activeTrip, setActiveTrip] = useState<StoredActiveTrip | null>(null);
  const [selectedWindow, setSelectedWindow] = useState<OpportunityWindow | null>(null);
  const [fields, setFields] = useState<FormFields>(() => freshFields());
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [gearProfiles, setGearProfiles] = useState<GearProfile[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [rejectedPhoto, setRejectedPhoto] = useState<RejectedPhoto | null>(null);
  const [photoTransferState, setPhotoTransferState] = useState<PhotoTransferState>("idle");
  const [locationState, setLocationState] = useState<LocationState>("idle");
  const [locationMessage, setLocationMessage] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");
  const [summary, setSummary] = useState<SummaryView | null>(null);
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);
  const networkState = useClientNetworkState();

  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const selectedCounts = catchCounts(fields.catchResult);
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
  const tripEntryDisabledTitle = forecastUnavailable
    ? "Forecast verification failed. Retry the forecast before logging a trip."
    : !forecastReady || sites.length === 0
      ? "Wait for the fishing-location catalog and forecast snapshot to load"
      : undefined;

  const resetFeedback = useCallback(() => {
    setSubmitState("idle");
    setMessage("");
    setPhoto(null);
    setRejectedPhoto(null);
    setPhotoTransferState("idle");
    setLocationState("idle");
    setLocationMessage("");
    if (photoInputRef.current) photoInputRef.current.value = "";
  }, []);

  const openPanel = useCallback((nextPanel: Panel, siteId?: string, forecastWindow?: OpportunityWindow) => {
    // Finishing a previously started trip must remain possible during a forecast outage.
    // Starting or backfilling a location-bound trip requires the verified catalog and snapshot.
    if (nextPanel !== "complete" && (!forecastReady || sites.length === 0)) return;
    if (!canSubmit) {
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
      const fallback = freshFields(siteId ?? sites[0]?.id ?? "");
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
  }, [activeTrip, canSubmit, forecastReady, onRequireLogin, resetFeedback, sites]);

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

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const nextPhoto = event.target.files?.[0] ?? null;
    if (!nextPhoto) {
      setPhoto(null);
      setRejectedPhoto(null);
      setPhotoTransferState("idle");
      return;
    }
    try {
      validatePhoto(nextPhoto);
      setPhoto(nextPhoto);
      setRejectedPhoto(null);
      setPhotoTransferState("selected");
    } catch (error) {
      setPhoto(null);
      setRejectedPhoto({
        name: nextPhoto.name,
        type: nextPhoto.type,
        size: nextPhoto.size,
        message: error instanceof Error ? error.message : "That photo cannot be used.",
      });
      setPhotoTransferState("idle");
      event.target.value = "";
    }
  };

  const removePhoto = () => {
    setPhoto(null);
    setRejectedPhoto(null);
    setPhotoTransferState("idle");
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const updateCatchResult = (catchResult: CatchResult) => {
    setFields((current) => ({ ...current, catchResult, ...catchCounts(catchResult) }));
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
          scoreInfluencedChoice: false,
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
        scoreInfluencedChoice: false,
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
    if (networkState === "offline") {
      setSubmitState("error");
      setMessage("This device appears offline. The report was not submitted and its draft remains on this device.");
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
      const reportFields = { ...fields, endedAt: estimatedEndLocal(fields.startedAt, fields.durationMinutes) };
      appendCompletionFields(formData, reportFields, photo);
      formData.set("clientTripId", requestMaterial.id);
      formData.set("requestToken", requestMaterial.token);
      formData.set("siteId", site.id);
      formData.set("anglerCount", String(fields.anglerCount));
      formData.set("mode", modeForSite(site));
      formData.set("fishingMethod", fields.fishingMethod);
      formData.set("method", fields.fishingMethod);
      formData.set("scoreInfluencedChoice", "false");
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
                <div className="trip-step-indicator"><span className={formStep === 1 ? "active" : ""}>1 · Location</span><span className={formStep === 2 ? "active" : ""}>2 · Optional setup</span></div>
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
                {formStep === 2 ? <button className="trip-back-button" type="button" onClick={() => setFormStep(1)}>← Back to location</button> : null}
                </fieldset>
                <button className="trip-submit" type="submit" disabled={submitState === "submitting" || Boolean(activeTrip) || (formStep === 2 && networkState === "offline")}>
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
                {PHOTO_UPLOADS_ENABLED && canSubmit ? <TripPhotoField photo={photo} rejectedPhoto={rejectedPhoto} transferState={photoTransferState} inputRef={photoInputRef} onPhoto={handlePhoto} onRemove={removePhoto} /> : <div className="trip-photo-unavailable"><strong>Fish photo</strong><p>Photo capture and fish identification are not enabled in this release. The result can still be logged in one tap.</p></div>}
                <TripCompletionFields fields={fields} setFields={setFields} onCatchResult={updateCatchResult} hideTimes />
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
              <form onSubmit={formStep === 1 ? (event) => { event.preventDefault(); setFormStep(2); } : reportPastTrip}>
                <fieldset className="trip-write-fields" disabled={submitState === "submitting" || submitState === "ambiguous"}>
                <header className="trip-form-heading">
                  <h2 id="trip-modal-title">Log a past trip.</h2>
                  <p>Take a photo first, choose a nearby place, and give us one rough duration. We estimate the rest from date, time, and location.</p>
                </header>
                <div className="trip-step-indicator"><span className={formStep === 1 ? "active" : ""}>1 · Photo + location</span><span className={formStep === 2 ? "active" : ""}>2 · Result</span></div>
                {formStep === 1 ? <>
                  {PHOTO_UPLOADS_ENABLED && canSubmit ? <TripPhotoField photo={photo} rejectedPhoto={rejectedPhoto} transferState={photoTransferState} inputRef={photoInputRef} onPhoto={handlePhoto} onRemove={removePhoto} /> : <div className="trip-photo-unavailable"><strong>Fish photo</strong><p>Photo capture and fish identification are not enabled in this release. You can still log the trip without one.</p></div>}
                  <TripLocationFields sites={sites} siteId={fields.siteId} onSiteChange={updateSite} onUseCurrentLocation={requestCurrentLocation} locationState={locationState} locationMessage={locationMessage} />
                  <label className="trip-field">
                    <span>When did you fish?</span>
                    <input type="datetime-local" value={fields.startedAt} onChange={(event) => setFields((current) => ({ ...current, startedAt: event.target.value }))} required />
                  </label>
                  <label className="trip-field">
                    <span>About how long?</span>
                    <select value={fields.durationMinutes} onChange={(event) => setFields((current) => ({ ...current, durationMinutes: event.target.value }))} required>
                      <option value="30">About 30 minutes</option>
                      <option value="60">About 1 hour</option>
                      <option value="120">About 2 hours</option>
                      <option value="240">About 4 hours</option>
                      <option value="480">Most of the day</option>
                    </select>
                  </label>
                  <div className="trip-privacy-note"><strong>Estimated, not interrogated</strong><p>We use the date, approximate duration, and catalog location to calculate angler-hours. You can choose the closest option when a trip ran long.</p></div>
                </> : <>
                <TripCompletionFields fields={fields} setFields={setFields} onCatchResult={updateCatchResult} hideTimes />
                <TripGearFields fields={fields} gearProfiles={gearProfiles} applyGearProfile={applyGearProfile} />
                </>}
                {formStep === 2 ? <button className="trip-back-button" type="button" onClick={() => setFormStep(1)}>← Back to photo + location</button> : null}
                </fieldset>
                <button className="trip-submit" type="submit" disabled={submitState === "submitting" || submitState === "success" || (formStep === 2 && networkState === "offline")}>
                  {submitState === "ambiguous" ? "Retry safely" : formStep === 1 ? "Continue to result" : submitState === "submitting" ? "Saving…" : networkState === "offline" ? "Reconnect to save report" : submitState === "success" ? "Report saved" : anyFishEncounters === 0 ? "Record no-fish trip" : "Submit trip report"}
                  {submitState === "idle" || submitState === "error" || submitState === "ambiguous" ? <ArrowIcon /> : null}
                </button>
                <TripFormStatus state={displayedSubmitState} message={displayedSubmitMessage} />
              </form>
            ) : null}

            <p className="trip-beta-note">Beta · trip data is saved immediately. Automated review may prepare a private draft, but no discussion summary is posted automatically; human approval is required.</p>
            <p className="trip-draft-note">Draft saved on this device as you type.</p>
          </section>
        </div>
      ) : null}
    </>
  );
}

interface TripCompletionFieldsProps {
  fields: FormFields;
  setFields: (updater: (current: FormFields) => FormFields) => void;
  onCatchResult: (result: CatchResult) => void;
  hideTimes?: boolean;
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
      {gearProfiles.length ? (
        <label className="trip-field wide"><span>Saved gear preset</span>
          <select value={fields.gearProfileId} onChange={(event) => applyGearProfile(event.target.value)}>
            <option value="">No saved setup</option>
            {gearProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
          </select>
        </label>
      ) : null}
      <Link className="trip-profile-link" href="/profile#gear">Set up gear and bait in your profile <ArrowIcon /></Link>
      <small className="gear-catalog-note">A saved preset is copied into the private trip record. There are no gear text boxes in the trip flow.</small>
    </section>
  );
}

function TripCompletionFields({
  fields,
  setFields,
  onCatchResult,
  hideTimes = false,
}: TripCompletionFieldsProps) {
  void hideTimes;
  return (
    <>
      <fieldset className="catch-fieldset">
        <legend>What happened?</legend>
        <p>Choose one simple result. The camera is the path to future fish identification; this release keeps the result human-confirmed.</p>
        <div className="trip-quick-result" role="group" aria-label="Catch result">
          {([
            ["none", "No fish"],
            ["halibut-kept", "Halibut kept"],
            ["halibut-released", "Halibut released"],
            ["other-fish", "Other fish"],
          ] as const).map(([value, label]) => <button key={value} type="button" className={fields.catchResult === value ? "selected" : ""} aria-pressed={fields.catchResult === value} onClick={() => onCatchResult(value)}>{label}</button>)}
        </div>
        <small className="regulation-reminder">
          Only count a kept fish if it was legal. California halibut must be at least 22 inches total length;
          always confirm the <a href="https://wildlife.ca.gov/Fishing/Ocean/Regulations/Fishing-Map/San-Francisco" target="_blank" rel="noreferrer">current CDFW regulations ↗</a>.
        </small>
      </fieldset>
      <label className="consent-field">
        <input type="checkbox" checked={fields.consent} onChange={(event) => {
          const consent = event.target.checked;
          setFields((current) => ({ ...current, consent, primaryTargetConfirmed: consent, completeAttempt: consent }));
        }} required />
        <span>I confirm this covers the whole fishing attempt, California halibut was the primary target, and I consent to the private uses described in the <Link href="/terms" target="_blank">Terms</Link> and <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span>
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
  return type || "Unknown type";
}

function TripPhotoField({
  photo,
  rejectedPhoto,
  transferState,
  inputRef,
  onPhoto,
  onRemove,
}: {
  photo: File | null;
  rejectedPhoto: RejectedPhoto | null;
  transferState: PhotoTransferState;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPhoto: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    if (!photo) return;
    const reader = new FileReader();
    const handleLoad = () => {
      if (typeof reader.result === "string") setPreview({ file: photo, url: reader.result });
    };
    reader.addEventListener("load", handleLoad);
    reader.readAsDataURL(photo);
    return () => {
      reader.removeEventListener("load", handleLoad);
      if (reader.readyState === FileReader.LOADING) reader.abort();
    };
  }, [photo]);

  const previewUrl = preview?.file === photo ? preview.url : null;

  const displayedFile = photo ?? rejectedPhoto;
  const state = rejectedPhoto ? "invalid" : transferState;
  const statusCopy = rejectedPhoto
    ? rejectedPhoto.message
    : transferState === "selected"
      ? "Browser checks passed. Selected only—nothing has uploaded yet."
      : transferState === "sending"
        ? "Sending with the trip report. No attachment is confirmed yet."
        : transferState === "confirmed"
          ? "The exact trip receipt confirms a private stored photo."
          : transferState === "failed"
            ? "Not confirmed. Correct any report error, then retry the whole report explicitly."
            : transferState === "ambiguous"
              ? "Outcome unknown. Keep this file selected and use the same safe report retry."
              : "Choose one private verification photo. Nothing uploads until the report is submitted.";
  const removable = state === "selected" || state === "failed" || state === "invalid";

  return (
    <section className={`photo-field photo-field-${state}`} aria-labelledby="trip-photo-label">
      <div className="photo-field-heading">
        <span id="trip-photo-label">Fish photo for identification <em>optional</em></span>
        <small aria-live="polite">{statusCopy}</small>
      </div>
      {!displayedFile ? (
        <label className="photo-picker">
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={onPhoto} />
          <strong>Take a fish photo</strong>
          <small>Camera or one JPEG, PNG, or WebP · 5 MB max</small>
        </label>
      ) : (
        <div className="photo-file-card" data-state={state}>
          {previewUrl && photo ? (
            // A local data URL is deliberately not routed through the image optimizer or a provider.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Selected verification photo preview" />
          ) : <span className="photo-file-placeholder" aria-hidden="true">IMG</span>}
          <div>
            <strong>{displayedFile.name}</strong>
            <span>{photoTypeLabel(displayedFile.type)} · {formatPhotoSize(displayedFile.size)}</span>
            <small>{statusCopy}</small>
          </div>
          {removable ? <button type="button" onClick={onRemove}>{state === "invalid" ? "Dismiss" : "Remove"}</button> : null}
          {state === "failed" ? <button type="submit">Retry report with this photo</button> : null}
        </div>
      )}
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
      <small className="photo-contract-note">Current storage supports one private photo per trip. The server strips metadata and re-encodes accepted files before storage. Fish-ID inference is not enabled until its separate model release is approved.</small>
    </section>
  );
}
