"""Synthetic-only capability adapters for the classical candidate families.

The adapters in this module prove that the declared classical families share a
callable two-head interface. They intentionally refuse California-halibut
labels, non-synthetic datasets, benchmark authority, locked-test access,
winner selection, score changes, and serving changes. A later externally
timestamped protocol must introduce a separate authorized benchmark boundary.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import SplineTransformer, StandardScaler

from shared.species_contract import SYNTHETIC_TARGET_TAXON_ID

from .baselines import fit_predict_baseline
from .model_selection_plan import (
    PLAN_ID,
    PLAN_VERSION,
    canonical_plan_sha256,
    load_model_selection_plan,
)


CAPABILITY_SCHEMA_VERSION = "castingcompass.model-candidate-capability/1.0.0"
CAPABILITY_STATUS = "synthetic-interface-smoke-only"
CLASSICAL_CANDIDATE_IDS = (
    "naive-prevalence-mean-cpue",
    "regularized-linear-two-head",
    "spline-gam-two-head",
    "random-forest-two-head",
    "hist-gradient-boosted-two-head",
    "spatial-hierarchical-two-head",
)
DEEP_CANDIDATE_ID = "bathymetric-deep-two-head"
HYBRID_CANDIDATE_ID = "predeclared-hybrid-or-ensemble"
IMPLEMENTATION_ENTRYPOINT = (
    "pipeline.contourcast.candidate_models:fit_predict_classical_candidate"
)
DEEP_IMPLEMENTATION_ENTRYPOINT = "pipeline.contourcast.deep_model:CatchMultiTaskModel"


@dataclass(frozen=True)
class CandidateCapabilityScope:
    """Explicitly non-authorizing scope required by every adapter call."""

    dataset_kind: str
    target_taxon_id: str
    benchmark_execution_authorized: bool
    locked_test_access_authorized: bool
    winner_selection_authorized: bool
    score_change_authorized: bool
    serving_change_authorized: bool


@dataclass(frozen=True)
class CandidatePredictions:
    """Two-head predictions shared by every classical candidate."""

    occurrence_probability: np.ndarray
    positive_catch_cpue: np.ndarray


def synthetic_capability_scope() -> CandidateCapabilityScope:
    """Return the sole scope currently accepted by the candidate adapters."""

    return CandidateCapabilityScope(
        dataset_kind="synthetic_fixture",
        target_taxon_id=SYNTHETIC_TARGET_TAXON_ID,
        benchmark_execution_authorized=False,
        locked_test_access_authorized=False,
        winner_selection_authorized=False,
        score_change_authorized=False,
        serving_change_authorized=False,
    )


def _validate_scope(scope: CandidateCapabilityScope) -> None:
    """Refuse any scope that could be mistaken for model-selection authority."""

    if not isinstance(scope, CandidateCapabilityScope):
        raise TypeError("scope must be a CandidateCapabilityScope")
    if scope.dataset_kind != "synthetic_fixture":
        raise ValueError("candidate adapters currently accept synthetic_fixture only")
    if scope.target_taxon_id != SYNTHETIC_TARGET_TAXON_ID:
        raise ValueError(
            "candidate adapters currently accept the synthetic target only"
        )
    authority = (
        scope.benchmark_execution_authorized,
        scope.locked_test_access_authorized,
        scope.winner_selection_authorized,
        scope.score_change_authorized,
        scope.serving_change_authorized,
    )
    if any(authority):
        raise ValueError(
            "synthetic candidate capability scope grants no execution authority"
        )


def _feature_matrix(value: Any, context: str) -> np.ndarray:
    """Return a finite two-dimensional floating-point feature matrix."""

    matrix = np.asarray(value, dtype=float)
    if matrix.ndim != 2 or matrix.shape[0] < 1 or matrix.shape[1] < 1:
        raise ValueError(f"{context} must be a non-empty two-dimensional matrix")
    if not np.all(np.isfinite(matrix)):
        raise ValueError(f"{context} must contain only finite values")
    return matrix


def _labels(
    occurrence: Any,
    cpue: Any,
    *,
    expected_rows: int,
) -> tuple[np.ndarray, np.ndarray]:
    """Validate complete binary occurrence and nonnegative CPUE labels."""

    occurrence_array = np.asarray(occurrence)
    cpue_array = np.asarray(cpue, dtype=float)
    if occurrence_array.ndim != 1 or len(occurrence_array) != expected_rows:
        raise ValueError("training occurrence labels must match the training rows")
    if cpue_array.ndim != 1 or len(cpue_array) != expected_rows:
        raise ValueError("training CPUE labels must match the training rows")
    if occurrence_array.dtype.kind not in {"b", "i", "u", "f"}:
        raise ValueError("training occurrence labels must be numeric binary values")
    numeric_occurrence = occurrence_array.astype(float)
    if not np.all(np.isfinite(numeric_occurrence)):
        raise ValueError("training occurrence labels must be finite")
    if np.any((numeric_occurrence != 0.0) & (numeric_occurrence != 1.0)):
        raise ValueError("training occurrence labels must be binary values")
    occurrence_array = numeric_occurrence.astype(int)
    if set(np.unique(occurrence_array)) != {0, 1}:
        raise ValueError("training occurrence labels must include both classes")
    if not np.all(np.isfinite(cpue_array)) or np.any(cpue_array < 0):
        raise ValueError("training CPUE labels must be finite and nonnegative")
    if np.any(cpue_array[occurrence_array == 0] != 0):
        raise ValueError("non-encounter rows must have zero target CPUE")
    if np.sum(occurrence_array == 1) < 5:
        raise ValueError("at least five positive training catches are required")
    return occurrence_array, cpue_array


def _group_ids(value: Any, context: str, expected_rows: int) -> np.ndarray:
    """Return nonempty string group identifiers aligned to the requested rows."""

    groups = np.asarray(value, dtype=object)
    if groups.ndim != 1 or len(groups) != expected_rows:
        raise ValueError(f"{context} must match its feature rows")
    normalized = []
    for group in groups:
        if not isinstance(group, str):
            raise ValueError(f"{context} must contain string group identifiers")
        text = group.strip()
        if not text:
            raise ValueError(f"{context} cannot contain empty group identifiers")
        normalized.append(text)
    return np.asarray(normalized, dtype=str)


def _random_seed(value: Any) -> int:
    """Return a true integer seed without accepting lossy coercion."""

    if isinstance(value, (bool, np.bool_)) or not isinstance(value, (int, np.integer)):
        raise ValueError("random_state must be an integer")
    return int(value)


def _positive_log_cpue(
    train_features: np.ndarray,
    occurrence: np.ndarray,
    cpue: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return positive-row features, log CPUE labels, and their row mask."""

    positive = occurrence == 1
    return train_features[positive], np.log1p(cpue[positive]), positive


def _fit_spline_gam(
    train_features: np.ndarray,
    occurrence: np.ndarray,
    cpue: np.ndarray,
    test_features: np.ndarray,
    *,
    random_state: int,
) -> CandidatePredictions:
    """Fit regularized additive spline occurrence and CPUE heads."""

    positive_x, positive_log_cpue, _ = _positive_log_cpue(
        train_features,
        occurrence,
        cpue,
    )
    occurrence_model = make_pipeline(
        SplineTransformer(
            n_knots=5,
            degree=3,
            knots="quantile",
            extrapolation="linear",
            include_bias=False,
        ),
        StandardScaler(),
        LogisticRegression(
            max_iter=3000,
            class_weight="balanced",
            C=0.5,
            random_state=random_state,
        ),
    )
    cpue_model = make_pipeline(
        SplineTransformer(
            n_knots=5,
            degree=3,
            knots="quantile",
            extrapolation="linear",
            include_bias=False,
        ),
        StandardScaler(),
        Ridge(alpha=2.0),
    )
    occurrence_model.fit(train_features, occurrence)
    cpue_model.fit(positive_x, positive_log_cpue)
    probability = occurrence_model.predict_proba(test_features)[:, 1]
    predicted_cpue = np.maximum(
        np.expm1(cpue_model.predict(test_features)),
        0.0,
    )
    return CandidatePredictions(probability, predicted_cpue)


def _fit_random_forest(
    train_features: np.ndarray,
    occurrence: np.ndarray,
    cpue: np.ndarray,
    test_features: np.ndarray,
    *,
    random_state: int,
) -> CandidatePredictions:
    """Fit class-balanced bagged-tree occurrence and CPUE heads."""

    positive_x, positive_log_cpue, _ = _positive_log_cpue(
        train_features,
        occurrence,
        cpue,
    )
    occurrence_model = RandomForestClassifier(
        n_estimators=128,
        max_features="sqrt",
        min_samples_leaf=4,
        class_weight="balanced_subsample",
        n_jobs=1,
        random_state=random_state,
    )
    cpue_model = RandomForestRegressor(
        n_estimators=128,
        max_features="sqrt",
        min_samples_leaf=3,
        n_jobs=1,
        random_state=random_state,
    )
    occurrence_model.fit(train_features, occurrence)
    cpue_model.fit(positive_x, positive_log_cpue)
    probability = occurrence_model.predict_proba(test_features)[:, 1]
    predicted_cpue = np.maximum(
        np.expm1(cpue_model.predict(test_features)),
        0.0,
    )
    return CandidatePredictions(probability, predicted_cpue)


def _clipped_logit(probability: np.ndarray | float) -> np.ndarray:
    """Transform bounded probabilities to finite logits."""

    clipped = np.clip(np.asarray(probability, dtype=float), 1e-6, 1 - 1e-6)
    return np.log(clipped / (1.0 - clipped))


def _fit_spatial_partial_pooling(
    train_features: np.ndarray,
    occurrence: np.ndarray,
    cpue: np.ndarray,
    test_features: np.ndarray,
    train_groups: np.ndarray,
    test_groups: np.ndarray,
    *,
    random_state: int,
    prior_strength: float = 8.0,
) -> CandidatePredictions:
    """Fit linear heads plus deterministic group-level partial pooling.

    Occurrence offsets use a beta-binomial-style posterior centered on each
    group's base-model probability. Positive log-CPUE residuals use a
    zero-centered normal-mean shrinkage analogue. Unseen groups receive the
    global base prediction rather than an invented local effect.
    """

    if prior_strength <= 0:
        raise ValueError("partial-pooling prior strength must be positive")
    positive_x, positive_log_cpue, positive = _positive_log_cpue(
        train_features,
        occurrence,
        cpue,
    )
    occurrence_model = make_pipeline(
        StandardScaler(),
        LogisticRegression(
            max_iter=3000,
            class_weight="balanced",
            C=0.5,
            random_state=random_state,
        ),
    )
    cpue_model = make_pipeline(StandardScaler(), Ridge(alpha=2.0))
    occurrence_model.fit(train_features, occurrence)
    cpue_model.fit(positive_x, positive_log_cpue)

    train_probability = occurrence_model.predict_proba(train_features)[:, 1]
    test_probability = occurrence_model.predict_proba(test_features)[:, 1]
    train_log_cpue = cpue_model.predict(train_features)
    test_log_cpue = cpue_model.predict(test_features)

    occurrence_offsets: dict[str, float] = {}
    cpue_offsets: dict[str, float] = {}
    for group in np.unique(train_groups):
        group_mask = train_groups == group
        rows = int(np.sum(group_mask))
        base_probability = float(np.mean(train_probability[group_mask]))
        posterior_probability = (
            float(np.sum(occurrence[group_mask])) + prior_strength * base_probability
        ) / (rows + prior_strength)
        occurrence_offsets[str(group)] = float(
            _clipped_logit(posterior_probability) - _clipped_logit(base_probability)
        )

        positive_group = group_mask & positive
        positive_rows = int(np.sum(positive_group))
        if positive_rows:
            residual_sum = float(
                np.sum(np.log1p(cpue[positive_group]) - train_log_cpue[positive_group])
            )
            cpue_offsets[str(group)] = residual_sum / (positive_rows + prior_strength)
        else:
            cpue_offsets[str(group)] = 0.0

    adjusted_probability = np.empty(len(test_features), dtype=float)
    adjusted_log_cpue = np.empty(len(test_features), dtype=float)
    for index, group in enumerate(test_groups):
        occurrence_offset = occurrence_offsets.get(str(group), 0.0)
        cpue_offset = cpue_offsets.get(str(group), 0.0)
        adjusted_probability[index] = 1.0 / (
            1.0 + np.exp(-(_clipped_logit(test_probability[index]) + occurrence_offset))
        )
        adjusted_log_cpue[index] = test_log_cpue[index] + cpue_offset
    return CandidatePredictions(
        adjusted_probability,
        np.maximum(np.expm1(adjusted_log_cpue), 0.0),
    )


def _validate_predictions(
    predictions: CandidatePredictions,
    expected_rows: int,
) -> CandidatePredictions:
    """Reject missing, nonfinite, unbounded, or negative prediction heads."""

    probability = np.asarray(predictions.occurrence_probability, dtype=float)
    cpue = np.asarray(predictions.positive_catch_cpue, dtype=float)
    if probability.shape != (expected_rows,) or cpue.shape != (expected_rows,):
        raise RuntimeError("candidate prediction heads do not match the requested rows")
    if not np.all(np.isfinite(probability)) or not np.all(np.isfinite(cpue)):
        raise RuntimeError("candidate prediction heads must be finite")
    if np.any((probability < 0) | (probability > 1)):
        raise RuntimeError("candidate occurrence probabilities must stay within [0, 1]")
    if np.any(cpue < 0):
        raise RuntimeError(
            "candidate positive-catch CPUE predictions cannot be negative"
        )
    return CandidatePredictions(probability, cpue)


def fit_predict_classical_candidate(
    candidate_id: str,
    train_features: Any,
    train_occurrence: Any,
    train_cpue: Any,
    test_features: Any,
    *,
    train_group_ids: Any,
    test_group_ids: Any,
    scope: CandidateCapabilityScope,
    random_state: int = 42,
) -> CandidatePredictions:
    """Fit one declared classical candidate under synthetic-only authority."""

    _validate_scope(scope)
    if candidate_id not in CLASSICAL_CANDIDATE_IDS:
        if candidate_id == DEEP_CANDIDATE_ID:
            raise ValueError(
                "the deep candidate requires patch tensors and a frozen site-window adapter"
            )
        if candidate_id == HYBRID_CANDIDATE_ID:
            raise ValueError(
                "the hybrid candidate remains conditional and has no execution authority"
            )
        raise ValueError(f"unknown or unimplemented candidate {candidate_id!r}")

    train_x = _feature_matrix(train_features, "training features")
    test_x = _feature_matrix(test_features, "test features")
    if train_x.shape[1] != test_x.shape[1]:
        raise ValueError("training and test features must have identical columns")
    occurrence, cpue = _labels(
        train_occurrence,
        train_cpue,
        expected_rows=len(train_x),
    )
    train_groups = _group_ids(
        train_group_ids,
        "training group IDs",
        len(train_x),
    )
    test_groups = _group_ids(
        test_group_ids,
        "test group IDs",
        len(test_x),
    )
    seed = _random_seed(random_state)

    baseline_names = {
        "naive-prevalence-mean-cpue": "naive",
        "regularized-linear-two-head": "linear",
        "hist-gradient-boosted-two-head": "boosted",
    }
    if candidate_id in baseline_names:
        baseline = fit_predict_baseline(
            baseline_names[candidate_id],
            train_x,
            occurrence,
            cpue,
            test_x,
            random_state=seed,
        )
        predictions = CandidatePredictions(
            baseline.occurrence_probability,
            baseline.cpue,
        )
    elif candidate_id == "spline-gam-two-head":
        predictions = _fit_spline_gam(
            train_x,
            occurrence,
            cpue,
            test_x,
            random_state=seed,
        )
    elif candidate_id == "random-forest-two-head":
        predictions = _fit_random_forest(
            train_x,
            occurrence,
            cpue,
            test_x,
            random_state=seed,
        )
    else:
        predictions = _fit_spatial_partial_pooling(
            train_x,
            occurrence,
            cpue,
            test_x,
            train_groups,
            test_groups,
            random_state=seed,
        )
    return _validate_predictions(predictions, len(test_x))


def validate_registry_against_plan(
    plan: Mapping[str, Any] | None = None,
) -> Mapping[str, Any]:
    """Require the implementation registry to match the frozen plan exactly."""

    _resolve_entrypoint(IMPLEMENTATION_ENTRYPOINT)
    _resolve_entrypoint(DEEP_IMPLEMENTATION_ENTRYPOINT)

    selected = plan if plan is not None else load_model_selection_plan()
    candidates = {
        str(candidate["candidate_id"]): candidate
        for candidate in selected["candidate_families"]
    }
    if tuple(candidates) != (
        *CLASSICAL_CANDIDATE_IDS,
        DEEP_CANDIDATE_ID,
        HYBRID_CANDIDATE_ID,
    ):
        raise ValueError("candidate implementation order diverges from the frozen plan")
    for candidate_id in CLASSICAL_CANDIDATE_IDS:
        candidate = candidates[candidate_id]
        if candidate["implementation_status"] != "implemented":
            raise ValueError(f"{candidate_id} is not marked implemented")
        if candidate["current_implementation"] != IMPLEMENTATION_ENTRYPOINT:
            raise ValueError(f"{candidate_id} implementation entrypoint changed")
    deep = candidates[DEEP_CANDIDATE_ID]
    if (
        deep["implementation_status"]
        != "encoder-and-heads-implemented-site-window-adapter-open"
        or deep["current_implementation"] != DEEP_IMPLEMENTATION_ENTRYPOINT
    ):
        raise ValueError("deep implementation truth changed")
    hybrid = candidates[HYBRID_CANDIDATE_ID]
    if (
        hybrid["implementation_status"] != "conditional-plan-only"
        or hybrid["current_implementation"] is not None
    ):
        raise ValueError("hybrid implementation truth changed")
    return selected


def _resolve_entrypoint(value: str) -> Any:
    """Resolve one module:symbol entrypoint and require a callable target."""

    if value.count(":") != 1:
        raise ValueError(f"invalid implementation entrypoint {value!r}")
    module_name, symbol_name = value.split(":")
    if not module_name or not symbol_name:
        raise ValueError(f"invalid implementation entrypoint {value!r}")
    try:
        implementation = getattr(importlib.import_module(module_name), symbol_name)
    except (AttributeError, ImportError) as exc:
        raise ValueError(f"implementation entrypoint is unavailable: {value}") from exc
    if not callable(implementation):
        raise ValueError(f"implementation entrypoint is not callable: {value}")
    return implementation


def _synthetic_fixture(
    *,
    seed: int,
    train_rows: int,
    test_rows: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Build deterministic fictional rows for interface and determinism checks."""

    if train_rows < 120 or test_rows < 24:
        raise ValueError(
            "synthetic capability smoke requires 120 train and 24 test rows"
        )
    generator = np.random.default_rng(seed)
    train_x = generator.normal(size=(train_rows, 6))
    test_x = generator.normal(size=(test_rows, 6))
    train_groups = np.asarray(
        [f"synthetic-region-{index % 6}" for index in range(train_rows)],
        dtype=str,
    )
    test_groups = np.asarray(
        [
            (
                f"synthetic-region-{index % 6}"
                if index % 4
                else f"synthetic-unseen-{index % 2}"
            )
            for index in range(test_rows)
        ],
        dtype=str,
    )
    group_effects = {
        f"synthetic-region-{index}": (index - 2.5) * 0.14 for index in range(6)
    }
    logits = (
        -0.15
        + 0.65 * train_x[:, 0]
        - 0.35 * np.square(train_x[:, 1])
        + 0.25 * np.sin(train_x[:, 2])
        + np.asarray([group_effects[group] for group in train_groups])
    )
    probability = 1.0 / (1.0 + np.exp(-logits))
    occurrence = generator.binomial(1, probability).astype(int)
    if set(np.unique(occurrence)) != {0, 1} or np.sum(occurrence) < 5:
        raise RuntimeError(
            "deterministic synthetic fixture lacks required class support"
        )
    positive_cpue = np.exp(
        0.25
        + 0.3 * train_x[:, 0]
        + 0.2 * np.abs(train_x[:, 3])
        + generator.normal(0.0, 0.15, size=train_rows)
    )
    cpue = np.where(occurrence == 1, positive_cpue, 0.0)
    return train_x, occurrence, cpue, test_x, train_groups, test_groups


def audit_synthetic_candidate_capabilities(
    *,
    seed: int = 42,
    train_rows: int = 180,
    test_rows: int = 48,
) -> Mapping[str, Any]:
    """Return a metric-free receipt proving deterministic adapter plumbing."""

    plan = validate_registry_against_plan()
    fixture = _synthetic_fixture(
        seed=seed,
        train_rows=train_rows,
        test_rows=test_rows,
    )
    train_x, occurrence, cpue, test_x, train_groups, test_groups = fixture
    checks = []
    for candidate_id in CLASSICAL_CANDIDATE_IDS:
        first = fit_predict_classical_candidate(
            candidate_id,
            train_x,
            occurrence,
            cpue,
            test_x,
            train_group_ids=train_groups,
            test_group_ids=test_groups,
            scope=synthetic_capability_scope(),
            random_state=seed,
        )
        second = fit_predict_classical_candidate(
            candidate_id,
            train_x,
            occurrence,
            cpue,
            test_x,
            train_group_ids=train_groups,
            test_group_ids=test_groups,
            scope=synthetic_capability_scope(),
            random_state=seed,
        )
        checks.append(
            {
                "candidate_id": candidate_id,
                "prediction_rows": len(test_x),
                "deterministic": bool(
                    np.array_equal(
                        first.occurrence_probability,
                        second.occurrence_probability,
                    )
                    and np.array_equal(
                        first.positive_catch_cpue,
                        second.positive_catch_cpue,
                    )
                ),
                "finite": bool(
                    np.all(np.isfinite(first.occurrence_probability))
                    and np.all(np.isfinite(first.positive_catch_cpue))
                ),
                "probability_bounded": bool(
                    np.all(
                        (first.occurrence_probability >= 0)
                        & (first.occurrence_probability <= 1)
                    )
                ),
                "cpue_nonnegative": bool(np.all(first.positive_catch_cpue >= 0)),
            }
        )
    if not all(
        check["deterministic"]
        and check["finite"]
        and check["probability_bounded"]
        and check["cpue_nonnegative"]
        for check in checks
    ):
        raise RuntimeError("one or more synthetic candidate capability checks failed")
    return {
        "schema_version": CAPABILITY_SCHEMA_VERSION,
        "status": CAPABILITY_STATUS,
        "plan_id": PLAN_ID,
        "plan_version": PLAN_VERSION,
        "plan_sha256": canonical_plan_sha256(plan),
        "dataset_kind": "synthetic_fixture",
        "target_taxon_id": SYNTHETIC_TARGET_TAXON_ID,
        "train_rows": len(train_x),
        "test_rows": len(test_x),
        "feature_count": train_x.shape[1],
        "candidate_count": len(checks),
        "candidate_checks": checks,
        "benchmark_execution_authorized": False,
        "locked_test_access_authorized": False,
        "winner_selection_authorized": False,
        "score_or_serving_change_authorized": False,
        "claim_boundary": (
            "Synthetic interface and determinism smoke only; no California-halibut "
            "labels, benchmark metrics, candidate comparison, winner, promotion, "
            "score, serving, provider, or deployment action occurred."
        ),
    }


def _write_json(value: Mapping[str, Any], output: Path | None) -> None:
    """Write deterministic human-readable JSON to stdout or a selected path."""

    payload = json.dumps(value, indent=2, sort_keys=True) + "\n"
    if output is None:
        sys.stdout.write(payload)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload, encoding="utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    """Run the metric-free synthetic candidate capability audit."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-rows", type=int, default=180)
    parser.add_argument("--test-rows", type=int, default=48)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        receipt = audit_synthetic_candidate_capabilities(
            seed=args.seed,
            train_rows=args.train_rows,
            test_rows=args.test_rows,
        )
        _write_json(receipt, args.output)
    except (OSError, RuntimeError, TypeError, ValueError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
