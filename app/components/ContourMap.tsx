"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { FishingSite, OpportunityWindow } from "../types";
import { LocateIcon } from "./icons";

const BAY_AREA_BOUNDS: [[number, number], [number, number]] = [
  [-123.06, 37.34],
  [-121.93, 38.18],
];

interface ContourMapProps {
  sites: FishingSite[];
  windowsBySite: Map<string, OpportunityWindow>;
  selectedSiteId: string | null;
  onSelectSite: (siteId: string) => void;
  userPosition: [number, number] | null;
}

function markerTone(score: number) {
  if (score >= 80) return "excellent";
  if (score >= 65) return "good";
  if (score >= 45) return "fair";
  return "quiet";
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
  const markersRef = useRef<MapLibreMarker[]>([]);
  const userMarkerRef = useRef<MapLibreMarker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let active = true;

    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (!active || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        center: [-122.42, 37.79],
        zoom: 9,
        minZoom: 7.2,
        maxZoom: 16,
        attributionControl: false,
        style: "https://tiles.openfreemap.org/styles/fiord",
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      map.once("load", () => {
        try {
          map.addSource("regional-bathymetry", {
            type: "vector",
            tiles: ["https://tiles.versatiles.org/tiles/bathymetry-vectors/{z}/{x}/{y}"],
            maxzoom: 10,
            attribution: "Bathymetry: GEBCO, Natural Earth, OpenDEM via VersaTiles",
          });
          map.addLayer({
            id: "regional-bathymetry-fill",
            type: "fill",
            source: "regional-bathymetry",
            "source-layer": "bathymetry",
            paint: {
              "fill-color": [
                "interpolate",
                ["linear"],
                ["to-number", ["get", "mindepth"]],
                0,
                "#2b6d8e",
                100,
                "#205a7a",
                1000,
                "#113b5b",
                4000,
                "#071d34",
              ],
              "fill-opacity": 0.12,
              "fill-outline-color": "rgba(113, 209, 224, 0.18)",
            },
          });
        } catch {
          // The basemap remains fully usable if the optional regional overlay is unavailable.
        }
        map.fitBounds(BAY_AREA_BOUNDS, {
          padding: { top: 58, right: 58, bottom: 58, left: 58 },
          duration: 0,
          maxZoom: 9.35,
        });
      });
      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      active = false;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    let cancelled = false;
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !mapRef.current) return;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = sites.map((site) => {
        const window = windowsBySite.get(site.id);
        const score = Math.round(window?.score ?? 0);
        const element = document.createElement("button");
        element.type = "button";
        element.className = `map-score-marker ${markerTone(score)}${selectedSiteId === site.id ? " selected" : ""}`;
        element.setAttribute("aria-label", `${site.name}, opportunity score ${score}`);
        const label = document.createElement("span");
        label.textContent = score ? String(score) : "–";
        element.append(label);
        element.addEventListener("click", () => onSelectSite(site.id));

        return new maplibregl.Marker({ element, anchor: "center" })
          .setLngLat([site.longitude, site.latitude])
          .addTo(mapRef.current!);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [sites, windowsBySite, selectedSiteId, onSelectSite, mapReady]);

  useEffect(() => {
    if (!mapRef.current || !selectedSiteId) return;
    const site = sites.find((candidate) => candidate.id === selectedSiteId);
    if (!site) return;
    mapRef.current.easeTo({
      center: [site.longitude, site.latitude],
      zoom: Math.max(mapRef.current.getZoom(), 11.2),
      duration: 650,
      padding: { top: 60, right: 40, bottom: 120, left: 40 },
    });
  }, [selectedSiteId, sites]);

  useEffect(() => {
    if (!mapRef.current || !userPosition) return;
    let cancelled = false;
    void import("maplibre-gl").then(({ default: maplibregl }) => {
      if (cancelled || !mapRef.current) return;
      userMarkerRef.current?.remove();
      const element = document.createElement("div");
      element.className = "user-location-marker";
      element.setAttribute("aria-label", "Your location");
      userMarkerRef.current = new maplibregl.Marker({ element })
        .setLngLat(userPosition)
        .addTo(mapRef.current);
      mapRef.current.easeTo({ center: userPosition, zoom: 10.5, duration: 700 });
    });
    return () => {
      cancelled = true;
    };
  }, [userPosition]);

  const centerBay = () => {
    mapRef.current?.fitBounds(BAY_AREA_BOUNDS, {
      padding: { top: 58, right: 58, bottom: 58, left: 58 },
      duration: 650,
      maxZoom: 9.35,
    });
  };

  return (
    <div className="contour-map-shell">
      <div ref={containerRef} className="contour-map" aria-label="Map of fishing access locations" />
      <button className="map-center-button" type="button" onClick={centerBay}>
        <LocateIcon /> Center Bay
      </button>
    </div>
  );
}
