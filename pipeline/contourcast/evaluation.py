"""Fold-safe metrics and terrain-channel ablation hooks."""

from __future__ import annotations

from typing import Any, Dict, Iterable, Mapping, Sequence

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    log_loss,
    mean_absolute_error,
    mean_squared_error,
    roc_auc_score,
)

from .baselines import BASELINE_NAMES, fit_predict_baseline
from .patches import select_channels
from .splits import SpatialFold
from .terrain import TERRAIN_CHANNELS


DEFAULT_ABLATIONS: Mapping[str, Sequence[str]] = {
    "full_six": TERRAIN_CHANNELS,
    "depth_only": ("depth_m",),
    "geomorphology_without_depth": (
        "slope_deg",
        "roughness_m",
        "curvature",
        "tpi_local_m",
        "tpi_broad_m",
    ),
    "without_tpi": ("depth_m", "slope_deg", "roughness_m", "curvature"),
}


def _average_ranks(values: np.ndarray) -> np.ndarray:
    """Return one-based average ranks with deterministic handling of ties."""

    values = np.asarray(values, dtype=float)
    order = np.argsort(values, kind="mergesort")
    ranked = np.empty(len(values), dtype=float)
    cursor = 0
    while cursor < len(values):
        end = cursor + 1
        while end < len(values) and values[order[end]] == values[order[cursor]]:
            end += 1
        ranked[order[cursor:end]] = (cursor + 1 + end) / 2.0
        cursor = end
    return ranked


def spearman_rank(target: np.ndarray, prediction: np.ndarray) -> float | None:
    target_ranks = _average_ranks(np.asarray(target, dtype=float))
    prediction_ranks = _average_ranks(np.asarray(prediction, dtype=float))
    if np.std(target_ranks) == 0 or np.std(prediction_ranks) == 0:
        return None
    return float(np.corrcoef(target_ranks, prediction_ranks)[0, 1])


def ndcg_at_k(target: np.ndarray, prediction: np.ndarray, k: int = 10) -> float | None:
    """Normalized discounted cumulative gain using nonnegative realized CPUE."""

    relevance = np.maximum(np.asarray(target, dtype=float), 0.0)
    prediction = np.asarray(prediction, dtype=float)
    limit = min(k, len(relevance))
    if limit == 0:
        return None
    discount = np.log2(np.arange(2, limit + 2, dtype=float))
    predicted_order = np.argsort(-prediction, kind="mergesort")[:limit]
    ideal_order = np.argsort(-relevance, kind="mergesort")[:limit]
    dcg = float(np.sum(np.log1p(relevance[predicted_order]) / discount))
    ideal = float(np.sum(np.log1p(relevance[ideal_order]) / discount))
    return dcg / ideal if ideal > 0 else None


def _bootstrap_interval(
    target: np.ndarray,
    prediction: np.ndarray,
    metric: Any,
    *,
    samples: int,
    random_state: int,
) -> tuple[float | None, float | None]:
    if len(target) < 2 or samples < 1:
        return None, None
    generator = np.random.default_rng(random_state)
    values = []
    for _ in range(samples):
        indices = generator.integers(0, len(target), len(target))
        value = metric(target[indices], prediction[indices])
        if value is not None and np.isfinite(value):
            values.append(value)
    if not values:
        return None, None
    lower, upper = np.quantile(values, [0.025, 0.975])
    return float(lower), float(upper)


def expected_calibration_error(
    labels: np.ndarray, probabilities: np.ndarray, bins: int = 10
) -> float:
    labels = np.asarray(labels, dtype=float)
    probabilities = np.asarray(probabilities, dtype=float)
    edges = np.linspace(0.0, 1.0, bins + 1)
    total = len(labels)
    error = 0.0
    for lower, upper in zip(edges[:-1], edges[1:]):
        include = (probabilities >= lower) & (
            (probabilities < upper) | ((upper == 1.0) & (probabilities <= upper))
        )
        if np.any(include):
            error += np.sum(include) / total * abs(
                np.mean(labels[include]) - np.mean(probabilities[include])
            )
    return float(error)


def score_predictions(
    occurrence: np.ndarray,
    cpue: np.ndarray,
    occurrence_probability: np.ndarray,
    predicted_cpue: np.ndarray,
    *,
    bootstrap_samples: int = 100,
    random_state: int = 42,
) -> Dict[str, float | None]:
    occurrence = np.asarray(occurrence, dtype=int)
    cpue = np.asarray(cpue, dtype=float)
    probability = np.clip(np.asarray(occurrence_probability, dtype=float), 1e-6, 1 - 1e-6)
    predicted_cpue = np.asarray(predicted_cpue, dtype=float)
    both_classes = len(np.unique(occurrence)) == 2
    positive = occurrence == 1
    realized_utility = np.maximum(cpue, 0.0)
    predicted_utility = probability * np.maximum(predicted_cpue, 0.0)
    spearman = spearman_rank(realized_utility, predicted_utility)
    ndcg = ndcg_at_k(realized_utility, predicted_utility, k=10)
    spearman_low, spearman_high = _bootstrap_interval(
        realized_utility,
        predicted_utility,
        spearman_rank,
        samples=bootstrap_samples,
        random_state=random_state,
    )
    ndcg_low, ndcg_high = _bootstrap_interval(
        realized_utility,
        predicted_utility,
        lambda target, prediction: ndcg_at_k(target, prediction, k=10),
        samples=bootstrap_samples,
        random_state=random_state + 1,
    )
    metrics: Dict[str, float | None] = {
        "roc_auc": float(roc_auc_score(occurrence, probability)) if both_classes else None,
        "average_precision": (
            float(average_precision_score(occurrence, probability)) if both_classes else None
        ),
        "brier": float(brier_score_loss(occurrence, probability)),
        "log_loss": float(log_loss(occurrence, probability, labels=[0, 1])),
        "ece_10_bin": expected_calibration_error(occurrence, probability, bins=10),
        "spearman_rank": spearman,
        "spearman_rank_ci_95_low": spearman_low,
        "spearman_rank_ci_95_high": spearman_high,
        "ndcg_at_10": ndcg,
        "ndcg_at_10_ci_95_low": ndcg_low,
        "ndcg_at_10_ci_95_high": ndcg_high,
        "cpue_mae_positive": None,
        "cpue_rmse_positive": None,
    }
    if np.any(positive):
        metrics["cpue_mae_positive"] = float(
            mean_absolute_error(cpue[positive], predicted_cpue[positive])
        )
        metrics["cpue_rmse_positive"] = float(
            mean_squared_error(cpue[positive], predicted_cpue[positive]) ** 0.5
        )
    return metrics


def _aggregate_folds(fold_metrics: Sequence[Mapping[str, float | None]]) -> Dict[str, Any]:
    result: Dict[str, Any] = {}
    for metric in fold_metrics[0]:
        values = [fold[metric] for fold in fold_metrics if fold[metric] is not None]
        result[metric] = {
            "mean": float(np.mean(values)) if values else None,
            "std": float(np.std(values)) if values else None,
            "valid_folds": len(values),
        }
    return result


def evaluate_ablations(
    features: np.ndarray,
    feature_names: Sequence[str],
    occurrence: np.ndarray,
    cpue: np.ndarray,
    folds: Iterable[SpatialFold],
    *,
    ablations: Mapping[str, Sequence[str]] = DEFAULT_ABLATIONS,
    model_names: Sequence[str] = BASELINE_NAMES,
    random_state: int = 42,
) -> Dict[str, Any]:
    """Fit every model inside every fold; no global preprocessing is allowed."""

    fold_list = list(folds)
    output: Dict[str, Any] = {
        "evaluation_design": "geographically blocked K-means regions with optional distance buffer",
        "folds": [
            {
                "fold_id": fold.fold_id,
                "train_rows": int(len(fold.train_indices)),
                "test_rows": int(len(fold.test_indices)),
                "buffer_excluded_rows": int(len(fold.buffer_excluded_indices)),
            }
            for fold in fold_list
        ],
        "ablations": {},
    }
    for ablation_name, channel_names in ablations.items():
        selected, selected_names = select_channels(features, feature_names, channel_names)
        ablation_output: Dict[str, Any] = {
            "channels": list(channel_names),
            "feature_count": len(selected_names),
            "models": {},
        }
        for model_name in model_names:
            per_fold = []
            for fold in fold_list:
                predictions = fit_predict_baseline(
                    model_name,
                    selected[fold.train_indices],
                    occurrence[fold.train_indices],
                    cpue[fold.train_indices],
                    selected[fold.test_indices],
                    random_state=random_state + fold.fold_id,
                )
                scores = score_predictions(
                    occurrence[fold.test_indices],
                    cpue[fold.test_indices],
                    predictions.occurrence_probability,
                    predictions.cpue,
                    random_state=random_state + 1000 * fold.fold_id,
                )
                per_fold.append({"fold_id": fold.fold_id, **scores})
            ablation_output["models"][model_name] = {
                "per_fold": per_fold,
                "aggregate": _aggregate_folds(per_fold),
            }
        output["ablations"][ablation_name] = ablation_output
    return output
