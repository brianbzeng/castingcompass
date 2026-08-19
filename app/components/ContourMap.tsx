"use client";

import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, Point } from "geojson";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import type { FishingSite, OpportunityWindow } from "../types";
import { suppressExpectedMapLibreRasterTileAbort } from "../lib/maplibre-errors.js";
import { LocateIcon } from "./icons";

const CALIFORNIA_COVERAGE_BOUNDS: [[number, number], [number, number]] = [
  [-123.06, 34.34],
  [-119.4, 38.18],
];

const CALIFORNIA_COVERAGE_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-123.25, 34.18],
  [-119.2, 38.35],
];

const SITE_FIT_OPTIONS = {
  padding: { top: 58, right: 58, bottom: 58, left: 58 },
  maxZoom: 9.35,
  retainPadding: false,
};

const SITE_SOURCE_ID = "fishing-sites";
const CLUSTER_LAYER_ID = "site-clusters";
const CLUSTER_LABEL_LAYER_ID = "site-cluster-labels";
const SITE_LAYER_ID = "site-points";
const SITE_LABEL_LAYER_ID = "site-score-labels";
const USER_SOURCE_ID = "user-position";

const EMPTY_POINTS: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: [],
};

// Keyless vector base for the prototype. The style URL can later move to a
// MapTiler or Stadia account without changing CastingCompass' map overlays.
const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

const APPLE_LIKE_MAP_COLORS = {
  background: "#172748",
  water: "#1e3f87",
  waterway: "#2d6eb2",
  park: "#0f6a5b",
  wood: "#0d584e",
  residential: "#303d50",
  building: "#3a4659",
  buildingOutline: "#4b5b70",
  road: "#6e8199",
  roadCasing: "#485b73",
  majorRoad: "#aabbd1",
  majorCasing: "#60758f",
  motorway: "#dbe8f6",
  motorwayCasing: "#83a4cc",
  label: "#c9d7e9",
  labelHalo: "#263650",
  waterLabel: "#7fb9e7",
  waterLabelHalo: "#1a3a78",
  selected: "#2894e8",
  selectedLabel: "#ffffff",
};

function setPaintPropertyIfPresent(
  map: MapLibreMap,
  layerId: string,
  property: string,
  value: unknown,
) {
  if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
}

function applyAppleLikeMapStyle(map: MapLibreMap) {
  setPaintPropertyIfPresent(map, "background", "background-color", APPLE_LIKE_MAP_COLORS.background);
  setPaintPropertyIfPresent(map, "water", "fill-color", APPLE_LIKE_MAP_COLORS.water);
  setPaintPropertyIfPresent(map, "waterway", "line-color", APPLE_LIKE_MAP_COLORS.waterway);
  setPaintPropertyIfPresent(map, "park", "fill-color", APPLE_LIKE_MAP_COLORS.park);
  setPaintPropertyIfPresent(map, "landcover_wood", "fill-color", APPLE_LIKE_MAP_COLORS.wood);
  setPaintPropertyIfPresent(map, "landuse_residential", "fill-color", APPLE_LIKE_MAP_COLORS.residential);
  setPaintPropertyIfPresent(map, "building", "fill-color", APPLE_LIKE_MAP_COLORS.building);
  setPaintPropertyIfPresent(map, "building", "fill-outline-color", APPLE_LIKE_MAP_COLORS.buildingOutline);

  for (const layerId of ["highway_path", "highway_minor"]) {
    setPaintPropertyIfPresent(map, layerId, "line-color", APPLE_LIKE_MAP_COLORS.road);
  }
  setPaintPropertyIfPresent(map, "highway_path", "line-opacity", 0.45);
  setPaintPropertyIfPresent(map, "highway_minor", "line-opacity", 0.52);
  setPaintPropertyIfPresent(map, "highway_major_inner", "line-color", APPLE_LIKE_MAP_COLORS.majorRoad);
  setPaintPropertyIfPresent(map, "highway_major_inner", "line-opacity", 0.88);
  setPaintPropertyIfPresent(map, "highway_major_subtle", "line-color", APPLE_LIKE_MAP_COLORS.majorRoad);
  setPaintPropertyIfPresent(map, "highway_major_subtle", "line-opacity", 0.54);
  setPaintPropertyIfPresent(map, "highway_major_casing", "line-color", APPLE_LIKE_MAP_COLORS.majorCasing);
  setPaintPropertyIfPresent(map, "highway_major_casing", "line-opacity", 0.82);
  for (const layerId of ["highway_motorway_casing", "highway_motorway_bridge_casing"]) {
    setPaintPropertyIfPresent(map, layerId, "line-color", APPLE_LIKE_MAP_COLORS.motorwayCasing);
    setPaintPropertyIfPresent(map, layerId, "line-opacity", 0.94);
  }
  setPaintPropertyIfPresent(map, "highway_motorway_inner", "line-color", APPLE_LIKE_MAP_COLORS.motorway);
  setPaintPropertyIfPresent(map, "highway_motorway_inner", "line-opacity", 1);
  setPaintPropertyIfPresent(map, "highway_motorway_subtle", "line-color", APPLE_LIKE_MAP_COLORS.motorwayCasing);
  setPaintPropertyIfPresent(map, "highway_motorway_subtle", "line-opacity", 0.62);
  setPaintPropertyIfPresent(map, "highway_motorway_bridge_inner", "line-color", APPLE_LIKE_MAP_COLORS.motorway);
  setPaintPropertyIfPresent(map, "highway_motorway_bridge_inner", "line-opacity", 1);
  setPaintPropertyIfPresent(map, "road_area_pier", "fill-color", "#315879");
  setPaintPropertyIfPresent(map, "road_pier", "line-color", "#6d9ec3");

  for (const layerId of [
    "highway-name-path",
    "highway-name-minor",
    "highway-name-major",
    "label_other",
    "label_village",
    "label_town",
    "label_state",
    "label_city",
    "label_city_capital",
    "label_country_3",
    "label_country_2",
    "label_country_1",
  ]) {
    setPaintPropertyIfPresent(map, layerId, "text-color", APPLE_LIKE_MAP_COLORS.label);
    setPaintPropertyIfPresent(map, layerId, "text-halo-color", APPLE_LIKE_MAP_COLORS.labelHalo);
    setPaintPropertyIfPresent(map, layerId, "text-halo-width", 1.25);
    setPaintPropertyIfPresent(map, layerId, "text-halo-blur", 0.2);
  }
  for (const layerId of ["water_name_point_label", "water_name_line_label", "waterway_line_label"]) {
    setPaintPropertyIfPresent(map, layerId, "text-color", APPLE_LIKE_MAP_COLORS.waterLabel);
    setPaintPropertyIfPresent(map, layerId, "text-halo-color", APPLE_LIKE_MAP_COLORS.waterLabelHalo);
    setPaintPropertyIfPresent(map, layerId, "text-halo-width", 1.25);
  }
}

interface ContourMapProps {
  sites: FishingSite[];
  windowsBySite: Map<string, OpportunityWindow>;
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
  userPosition: [number, number] | null;
}

function siteFeatureCollection(
  sites: FishingSite[],
  windowsBySite: Map<string, OpportunityWindow>,
  selectedSiteId: string | null,
): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: sites.map((site) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [site.longitude, site.latitude],
      },
      properties: {
        siteId: site.id,
        score: Math.round(windowsBySite.get(site.id)?.score ?? 0),
        selected: site.id === selectedSiteId ? 1 : 0,
      },
    })),
  };
}

function userFeatureCollection(userPosition: [number, number] | null): FeatureCollection<Point> {
  if (!userPosition) return EMPTY_POINTS;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: userPosition },
        properties: {},
      },
    ],
  };
}

function boundsForSites(sites: FishingSite[]): [[number, number], [number, number]] | null {
  if (sites.length === 0) return null;
  let west = sites[0].longitude;
  let east = sites[0].longitude;
  let south = sites[0].latitude;
  let north = sites[0].latitude;

  for (const site of sites.slice(1)) {
    west = Math.min(west, site.longitude);
    east = Math.max(east, site.longitude);
    south = Math.min(south, site.latitude);
    north = Math.max(north, site.latitude);
  }

  if (sites.length === 1) {
    const longitudePadding = 0.035;
    const latitudePadding = 0.025;
    return [
      [west - longitudePadding, south - latitudePadding],
      [east + longitudePadding, north + latitudePadding],
    ];
  }

  return [[west, south], [east, north]];
}

function mapMotionDuration(duration: number) {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : duration;
}

function addFishingSiteLayers(map: MapLibreMap) {
  map.addSource(SITE_SOURCE_ID, {
    type: "geojson",
    data: EMPTY_POINTS,
    cluster: true,
    clusterMaxZoom: 12,
    clusterRadius: 34,
  });

  map.addLayer({
    id: CLUSTER_LAYER_ID,
    type: "circle",
    source: SITE_SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#3d9dcc",
      "circle-opacity": 0.96,
      "circle-radius": ["step", ["get", "point_count"], 20, 5, 23, 10, 27],
      "circle-stroke-color": "#f8fbfc",
      "circle-stroke-width": 2,
    },
  });

  map.addLayer({
    id: CLUSTER_LABEL_LAYER_ID,
    type: "symbol",
    source: SITE_SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["to-string", ["get", "point_count_abbreviated"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#f8fbfc",
    },
  });

  map.addLayer({
    id: SITE_LAYER_ID,
    type: "circle",
    source: SITE_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "selected"], 1],
        APPLE_LIKE_MAP_COLORS.selected,
        [
          "step",
          ["to-number", ["get", "score"]],
          "#88a9bf",
          45,
          "#e6b75c",
          65,
          "#5bc4df",
          80,
          "#2e9cda",
        ],
      ],
      "circle-opacity": 0.98,
      "circle-radius": ["case", ["==", ["get", "selected"], 1], 23, 20],
      "circle-stroke-color": [
        "case",
        ["==", ["get", "selected"], 1],
        "#0b2636",
        "#f8fbfc",
      ],
      "circle-stroke-width": ["case", ["==", ["get", "selected"], 1], 4, 2],
    },
  });

  map.addLayer({
    id: SITE_LABEL_LAYER_ID,
    type: "symbol",
    source: SITE_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["to-string", ["get", "score"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": [
        "case",
        ["==", ["get", "selected"], 1],
        APPLE_LIKE_MAP_COLORS.selectedLabel,
        "#f2f8ff",
      ],
    },
  });
}

function addUserPositionLayer(map: MapLibreMap) {
  map.addSource(USER_SOURCE_ID, {
    type: "geojson",
    data: EMPTY_POINTS,
  });

  map.addLayer({
    id: "user-position-halo",
    type: "circle",
    source: USER_SOURCE_ID,
    paint: {
      "circle-color": "#4a9dff",
      "circle-opacity": 0.2,
      "circle-radius": 15,
    },
  });

  map.addLayer({
    id: "user-position-dot",
    type: "circle",
    source: USER_SOURCE_ID,
    paint: {
      "circle-color": "#4a9dff",
      "circle-radius": 7,
      "circle-stroke-color": "#f8fbfc",
      "circle-stroke-width": 3,
    },
  });
}

export function ContourMap({
  sites,
  windowsBySite,
  selectedSiteId,
  onSelectSite,
  userPosition,
}: ContourMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectSiteRef = useRef(onSelectSite);
  const fittedGeometryKeyRef = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const siteGeometryKey = sites
    .map((site) => `${site.id}:${site.longitude}:${site.latitude}`)
    .sort()
    .join("|");

  useEffect(() => {
    onSelectSiteRef.current = onSelectSite;
  }, [onSelectSite]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let active = true;
    let resizeObserver: ResizeObserver | null = null;
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      suppressExpectedMapLibreRasterTileAbort(event);
    };

    // MapLibre GL 5.24 does not consume one expected raster-tile cancellation path
    // during viewport cleanup. Suppress only its exact abortTile signature while this
    // map is mounted; every other rejection remains visible to error reporting.
    window.addEventListener("unhandledrejection", handleUnhandledRejection, { capture: true });

    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!active || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: OPENFREEMAP_STYLE_URL,
        bounds: CALIFORNIA_COVERAGE_BOUNDS,
        fitBoundsOptions: { ...SITE_FIT_OPTIONS, duration: 0 },
        maxBounds: CALIFORNIA_COVERAGE_MAX_BOUNDS,
        minZoom: 5,
        maxZoom: 16,
        maxPitch: 0,
        renderWorldCopies: false,
        attributionControl: false,
        cooperativeGestures: true,
        scrollZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });

      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({
        compact: true,
        customAttribution: "OpenFreeMap © OpenMapTiles Data from OpenStreetMap",
      }), "bottom-right");
      mapRef.current = map;

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(containerRef.current);
      }

      map.once("load", () => {
        if (!active) return;
        applyAppleLikeMapStyle(map);
        addFishingSiteLayers(map);
        addUserPositionLayer(map);

        map.on("click", SITE_LAYER_ID, (event: MapLayerMouseEvent) => {
          const siteId = event.features?.[0]?.properties?.siteId;
          if (typeof siteId === "string") onSelectSiteRef.current(siteId);
        });

        map.on("click", CLUSTER_LAYER_ID, (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          const clusterId = Number(feature?.properties?.cluster_id);
          if (!feature || feature.geometry.type !== "Point" || !Number.isFinite(clusterId)) return;

          const [longitude, latitude] = feature.geometry.coordinates;
          const source = map.getSource(SITE_SOURCE_ID) as GeoJSONSource | undefined;
          if (!source) return;

          void source.getClusterExpansionZoom(clusterId).then((zoom) => {
            if (!active) return;
            map.easeTo({
              center: [longitude, latitude],
              zoom: Math.min(zoom, map.getMaxZoom()),
              duration: mapMotionDuration(450),
            });
          });
        });

        const showPointer = () => {
          map.getCanvas().style.cursor = "pointer";
        };
        const clearPointer = () => {
          map.getCanvas().style.cursor = "";
        };
        map.on("mouseenter", SITE_LAYER_ID, showPointer);
        map.on("mouseleave", SITE_LAYER_ID, clearPointer);
        map.on("mouseenter", CLUSTER_LAYER_ID, showPointer);
        map.on("mouseleave", CLUSTER_LAYER_ID, clearPointer);

        setMapReady(true);
      });
    });

    return () => {
      active = false;
      window.removeEventListener("unhandledrejection", handleUnhandledRejection, { capture: true });
      resizeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const source = mapRef.current.getSource(SITE_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(siteFeatureCollection(sites, windowsBySite, selectedSiteId));
  }, [sites, windowsBySite, selectedSiteId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (fittedGeometryKeyRef.current === siteGeometryKey) return;
    const bounds = boundsForSites(sites);
    if (!bounds) return;
    map.stop();
    map.resize();
    map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
    map.fitBounds(bounds, { ...SITE_FIT_OPTIONS, duration: mapMotionDuration(450) });
    fittedGeometryKeyRef.current = siteGeometryKey;
  }, [mapReady, siteGeometryKey, sites]);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const source = mapRef.current.getSource(USER_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(userFeatureCollection(userPosition));
  }, [userPosition, mapReady]);

  const fitSites = () => {
    const map = mapRef.current;
    if (!map) return;
    const bounds = boundsForSites(sites);
    if (!bounds) return;
    map.stop();
    map.resize();
    map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
    map.fitBounds(bounds, { ...SITE_FIT_OPTIONS, duration: mapMotionDuration(650) });
  };

  return (
    <div className="contour-map-shell">
      <p id="map-alternative-description" className="sr-only">
        Every location and forecast shown here is also available in the keyboard-accessible ranked list after the map.
      </p>
      <div
        ref={containerRef}
        className="contour-map"
        role="region"
        aria-label="Interactive map of fishing access locations"
        aria-describedby="map-alternative-description"
      />
      <button className="map-center-button" type="button" onClick={fitSites}>
        <LocateIcon /> Fit sites
      </button>
    </div>
  );
}
