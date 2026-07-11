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
  distanceMiles?: number;
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

export type TimeFilter = "next" | "today" | "tomorrow" | "weekend";
