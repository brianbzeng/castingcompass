"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ContourMap } from "./ContourMap";
import {
  ArrowIcon,
  ChevronIcon,
  ClockIcon,
  CloseIcon,
  DownloadIcon,
  InfoIcon,
  LayersIcon,
  ListIcon,
  LocateIcon,
  LogoMark,
  MapIcon,
  TemperatureIcon,
  TideIcon,
  WindIcon,
} from "./icons";
import type {
  FishingSite,
  OpportunitySnapshot,
  OpportunityWindow,
  SourceFreshness,
  TimeFilter,
} from "../types";

const FALLBACK_SITES: FishingSite[] = [
  {
    id: "oyster-point-pier",
    name: "Oyster Point Pier",
    latitude: 37.665,
    longitude: -122.377,
    region: "South Bay",
    type: "Pier",
    access: "Public shoreline pier; verify posted access hours before departure.",
    regulationUrl: "https://wildlife.ca.gov/Fishing/Ocean/Regulations/Fishing-Map/sf-bay",
    structureTags: ["channel edge", "sand flat"],
  },
  {
    id: "pacifica-pier",
    name: "Pacifica Municipal Pier",
    latitude: 37.633,
    longitude: -122.495,
    region: "Coast",
    type: "Pier",
    access: "Public municipal pier; closures can occur during heavy swell.",
    regulationUrl: "https://wildlife.ca.gov/Fishing/Ocean/Regulations/Fishing-Map/San-Francisco",
    structureTags: ["open coast", "sand trough"],
  },
  {
    id: "berkeley-pier-shore",
    name: "Berkeley Marina Shoreline",
    latitude: 37.865,
    longitude: -122.314,
    region: "East Bay",
    type: "Shore",
    access: "Public shoreline access near the marina.",
    regulationUrl: "https://wildlife.ca.gov/Fishing/Ocean/Regulations/Fishing-Map/sf-bay",
    structureTags: ["marina edge", "mud-sand transition"],
  },
];

interface ApiSourceFreshness {
  source: string;
  observed_at: string | null;
  checked_at: string;
  age_minutes: number | null;
  freshness_limit_minutes: number;
  status: string;
  used_in_score: boolean;
  excluded_reason: string | null;
}

interface ApiOpportunityWindow {
  id: string;
  site: { id: string };
  start_time: string;
  end_time: string;
  opportunity_score: number;
  components: {
    habitat_score: number;
    seasonality_score: number;
    dynamic_score: number;
  };
  confidence: { level: string };
  explanation_factors: Array<{ label: string; detail: string }>;
  model_version: string;
  generated_at: string;
  source_freshness: ApiSourceFreshness[];
  conditions?: {
    tide_stage?: string | null;
    current_knots?: number | null;
    wind_mph?: number | null;
    swell_feet?: number | null;
    water_temp_f?: number | null;
    daylight?: boolean | null;
  } | null;
  rank?: number | null;
}

interface ApiOpportunityResponse {
  generated_at: string;
  score_definition: string;
  windows: ApiOpportunityWindow[];
}

function normalizeApiSnapshot(payload: ApiOpportunityResponse): OpportunitySnapshot {
  const sourceMap = new Map<string, SourceFreshness>();
  payload.windows.forEach((window) => {
    window.source_freshness.forEach((source) => {
      const current = sourceMap.get(source.source);
      if (!current || new Date(source.checked_at) > new Date(current.observedAt)) {
        sourceMap.set(source.source, {
          name: source.source.replaceAll("_", " "),
          observedAt: source.observed_at ?? source.checked_at,
          status: source.status,
          ageMinutes: source.age_minutes ?? undefined,
          freshnessLimitMinutes: source.freshness_limit_minutes,
          detail: source.excluded_reason ?? undefined,
        });
      }
    });
  });

  return {
    generatedAt: payload.generated_at,
    modelVersion: payload.windows[0]?.model_version ?? "unknown",
    methodology: payload.score_definition,
    sources: Array.from(sourceMap.values()),
    windows: payload.windows.map((window) => ({
      id: window.id,
      siteId: window.site.id,
      start: window.start_time,
      end: window.end_time,
      score: window.opportunity_score,
      habitatScore: window.components.habitat_score,
      seasonalityScore: window.components.seasonality_score,
      dynamicScore: window.components.dynamic_score,
      confidence: window.confidence.level,
      rank: window.rank ?? undefined,
      explanationFactors: window.explanation_factors.map((factor) => factor.detail || factor.label),
      conditions: {
        tideStage: window.conditions?.tide_stage ?? undefined,
        currentKnots: window.conditions?.current_knots ?? undefined,
        windMph: window.conditions?.wind_mph ?? undefined,
        swellFeet: window.conditions?.swell_feet ?? undefined,
        waterTempF: window.conditions?.water_temp_f ?? undefined,
        daylight: window.conditions?.daylight ?? undefined,
      },
      modelVersion: window.model_version,
      sources: window.source_freshness.map((source) => ({
        name: source.source.replaceAll("_", " "),
        observedAt: source.observed_at ?? source.checked_at,
        status: source.status,
        ageMinutes: source.age_minutes ?? undefined,
        freshnessLimitMinutes: source.freshness_limit_minutes,
        detail: source.excluded_reason ?? undefined,
      })),
    })),
  };
}

async function loadForecastData() {
  const staticSitesPromise = fetch("/data/sites.json").then((response) => {
    if (!response.ok) throw new Error("sites unavailable");
    return response.json() as Promise<FishingSite[]>;
  });
  const apiBase = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

  if (apiBase) {
    const staticSites = await staticSitesPromise;
    try {
      const from = new Date().toISOString();
      const response = await fetch(
        `${apiBase}/v1/opportunities?species=california-halibut&from=${encodeURIComponent(from)}&hours=72`,
      );
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const apiSnapshot = (await response.json()) as ApiOpportunityResponse;
      return { sites: staticSites, snapshot: normalizeApiSnapshot(apiSnapshot), state: "live" as const };
    } catch {
      const response = await fetch("/data/opportunities.json");
      if (!response.ok) throw new Error("API and snapshot unavailable");
      return {
        sites: staticSites,
        snapshot: (await response.json()) as OpportunitySnapshot,
        state: "cached" as const,
      };
    }
  }

  const [staticSites, staticSnapshot] = await Promise.all([
    staticSitesPromise,
    fetch("/data/opportunities.json").then((response) => {
      if (!response.ok) throw new Error("snapshot unavailable");
      return response.json() as Promise<OpportunitySnapshot>;
    }),
  ]);
  const state = staticSnapshot.sources.some((source) => source.status.startsWith("fresh")) ? "live" : "cached";
  return { sites: staticSites, snapshot: staticSnapshot, state: state as "live" | "cached" };
}

function fallbackSnapshot(): OpportunitySnapshot {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const sources: SourceFreshness[] = [
    {
      name: "Cached planning snapshot",
      observedAt: start.toISOString(),
      status: "aging",
      detail: "Live sources unavailable; scores are illustrative until refreshed.",
    },
  ];
  const windows = FALLBACK_SITES.map((site, index) => ({
    id: `${site.id}-${start.toISOString()}`,
    siteId: site.id,
    start: new Date(start.getTime() + index * 60 * 60 * 1000).toISOString(),
    end: new Date(start.getTime() + (index + 2) * 60 * 60 * 1000).toISOString(),
    score: 72 - index * 7,
    habitatScore: 76 - index * 5,
    seasonalityScore: 68,
    dynamicScore: 69 - index * 4,
    confidence: "low",
    rank: index + 1,
    explanationFactors: ["Accessible casting zone", "Seasonal halibut pattern", "Cached conditions"],
    conditions: { tideStage: "Loading", windMph: 9, waterTempF: 58, daylight: true },
    modelVersion: "fallback-0.1",
    sources,
  }));
  return {
    generatedAt: start.toISOString(),
    modelVersion: "fallback-0.1",
    methodology: "Offline interface fallback",
    sources,
    windows,
  };
}

function distanceMiles(a: [number, number], b: [number, number]) {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMiles * Math.asin(Math.sqrt(h));
}

function scoreTone(score: number) {
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 45) return "fair";
  return "quiet";
}

function formatWindow(startIso: string, endIso: string, compact = false) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay = start.toDateString() === new Date().toDateString();
  const day = sameDay ? "Today" : start.toLocaleDateString("en-US", { weekday: "short" });
  const timeOptions: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  if (compact) return `${day}, ${start.toLocaleTimeString("en-US", timeOptions)}`;
  return `${day} · ${start.toLocaleTimeString("en-US", timeOptions)}–${end.toLocaleTimeString("en-US", timeOptions)}`;
}

function formatAge(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function filterWindow(window: OpportunityWindow, filter: TimeFilter) {
  const start = new Date(window.start);
  const now = new Date();
  if (filter === "next") return start.getTime() >= now.getTime() - 2 * 60 * 60 * 1000;
  if (filter === "today") return start.toDateString() === now.toDateString();
  if (filter === "tomorrow") {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    return start.toDateString() === tomorrow.toDateString();
  }
  return start.getDay() === 0 || start.getDay() === 6;
}

function latestPerSite(windows: OpportunityWindow[], filter: TimeFilter) {
  const result = new Map<string, OpportunityWindow>();
  windows
    .filter((window) => filterWindow(window, filter))
    .sort((a, b) => {
      if (filter === "next") return b.score - a.score;
      return new Date(a.start).getTime() - new Date(b.start).getTime() || b.score - a.score;
    })
    .forEach((window) => {
      const existing = result.get(window.siteId);
      if (!existing || window.score > existing.score) result.set(window.siteId, window);
    });
  return result;
}

function MetricBar({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="metric-row">
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{Math.round(value)}</strong>
      </div>
      <div className="metric-track" aria-label={`${label} ${Math.round(value)} out of 100`}>
        <span style={{ width: `${Math.max(3, Math.min(100, value))}%` }} />
      </div>
      <small>{note}</small>
    </div>
  );
}

function SourceStatus({ source }: { source: SourceFreshness }) {
  const statusTone = source.status.startsWith("fresh")
    ? "fresh"
    : source.status.startsWith("aging") || source.status.startsWith("provisional") || source.status.startsWith("demo")
      ? "aging"
      : "stale";
  const statusLabel = source.status.split(";")[0];
  return (
    <div className="source-row">
      <span className={`source-dot ${statusTone}`} />
      <div>
        <strong>{source.name}</strong>
        <small>{statusLabel} · {formatAge(source.observedAt)}</small>
      </div>
    </div>
  );
}

export function OpportunityApp() {
  const [sites, setSites] = useState<FishingSite[]>(FALLBACK_SITES);
  const [snapshot, setSnapshot] = useState<OpportunitySnapshot>(fallbackSnapshot);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("next");
  const [view, setView] = useState<"map" | "list">("map");
  const [region, setRegion] = useState("All water");
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [showMethod, setShowMethod] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [dataState, setDataState] = useState<"loading" | "live" | "cached">("loading");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  useEffect(() => {
    let active = true;
    loadForecastData()
      .then(({ sites: nextSites, snapshot: nextSnapshot, state }) => {
        if (!active) return;
        setSites(nextSites);
        setSnapshot(nextSnapshot);
        setDataState(state);
      })
      .catch(() => {
        if (active) setDataState("cached");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const windowsBySite = useMemo(
    () => latestPerSite(snapshot.windows, timeFilter),
    [snapshot.windows, timeFilter],
  );

  const regions = useMemo(
    () => ["All water", ...Array.from(new Set(sites.map((site) => site.region))).sort()],
    [sites],
  );

  const rankedSites = useMemo(() => {
    return sites
      .filter((site) => region === "All water" || site.region === region)
      .map((site) => ({
        ...site,
        distanceMiles: userPosition
          ? distanceMiles(userPosition, [site.longitude, site.latitude])
          : undefined,
      }))
      .filter((site) => windowsBySite.has(site.id))
      .sort((a, b) => {
        if (userPosition && a.distanceMiles !== undefined && b.distanceMiles !== undefined) {
          const distanceDifference = a.distanceMiles - b.distanceMiles;
          if (Math.abs(distanceDifference) > 8) return distanceDifference;
        }
        return (windowsBySite.get(b.id)?.score ?? 0) - (windowsBySite.get(a.id)?.score ?? 0);
      });
  }, [sites, region, userPosition, windowsBySite]);

  const bestSite = rankedSites[0] ?? null;
  const bestWindow = bestSite ? windowsBySite.get(bestSite.id) ?? null : null;
  const selectedSite = sites.find((site) => site.id === selectedSiteId) ?? null;
  const selectedWindow = selectedSiteId ? windowsBySite.get(selectedSiteId) ?? null : null;

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser.");
      return;
    }
    setLocationMessage("Locating…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPosition([position.coords.longitude, position.coords.latitude]);
        setLocationMessage("Sorted with nearby access first");
      },
      () => setLocationMessage("Location permission was not granted."),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, []);

  const triggerInstall = useCallback(() => {
    if (!installPrompt) return;
    const promptEvent = installPrompt as Event & { prompt: () => Promise<void> };
    void promptEvent.prompt();
    setInstallPrompt(null);
  }, [installPrompt]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="ContourCast home">
          <LogoMark />
          <span>ContourCast</span>
          <em>Bay Area beta</em>
        </a>
        <nav className="desktop-nav" aria-label="Primary navigation">
          <a href="#forecast">Forecast</a>
          <button type="button" onClick={() => setShowMethod(true)}>How it works</button>
          <a href="#sources">Data</a>
        </nav>
        <div className="topbar-actions">
          <span className={`data-pill ${dataState}`}>
            <i /> {dataState === "loading" ? "Loading" : dataState === "live" ? "Live data" : "Cached"}
          </span>
          {installPrompt ? (
            <button className="install-button" type="button" onClick={triggerInstall}>
              <DownloadIcon /> Install
            </button>
          ) : null}
        </div>
      </header>

      <section className="forecast-intro" id="top">
        <div className="eyebrow-row">
          <span className="eyebrow"><span /> California halibut</span>
          <button className="method-link" type="button" onClick={() => setShowMethod(true)}>
            What does the score mean? <InfoIcon />
          </button>
        </div>
        <div className="intro-grid">
          <div>
            <h1>Find the water<br />worth fishing.</h1>
            <p>
              Ranked two-hour windows for public shore and pier access—built from seafloor structure,
              seasonality, and current conditions.
            </p>
          </div>
          {bestSite && bestWindow ? (
            <button className="next-window-card" type="button" onClick={() => setSelectedSiteId(bestSite.id)}>
              <div className={`score-orbit ${scoreTone(bestWindow.score)}`}>
                <span>{Math.round(bestWindow.score)}</span>
                <small>of 100</small>
              </div>
              <div className="next-window-copy">
                <span>Strongest upcoming window</span>
                <strong>{bestSite.name}</strong>
                <p><ClockIcon /> {formatWindow(bestWindow.start, bestWindow.end)}</p>
              </div>
              <ArrowIcon className="next-arrow" />
            </button>
          ) : (
            <div className="empty-window">No ranked windows match this filter.</div>
          )}
        </div>
      </section>

      <section className="control-deck" id="forecast">
        <div className="time-tabs" role="tablist" aria-label="Forecast period">
          {([
            ["next", "Best next"],
            ["today", "Today"],
            ["tomorrow", "Tomorrow"],
            ["weekend", "Weekend"],
          ] as [TimeFilter, string][]).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={timeFilter === value}
              className={timeFilter === value ? "active" : ""}
              type="button"
              onClick={() => setTimeFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="filters">
          <label>
            <span>Area</span>
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              {regions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
          <button type="button" className="location-button" onClick={requestLocation}>
            <LocateIcon /> Near me
          </button>
          <div className="view-toggle" aria-label="View">
            <button type="button" className={view === "map" ? "active" : ""} onClick={() => setView("map")} aria-label="Map view"><MapIcon /></button>
            <button type="button" className={view === "list" ? "active" : ""} onClick={() => setView("list")} aria-label="List view"><ListIcon /></button>
          </div>
        </div>
        {locationMessage ? <p className="location-message">{locationMessage}</p> : null}
      </section>

      <section className={`workspace ${view === "list" ? "list-only" : ""}`}>
        <div className="map-wrap">
          <ContourMap
            sites={rankedSites}
            windowsBySite={windowsBySite}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
            userPosition={userPosition}
          />
          <div className="map-overlay-label"><LayersIcon /> 30–50 accessible casting zones</div>
          <div className="map-legend">
            <span><i className="excellent" />80+</span>
            <span><i className="good" />65–79</span>
            <span><i className="fair" />45–64</span>
            <span><i className="quiet" />Below 45</span>
          </div>
        </div>

        <div className="ranking-panel">
          <div className="panel-heading">
            <div>
              <span>Ranked access</span>
              <h2>{rankedSites.length} locations</h2>
            </div>
            <div className="panel-actions">
              <small>Updated {formatAge(snapshot.generatedAt)}</small>
              <button type="button" onClick={() => setShowCompare(true)}>Compare top 3</button>
            </div>
          </div>
          <div className="site-list">
            {rankedSites.map((site, index) => {
              const window = windowsBySite.get(site.id)!;
              return (
                <button
                  type="button"
                  className={`site-card ${selectedSiteId === site.id ? "selected" : ""}`}
                  key={site.id}
                  onClick={() => setSelectedSiteId(site.id)}
                >
                  <span className="site-rank">{String(index + 1).padStart(2, "0")}</span>
                  <div className={`site-score ${scoreTone(window.score)}`}>{Math.round(window.score)}</div>
                  <div className="site-card-copy">
                    <div><strong>{site.name}</strong><em>{site.type}</em></div>
                    <p><ClockIcon /> {formatWindow(window.start, window.end, true)}</p>
                    <div className="tag-row">
                      {site.structureTags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
                      {site.distanceMiles !== undefined ? <span>{site.distanceMiles.toFixed(1)} mi</span> : null}
                    </div>
                  </div>
                  <ChevronIcon className="site-chevron" />
                </button>
              );
            })}
            {rankedSites.length === 0 ? (
              <div className="no-results">
                <strong>No windows in this slice</strong>
                <p>Try another area or forecast period.</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="score-note">
        <div className="score-note-number">80</div>
        <div>
          <span>Read the score correctly</span>
          <p>
            A score of 80 means this window ranks above 80% of the options evaluated right now.
            It is <strong>not</strong> an 80% chance of catching a fish.
          </p>
        </div>
        <button type="button" onClick={() => setShowMethod(true)}>See methodology <ArrowIcon /></button>
      </section>

      <section className="source-section" id="sources">
        <div className="source-heading">
          <span>Forecast inputs</span>
          <h2>Nothing hidden behind the score.</h2>
          <p>Every source carries an observed time and freshness limit. Expired live inputs are excluded instead of silently filled.</p>
        </div>
        <div className="source-grid">
          {snapshot.sources.map((source) => <SourceStatus key={source.name} source={source} />)}
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top"><LogoMark /><span>ContourCast</span></a>
        <p>Planning aid only. Not navigational data, legal advice, or a guarantee of catch.</p>
        <div>
          <a href="https://wildlife.ca.gov/Fishing/Ocean/Regulations/Fishing-Map/sf-bay" target="_blank" rel="noreferrer">CDFW Bay regulations ↗</a>
          <a href="https://wildlife.ca.gov/Fishing/Ocean/Regulations/Fishing-Map/San-Francisco" target="_blank" rel="noreferrer">Coast regulations ↗</a>
        </div>
      </footer>

      {selectedSite && selectedWindow ? (
        <div className="detail-layer" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedSiteId(null);
        }}>
          <aside className="detail-sheet" aria-label={`${selectedSite.name} forecast details`}>
            <div className="sheet-handle" />
            <button className="sheet-close" type="button" onClick={() => setSelectedSiteId(null)} aria-label="Close details"><CloseIcon /></button>
            <div className="sheet-topline">
              <span>{selectedSite.region} · {selectedSite.type}</span>
              <span className={`confidence ${selectedWindow.confidence}`}>{selectedWindow.confidence} confidence</span>
            </div>
            <h2>{selectedSite.name}</h2>
            <p className="sheet-window"><ClockIcon /> {formatWindow(selectedWindow.start, selectedWindow.end)}</p>
            <div className="detail-score-block">
              <div className={`detail-score ${scoreTone(selectedWindow.score)}`}>
                <strong>{Math.round(selectedWindow.score)}</strong>
                <span>Opportunity<br />Score</span>
              </div>
              <p>Better than <strong>{Math.round(selectedWindow.score)}%</strong> of the site/window combinations currently evaluated.</p>
            </div>

            <div className="component-block">
              <h3>Why it ranks here</h3>
              <MetricBar label="Habitat" value={selectedWindow.habitatScore} note="Long-term seafloor structure" />
              <MetricBar label="Seasonality" value={selectedWindow.seasonalityScore} note="Public monthly catch and effort" />
              <MetricBar label="Conditions" value={selectedWindow.dynamicScore} note="Bounded live modifier" />
            </div>

            <div className="factor-block">
              {selectedWindow.explanationFactors.map((factor) => <span key={factor}>{factor}</span>)}
            </div>

            <div className="conditions-grid">
              <div><TideIcon /><span>Tide</span><strong>{selectedWindow.conditions.tideStage ?? "Unavailable"}</strong></div>
              <div><WindIcon /><span>Wind</span><strong>{selectedWindow.conditions.windMph !== undefined ? `${Math.round(selectedWindow.conditions.windMph)} mph` : "Unavailable"}</strong></div>
              <div><TemperatureIcon /><span>Water</span><strong>{selectedWindow.conditions.waterTempF !== undefined ? `${Math.round(selectedWindow.conditions.waterTempF)}°F` : "Unavailable"}</strong></div>
            </div>

            <div className="detail-freshness">
              <h3>Input status</h3>
              {(selectedWindow.sources ?? snapshot.sources).slice(0, 6).map((source) => {
                const tone = source.status.startsWith("fresh")
                  ? "fresh"
                  : source.status.includes("excluded") || source.status.includes("not integrated")
                    ? "stale"
                    : "aging";
                return (
                  <span key={source.name} title={source.detail}>
                    <i className={tone} /> {source.name.replace("NOAA ", "")}
                  </span>
                );
              })}
            </div>

            <div className="access-block">
              <h3>Access notes</h3>
              <p>{selectedSite.access}</p>
              {selectedSite.depthProfile ? <small>{selectedSite.depthProfile}</small> : null}
            </div>

            <a className="regulations-link" href={selectedSite.regulationUrl} target="_blank" rel="noreferrer">
              Check current CDFW regulations <ArrowIcon />
            </a>
            <p className="model-stamp">Model {selectedWindow.modelVersion ?? snapshot.modelVersion} · generated {formatAge(snapshot.generatedAt)}</p>
            <p className="legal-note">Rules and access can change. Confirm official regulations and posted site closures before fishing.</p>
          </aside>
        </div>
      ) : null}

      {showMethod ? (
        <div className="modal-layer" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setShowMethod(false);
        }}>
          <section className="method-modal" role="dialog" aria-modal="true" aria-labelledby="method-title">
            <button className="sheet-close" type="button" onClick={() => setShowMethod(false)} aria-label="Close methodology"><CloseIcon /></button>
            <span className="eyebrow"><span /> Model note</span>
            <h2 id="method-title">A ranking, not a promise.</h2>
            <p>
              ContourCast compares reachable casting zones and upcoming two-hour windows. The 0–100 value is a percentile within that current comparison set—not a catch probability.
            </p>
            <div className="method-equation">
              <div><span>01</span><strong>Habitat</strong><p>Depth, slope, roughness, channel edges, shoreline distance, and public historical catch patterns.</p></div>
              <b>×</b>
              <div><span>02</span><strong>Season</strong><p>Monthly California halibut catch and effort patterns from public recreational fisheries data.</p></div>
              <b>×</b>
              <div><span>03</span><strong>Conditions</strong><p>Tide, current, wind, water temperature, swell, and daylight—with hard bounds.</p></div>
            </div>
            <div className="method-callout">
              <InfoIcon />
              <p>The deep model is promoted only if geographically blocked evaluation beats simpler baselines. Until then, the strongest validated model or ensemble owns the score.</p>
            </div>
            <a href="#sources" onClick={() => setShowMethod(false)}>Inspect source freshness <ArrowIcon /></a>
          </section>
        </div>
      ) : null}

      {showCompare ? (
        <div className="modal-layer" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setShowCompare(false);
        }}>
          <section className="compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title">
            <button className="sheet-close" type="button" onClick={() => setShowCompare(false)} aria-label="Close comparison"><CloseIcon /></button>
            <span className="eyebrow"><span /> Side by side</span>
            <h2 id="compare-title">Top windows,<br />same scale.</h2>
            <p>These are the three strongest locations in the current area and time filter. Components use the same 0–100 scale.</p>
            <div className="compare-grid">
              {rankedSites.slice(0, 3).map((site, index) => {
                const window = windowsBySite.get(site.id)!;
                return (
                  <article key={site.id}>
                    <div className="compare-card-top">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong className={scoreTone(window.score)}>{Math.round(window.score)}</strong>
                    </div>
                    <h3>{site.name}</h3>
                    <p><ClockIcon /> {formatWindow(window.start, window.end)}</p>
                    <MetricBar label="Habitat" value={window.habitatScore} note="Structure" />
                    <MetricBar label="Season" value={window.seasonalityScore} note="Catch / effort" />
                    <MetricBar label="Conditions" value={window.dynamicScore} note="Fresh inputs" />
                    <button type="button" onClick={() => {
                      setShowCompare(false);
                      setSelectedSiteId(site.id);
                    }}>Open details <ArrowIcon /></button>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
