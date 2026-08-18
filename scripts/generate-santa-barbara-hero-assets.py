#!/usr/bin/env python3
"""Build geographically registered assets for the Santa Barbara hero map.

The script uses one WGS84 output grid for every generated layer. USGS Data
Series 702 supplies all rendered bathymetric contours. The NOAA Santa Barbara
MHW Coastal DEM supplies only the land/water mask and shoreline, so bathymetric
vertical datums are never mixed.

Example:
    python3 -m venv /tmp/castingcompass-geo
    /tmp/castingcompass-geo/bin/pip install -r scripts/santa-barbara-hero-requirements.txt
    /tmp/castingcompass-geo/bin/python scripts/generate-santa-barbara-hero-assets.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import contourpy
import numpy as np
import rasterio
from PIL import Image, ImageFilter
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIRECTORY = ROOT / "public" / "marketing" / "daylight-draft"
CACHE_DIRECTORY = Path(tempfile.gettempdir()) / "castingcompass-geodata"

MAP_TRANSFORM_ID = "santa-barbara-wgs84-20260808-v1"
MAP_BOUNDS = (-119.87, 34.27, -119.56, 34.53)
OUTPUT_SIZE = (1800, 1800)
LAND_DILATION_PIXELS = 2

USGS_URL = (
    "https://pubs.usgs.gov/ds/702/data/bathymetry/"
    "sbchannel_10mbathy.zip"
)
USGS_ARCHIVE_SHA256 = (
    "5ae764fe1d154b43deb2dcd1c1a1de253c737abb5b2221529783ccbead79453b"
)
USGS_ARCHIVE_MEMBER = "sbchannel_10mbathy.asc"
USGS_SOURCE_CRS = "EPSG:26911"
USGS_VERTICAL_DATUM = "NAVD88"

NOAA_WCS_URL = (
    "https://www.ngdc.noaa.gov/thredds/wcs/regional/"
    "santa_barbara_13_mhw_2008.nc?service=WCS&version=1.0.0&"
    "request=GetCoverage&coverage=Band1&"
    "bbox=-119.87,34.27,-119.56,34.53&crs=OGC:CRS84&"
    "format=GeoTIFF_Float&resx=0.00009259259&resy=0.00009259259"
)
NOAA_SUBSET_SHA256 = (
    "ce65ca314f35ec91effe0a5aa6465f2ded9542e5857323e4b487f4f70a62ec31"
)
NOAA_SOURCE_CRS = "EPSG:4326"
NOAA_VERTICAL_DATUM = "Mean High Water"

SENTINEL_STAC_ITEM = "S2B_11SKU_20251017_0_L2A"
SENTINEL_URL = (
    "https://sentinel-cogs.s3.us-west-2.amazonaws.com/"
    "sentinel-s2-l2a-cogs/11/S/KU/2025/10/"
    "S2B_11SKU_20251017_0_L2A/TCI.tif"
)

FEATURES = [
    {
        "id": "leadbetter-beach",
        "label": "Leadbetter Beach",
        "longitude": -119.6977,
        "latitude": 34.4015,
        "kind": "label",
    },
    {
        "id": "santa-barbara-harbor-breakwater",
        "label": "Santa Barbara Harbor",
        "longitude": -119.6908,
        "latitude": 34.4031,
        "kind": "marker",
    },
    {
        "id": "stearns-wharf",
        "label": "Stearns Wharf",
        "longitude": -119.6855,
        "latitude": 34.409,
        "kind": "label",
    },
]

KNOWN_PROBES = [
    {
        "id": "santa-barbara-city",
        "longitude": -119.704,
        "latitude": 34.423,
        "expected": "land",
    },
    {
        "id": "leadbetter-upland",
        "longitude": -119.7005,
        "latitude": 34.4078,
        "expected": "land",
    },
    {
        "id": "harbor-breakwater",
        "longitude": -119.6908,
        "latitude": 34.4031,
        "expected": "land",
    },
    {
        "id": "harbor-approach",
        "longitude": -119.699,
        "latitude": 34.392,
        "expected": "ocean",
    },
    {
        "id": "leadbetter-offshore",
        "longitude": -119.735,
        "latitude": 34.365,
        "expected": "ocean",
    },
    {
        "id": "channel-offshore",
        "longitude": -119.66,
        "latitude": 34.32,
        "expected": "ocean",
    },
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path, expected_sha256: str) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and sha256(destination) == expected_sha256:
        return

    partial = destination.with_suffix(destination.suffix + ".partial")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "CastingCompass-geospatial-asset-builder/1.0"},
    )
    with urllib.request.urlopen(request) as response, partial.open("wb") as output:
        shutil.copyfileobj(response, output)
    actual = sha256(partial)
    if actual != expected_sha256:
        partial.unlink(missing_ok=True)
        raise ValueError(
            f"Source hash mismatch for {url}: expected {expected_sha256}, got {actual}"
        )
    partial.replace(destination)


def project(longitude: float, latitude: float) -> tuple[float, float]:
    west, south, east, north = MAP_BOUNDS
    width, height = OUTPUT_SIZE
    x = (longitude - west) / (east - west) * width
    y = (north - latitude) / (north - south) * height
    return x, y


def raster_on_output_grid(
    source: rasterio.io.DatasetReader,
    *,
    band: int = 1,
    resampling: Resampling = Resampling.bilinear,
    dtype: str = "float32",
    nodata: float = math.nan,
) -> np.ndarray:
    width, height = OUTPUT_SIZE
    destination = np.full((height, width), nodata, dtype=dtype)
    reproject(
        source=rasterio.band(source, band),
        destination=destination,
        src_transform=source.transform,
        src_crs=source.crs,
        src_nodata=source.nodata,
        dst_transform=from_bounds(*MAP_BOUNDS, width, height),
        dst_crs="EPSG:4326",
        dst_nodata=nodata,
        resampling=resampling,
    )
    return destination


def read_noaa_dem(path: Path) -> np.ndarray:
    with rasterio.open(path) as source:
        if source.crs is None:
            raise ValueError("NOAA DEM is missing a CRS")
        return raster_on_output_grid(source)


def read_usgs_bathymetry(path: Path) -> np.ndarray:
    virtual_path = f"/vsizip/{path.resolve()}/{USGS_ARCHIVE_MEMBER}"
    with rasterio.open(virtual_path) as source:
        if source.crs is None or source.crs.to_string() != USGS_SOURCE_CRS:
            raise ValueError(
                f"Unexpected USGS CRS: expected {USGS_SOURCE_CRS}, got {source.crs}"
            )
        return raster_on_output_grid(source)


def read_sentinel_land(url: str, land_alpha: np.ndarray) -> Image.Image:
    width, height = OUTPUT_SIZE
    rgb = np.zeros((height, width, 3), dtype=np.uint8)
    previous_setting = os.environ.get("GDAL_DISABLE_READDIR_ON_OPEN")
    os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = "EMPTY_DIR"
    try:
        with rasterio.open(url) as source:
            for band in range(1, 4):
                rgb[:, :, band - 1] = raster_on_output_grid(
                    source,
                    band=band,
                    resampling=Resampling.bilinear,
                    dtype="uint8",
                    nodata=0,
                )
    finally:
        if previous_setting is None:
            os.environ.pop("GDAL_DISABLE_READDIR_ON_OPEN", None)
        else:
            os.environ["GDAL_DISABLE_READDIR_ON_OPEN"] = previous_setting

    rgba = np.dstack((rgb, land_alpha.astype(np.uint8)))
    return Image.fromarray(rgba)


def dilated_land_alpha(noaa_dem: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    raw_land = np.isfinite(noaa_dem) & (noaa_dem >= 0)
    mask_image = Image.fromarray(raw_land.astype(np.uint8) * 255)
    filter_size = LAND_DILATION_PIXELS * 2 + 1
    dilated = np.asarray(mask_image.filter(ImageFilter.MaxFilter(filter_size)))
    return raw_land, dilated


def svg_path(points: np.ndarray) -> str:
    if len(points) < 2:
        return ""
    commands = [f"M{points[0, 0]:.1f} {points[0, 1]:.1f}"]
    commands.extend(f"L{x:.1f} {y:.1f}" for x, y in points[1:])
    return " ".join(commands)


def contour_paths(
    bathymetry: np.ndarray,
    water_mask: np.ndarray,
) -> list[dict[str, object]]:
    masked = np.ma.array(
        bathymetry,
        mask=(~np.isfinite(bathymetry)) | (~water_mask),
    )
    generator = contourpy.contour_generator(
        z=masked,
        line_type="Separate",
        corner_mask=True,
    )
    records: list[dict[str, object]] = []
    for depth in range(-10, -401, -10):
        for segment in generator.lines(depth):
            path = svg_path(segment)
            if not path:
                continue
            records.append(
                {
                    "depth": depth,
                    "major": depth % 50 == 0,
                    "path": path,
                    "vertices": int(len(segment)),
                }
            )
    return records


def shoreline_paths(noaa_dem: np.ndarray) -> list[str]:
    generator = contourpy.contour_generator(
        z=np.ma.masked_invalid(noaa_dem),
        line_type="Separate",
        corner_mask=True,
    )
    return [
        path
        for segment in generator.lines(0)
        if len(segment) >= 8 and (path := svg_path(segment))
    ]


def classify_probe(alpha: np.ndarray, probe: dict[str, object]) -> dict[str, object]:
    x, y = project(float(probe["longitude"]), float(probe["latitude"]))
    pixel_x = min(max(int(round(x)), 0), OUTPUT_SIZE[0] - 1)
    pixel_y = min(max(int(round(y)), 0), OUTPUT_SIZE[1] - 1)
    alpha_value = int(alpha[pixel_y, pixel_x])
    actual = "land" if alpha_value == 255 else "ocean"
    return {
        **probe,
        "x": round(x, 3),
        "y": round(y, 3),
        "alpha": alpha_value,
        "actual": actual,
        "matches": actual == probe["expected"],
    }


def contour_validation(
    contours: list[dict[str, object]],
    land_alpha: np.ndarray,
) -> dict[str, object]:
    inside_land = 0
    edge_touches = {"top": 0, "right": 0, "bottom": 0, "left": 0}
    depth_values = set()
    total_vertices = 0
    tolerance = 2.5

    for contour in contours:
        depth_values.add(int(contour["depth"]))
        numbers = [float(value) for value in str(contour["path"]).replace("M", " ").replace("L", " ").split()]
        coordinates = list(zip(numbers[0::2], numbers[1::2]))
        total_vertices += len(coordinates)
        for x, y in coordinates:
            pixel_x = min(max(int(round(x)), 0), OUTPUT_SIZE[0] - 1)
            pixel_y = min(max(int(round(y)), 0), OUTPUT_SIZE[1] - 1)
            if land_alpha[pixel_y, pixel_x] == 255:
                inside_land += 1
            if y <= tolerance:
                edge_touches["top"] += 1
            if x >= OUTPUT_SIZE[0] - tolerance:
                edge_touches["right"] += 1
            if y >= OUTPUT_SIZE[1] - tolerance:
                edge_touches["bottom"] += 1
            if x <= tolerance:
                edge_touches["left"] += 1

    return {
        "contourCount": len(contours),
        "contourVertexCount": total_vertices,
        "contourDepths": sorted(depth_values, reverse=True),
        "contourLandIntersectionCount": inside_land,
        "edgeVertexCounts": edge_touches,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache-dir", type=Path, default=CACHE_DIRECTORY)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIRECTORY)
    parser.add_argument("--usgs-archive", type=Path)
    parser.add_argument("--noaa-dem", type=Path)
    parser.add_argument("--sentinel-url", default=SENTINEL_URL)
    args = parser.parse_args()

    cache_dir = args.cache_dir.resolve()
    output_dir = args.output_dir.resolve()
    usgs_archive = (args.usgs_archive or cache_dir / "sbchannel_10mbathy.zip").resolve()
    noaa_dem_path = (args.noaa_dem or cache_dir / "santa-barbara-noaa-dem.tif").resolve()

    download(USGS_URL, usgs_archive, USGS_ARCHIVE_SHA256)
    download(NOAA_WCS_URL, noaa_dem_path, NOAA_SUBSET_SHA256)
    if USGS_ARCHIVE_MEMBER not in zipfile.ZipFile(usgs_archive).namelist():
        raise ValueError(f"{USGS_ARCHIVE_MEMBER} is absent from {usgs_archive}")

    noaa_dem = read_noaa_dem(noaa_dem_path)
    raw_land, land_alpha = dilated_land_alpha(noaa_dem)
    water_mask = land_alpha == 0
    bathymetry = read_usgs_bathymetry(usgs_archive)
    contours = contour_paths(bathymetry, water_mask)
    shorelines = shoreline_paths(noaa_dem)
    probes = [classify_probe(land_alpha, probe) for probe in KNOWN_PROBES]
    validation = contour_validation(contours, land_alpha)
    validation.update(
        {
            "allKnownProbesMatch": all(probe["matches"] for probe in probes),
            "knownProbes": probes,
            "rawLandPixelCount": int(raw_land.sum()),
            "dilatedLandPixelCount": int((land_alpha == 255).sum()),
            "shorelinePathCount": len(shorelines),
        }
    )
    if not validation["allKnownProbesMatch"]:
        mismatches = [probe for probe in probes if not probe["matches"]]
        raise ValueError(f"Known land/water probe mismatch: {mismatches}")
    if validation["contourLandIntersectionCount"]:
        raise ValueError(
            "Generated contour vertices intersect the final dilated land mask: "
            f"{validation['contourLandIntersectionCount']}"
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    land_path = output_dir / "santa-barbara-land.png"
    geometry_path = output_dir / "santa-barbara-hero-geometry.json"

    land_image = read_sentinel_land(args.sentinel_url, land_alpha)
    land_image.save(land_path, format="PNG", optimize=True, compress_level=9)

    projected_features = []
    for feature in FEATURES:
        x, y = project(feature["longitude"], feature["latitude"])
        projected_features.append(
            {**feature, "x": round(x, 3), "y": round(y, 3)}
        )

    payload = {
        "schemaVersion": "castingcompass.santa-barbara-hero-geometry/1.0.0",
        "generatedAt": "2026-08-08",
        "generatedBy": "scripts/generate-santa-barbara-hero-assets.py",
        "mapTransformId": MAP_TRANSFORM_ID,
        "coordinateReference": "EPSG:4326",
        "bounds": {
            "west": MAP_BOUNDS[0],
            "south": MAP_BOUNDS[1],
            "east": MAP_BOUNDS[2],
            "north": MAP_BOUNDS[3],
        },
        "viewBox": [0, 0, OUTPUT_SIZE[0], OUTPUT_SIZE[1]],
        "camera": {"rotationDegrees": 120, "scale": 1.46},
        "sources": {
            "bathymetry": {
                "title": "Merged bathymetry of the Santa Barbara Channel, California",
                "agency": "U.S. Geological Survey",
                "series": "Data Series 702",
                "downloadUrl": USGS_URL,
                "archiveSha256": USGS_ARCHIVE_SHA256,
                "originalCrs": USGS_SOURCE_CRS,
                "verticalDatum": USGS_VERTICAL_DATUM,
                "resolutionMeters": 10,
                "publicDomain": True,
                "notForNavigation": True,
            },
            "landMask": {
                "title": "Santa Barbara, California 1/3 arc-second MHW Coastal Digital Elevation Model",
                "agency": "NOAA National Centers for Environmental Information",
                "downloadUrl": NOAA_WCS_URL,
                "subsetSha256": NOAA_SUBSET_SHA256,
                "originalCrs": NOAA_SOURCE_CRS,
                "verticalDatum": NOAA_VERTICAL_DATUM,
                "use": "Binary land/water mask and zero-elevation shoreline only",
                "notForNavigation": True,
            },
            "landImagery": {
                "title": "Copernicus Sentinel-2 L2A true color",
                "agency": "Copernicus / Element84 Earth Search",
                "stacItem": SENTINEL_STAC_ITEM,
                "assetUrl": args.sentinel_url,
                "originalCrs": "EPSG:32611",
                "resolutionMeters": 10,
            },
        },
        "processing": {
            "outputGrid": "One 1800 by 1800 WGS84 grid for land, shoreline, contours, and features",
            "contours": "USGS DS 702 raster reprojected once, masked by NOAA MHW water, then contoured at 10 m intervals without decorative geometry",
            "land": f"Sentinel true color masked by NOAA MHW land and dilated {LAND_DILATION_PIXELS} output pixels offshore",
            "clipping": "Geographic sources buffered to the registered frame; browser clipping occurs only at the outer rounded hero viewport",
        },
        "contours": contours,
        "shorelines": shorelines,
        "features": projected_features,
        "validation": validation,
        "assets": {
            "land": land_path.name,
            "landSha256": sha256(land_path),
            "geometry": geometry_path.name,
        },
        "limitations": [
            "Not for navigation.",
            "DS 702 is a historical 10 m compilation relative to NAVD88.",
            "The NOAA MHW DEM is used only for the display mask and shoreline, not to create or fill bathymetric contours.",
            "Resolution does not equal positional or vertical accuracy.",
        ],
    }
    geometry_path.write_text(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=True) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {land_path} ({sha256(land_path)})")
    print(f"Wrote {geometry_path} ({sha256(geometry_path)})")
    print(json.dumps(validation, indent=2))


if __name__ == "__main__":
    main()
