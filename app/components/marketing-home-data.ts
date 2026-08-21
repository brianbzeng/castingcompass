import type { FishingSite, OpportunitySnapshot, OpportunityWindow } from "../types";

export type LocationState =
  | { status: "loading" }
  | { status: "available"; latitude: number; longitude: number }
  | { status: "denied" | "unavailable" };

export type DataState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "empty"; message: string }
  | { status: "error"; message: string };

export interface MarketingOpportunity {
  siteId: string;
  siteName: string;
  score: number;
  start: string;
  end: string;
  windMph: number | null;
  swellFeet: number | null;
  tideStage: string | null;
  waterTempF: number | null;
  generatedAt: string;
  confidence: string;
  scope: "local" | "service";
  timing: "active" | "upcoming" | "last-available";
  source: "api" | "snapshot";
}

export interface MarketingCommunityThread {
  id: string;
  siteId: string;
  siteName: string;
  title: string;
  body: string;
  handle: string;
  createdAt: string;
  commentCount: number;
}

export interface MarketingCatchReport {
  id: string;
  imageUrl: string;
  imageAlt: string;
  species: string;
  measurement: string;
  siteName: string;
  createdAt: string;
  handle: string;
}

export const marketingApiContract = {
  opportunity: "/v1/opportunities?species=california-halibut&from={iso}&hours=72",
  communityAggregate: "/api/marketing/community-preview?limit=3&sort=recent",
  approvedCatches: "/api/marketing/recent-catches?limit=4&status=approved",
  mailingList: "/api/marketing/mailing-list",
} as const;

const LOCAL_RADIUS_KM = 80;

/**
 * The visual-only branch is intentionally self-contained. It should render
 * the mockup without probing live community APIs that are not part of that
 * checkout's purpose, which otherwise produces noisy 404/503 console errors.
 */
function isVisualOnlyPreview() {
  return typeof window !== "undefined"
    && window.location.hostname === "127.0.0.1"
    && window.location.port === "8788";
}

export function requestBrowserLocation(): Promise<LocationState> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ status: "unavailable" });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        status: "available",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      (error) => resolve({
        status: error.code === error.PERMISSION_DENIED ? "denied" : "unavailable",
      }),
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 6_000 },
    );
  });
}

function radians(value: number) {
  return value * Math.PI / 180;
}

function distanceKm(a: { latitude: number; longitude: number }, b: FishingSite) {
  const earthRadiusKm = 6371;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const startLatitude = radians(a.latitude);
  const endLatitude = radians(b.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function nearestSites(location: LocationState, sites: FishingSite[]) {
  if (location.status !== "available") return [];
  return sites
    .map((site) => ({ site, distance: distanceKm(location, site) }))
    .sort((a, b) => a.distance - b.distance);
}

interface ApiOpportunityWindow {
  id: string;
  site: { id: string };
  start_time: string;
  end_time: string;
  opportunity_score: number;
  confidence?: { level?: string };
  generated_at?: string;
  conditions?: {
    wind_mph?: number | null;
    swell_feet?: number | null;
    tide_stage?: string | null;
    water_temp_f?: number | null;
  } | null;
}

interface ApiOpportunityResponse {
  generated_at: string;
  windows: ApiOpportunityWindow[];
}

function normalizeApiOpportunity(payload: ApiOpportunityResponse): OpportunitySnapshot {
  return {
    generatedAt: payload.generated_at,
    modelVersion: "shared-species-ranking-api",
    targetTaxonId: "california-halibut",
    sources: [],
    windows: payload.windows.map((window) => ({
      id: window.id,
      siteId: window.site.id,
      start: window.start_time,
      end: window.end_time,
      score: window.opportunity_score,
      habitatScore: 0,
      seasonalityScore: 0,
      dynamicScore: 0,
      fishabilityScore: 0,
      confidence: window.confidence?.level ?? "unknown",
      explanationFactors: [],
      targetTaxonId: "california-halibut",
      conditions: {
        windMph: window.conditions?.wind_mph ?? undefined,
        swellFeet: window.conditions?.swell_feet ?? undefined,
        tideStage: window.conditions?.tide_stage ?? undefined,
        waterTempF: window.conditions?.water_temp_f ?? undefined,
      },
    })),
  };
}

async function loadOpportunitySnapshot(signal: AbortSignal) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");
  if (apiBase) {
    try {
      const from = new Date().toISOString();
      const response = await fetch(
        `${apiBase}/v1/opportunities?species=california-halibut&from=${encodeURIComponent(from)}&hours=72`,
        { cache: "no-store", signal },
      );
      if (!response.ok) throw new Error(`Opportunity API returned ${response.status}`);
      return {
        snapshot: normalizeApiOpportunity(await response.json() as ApiOpportunityResponse),
        source: "api" as const,
      };
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }

  const response = await fetch("/data/opportunities-browser.json", { cache: "no-store", signal });
  if (!response.ok) throw new Error("Opportunity snapshot unavailable");
  return {
    snapshot: await response.json() as OpportunitySnapshot,
    source: "snapshot" as const,
  };
}

function selectWindow(windows: OpportunityWindow[], now: number) {
  const active = windows.filter((window) => Date.parse(window.start) <= now && Date.parse(window.end) > now);
  if (active.length) {
    return { window: active.sort((a, b) => b.score - a.score)[0], timing: "active" as const };
  }

  const upcoming = windows.filter((window) => Date.parse(window.start) > now);
  if (upcoming.length) {
    const nearestStart = Math.min(...upcoming.map((window) => Date.parse(window.start)));
    const firstBand = upcoming.filter((window) => Date.parse(window.start) <= nearestStart + 6 * 60 * 60 * 1000);
    return { window: firstBand.sort((a, b) => b.score - a.score)[0], timing: "upcoming" as const };
  }

  const lastEnd = Math.max(...windows.map((window) => Date.parse(window.end)));
  const lastBand = windows.filter((window) => Date.parse(window.end) >= lastEnd - 24 * 60 * 60 * 1000);
  return { window: lastBand.sort((a, b) => b.score - a.score)[0], timing: "last-available" as const };
}

export async function loadMarketingOpportunity(
  location: LocationState,
  signal: AbortSignal,
): Promise<MarketingOpportunity> {
  const [sitesResponse, opportunityResult] = await Promise.all([
    fetch("/data/sites.json", { cache: "force-cache", signal }),
    loadOpportunitySnapshot(signal),
  ]);
  if (!sitesResponse.ok) throw new Error("Supported places unavailable");

  const sites = await sitesResponse.json() as FishingSite[];
  const nearest = nearestSites(location, sites);
  const localSiteIds = new Set(
    nearest.filter(({ distance }) => distance <= LOCAL_RADIUS_KM).map(({ site }) => site.id),
  );
  const localWindows = opportunityResult.snapshot.windows.filter((window) => localSiteIds.has(window.siteId));
  const scopedWindows = localWindows.length ? localWindows : opportunityResult.snapshot.windows;
  if (!scopedWindows.length) throw new Error("No opportunity windows available");

  const selection = selectWindow(scopedWindows, Date.now());
  const window = selection.window;
  const site = sites.find((candidate) => candidate.id === window.siteId);
  return {
    siteId: window.siteId,
    siteName: site?.name ?? "Supported public coast",
    score: Math.round(window.score),
    start: window.start,
    end: window.end,
    windMph: window.conditions.windMph ?? null,
    swellFeet: window.conditions.swellFeet ?? null,
    tideStage: window.conditions.tideStage ?? null,
    waterTempF: window.conditions.waterTempF ?? null,
    generatedAt: opportunityResult.snapshot.generatedAt,
    confidence: window.confidence,
    scope: localWindows.length ? "local" : "service",
    timing: selection.timing,
    source: opportunityResult.source,
  };
}

function parseCommunityThreads(payload: unknown, siteName: string): MarketingCommunityThread[] {
  if (!payload || typeof payload !== "object") return [];
  const posts = (payload as { posts?: unknown[] }).posts;
  if (!Array.isArray(posts)) return [];
  return posts.flatMap((post) => {
    if (!post || typeof post !== "object") return [];
    const item = post as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : "";
    const siteId = typeof item.siteId === "string" ? item.siteId : "";
    const body = typeof item.body === "string"
      ? item.body
      : typeof item.summary === "string" ? item.summary : "";
    const createdAt = typeof item.createdAt === "string"
      ? item.createdAt
      : typeof item.postedAt === "string" ? item.postedAt : "";
    if (!id || !body || !createdAt) return [];
    return [{
      id,
      siteId,
      siteName: typeof item.siteName === "string" ? item.siteName : siteName,
      title: typeof item.title === "string" ? item.title : "Reviewed local report",
      body,
      handle: typeof item.handle === "string" ? item.handle : "reviewed_angler",
      createdAt,
      commentCount: typeof item.commentCount === "number" ? item.commentCount : 0,
    }];
  });
}

export async function loadMarketingCommunity(
  location: LocationState,
  signal: AbortSignal,
): Promise<{ threads: MarketingCommunityThread[]; scope: "local" | "service"; siteName?: string }> {
  const sitesResponse = await fetch("/data/sites.json", { cache: "force-cache", signal });
  if (!sitesResponse.ok) throw new Error("Supported places unavailable");
  const sites = await sitesResponse.json() as FishingSite[];
  const nearestResult = nearestSites(location, sites)[0];
  const nearest = nearestResult && nearestResult.distance <= LOCAL_RADIUS_KM
    ? nearestResult.site
    : undefined;

  if (isVisualOnlyPreview()) {
    return { threads: [], scope: "service", siteName: nearest?.name };
  }

  if (nearest) {
    const [previewResponse, legacyResponse] = await Promise.all([
      fetch(`/api/community/${encodeURIComponent(nearest.id)}/preview`, { cache: "no-store", signal }),
      fetch(`/api/discussions/${encodeURIComponent(nearest.id)}`, { cache: "no-store", signal }),
    ]);
    const preview = previewResponse.ok ? await previewResponse.json() as unknown : null;
    const legacy = legacyResponse.ok ? await legacyResponse.json() as unknown : null;
    const localThreads = [
      ...parseCommunityThreads(preview, nearest.name),
      ...parseCommunityThreads(legacy, nearest.name),
    ].slice(0, 3);
    if (localThreads.length) return { threads: localThreads, scope: "local", siteName: nearest.name };
  }

  const aggregateResponse = await fetch(marketingApiContract.communityAggregate, { cache: "no-store", signal });
  if (!aggregateResponse.ok) return { threads: [], scope: "service", siteName: nearest?.name };
  return {
    threads: parseCommunityThreads(await aggregateResponse.json() as unknown, "CastingCompass community").slice(0, 3),
    scope: "service",
    siteName: nearest?.name,
  };
}

export async function loadApprovedCatchReports(signal: AbortSignal): Promise<MarketingCatchReport[]> {
  if (isVisualOnlyPreview()) return [];
  const response = await fetch(marketingApiContract.approvedCatches, { cache: "no-store", signal });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) return [];
  const payload = await response.json() as { reports?: MarketingCatchReport[] };
  return (payload.reports ?? []).filter((report) => Boolean(report.imageUrl && report.imageAlt));
}

export async function joinMarketingMailingList(email: string) {
  const response = await fetch(marketingApiContract.mailingList, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, source: "marketing-home" }),
  });
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(payload.message ?? "The mailing list is not accepting signups yet.");
  return payload.message ?? "You're on the list.";
}
