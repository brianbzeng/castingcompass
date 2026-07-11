"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { FishingSite, OpportunityWindow } from "../types";

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
        zoom: 8.65,
        minZoom: 7.2,
        maxZoom: 16,
        attributionControl: false,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [
                "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],
              tileSize: 256,
              attribution: "© OpenStreetMap contributors",
              maxzoom: 19,
            },
          },
          layers: [
            { id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.72, "raster-contrast": 0.12, "raster-brightness-max": 0.68, "raster-hue-rotate": 148 } },
          ],
        },
      });

      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
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
        element.innerHTML = `<span>${score || "–"}</span>`;
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

  return <div ref={containerRef} className="contour-map" aria-label="Map of fishing access locations" />;
}
