"""Patch extraction and tabular summaries shared by deep and baseline models."""

from __future__ import annotations

from typing import Iterable, Sequence, Tuple

import numpy as np

from .geo import GeoGrid, validate_observation_extent
from .terrain import TERRAIN_CHANNELS


def extract_patches(
    channels: np.ndarray,
    grid: GeoGrid,
    x: Sequence[float],
    y: Sequence[float],
    patch_size: int = 17,
) -> np.ndarray:
    """Extract edge-padded terrain patches centered on projected coordinates."""

    if channels.shape != (len(TERRAIN_CHANNELS), grid.height, grid.width):
        raise ValueError("terrain channels do not align with the supplied grid")
    if patch_size < 3 or patch_size % 2 == 0:
        raise ValueError("patch_size must be an odd integer of at least three")
    validate_observation_extent(grid, x, y)
    rows, cols = grid.xy_to_row_col(np.asarray(x), np.asarray(y))
    radius = patch_size // 2
    finite = np.isfinite(channels)
    channel_medians = np.nanmedian(channels.reshape(channels.shape[0], -1), axis=1)
    filled = np.where(finite, channels, channel_medians[:, None, None])
    padded = np.pad(filled, ((0, 0), (radius, radius), (radius, radius)), mode="edge")
    patches = np.empty((len(rows), channels.shape[0], patch_size, patch_size), dtype=np.float32)
    for index, (row, col) in enumerate(zip(rows, cols)):
        patches[index] = padded[:, row : row + patch_size, col : col + patch_size]
    return patches


def summarize_patches(patches: np.ndarray) -> Tuple[np.ndarray, Tuple[str, ...]]:
    """Create interpretable per-channel features for classical baselines."""

    if patches.ndim != 4 or patches.shape[1] != len(TERRAIN_CHANNELS):
        raise ValueError("patches must have shape (N, 6, H, W)")
    center_row = patches.shape[2] // 2
    center_col = patches.shape[3] // 2
    features = []
    names = []
    for channel_index, channel_name in enumerate(TERRAIN_CHANNELS):
        layer = patches[:, channel_index]
        summaries = (
            layer[:, center_row, center_col],
            np.mean(layer, axis=(1, 2)),
            np.std(layer, axis=(1, 2)),
            np.min(layer, axis=(1, 2)),
            np.max(layer, axis=(1, 2)),
        )
        for suffix, values in zip(("center", "mean", "std", "min", "max"), summaries):
            features.append(values)
            names.append(f"{channel_name}__{suffix}")
    return np.column_stack(features).astype(np.float32), tuple(names)


def select_channels(
    features: np.ndarray,
    feature_names: Sequence[str],
    channels: Iterable[str],
) -> Tuple[np.ndarray, Tuple[str, ...]]:
    requested = set(channels)
    unknown = requested - set(TERRAIN_CHANNELS)
    if unknown:
        raise ValueError(f"unknown terrain channels: {sorted(unknown)}")
    mask = np.asarray([name.split("__", 1)[0] in requested for name in feature_names])
    if not np.any(mask):
        raise ValueError("channel selection produced zero features")
    return features[:, mask], tuple(name for name, keep in zip(feature_names, mask) if keep)
