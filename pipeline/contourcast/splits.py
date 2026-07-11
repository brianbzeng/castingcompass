"""Geographically blocked evaluation with optional exclusion buffers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence

import numpy as np
from sklearn.cluster import KMeans


@dataclass(frozen=True)
class SpatialFold:
    fold_id: int
    train_indices: np.ndarray
    test_indices: np.ndarray
    buffer_excluded_indices: np.ndarray


def _near_any(
    candidate_xy: np.ndarray,
    reference_xy: np.ndarray,
    distance_m: float,
    batch_size: int = 2048,
) -> np.ndarray:
    if distance_m <= 0:
        return np.zeros(len(candidate_xy), dtype=bool)
    threshold_squared = float(distance_m) ** 2
    output = np.zeros(len(candidate_xy), dtype=bool)
    for start in range(0, len(candidate_xy), batch_size):
        chunk = candidate_xy[start : start + batch_size]
        squared = np.sum(np.square(chunk[:, None, :] - reference_xy[None, :, :]), axis=2)
        output[start : start + len(chunk)] = np.any(squared < threshold_squared, axis=1)
    return output


def spatial_block_folds(
    x: Sequence[float],
    y: Sequence[float],
    *,
    n_splits: int = 5,
    buffer_m: float = 0.0,
    random_state: int = 42,
    min_train: int = 20,
    min_test: int = 5,
) -> List[SpatialFold]:
    """Create contiguous K-means regions and hold out each entire region.

    Training points within ``buffer_m`` of any held-out point are removed. This
    prevents near-duplicate shoreline or survey locations from leaking across a
    boundary. Coordinates must already be in the same projected metre CRS.
    """

    xy = np.column_stack([np.asarray(x, dtype=float), np.asarray(y, dtype=float)])
    if xy.ndim != 2 or xy.shape[1] != 2 or len(xy) < n_splits * min_test:
        raise ValueError("not enough observations for requested blocked folds")
    if not np.all(np.isfinite(xy)):
        raise ValueError("spatial coordinates must be finite")
    if n_splits < 2:
        raise ValueError("n_splits must be at least two")
    if buffer_m < 0:
        raise ValueError("buffer_m cannot be negative")

    scale = np.std(xy, axis=0)
    scale[scale == 0] = 1.0
    labels = KMeans(n_clusters=n_splits, random_state=random_state, n_init=20).fit_predict(
        (xy - np.mean(xy, axis=0)) / scale
    )
    all_indices = np.arange(len(xy))
    folds: List[SpatialFold] = []
    for fold_id in range(n_splits):
        test_indices = all_indices[labels == fold_id]
        candidate_train = all_indices[labels != fold_id]
        excluded_mask = _near_any(xy[candidate_train], xy[test_indices], buffer_m)
        excluded = candidate_train[excluded_mask]
        train_indices = candidate_train[~excluded_mask]
        if len(test_indices) < min_test:
            raise ValueError(f"fold {fold_id} has only {len(test_indices)} test observations")
        if len(train_indices) < min_train:
            raise ValueError(
                f"fold {fold_id} has only {len(train_indices)} training observations after buffer"
            )
        folds.append(SpatialFold(fold_id, train_indices, test_indices, excluded))

    seen = np.concatenate([fold.test_indices for fold in folds])
    if not np.array_equal(np.sort(seen), all_indices):
        raise RuntimeError("blocked folds did not hold out every observation exactly once")
    return folds
