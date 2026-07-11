export type SiteType = "Pier" | "Shore" | "Beach" | "Jetty";

export interface FishingSite {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  region: string;
  type: SiteType | string;
  access: string;
  regulationUrl: string;
  depthProfile?: string;
  structureTags: string[];
  parking?: string;
  transit?: string;
  amenities?: string[];
  accessSourceUrl?: string;
  accessStatus?: "open" | "limited" | "closed" | "unknown";
  accessStatusNote?: string;
  accessStatusUpdatedAt?: string;
  distanceMiles?: number;
}

export interface CommunityPulseTheme {
  label: string;
  note: string;
}

export interface CommunityPulseSource {
  label: string;
  url: string;
  publishedAt?: string;
  kind: "official" | "discussion" | "guide" | string;
}

export interface CommunityPulse {
  siteId: string;
  reviewedAt: string;
  coverage: string;
  confidence: "high" | "medium" | "low";
  summary: string;
  themes: CommunityPulseTheme[];
  sources: CommunityPulseSource[];
}

export interface SourceFreshness {
  name: string;
  observedAt: string;
  status: "fresh" | "aging" | "stale" | "unavailable" | string;
  ageMinutes?: number;
  freshnessLimitMinutes?: number;
  detail?: string;
}

export interface Conditions {
  tideStage?: string;
  currentKnots?: number;
  windMph?: number;
  windDirection?: string;
  swellFeet?: number;
  waterTempF?: number;
  waterTempSource?: string;
  ndbcObservedWaterTempF?: number;
  ndbcObservedAt?: string;
  daylight?: boolean;
  summary?: string;
}

export interface OpportunityWindow {
  id: string;
  siteId: string;
  start: string;
  end: string;
  score: number;
  habitatScore: number;
  seasonalityScore: number;
  dynamicScore: number;
  confidence: "high" | "medium" | "low" | string;
  rank?: number;
  explanationFactors: string[];
  conditions: Conditions;
  modelVersion?: string;
  sources?: SourceFreshness[];
}

export interface OpportunitySnapshot {
  generatedAt: string;
  modelVersion: string;
  methodology?: string;
  sources: SourceFreshness[];
  windows: OpportunityWindow[];
}

export type TimeFilter = "today" | "tomorrow" | "custom";
