import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const component = readFileSync(
  join(root, "app/components/TopographicTransition.tsx"),
  "utf8",
);
const home = readFileSync(
  join(root, "app/components/MarketingHome.tsx"),
  "utf8",
);
const styles = readFileSync(join(root, "app/marketing.css"), "utf8");
const documentation = readFileSync(
  join(root, "docs/SANTA-BARBARA-HERO-GEOSPATIAL-ASSETS.md"),
  "utf8",
);
const geometryPath = join(
  root,
  "public/marketing/daylight-draft/santa-barbara-hero-geometry.json",
);
const landPath = join(
  root,
  "public/marketing/daylight-draft/santa-barbara-land.png",
);
const geometry = JSON.parse(readFileSync(geometryPath, "utf8"));

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("hero geometry is registered real Santa Barbara bathymetry", () => {
  assert.equal(
    geometry.schemaVersion,
    "castingcompass.santa-barbara-hero-geometry/1.0.0",
  );
  assert.equal(geometry.mapTransformId, "santa-barbara-wgs84-20260808-v1");
  assert.equal(geometry.coordinateReference, "EPSG:4326");
  assert.deepEqual(geometry.viewBox, [0, 0, 1800, 1800]);
  assert.deepEqual(geometry.bounds, {
    west: -119.87,
    south: 34.27,
    east: -119.56,
    north: 34.53,
  });
  assert.equal(geometry.sources.bathymetry.series, "Data Series 702");
  assert.equal(geometry.sources.bathymetry.originalCrs, "EPSG:26911");
  assert.equal(geometry.sources.bathymetry.verticalDatum, "NAVD88");
  assert.equal(geometry.sources.bathymetry.resolutionMeters, 10);
  assert.equal(geometry.sources.bathymetry.notForNavigation, true);
  assert.match(geometry.sources.bathymetry.downloadUrl, /pubs\.usgs\.gov\/ds\/702/);
  assert.equal(geometry.sources.landMask.verticalDatum, "Mean High Water");
  assert.equal(
    geometry.sources.landMask.use,
    "Binary land/water mask and zero-elevation shoreline only",
  );
});

test("contours cover valid offshore edges and never cross the final land mask", () => {
  assert.ok(geometry.validation.contourCount >= 300);
  assert.ok(geometry.validation.contourVertexCount >= 60_000);
  assert.deepEqual(
    geometry.validation.contourDepths,
    Array.from({ length: 40 }, (_, index) => -(index + 1) * 10),
  );
  assert.equal(geometry.validation.contourLandIntersectionCount, 0);
  assert.equal(geometry.validation.edgeVertexCounts.top, 0);
  assert.ok(geometry.validation.edgeVertexCounts.left > 0);
  assert.ok(geometry.validation.edgeVertexCounts.right > 0);
  assert.ok(geometry.validation.edgeVertexCounts.bottom > 0);
  assert.ok(geometry.contours.every((contour) => contour.depth < 0));
  assert.ok(
    geometry.contours.every((contour) => contour.depth % 10 === 0),
  );
});

test("known Santa Barbara land, water, harbor, and asset probes pass", () => {
  assert.equal(geometry.validation.allKnownProbesMatch, true);
  assert.ok(
    geometry.validation.knownProbes.every((probe) => probe.matches === true),
  );
  const breakwaterProbe = geometry.validation.knownProbes.find(
    (probe) => probe.id === "harbor-breakwater",
  );
  const harborFeature = geometry.features.find(
    (feature) => feature.id === "santa-barbara-harbor-breakwater",
  );
  assert.deepEqual(
    [harborFeature.x, harborFeature.y],
    [breakwaterProbe.x, breakwaterProbe.y],
  );
  assert.equal(geometry.assets.landSha256, sha256(landPath));
  assert.equal(
    geometry.sources.bathymetry.archiveSha256,
    "5ae764fe1d154b43deb2dcd1c1a1de253c737abb5b2221529783ccbead79453b",
  );
});

test("hero DOM and CSS enforce one camera and the required layer order", () => {
  const orderedTokens = [
    "cc-hero-ocean-base",
    "cc-hero-map-camera",
    "cc-hero-depth-shading",
    "cc-hero-bathymetry",
    "cc-hero-land-layer",
    "cc-hero-shoreline",
    "cc-hero-map-features",
    "cc-hero-map-attribution",
  ];
  let cursor = -1;
  for (const token of orderedTokens) {
    const next = component.indexOf(token);
    assert.ok(next > cursor, `${token} is out of layer order`);
    cursor = next;
  }
  assert.ok(component.match(/data-map-transform=/g).length >= 5);
  assert.match(styles, /\.cc-hero-map-camera\s*\{[\s\S]*?transform:\s*rotate/);
  assert.doesNotMatch(styles, /--cc-hero-coastline-clip/);
  assert.doesNotMatch(styles, /translateX\(-28%\)/);
  assert.doesNotMatch(component, /santa-barbara-etopo-bathymetry/);
  assert.doesNotMatch(component, /santa-barbara-satellite\.jpg/);

  const internalMapCss = styles.slice(
    styles.indexOf(".cc-hero-satellite"),
    styles.indexOf(".cc-hero-map-attribution"),
  );
  assert.doesNotMatch(internalMapCss, /clip-path/);
  assert.doesNotMatch(internalMapCss, /overflow:\s*hidden/);
  assert.match(styles, /\.cc-hero-topo-panel\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(styles, /\.cc-forecast-card\s*\{[\s\S]*?z-index:\s*7/);
  assert.ok(home.indexOf("<ForecastCard") > home.indexOf("<HeroTopographicArt"));
});

test("hero disclosure and reproducibility metadata remain public", () => {
  assert.match(component, /USGS DS 702 \/ NOAA MHW \/ Sentinel-2/);
  assert.match(component, /Not for\s*navigation/);
  assert.match(documentation, /not for navigation/i);
  assert.match(documentation, /EPSG:26911/);
  assert.match(documentation, /NAVD88/);
  assert.match(documentation, /Mean High Water/);
  assert.match(documentation, /Data Series 781/);
  assert.match(documentation, /generate-santa-barbara-hero-assets\.py/);
});
