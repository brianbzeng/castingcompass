#!/usr/bin/env python3
"""Materialize exact USGS inputs and run the South Coast sediment screen."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urlparse
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.contourcast.metadata import sha256_file  # noqa: E402
from pipeline.contourcast.sediment_endpoint_audit import DS182_SOURCE_ID  # noqa: E402
from pipeline.contourcast.sediment_south_coast_support_audit import (  # noqa: E402
    REGION_PRIORITY,
    SOUTH_COAST_SOURCE_ID,
    audit_usgs_south_coast_sediment_support,
)
from pipeline.contourcast.sources import get_source_manifest  # noqa: E402


def _safe_url_name(url: str) -> str:
    name = Path(urlparse(url).path).name
    if not name or name in {".", ".."}:
        raise ValueError(f"official URL has no safe filename: {url}")
    return name


def _materialize(
    url: str,
    expected_sha256: str,
    expected_bytes: int | None,
    destination: Path,
) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if (
            (expected_bytes is not None and destination.stat().st_size != expected_bytes)
            or sha256_file(destination) != expected_sha256
        ):
            raise ValueError(f"cached artifact checksum mismatch: {destination}")
        return destination
    partial = destination.with_suffix(destination.suffix + ".part")
    partial.unlink(missing_ok=True)
    try:
        request = urllib.request.Request(
            url,
            headers={"User-Agent": "CastingCompass/1.0 (+https://castingcompass.com)"},
        )
        with urllib.request.urlopen(request, timeout=120) as response, partial.open(
            "wb"
        ) as output:
            shutil.copyfileobj(response, output, length=1024 * 1024)
        if (
            (expected_bytes is not None and partial.stat().st_size != expected_bytes)
            or sha256_file(partial) != expected_sha256
        ):
            raise ValueError(f"download checksum mismatch: {url}")
        os.replace(partial, destination)
    finally:
        partial.unlink(missing_ok=True)
    return destination


def _extract_exact_member(
    archive_path: Path,
    member: str,
    expected_sha256: str,
    destination: Path,
) -> Path:
    if Path(member).name != member:
        raise ValueError("GeoTIFF member name is unsafe")
    if destination.exists():
        if sha256_file(destination) != expected_sha256:
            raise ValueError(f"cached GeoTIFF checksum mismatch: {destination}")
        return destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_suffix(destination.suffix + ".part")
    partial.unlink(missing_ok=True)
    try:
        try:
            with ZipFile(archive_path) as source:
                if source.namelist().count(member) != 1:
                    raise ValueError("official archive lacks one exact GeoTIFF member")
                with source.open(member) as input_handle, partial.open("wb") as output:
                    shutil.copyfileobj(input_handle, output, length=1024 * 1024)
        except BadZipFile as error:
            raise ValueError("official raster archive is not a valid ZIP file") from error
        if sha256_file(partial) != expected_sha256:
            raise ValueError("extracted GeoTIFF checksum mismatch")
        os.replace(partial, destination)
    finally:
        partial.unlink(missing_ok=True)
    return destination


def run(source_root: Path, output_dir: Path) -> dict[str, str]:
    sediment_manifest = get_source_manifest(DS182_SOURCE_ID)
    sediment_access = sediment_manifest["access"]
    outcome = sediment_access["outcome_asset"]
    source_table = sediment_access["source_table"]
    south_manifest = get_source_manifest(SOUTH_COAST_SOURCE_ID)
    south_access = south_manifest["access"]
    if tuple(south_access["region_priority"]) != REGION_PRIORITY:
        raise ValueError("South Coast region priority disagrees with protocol")

    raw_dir = source_root / "raw"
    archive_path = _materialize(
        outcome["url"],
        outcome["archive_sha256"],
        outcome["archive_bytes"],
        raw_dir / "sediment" / _safe_url_name(outcome["url"]),
    )
    source_table_path = _materialize(
        source_table["url"],
        source_table["sha256"],
        source_table["bytes"],
        raw_dir / "sediment" / _safe_url_name(source_table["url"]),
    )
    raster_paths: dict[str, Path] = {}
    for region in REGION_PRIORITY:
        bathymetry = south_access["regions"][region]["bathymetry"]
        raster_archive = _materialize(
            bathymetry["url"],
            bathymetry["archive_sha256"],
            None,
            raw_dir / region / _safe_url_name(bathymetry["url"]),
        )
        member = bathymetry["geotiff_path"]
        raster_paths[region] = _extract_exact_member(
            raster_archive,
            member,
            bathymetry["geotiff_sha256"],
            raw_dir / region / "reference" / member,
        )
    result = audit_usgs_south_coast_sediment_support(
        archive_path,
        source_table_path,
        raster_paths,
        output_dir,
    )
    return {key: str(path.resolve()) for key, path in result.items()}


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Download exact official DS182 and South Coast raster bytes and screen direct "
            "sediment support inside four metadata-only footprints. No raster pixels, patches, "
            "training, promotion, score, serving, or deployment path is used."
        )
    )
    default_root = ROOT / "work" / "usgs-south-coast-sediment-support-v1"
    parser.add_argument("--source-root", type=Path, default=default_root / "sources")
    parser.add_argument("--output-dir", type=Path, default=default_root / "results")
    args = parser.parse_args()
    print(json.dumps(run(args.source_root, args.output_dir), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
