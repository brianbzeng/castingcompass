"""Derive six auditable terrain channels from bathymetric elevation."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Mapping, Tuple

import numpy as np

from .geo import GeoGrid


TERRAIN_CHANNELS: Tuple[str, ...] = (
    "depth_m",
    "slope_deg",
    "roughness_m",
    "curvature",
    "tpi_local_m",
    "tpi_broad_m",
)


def _box_mean(values: np.ndarray, radius: int) -> np.ndarray:
    if radius < 1:
        raise ValueError("box radius must be positive")
    size = 2 * radius + 1
    padded = np.pad(values, radius, mode="edge")
    integral = np.pad(padded, ((1, 0), (1, 0)), mode="constant").cumsum(0).cumsum(1)
    window_sum = (
        integral[size:, size:]
        - integral[:-size, size:]
        - integral[size:, :-size]
        + integral[:-size, :-size]
    )
    return window_sum / float(size * size)


def derive_terrain_channels(
    grid: GeoGrid,
    local_radius: int = 2,
    broad_radius: int = 6,
) -> Tuple[np.ndarray, Dict[str, object]]:
    """Return a ``(6, height, width)`` terrain tensor and derivation metadata.

    Source elevation is expected to follow the conventional positive-upward sign.
    ``depth_m`` is therefore ``max(-elevation, 0)``. Land cells are retained as
    zero depth rather than being represented as underwater habitat.
    """

    if broad_radius <= local_radius:
        raise ValueError("broad_radius must be larger than local_radius")

    valid = grid.valid_mask
    elevation = grid.values.astype(np.float64, copy=True)
    fill = float(np.nanmedian(elevation[valid]))
    elevation[~valid] = fill
    depth = np.maximum(-elevation, 0.0)

    dx, dy = grid.pixel_size
    dz_dy, dz_dx = np.gradient(elevation, dy, dx)
    slope = np.degrees(np.arctan(np.hypot(dz_dx, dz_dy)))

    local_mean = _box_mean(depth, local_radius)
    broad_mean = _box_mean(depth, broad_radius)
    second_moment = _box_mean(np.square(depth), local_radius)
    roughness = np.sqrt(np.maximum(second_moment - np.square(local_mean), 0.0))

    d2z_dx2 = np.gradient(np.gradient(elevation, dx, axis=1), dx, axis=1)
    d2z_dy2 = np.gradient(np.gradient(elevation, dy, axis=0), dy, axis=0)
    curvature = d2z_dx2 + d2z_dy2
    tpi_local = depth - local_mean
    tpi_broad = depth - broad_mean

    stack = np.stack([depth, slope, roughness, curvature, tpi_local, tpi_broad]).astype(np.float32)
    stack[:, ~valid] = np.nan
    metadata: Dict[str, object] = {
        "channels": list(TERRAIN_CHANNELS),
        "channel_count": len(TERRAIN_CHANNELS),
        "source_id": grid.source_id,
        "source_vertical_datum": grid.vertical_datum,
        "horizontal_crs": grid.crs,
        "pixel_size_m": [dx, dy],
        "local_radius_cells": local_radius,
        "broad_radius_cells": broad_radius,
        "depth_sign_convention": "positive downward; derived as max(-elevation, 0)",
        "curvature_units": "elevation metres per horizontal metre squared",
    }
    return stack, metadata


def robust_channel_stats(channels: np.ndarray) -> Dict[str, Dict[str, float]]:
    if channels.ndim != 3 or channels.shape[0] != len(TERRAIN_CHANNELS):
        raise ValueError(f"expected ({len(TERRAIN_CHANNELS)}, H, W) channels")
    output: Dict[str, Dict[str, float]] = {}
    for name, layer in zip(TERRAIN_CHANNELS, channels):
        finite = layer[np.isfinite(layer)]
        if finite.size == 0:
            raise ValueError(f"channel {name!r} contains no finite values")
        output[name] = {
            "median": float(np.median(finite)),
            "iqr": float(np.percentile(finite, 75) - np.percentile(finite, 25)),
            "mean": float(np.mean(finite)),
            "std": float(np.std(finite)),
        }
    return output


def save_terrain_stack(
    path: Path,
    channels: np.ndarray,
    grid: GeoGrid,
    derivation_metadata: Mapping[str, object],
) -> None:
    if channels.shape != (len(TERRAIN_CHANNELS), grid.height, grid.width):
        raise ValueError("terrain stack and reference grid do not align")
    metadata = {
        "schema_version": "1.0",
        "crs": grid.crs,
        "transform": list(grid.transform),
        "vertical_datum": grid.vertical_datum,
        "horizontal_units": grid.horizontal_units,
        "nodata": grid.nodata,
        "source_id": grid.source_id,
        "derivation": dict(derivation_metadata),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(path, values=channels, metadata=json.dumps(metadata, sort_keys=True))


def load_terrain_stack(path: Path) -> Tuple[np.ndarray, GeoGrid, Mapping[str, object]]:
    with np.load(path, allow_pickle=False) as archive:
        channels = archive["values"].astype(np.float32)
        metadata = json.loads(str(archive["metadata"].item()))
    if channels.ndim != 3 or channels.shape[0] != len(TERRAIN_CHANNELS):
        raise ValueError(f"terrain artifact must contain {len(TERRAIN_CHANNELS)} channels")
    reference = GeoGrid(
        values=channels[0],
        crs=metadata["crs"],
        transform=tuple(metadata["transform"]),
        vertical_datum=metadata["vertical_datum"],
        horizontal_units=metadata.get("horizontal_units", "metre"),
        nodata=metadata.get("nodata"),
        source_id=metadata.get("source_id", "unknown"),
    )
    if tuple(metadata.get("derivation", {}).get("channels", [])) != TERRAIN_CHANNELS:
        raise ValueError("terrain artifact channel order does not match the model contract")
    return channels, reference, metadata["derivation"]
