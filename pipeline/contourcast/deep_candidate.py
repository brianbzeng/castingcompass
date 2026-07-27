"""Synthetic-only site-window adapter for the bathymetric deep candidate.

This module proves that the existing terrain encoder and two catch heads can
consume masked bags of single- or multiscale terrain patches plus the exact
shared pre-trip context view and return the same two-head interface as the
classical candidates. It refuses real targets, non-synthetic datasets,
benchmark authority, locked-test access, winner selection, score changes,
serving changes, and deployment authority.
"""

from __future__ import annotations

import argparse
import json
import sys
import threading
from pathlib import Path
from typing import Any, Mapping, Sequence

import numpy as np

from shared.species_contract import SYNTHETIC_TARGET_TAXON_ID

from .candidate_models import (
    DEEP_CANDIDATE_ID,
    CandidateCapabilityScope,
    CandidatePredictions,
    synthetic_capability_scope,
    validate_candidate_capability_scope,
    validate_candidate_predictions,
    validate_candidate_random_state,
    validate_registry_against_plan,
    validate_two_head_training_labels,
)
from .deep_model import (
    ContextualAreaBagCatchModel,
    MultiScaleTerrainEncoder,
    TerrainResNetEncoder,
    multitask_loss,
    require_torch,
    torch,
)
from .model_input_contract import (
    canonical_input_contract_sha256,
    deep_context_feature_order,
    deep_context_feature_order_sha256,
    load_model_input_contract,
)
from .model_selection_plan import (
    PLAN_ID,
    PLAN_VERSION,
    canonical_plan_sha256,
)


DEEP_CAPABILITY_SCHEMA_VERSION = "castingcompass.deep-candidate-capability/1.1.0"
DEEP_CAPABILITY_STATUS = "synthetic-context-terrain-interface-smoke-only"
DEEP_CAPABILITY_EPOCHS = 4
DEEP_CAPABILITY_BASE_WIDTH = 8
DEEP_CAPABILITY_PATCHES_PER_WINDOW = 3
DEEP_CAPABILITY_SCALES = 3
DEEP_CAPABILITY_CHANNELS = 6
DEEP_CAPABILITY_PATCH_SIZE = 33
MAX_DEEP_CAPABILITY_ROWS = 256
MAX_DEEP_CAPABILITY_PATCHES_PER_WINDOW = 16
MAX_DEEP_CAPABILITY_SCALES = 4
MAX_DEEP_CAPABILITY_CHANNELS = 32
MAX_DEEP_CAPABILITY_PATCH_SIZE = 65
MAX_DEEP_CAPABILITY_ELEMENTS = 1_000_000
_TORCH_CAPABILITY_LOCK = threading.Lock()


def _patch_bags(value: Any, context: str) -> np.ndarray:
    """Return finite single- or multiscale site-window patch bags."""

    try:
        source = np.asarray(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{context} must be a numeric patch tensor") from exc
    if source.ndim not in {5, 6}:
        raise ValueError(f"{context} must be shaped (N,P,C,H,W) or (N,P,S,C,H,W)")
    if source.dtype.kind not in {"b", "i", "u", "f"}:
        raise ValueError(f"{context} must be a numeric patch tensor")
    if not 1 <= source.shape[0] <= MAX_DEEP_CAPABILITY_ROWS:
        raise ValueError(
            f"{context} row count must be within [1, {MAX_DEEP_CAPABILITY_ROWS}]"
        )
    if not 2 <= source.shape[1] <= MAX_DEEP_CAPABILITY_PATCHES_PER_WINDOW:
        raise ValueError(
            f"{context} patch slots must be within "
            f"[2, {MAX_DEEP_CAPABILITY_PATCHES_PER_WINDOW}]"
        )
    if source.ndim == 6 and not (1 <= source.shape[2] <= MAX_DEEP_CAPABILITY_SCALES):
        raise ValueError(
            f"{context} scale count must be within [1, {MAX_DEEP_CAPABILITY_SCALES}]"
        )
    channels = source.shape[-3]
    height, width = source.shape[-2:]
    if not 1 <= channels <= MAX_DEEP_CAPABILITY_CHANNELS:
        raise ValueError(
            f"{context} channel count must be within "
            f"[1, {MAX_DEEP_CAPABILITY_CHANNELS}]"
        )
    if not (
        5 <= height <= MAX_DEEP_CAPABILITY_PATCH_SIZE
        and 5 <= width <= MAX_DEEP_CAPABILITY_PATCH_SIZE
    ):
        raise ValueError(
            f"{context} spatial dimensions must each be within "
            f"[5, {MAX_DEEP_CAPABILITY_PATCH_SIZE}]"
        )
    if source.size > MAX_DEEP_CAPABILITY_ELEMENTS:
        raise ValueError(
            f"{context} exceeds the {MAX_DEEP_CAPABILITY_ELEMENTS}-element "
            "synthetic capability ceiling"
        )
    with np.errstate(over="ignore", invalid="ignore"):
        bags = source.astype(np.float32, copy=False)
    if not np.all(np.isfinite(bags)):
        raise ValueError(f"{context} must contain only finite values")
    return bags


def _patch_mask(value: Any, context: str, shape: tuple[int, int]) -> np.ndarray:
    """Return a strict boolean mask with at least one patch in every row."""

    mask = np.asarray(value)
    if mask.dtype != np.bool_:
        raise ValueError(f"{context} must contain boolean values")
    if mask.shape != shape:
        raise ValueError(f"{context} must be shaped {shape}")
    if not np.all(np.any(mask, axis=1)):
        raise ValueError(f"{context} must retain at least one patch in every row")
    return mask


def _context_features(
    value: Any,
    context: str,
    *,
    expected_rows: int,
) -> np.ndarray:
    """Return the exact finite shared-context matrix for one row set."""

    try:
        source = np.asarray(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{context} must be a numeric feature matrix") from exc
    expected_columns = len(deep_context_feature_order())
    if source.ndim != 2 or source.shape != (expected_rows, expected_columns):
        raise ValueError(
            f"{context} must be shaped ({expected_rows}, {expected_columns})"
        )
    if source.dtype.kind not in {"b", "i", "u", "f"}:
        raise ValueError(f"{context} must be a numeric feature matrix")
    with np.errstate(over="ignore", invalid="ignore"):
        features = source.astype(np.float32, copy=False)
    if not np.all(np.isfinite(features)):
        raise ValueError(f"{context} must contain only finite values")
    return features


def _normalize_context_features(
    train_features: np.ndarray,
    test_features: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Apply training-fold-only standardization to the shared context view."""

    train64 = train_features.astype(np.float64, copy=False)
    test64 = test_features.astype(np.float64, copy=False)
    center = np.mean(train64, axis=0, keepdims=True)
    scale = np.std(train64, axis=0, keepdims=True)
    scale = np.where(scale < 1e-6, 1.0, scale)
    with np.errstate(over="ignore", invalid="ignore"):
        normalized_train = ((train64 - center) / scale).astype(np.float32)
        normalized_test = ((test64 - center) / scale).astype(np.float32)
    if not (
        np.all(np.isfinite(normalized_train))
        and np.all(np.isfinite(normalized_test))
    ):
        raise ValueError("context normalization produced nonfinite values")
    return normalized_train, normalized_test


def _normalize_patch_bags(
    train_bags: np.ndarray,
    test_bags: np.ndarray,
    train_mask: np.ndarray,
    test_mask: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Apply fold-local robust channel scaling and zero masked patch slots."""

    valid_train = train_bags[train_mask].astype(np.float64, copy=False)
    if train_bags.ndim == 5:
        reduction_axes = (0, 2, 3)
        reshape = (1, 1, train_bags.shape[-3], 1, 1)
    else:
        reduction_axes = (0, 1, 3, 4)
        reshape = (1, 1, 1, train_bags.shape[-3], 1, 1)
    median = np.median(valid_train, axis=reduction_axes).reshape(reshape)
    lower = np.quantile(valid_train, 0.25, axis=reduction_axes).reshape(reshape)
    upper = np.quantile(valid_train, 0.75, axis=reduction_axes).reshape(reshape)
    scale = upper - lower
    scale = np.where(scale < 1e-6, 1.0, scale)
    train_mask_view = train_mask.reshape(
        train_mask.shape + (1,) * (train_bags.ndim - 2)
    )
    test_mask_view = test_mask.reshape(test_mask.shape + (1,) * (test_bags.ndim - 2))
    train_work = np.where(
        train_mask_view,
        train_bags.astype(np.float64, copy=False),
        median,
    )
    test_work = np.where(
        test_mask_view,
        test_bags.astype(np.float64, copy=False),
        median,
    )
    with np.errstate(over="ignore", invalid="ignore"):
        normalized_train = ((train_work - median) / scale).astype(np.float32)
        normalized_test = ((test_work - median) / scale).astype(np.float32)
    if not (
        np.all(np.isfinite(normalized_train)) and np.all(np.isfinite(normalized_test))
    ):
        raise ValueError("patch normalization produced nonfinite values")
    normalized_train[~train_mask] = 0.0
    normalized_test[~test_mask] = 0.0
    return normalized_train, normalized_test


def _build_site_window_model(patch_bags: np.ndarray) -> Any:
    """Build the small deterministic capability model for one tensor contract."""

    input_channels = int(patch_bags.shape[-3])
    base_encoder = TerrainResNetEncoder(
        input_channels=input_channels,
        base_width=DEEP_CAPABILITY_BASE_WIDTH,
        blocks_per_stage=1,
    )
    encoder = (
        MultiScaleTerrainEncoder(base_encoder, scales=int(patch_bags.shape[2]))
        if patch_bags.ndim == 6
        else base_encoder
    )
    return ContextualAreaBagCatchModel(
        encoder,
        context_dim=len(deep_context_feature_order()),
        context_width=16,
        dropout=0.0,
    )


def fit_predict_deep_candidate(
    train_patch_bags: Any,
    train_context_features: Any,
    train_occurrence: Any,
    train_cpue: Any,
    test_patch_bags: Any,
    *,
    test_context_features: Any,
    train_patch_mask: Any,
    test_patch_mask: Any,
    scope: CandidateCapabilityScope,
    random_state: int = 42,
) -> CandidatePredictions:
    """Fit the deep candidate on fictional terrain and context under closed authority."""

    validate_candidate_capability_scope(scope)
    seed = validate_candidate_random_state(random_state)
    train_bags = _patch_bags(train_patch_bags, "training patch bags")
    test_bags = _patch_bags(test_patch_bags, "test patch bags")
    if train_bags.ndim != test_bags.ndim:
        raise ValueError("training and test patch bags must use the same rank")
    if train_bags.shape[1:] != test_bags.shape[1:]:
        raise ValueError(
            "training and test patch bags must share patch, scale, channel, and spatial dimensions"
        )
    train_context = _context_features(
        train_context_features,
        "training context features",
        expected_rows=len(train_bags),
    )
    test_context = _context_features(
        test_context_features,
        "test context features",
        expected_rows=len(test_bags),
    )
    occurrence, cpue = validate_two_head_training_labels(
        train_occurrence,
        train_cpue,
        expected_rows=len(train_bags),
    )
    train_mask = _patch_mask(
        train_patch_mask,
        "training patch mask",
        train_bags.shape[:2],
    )
    test_mask = _patch_mask(
        test_patch_mask,
        "test patch mask",
        test_bags.shape[:2],
    )
    normalized_train, normalized_test = _normalize_patch_bags(
        train_bags,
        test_bags,
        train_mask,
        test_mask,
    )
    normalized_train_context, normalized_test_context = (
        _normalize_context_features(train_context, test_context)
    )

    require_torch()
    with _TORCH_CAPABILITY_LOCK, torch.random.fork_rng(devices=[]):
        torch.manual_seed(seed)
        previous_deterministic = torch.are_deterministic_algorithms_enabled()
        torch.use_deterministic_algorithms(True)
        try:
            model = _build_site_window_model(normalized_train)
            optimizer = torch.optim.AdamW(
                model.parameters(),
                lr=2e-3,
                weight_decay=1e-4,
            )
            train_tensor = torch.from_numpy(normalized_train)
            train_mask_tensor = torch.from_numpy(train_mask)
            occurrence_tensor = torch.from_numpy(
                occurrence.astype(np.float32, copy=False)
            )
            cpue_tensor = torch.from_numpy(cpue.astype(np.float32, copy=False))
            train_context_tensor = torch.from_numpy(normalized_train_context)
            model.train()
            for _ in range(DEEP_CAPABILITY_EPOCHS):
                outputs = model(
                    train_tensor,
                    train_context_tensor,
                    train_mask_tensor,
                )
                loss, _ = multitask_loss(
                    outputs,
                    occurrence_tensor,
                    cpue_tensor,
                )
                if not bool(torch.isfinite(loss)):
                    raise RuntimeError(
                        "deep candidate capability training produced a nonfinite loss"
                    )
                optimizer.zero_grad(set_to_none=True)
                loss.backward()
                optimizer.step()

            model.eval()
            with torch.no_grad():
                outputs = model(
                    torch.from_numpy(normalized_test),
                    torch.from_numpy(normalized_test_context),
                    torch.from_numpy(test_mask),
                )
                probability = torch.sigmoid(outputs["occurrence_logit"]).cpu().numpy()
                predicted_cpue = (
                    torch.expm1(outputs["log_cpue"]).clamp(min=0.0).cpu().numpy()
                )
        finally:
            torch.use_deterministic_algorithms(previous_deterministic)
    return validate_candidate_predictions(
        CandidatePredictions(probability, predicted_cpue),
        len(test_bags),
    )


def _synthetic_patch_fixture(
    *,
    seed: int,
    train_rows: int,
    test_rows: int,
) -> tuple[
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
    np.ndarray,
]:
    """Build fictional multiscale bags, shared context, and complete labels."""

    if (
        isinstance(train_rows, (bool, np.bool_))
        or isinstance(test_rows, (bool, np.bool_))
        or not isinstance(train_rows, (int, np.integer))
        or not isinstance(test_rows, (int, np.integer))
    ):
        raise ValueError("deep capability row counts must be integers")
    if not 16 <= train_rows <= MAX_DEEP_CAPABILITY_ROWS:
        raise ValueError(
            "deep capability training rows must be within "
            f"[16, {MAX_DEEP_CAPABILITY_ROWS}]"
        )
    if not 4 <= test_rows <= MAX_DEEP_CAPABILITY_ROWS:
        raise ValueError(
            f"deep capability test rows must be within [4, {MAX_DEEP_CAPABILITY_ROWS}]"
        )
    generator = np.random.default_rng(seed)
    shape = (
        DEEP_CAPABILITY_PATCHES_PER_WINDOW,
        DEEP_CAPABILITY_SCALES,
        DEEP_CAPABILITY_CHANNELS,
        DEEP_CAPABILITY_PATCH_SIZE,
        DEEP_CAPABILITY_PATCH_SIZE,
    )
    train_bags = generator.normal(size=(train_rows, *shape)).astype(np.float32)
    test_bags = generator.normal(size=(test_rows, *shape)).astype(np.float32)
    context_columns = len(deep_context_feature_order())
    train_context = generator.normal(
        size=(train_rows, context_columns)
    ).astype(np.float32)
    test_context = generator.normal(
        size=(test_rows, context_columns)
    ).astype(np.float32)
    train_mask = np.ones(
        (train_rows, DEEP_CAPABILITY_PATCHES_PER_WINDOW),
        dtype=bool,
    )
    test_mask = np.ones(
        (test_rows, DEEP_CAPABILITY_PATCHES_PER_WINDOW),
        dtype=bool,
    )
    train_mask[::3, -1] = False
    test_mask[::2, -1] = False
    train_bags[~train_mask] = 1000.0
    test_bags[~test_mask] = -1000.0
    occurrence = (np.arange(train_rows) % 2).astype(int)
    visible_train = np.where(
        train_mask[:, :, None, None, None, None],
        train_bags,
        0.0,
    )
    positive_cpue = np.exp(
        0.2
        + 0.08
        * np.mean(
            visible_train[:, :, :, 0],
            axis=(1, 2, 3, 4),
        )
        + 0.05 * train_context[:, 0]
    )
    cpue = np.where(occurrence == 1, positive_cpue, 0.0)
    return (
        train_bags,
        train_context,
        occurrence,
        cpue,
        test_bags,
        test_context,
        train_mask,
        test_mask,
    )


def audit_synthetic_deep_candidate_capability(
    *,
    seed: int = 42,
    train_rows: int = 16,
    test_rows: int = 4,
) -> Mapping[str, Any]:
    """Return a metric-free receipt for shared context/terrain adapter plumbing."""

    plan = validate_registry_against_plan()
    input_contract = load_model_input_contract()
    fixture = _synthetic_patch_fixture(
        seed=seed,
        train_rows=train_rows,
        test_rows=test_rows,
    )
    (
        train_bags,
        train_context,
        occurrence,
        cpue,
        test_bags,
        test_context,
        train_mask,
        test_mask,
    ) = fixture
    first = fit_predict_deep_candidate(
        train_bags,
        train_context,
        occurrence,
        cpue,
        test_bags,
        test_context_features=test_context,
        train_patch_mask=train_mask,
        test_patch_mask=test_mask,
        scope=synthetic_capability_scope(),
        random_state=seed,
    )
    second = fit_predict_deep_candidate(
        train_bags,
        train_context,
        occurrence,
        cpue,
        test_bags,
        test_context_features=test_context,
        train_patch_mask=train_mask,
        test_patch_mask=test_mask,
        scope=synthetic_capability_scope(),
        random_state=seed,
    )
    deterministic = bool(
        np.array_equal(
            first.occurrence_probability,
            second.occurrence_probability,
        )
        and np.array_equal(
            first.positive_catch_cpue,
            second.positive_catch_cpue,
        )
    )
    if not deterministic:
        raise RuntimeError("deep candidate capability output is not deterministic")
    return {
        "schema_version": DEEP_CAPABILITY_SCHEMA_VERSION,
        "status": DEEP_CAPABILITY_STATUS,
        "plan_id": PLAN_ID,
        "plan_version": PLAN_VERSION,
        "plan_sha256": canonical_plan_sha256(plan),
        "input_contract_id": input_contract["contract_id"],
        "input_contract_sha256": canonical_input_contract_sha256(input_contract),
        "candidate_id": DEEP_CANDIDATE_ID,
        "dataset_kind": "synthetic_fixture",
        "target_taxon_id": SYNTHETIC_TARGET_TAXON_ID,
        "train_rows": len(train_bags),
        "test_rows": len(test_bags),
        "patches_per_window": train_bags.shape[1],
        "scales": train_bags.shape[2],
        "channels": train_bags.shape[-3],
        "patch_size": list(train_bags.shape[-2:]),
        "shared_context_feature_count": train_context.shape[1],
        "shared_context_feature_order_sha256": (
            deep_context_feature_order_sha256()
        ),
        "context_normalization": "training-fold-only-standardization",
        "site_window_aggregation": (
            "masked-attention-over-synthetic-patch-bags-fused-with-shared-context"
        ),
        "prediction_rows": len(first.occurrence_probability),
        "deterministic": True,
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
        "target_specific_training_authorized": False,
        "benchmark_execution_authorized": False,
        "locked_test_access_authorized": False,
        "winner_selection_authorized": False,
        "score_or_serving_change_authorized": False,
        "deployment_authorized": False,
        "claim_boundary": (
            "Synthetic shared-context and masked-patch interface and determinism "
            "smoke only; no "
            "California-halibut labels, benchmark metrics, candidate comparison, "
            "winner, promotion, score, serving, provider, or deployment action occurred."
        ),
    }


def _write_json(value: Mapping[str, Any], output: Path | None) -> None:
    """Write deterministic JSON to stdout or one selected output path."""

    payload = json.dumps(value, indent=2, sort_keys=True) + "\n"
    if output is None:
        sys.stdout.write(payload)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload, encoding="utf-8")


def main(argv: Sequence[str] | None = None) -> int:
    """Run the metric-free synthetic deep-candidate capability audit."""

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--train-rows", type=int, default=16)
    parser.add_argument("--test-rows", type=int, default=4)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    try:
        receipt = audit_synthetic_deep_candidate_capability(
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
