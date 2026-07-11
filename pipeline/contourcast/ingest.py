"""Canonical bathymetry and recreational-catch ingestion."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Mapping

import numpy as np
import pandas as pd

from .geo import GeoGrid, GridValidationError, verify_projected_crs
from .metadata import sha256_file, utc_now, write_json
from .sources import get_source_manifest


OBSERVATION_COLUMNS = (
    "event_id",
    "observed_at",
    "species",
    "catch_count",
    "effort_hours",
    "sample_weight",
    "x",
    "y",
    "crs",
    "area_id",
    "spatial_resolution",
    "source_id",
)


def save_grid(path: Path, grid: GeoGrid) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    metadata = {
        "schema_version": "1.0",
        "crs": grid.crs,
        "transform": list(grid.transform),
        "vertical_datum": grid.vertical_datum,
        "horizontal_units": grid.horizontal_units,
        "nodata": grid.nodata,
        "source_id": grid.source_id,
    }
    np.savez_compressed(path, values=grid.values, metadata=json.dumps(metadata, sort_keys=True))


def load_grid(path: Path) -> GeoGrid:
    suffix = path.suffix.lower()
    if suffix == ".npz":
        with np.load(path, allow_pickle=False) as archive:
            values = archive["values"]
            raw_metadata = archive["metadata"].item()
        metadata = json.loads(str(raw_metadata))
        return GeoGrid(
            values=values,
            crs=metadata["crs"],
            transform=tuple(metadata["transform"]),
            vertical_datum=metadata["vertical_datum"],
            horizontal_units=metadata.get("horizontal_units", "metre"),
            nodata=metadata.get("nodata"),
            source_id=metadata.get("source_id", "unknown"),
        )
    if suffix in {".tif", ".tiff"}:
        raise GridValidationError(
            "raw GeoTIFF needs explicit vertical datum; run ingest-bathymetry instead of load_grid"
        )
    raise ValueError(f"unsupported raster format {suffix!r}; expected canonical .npz")


def ingest_bathymetry(
    source_path: Path,
    output_path: Path,
    *,
    source_id: str,
    vertical_datum: str,
    expected_sha256: str | None = None,
    crs_override: str | None = None,
) -> Mapping[str, Any]:
    """Convert an official GeoTIFF or canonical NPZ into a validated archive."""

    manifest = get_source_manifest(source_id)
    actual_sha256 = sha256_file(source_path)
    if expected_sha256 and expected_sha256.lower() != actual_sha256:
        raise ValueError(
            f"checksum mismatch for {source_path}: expected {expected_sha256}, got {actual_sha256}"
        )

    if source_path.suffix.lower() == ".npz":
        source_grid = load_grid(source_path)
        if crs_override and crs_override.strip().upper() != source_grid.crs.strip().upper():
            raise GridValidationError(
                "--crs-override cannot reproject a canonical NPZ; create a correctly reprojected raster first"
            )
        grid = GeoGrid(
            source_grid.values,
            source_grid.crs,
            source_grid.transform,
            vertical_datum,
            source_grid.horizontal_units,
            source_grid.nodata,
            source_id,
        )
    elif source_path.suffix.lower() in {".tif", ".tiff"}:
        try:
            import rasterio  # type: ignore
        except ImportError as error:
            raise RuntimeError(
                "GeoTIFF ingestion requires rasterio. Install it in an isolated Python environment; "
                "the synthetic smoke path does not require it."
            ) from error
        with rasterio.open(source_path) as dataset:
            if dataset.count != 1:
                raise GridValidationError("bathymetry input must contain exactly one raster band")
            source_crs = dataset.crs.to_string() if dataset.crs else ""
            if crs_override and source_crs and crs_override.strip().upper() != source_crs.strip().upper():
                raise GridValidationError(
                    "--crs-override only supplies missing metadata; it cannot reproject a raster. "
                    "Warp the GeoTIFF before ingestion."
                )
            crs = source_crs or crs_override or ""
            transform = dataset.transform
            grid = GeoGrid(
                dataset.read(1),
                crs,
                (transform.c, transform.a, transform.b, transform.f, transform.d, transform.e),
                vertical_datum,
                "metre",
                dataset.nodata,
                source_id,
            )
    else:
        raise ValueError("bathymetry input must be GeoTIFF or canonical NPZ")

    crs_check = verify_projected_crs(grid.crs)
    save_grid(output_path, grid)
    provenance = {
        "schema_version": "1.0",
        "created_at": utc_now(),
        "source_id": source_id,
        "source_title": manifest["title"],
        "official_landing_page": manifest["official_landing_page"],
        "input_path": str(source_path.resolve()),
        "input_sha256": actual_sha256,
        "output_path": str(output_path.resolve()),
        "output_sha256": sha256_file(output_path),
        "crs_check": crs_check,
        "vertical_datum": vertical_datum,
        "bounds": list(grid.bounds),
        "shape": list(grid.values.shape),
        "not_for_navigation": True,
    }
    write_json(output_path.with_suffix(".provenance.json"), provenance)
    return provenance


def _load_column_map(path: Path | None) -> Dict[str, str]:
    if path is None:
        return {}
    with path.open("r", encoding="utf-8") as handle:
        mapping = json.load(handle)
    if not isinstance(mapping, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in mapping.items()):
        raise ValueError("column map must be a JSON object from canonical name to source column")
    return mapping


def ingest_observations(
    source_path: Path,
    output_path: Path,
    *,
    source_id: str,
    column_map_path: Path | None = None,
    expected_sha256: str | None = None,
) -> Mapping[str, Any]:
    """Normalize a CRFS/RecFIN CSV without inventing precise coordinates.

    A source export may omit ``x``/``y``. Such rows remain useful for aggregated
    descriptive analysis but are deliberately ineligible for terrain-patch models.
    """

    manifest = get_source_manifest(source_id)
    actual_sha256 = sha256_file(source_path)
    if expected_sha256 and expected_sha256.lower() != actual_sha256:
        raise ValueError("observation checksum does not match expected_sha256")
    frame = pd.read_csv(source_path)
    mapping = _load_column_map(column_map_path)
    for canonical, source_column in mapping.items():
        if source_column not in frame.columns:
            raise ValueError(f"mapped source column {source_column!r} is absent")
        frame[canonical] = frame[source_column]

    required = {"event_id", "species", "catch_count", "effort_hours"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(
            f"missing required canonical columns {sorted(missing)}; provide --column-map"
        )

    normalized = pd.DataFrame(index=frame.index)
    for column in OBSERVATION_COLUMNS:
        if column in frame:
            normalized[column] = frame[column]
        else:
            normalized[column] = np.nan
    normalized["source_id"] = source_id
    normalized["catch_count"] = pd.to_numeric(normalized["catch_count"], errors="raise")
    normalized["effort_hours"] = pd.to_numeric(normalized["effort_hours"], errors="raise")
    normalized["sample_weight"] = pd.to_numeric(
        normalized["sample_weight"], errors="coerce"
    ).fillna(1.0)
    if (normalized["catch_count"] < 0).any() or (normalized["effort_hours"] <= 0).any():
        raise ValueError("catch_count must be nonnegative and effort_hours must be positive")
    if (normalized["sample_weight"] <= 0).any():
        raise ValueError("sample_weight must be positive when provided")
    normalized["occurrence"] = (normalized["catch_count"] > 0).astype(int)
    normalized["cpue"] = normalized["catch_count"] / normalized["effort_hours"]

    has_x = normalized["x"].notna()
    has_y = normalized["y"].notna()
    if not has_x.equals(has_y):
        raise ValueError("x and y must either both be present or both be absent")
    precise = has_x & normalized["spatial_resolution"].fillna("").astype(str).str.lower().isin(
        {"point", "exact", "gps"}
    )
    normalized["terrain_model_eligible"] = precise
    if has_x.any() and normalized.loc[has_x, "crs"].isna().any():
        raise ValueError("coordinate-bearing rows require an explicit projected CRS")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    normalized.to_csv(output_path, index=False)
    provenance = {
        "schema_version": "1.0",
        "created_at": utc_now(),
        "source_id": source_id,
        "source_title": manifest["title"],
        "official_landing_page": manifest["official_landing_page"],
        "input_path": str(source_path.resolve()),
        "input_sha256": actual_sha256,
        "output_path": str(output_path.resolve()),
        "output_sha256": sha256_file(output_path),
        "rows": int(len(normalized)),
        "terrain_model_eligible_rows": int(normalized["terrain_model_eligible"].sum()),
        "spatial_warning": (
            "Aggregated or area-only records were retained but are not eligible for exact terrain joins."
        ),
    }
    write_json(output_path.with_suffix(".provenance.json"), provenance)
    return provenance


def load_model_observations(path: Path, expected_crs: str) -> pd.DataFrame:
    frame = pd.read_csv(path)
    required = {"x", "y", "occurrence", "cpue", "terrain_model_eligible", "crs"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"model observations missing columns: {sorted(missing)}")
    eligible = frame["terrain_model_eligible"].astype(str).str.lower().isin({"true", "1"})
    frame = frame.loc[eligible].copy()
    if frame.empty:
        raise ValueError("no point-resolution observations are eligible for terrain modeling")
    crs_values = {str(value).strip().upper() for value in frame["crs"].dropna().unique()}
    if crs_values != {expected_crs.strip().upper()}:
        raise GridValidationError(
            f"observation CRS {sorted(crs_values)} does not match raster CRS {expected_crs!r}"
        )
    if "sample_weight" not in frame:
        frame["sample_weight"] = 1.0
    for column in ("x", "y", "occurrence", "cpue", "sample_weight"):
        frame[column] = pd.to_numeric(frame[column], errors="raise")
    return frame
