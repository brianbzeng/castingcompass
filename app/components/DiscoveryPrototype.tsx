"use client";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowIcon, ChevronIcon, CloseIcon, LayersIcon, ListIcon, LocateIcon, MapIcon } from "./icons";
import type { FishingSite, OpportunitySnapshot, OpportunityWindow } from "../types";
import { rankSnapshotForSpecies, TARGET_SPECIES, type TargetTaxonId } from "../lib/species-ranking";
import styles from "../discovery-prototype.module.css";

const ContourMap = lazy(() => import("./ContourMap").then((module) => ({ default: module.ContourMap })));

type FilterPanel = "area" | "type" | "score" | "more" | null;
type SiteTypeFilter = "all" | "Beach" | "Shore" | "Pier" | "Jetty";
type FilterPopoverPosition = { top: number; left: number };

const SITE_TYPE_FILTERS: SiteTypeFilter[] = ["Beach", "Shore", "Pier", "Jetty"];
const EMPTY_SNAPSHOT: OpportunitySnapshot = {
  generatedAt: "",
  modelVersion: "",
  sources: [],
  windows: [],
};

function scoreTone(score: number) {
  if (score >= 75) return styles.scoreStrong;
  if (score >= 50) return styles.scoreGood;
  return styles.scoreFair;
}

function scoreLabel(score: number) {
  if (score >= 75) return "Strong";
  if (score >= 50) return "Good";
  return "Watch";
}

function formatWindow(window: OpportunityWindow) {
  const start = new Date(window.start);
  const end = new Date(window.end);
  const day = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles",
  });
  const time = (date: Date) => date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
  return `${day} · ${time(start)}–${time(end)}`;
}

function bestWindowBySite(snapshot: OpportunitySnapshot) {
  const bySite = new Map<string, OpportunityWindow>();
  for (const window of snapshot.windows) {
    const current = bySite.get(window.siteId);
    if (!current || window.score > current.score || (window.score === current.score && window.start > current.start)) {
      bySite.set(window.siteId, window);
    }
  }
  return bySite;
}

function distanceFromOakland(site: FishingSite) {
  const latitudeDelta = (site.latitude - 37.7652) * 69;
  const longitudeDelta = (site.longitude + 122.1579) * 55;
  return Math.sqrt(latitudeDelta ** 2 + longitudeDelta ** 2);
}

function mapLabel(site: FishingSite) {
  return `${site.name}, ${site.region}`;
}

export function DiscoveryPrototype() {
  const [sites, setSites] = useState<FishingSite[]>([]);
  const [snapshot, setSnapshot] = useState<OpportunitySnapshot>(EMPTY_SNAPSHOT);
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");
  const [selectedTarget, setSelectedTarget] = useState<TargetTaxonId>("california-halibut");
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<"east-bay" | "all">("east-bay");
  const [siteType, setSiteType] = useState<SiteTypeFilter>("all");
  const [minimumScore, setMinimumScore] = useState(0);
  const [filterPanel, setFilterPanel] = useState<FilterPanel>(null);
  const [filterPopoverPosition, setFilterPopoverPosition] = useState<FilterPopoverPosition | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [detailSiteId, setDetailSiteId] = useState<string | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null);
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/data/sites.json", { signal: controller.signal }).then((response) => response.json() as Promise<FishingSite[]>),
      fetch("/data/opportunities-browser.json", { signal: controller.signal }).then((response) => response.json() as Promise<OpportunitySnapshot>),
    ])
      .then(([nextSites, nextSnapshot]) => {
        setSites(nextSites);
        setSnapshot(nextSnapshot);
        setDataState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setDataState("error");
      });
    return () => controller.abort();
  }, []);

  const rankedSnapshot = useMemo(
    () => rankSnapshotForSpecies(snapshot, sites, selectedTarget),
    [selectedTarget, sites, snapshot],
  );
  const windowsBySite = useMemo(() => bestWindowBySite(rankedSnapshot), [rankedSnapshot]);
  const visibleSites = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sites
      .filter((site) => area === "all" || site.region === "East Bay" || site.region === "Oakland" || site.region === "Alameda")
      .filter((site) => siteType === "all" || site.type === siteType)
      .filter((site) => (windowsBySite.get(site.id)?.score ?? 0) >= minimumScore)
      .filter((site) => {
        if (!normalizedQuery) return true;
        return [site.name, site.region, site.type, ...site.structureTags].join(" ").toLowerCase().includes(normalizedQuery);
      })
      .filter((site) => windowsBySite.has(site.id))
      .sort((a, b) => {
        const scoreDelta = (windowsBySite.get(b.id)?.score ?? 0) - (windowsBySite.get(a.id)?.score ?? 0);
        if (scoreDelta !== 0) return scoreDelta;
        return distanceFromOakland(a) - distanceFromOakland(b);
      });
  }, [area, minimumScore, query, siteType, sites, windowsBySite]);

  const selectedSite = sites.find((site) => site.id === detailSiteId) ?? null;
  const selectedWindow = selectedSite ? windowsBySite.get(selectedSite.id) ?? null : null;
  const activeMapSiteId = hoveredSiteId ?? selectedSiteId;
  const activeMapSite = visibleSites.find((site) => site.id === activeMapSiteId) ?? null;

  useEffect(() => {
    if (!filterPanel) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFilterPanel(null);
        setFilterPopoverPosition(null);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [filterPanel]);

  function openDetail(site: FishingSite) {
    setSelectedSiteId(site.id);
    setDetailSiteId(site.id);
    setPanelExpanded(true);
  }

  function selectSite(siteId: string) {
    setSelectedSiteId(siteId);
    setDetailSiteId(null);
  }

  function resetFilters() {
    setArea("east-bay");
    setSiteType("all");
    setMinimumScore(0);
    setQuery("");
  }

  function findUserLocation() {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not available in this browser.");
      return;
    }
    setLocationMessage("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPosition([position.coords.longitude, position.coords.latitude]);
        setLocationMessage("Sorted around your location");
      },
      () => setLocationMessage("Location unavailable; showing Oakland / East Bay."),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  const header = (
    <header className={styles.discoveryHeader}>
      <Link className={styles.brand} href="/" aria-label="CastingCompass home">
        <span className={styles.brandMark}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16c3-5 6-8 9-8s6 3 9 8" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M5 19c2-3 4-4 7-4s5 1 7 4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="5" r="1.6" fill="currentColor" /></svg></span>
        <span className={styles.brandName}>CastingCompass</span>
      </Link>
      <nav className={styles.primaryNav} aria-label="Primary navigation">
        <Link href="/">Home</Link>
        <Link href="/forecast" aria-current="page">Spots</Link>
        <Link href="/community">Reports</Link>
        <Link href="/forecast">Maps</Link>
        <Link href="/community">Community</Link>
      </nav>
      <div className={styles.headerRight}>
        <Link className={styles.headerAction} href="/community">Log a trip</Link>
        <Link className={`${styles.headerAction} ${styles.headerActionPrimary}`} href="/forecast">Open forecast</Link>
      </div>
    </header>
  );

  function toggleFilter(panel: Exclude<FilterPanel, null>, trigger: HTMLButtonElement) {
    if (filterPanel === panel) {
      setFilterPanel(null);
      setFilterPopoverPosition(null);
      return;
    }

    const triggerRect = trigger.getBoundingClientRect();
    const popoverWidth = 270;
    const gutter = 12;
    const left = Math.min(Math.max(gutter, triggerRect.left), window.innerWidth - popoverWidth - gutter);
    setFilterPopoverPosition({ top: triggerRect.bottom + 10, left });
    setFilterPanel(panel);
  }

  function filterButton(label: string, panel: Exclude<FilterPanel, null>, active = false) {
    return (
      <div className={styles.filterWrap}>
        <button
          className={`${styles.filterButton} ${active ? styles.filterButtonActive : ""}`}
          type="button"
          id={`filter-${panel}-trigger`}
          aria-controls={`filter-${panel}-popover`}
          aria-expanded={filterPanel === panel}
          onClick={(event) => toggleFilter(panel, event.currentTarget)}
        >
          {label}
          <ChevronIcon />
        </button>
      </div>
    );
  }

  function filterPopoverContent(panel: Exclude<FilterPanel, null>) {
    if (panel === "more") {
      return (
        <>
          <h3 id="filter-more-title">More filters</h3>
          <p>Keep the map visible while tuning the shortlist.</p>
          <div className={styles.filterOptions}>
            <label className={styles.filterOption}>
              <span>Public access only</span>
              <input type="checkbox" checked readOnly aria-label="Public access only" />
            </label>
            <label className={styles.filterOption}>
              <span>Fresh conditions</span>
              <input type="checkbox" aria-label="Fresh conditions" onChange={() => undefined} />
            </label>
            <label className={styles.filterOption}>
              <span>Saved locations</span>
              <input type="checkbox" aria-label="Saved locations" onChange={() => undefined} />
            </label>
          </div>
        </>
      );
    }

    if (panel === "area") {
      return (
        <>
          <h3 id="filter-area-title">Search area</h3>
          <p>Keep the map centered on the coastline you are exploring.</p>
          <div className={styles.filterOptions} role="group" aria-label="Search area options">
            {(["east-bay", "all"] as const).map((value) => (
              <label className={styles.filterOption} key={value}>
                <span>{value === "east-bay" ? "Oakland / East Bay" : "All California"}</span>
                <input type="radio" name="area" checked={area === value} onChange={() => setArea(value)} />
              </label>
            ))}
          </div>
        </>
      );
    }

    if (panel === "type") {
      return (
        <>
          <h3 id="filter-type-title">Access type</h3>
          <p>Choose the kinds of public water access that fit the trip.</p>
          <div className={styles.filterOptions} role="group" aria-label="Access type options">
            {(["all", ...SITE_TYPE_FILTERS] as SiteTypeFilter[]).map((value) => (
              <label className={styles.filterOption} key={value}>
                <span>{value === "all" ? "All access types" : value}</span>
                <input type="radio" name="site-type" checked={siteType === value} onChange={() => setSiteType(value)} />
              </label>
            ))}
          </div>
        </>
      );
    }

    return (
      <>
        <h3 id="filter-score-title">Opportunity score</h3>
        <p>Only show locations at or above a relative planning score.</p>
        <div className={styles.filterOptions} role="group" aria-label="Minimum score options">
          {[0, 50, 75].map((value) => (
            <label className={styles.filterOption} key={value}>
              <span>{value === 0 ? "Any score" : `${value}+ score`}</span>
              <input type="radio" name="minimum-score" checked={minimumScore === value} onChange={() => setMinimumScore(value)} />
            </label>
          ))}
        </div>
      </>
    );
  }

  const activeFilterPopover = filterPanel && filterPopoverPosition && typeof document !== "undefined"
    ? createPortal(
        <div
          className={styles.filterPopover}
          id={`filter-${filterPanel}-popover`}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`filter-${filterPanel}-title`}
          style={{ top: filterPopoverPosition.top, left: filterPopoverPosition.left }}
        >
          {filterPopoverContent(filterPanel)}
          <div className={styles.filterPopoverFooter}>
            <button className={styles.textButton} type="button" onClick={resetFilters}>Clear filters</button>
            <button className={styles.primaryButton} type="button" onClick={() => { setFilterPanel(null); setFilterPopoverPosition(null); }}>See {visibleSites.length} locations</button>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={styles.discoveryShell}>
      {header}
      <main className={styles.discoveryMain}>
        <section className={styles.discoveryToolbar} aria-label="Discovery controls">
          <div className={styles.contextBlock}>
            <p className={styles.eyebrow}>Map discovery</p>
            <strong>{area === "east-bay" ? "Oakland / East Bay" : "All California"}</strong>
            <span>{visibleSites.length} public access locations in view</span>
          </div>
          <label className={styles.searchBox}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="m16 16 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a shoreline, pier, or region" aria-label="Search locations" />
          </label>
          <div className={styles.toolbarFilters} aria-label="Location filters">
            {filterButton(area === "east-bay" ? "Oakland / East Bay" : "All California", "area", area !== "all")}
            {filterButton(siteType === "all" ? "Access type" : siteType, "type", siteType !== "all")}
            {filterButton(minimumScore === 0 ? "Opportunity score" : `${minimumScore}+ score`, "score", minimumScore > 0)}
            {filterButton("More filters", "more", false)}
          </div>
          <div className={styles.toolbarUtility}>
            <label className={styles.speciesSelect}>
              <span>Target species</span>
              <select value={selectedTarget} onChange={(event) => setSelectedTarget(event.target.value as TargetTaxonId)} aria-label="Target species">
                {TARGET_SPECIES.map((species) => <option value={species.taxonId} key={species.taxonId}>{species.shortName}</option>)}
              </select>
            </label>
            <button className={styles.useLocationButton} type="button" onClick={findUserLocation}><LocateIcon /> Use my location</button>
            <button className={styles.mapModeButton} type="button" onClick={() => setArea(area === "all" ? "east-bay" : "all")}><MapIcon /> {area === "all" ? "All water" : "Local view"}</button>
          </div>
        </section>

        <section className={`${styles.discoveryWorkspace} ${panelExpanded ? styles.expanded : ""} ${panelCollapsed ? styles.collapsed : ""}`} aria-label="Map discovery workspace">
          {panelCollapsed ? (
            <aside className={styles.collapsedPanel} aria-label="Collapsed results panel">
              <div className={styles.collapsedPanel}>
                <button className={styles.railButton} type="button" onClick={() => setPanelCollapsed(false)} aria-label="Show results"><ArrowIcon /></button>
                <span className={styles.railLabel}>Results</span>
              </div>
            </aside>
          ) : (
            <aside className={styles.resultsPanel} aria-label="Location results">
              {detailSiteId && selectedSite && selectedWindow ? (
                <div className={styles.detailView}>
                  <div className={styles.detailHeader}>
                    <div className={styles.detailTitleRow}>
                      <div>
                        <button className={styles.backButton} type="button" onClick={() => { setDetailSiteId(null); setPanelExpanded(false); }}><ArrowIcon /> Back to results</button>
                        <h1>{selectedSite.name}</h1>
                      </div>
                      <div className={styles.panelHeaderActions}>
                        <button className={styles.detailExpandButton} type="button" onClick={() => setPanelExpanded((current) => !current)} aria-label={panelExpanded ? "Reduce detail panel" : "Expand detail panel"}><LayersIcon /></button>
                        <button className={styles.closeButton} type="button" onClick={() => { setDetailSiteId(null); setSelectedSiteId(null); setPanelExpanded(false); }} aria-label="Close location detail"><CloseIcon /></button>
                      </div>
                    </div>
                    <div className={styles.detailTitleRow}>
                      <span className={styles.siteTypeBadge}>{selectedSite.type} · {selectedSite.region}</span>
                      <span className={styles.detailScoreBadge}>{selectedWindow.score}</span>
                    </div>
                    <p>{selectedSite.access}</p>
                  </div>
                  <div className={styles.detailBody}>
                    <section className={styles.detailSection}>
                      <h2>Best planning window</h2>
                      <div className={styles.detailWindow}>
                        <strong>{formatWindow(selectedWindow)}</strong>
                        <span>{scoreLabel(selectedWindow.score)} relative opportunity · {selectedWindow.confidence} confidence</span>
                      </div>
                      <div className={styles.detailStatRow}>
                        <div className={styles.detailStat}><strong>{selectedWindow.conditions.tideStage ?? "—"}</strong><span>Tide stage</span></div>
                        <div className={styles.detailStat}><strong>{selectedWindow.conditions.windMph ?? "—"} mph</strong><span>Wind</span></div>
                        <div className={styles.detailStat}><strong>{selectedWindow.conditions.swellFeet ?? "—"} ft</strong><span>Swell</span></div>
                      </div>
                    </section>
                    <section className={styles.detailSection}>
                      <h2>Why it ranks here</h2>
                      <ul className={styles.detailList}>
                        {selectedWindow.explanationFactors.slice(0, 3).map((factor) => <li key={factor}>{factor}</li>)}
                      </ul>
                    </section>
                    <section className={styles.detailSection}>
                      <h2>Access notes</h2>
                      <p>{selectedSite.depthProfile ?? "Public shoreline access; confirm conditions and posted restrictions before leaving."}</p>
                      <div className={styles.resultTags}>{selectedSite.structureTags.slice(0, 4).map((tag) => <span key={tag}>{tag.replaceAll("-", " ")}</span>)}</div>
                    </section>
                    <div className={styles.detailActions}>
                      <button className={styles.primaryButton} type="button" onClick={() => setSelectedSiteId(selectedSite.id)}>Keep selected</button>
                      <a className={styles.secondaryButton} href={selectedSite.regulationUrl} target="_blank" rel="noreferrer">View regulations</a>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.panelHeader}>
                    <div>
                      <h1>Access locations</h1>
                      <p>{dataState === "ready" ? `1–${visibleSites.length} of ${visibleSites.length} locations` : "Loading current snapshot…"}</p>
                    </div>
                    <div className={styles.panelHeaderActions}>
                      <button className={styles.collapseButton} type="button" onClick={() => setPanelCollapsed(true)}><ListIcon /> Hide</button>
                    </div>
                  </div>
                  <div className={styles.panelSubbar}>
                    <span>Sorted by opportunity score</span>
                    <button className={styles.sortButton} type="button"><LayersIcon /> Best first</button>
                  </div>
                  <div className={styles.resultList} role="list" aria-label="Fishing access locations">
                    {dataState === "loading" && <div className={styles.loadingState}><div className={styles.spinner} /><strong>Reading the coast…</strong><p>Loading the latest available CastingCompass location snapshot.</p></div>}
                    {dataState === "error" && <div className={styles.emptyState}><strong>Locations unavailable</strong><p>We couldn’t load the map snapshot.</p><button className={styles.primaryButton} type="button" onClick={() => window.location.reload()}>Try again</button></div>}
                    {dataState === "ready" && visibleSites.map((site, index) => {
                      const window = windowsBySite.get(site.id)!;
                      const isSelected = selectedSiteId === site.id;
                      const isActive = hoveredSiteId === site.id;
                      return (
                        <button
                          className={styles.resultCard}
                          key={site.id}
                          type="button"
                          role="listitem"
                          data-site-id={site.id}
                          data-selected={isSelected}
                          data-active={isActive}
                          onMouseEnter={() => setHoveredSiteId(site.id)}
                          onMouseLeave={() => setHoveredSiteId(null)}
                          onFocus={() => setHoveredSiteId(site.id)}
                          onBlur={() => setHoveredSiteId(null)}
                          onClick={() => openDetail(site)}
                          aria-label={`Open details for ${mapLabel(site)}`}
                        >
                          <span className={styles.resultMarker}><span>{index + 1}</span></span>
                          <span className={styles.resultContent}>
                            <span className={styles.resultTopline}><span className={`${styles.scoreBadge} ${scoreTone(window.score)}`}>{scoreLabel(window.score)}</span><span className={styles.resultScore}>{window.score}/100</span></span>
                            <span className={styles.resultCardHeading}><h2>{site.name}</h2></span>
                            <span className={styles.resultMeta}><span>{site.type}</span><span>{distanceFromOakland(site).toFixed(1)} mi from Oakland</span><span>{formatWindow(window).split(" · ")[1]}</span></span>
                            <span className={styles.resultTags}>{site.structureTags.slice(0, 2).map((tag) => <span key={tag}>{tag.replaceAll("-", " ")}</span>)}</span>
                          </span>
                        </button>
                      );
                    })}
                    {dataState === "ready" && visibleSites.length === 0 && <div className={styles.emptyState}><strong>No locations match these filters</strong><p>Try clearing a filter or searching a broader coastline.</p><button className={styles.secondaryButton} type="button" onClick={resetFilters}>Clear filters</button></div>}
                  </div>
                  <div className={styles.panelFooter}><span>{locationMessage || "Scores are relative planning guidance, not catch probability."}</span><span>Snapshot · Jul 2026</span></div>
                </>
              )}
            </aside>
          )}

          <div className={styles.mapPanel} aria-label="Map of fishing access locations">
            {dataState === "ready" && (
              <Suspense fallback={<div className={styles.mapLoading}><div className={styles.spinner} /></div>}>
                <ContourMap
                  sites={visibleSites}
                  windowsBySite={windowsBySite}
                  selectedSiteId={activeMapSiteId}
                  onSelectSite={selectSite}
                  userPosition={userPosition}
                />
              </Suspense>
            )}
            {dataState !== "ready" && <div className={styles.mapLoading}><div className={styles.spinner} /></div>}
            <div className={styles.mapToolbar}><MapIcon /> Explore map <span aria-hidden="true">·</span> {activeMapSite ? activeMapSite.name : `${visibleSites.length} locations`}</div>
            <div className={styles.mapLegend} aria-label="Map legend"><span><i /> Location</span><span><i className={styles.selected} /> Selected</span><span><i className={styles.user} /> You</span></div>
            <p className={styles.mapHint}>Hover a result to highlight its pin. Select a pin to keep it in view.</p>
          </div>
        </section>
      </main>
      {activeFilterPopover}
    </div>
  );
}
