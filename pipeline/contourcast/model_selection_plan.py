"""Fail-closed inventory for a future model-agnostic selection benchmark.

The checked-in plan is a local template, not a preregistration. This module
validates its exact safety and comparison boundaries and can emit a minimized
audit receipt. It never reads observations, fits a model, opens a locked test,
changes a score, or applies a serving decision.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any, Mapping

from shared.species_contract import (
    MODEL_RUN_CONTRACT_VERSION,
    OBSERVATION_CONTRACT_VERSION,
    PRODUCTION_TARGET_TAXON_ID,
    TAXON_CATALOG_VERSION,
    validate_contract_assets,
)

from .model_input_contract import (
    CONTRACT_ID as INPUT_CONTRACT_ID,
    CONTRACT_VERSION as INPUT_CONTRACT_VERSION,
    DEFAULT_INPUT_CONTRACT_PATH,
    SCHEMA_VERSION as INPUT_CONTRACT_SCHEMA_VERSION,
    canonical_input_contract_sha256,
    load_model_input_contract,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PLAN_PATH = (
    REPOSITORY_ROOT / "model" / "selection" / "california-halibut-v1.json"
)
SCHEMA_VERSION = "castingcompass.model-selection-plan/1.1.0"
RECEIPT_SCHEMA_VERSION = "castingcompass.model-selection-plan-audit/1.0.0"
PLAN_ID = "california-halibut-model-selection-v1"
PLAN_VERSION = "1.1.0"
PLAN_STATUS = "frozen-local-template-not-preregistered"

AUTHORITY = {
    "eligible_labeled_data_available": False,
    "separate_confirmatory_protocol_available": False,
    "benchmark_execution_authorized": False,
    "target_specific_training_authorized": False,
    "locked_test_access_authorized": False,
    "winner_selection_authorized": False,
    "score_change_authorized": False,
    "serving_change_authorized": False,
    "deployment_authorized": False,
    "reason": (
        "eligible-source-separated-confirmatory-labels-and-an-externally-timestamped-"
        "protocol-do-not-exist"
    ),
}

DATA_GATES = [
    "permitted-complete-effort-source-with-confirmed-zero-catch-semantics",
    "valid-v2-observation-contract-and-target-specific-effort",
    "collection-feasibility-pilot-passed-with-pilot-rows-excluded",
    "separate-confirmatory-protocol-externally-timestamped-before-enrollment",
    "candidate-feature-and-input-contract-frozen-before-label-access",
    "source-separated-development-and-locked-test-data",
    "geographic-and-temporal-holdouts-frozen-before-label-access",
    "participant-cluster-and-complete-attempt-groups-preserved",
    "minimum-positive-negative-participant-and-slice-support-frozen",
    "legal-privacy-consent-license-and-data-steward-approval",
    "encrypted-custody-restore-deletion-and-retention-evidence",
    "activation-manifest-sealed-before-first-eligible-row",
]
LOCALLY_SATISFIED_DATA_GATES = [
    "candidate-feature-and-input-contract-frozen-before-label-access",
]
INPUT_CONTRACT_REPOSITORY_PATH = "model/selection/california-halibut-input-v1.json"

REQUIRED_OUTPUTS = [
    "target-occurrence-probability",
    "positive-catch-cpue",
    "expected-opportunity-ranking",
]

REQUIRED_METRICS = [
    "brier-score",
    "log-loss",
    "expected-calibration-error",
    "roc-auc-when-estimable",
    "average-precision-when-estimable",
    "positive-catch-cpue-mae",
    "positive-catch-cpue-rmse",
    "spearman-rank-when-estimable",
    "ndcg-at-10-when-estimable",
    "abstention-rate",
    "coverage-by-required-slice",
    "participant-clustered-uncertainty",
]

CANDIDATE_FAMILIES = [
    {
        "candidate_id": "naive-prevalence-mean-cpue",
        "family": "naive",
        "complexity_rank": 0,
        "required_in_future_comparison": True,
        "implementation_status": "implemented",
        "current_implementation": (
            "pipeline.contourcast.candidate_models:fit_predict_classical_candidate"
        ),
        "occurrence_head": "training-fold target prevalence",
        "cpue_head": "training-fold positive-catch arithmetic mean",
        "explanation_boundary": "fold-local aggregate rates only",
    },
    {
        "candidate_id": "regularized-linear-two-head",
        "family": "regularized-linear",
        "complexity_rank": 1,
        "required_in_future_comparison": True,
        "implementation_status": "implemented",
        "current_implementation": (
            "pipeline.contourcast.candidate_models:fit_predict_classical_candidate"
        ),
        "occurrence_head": "standardized class-weighted logistic regression",
        "cpue_head": "standardized ridge regression on positive log1p cpue",
        "explanation_boundary": "coefficients and fold-local transforms",
    },
    {
        "candidate_id": "spline-gam-two-head",
        "family": "generalized-additive",
        "complexity_rank": 2,
        "required_in_future_comparison": True,
        "implementation_status": "implemented",
        "current_implementation": (
            "pipeline.contourcast.candidate_models:fit_predict_classical_candidate"
        ),
        "occurrence_head": "regularized logistic additive spline terms",
        "cpue_head": "regularized additive spline regression on positive log1p cpue",
        "explanation_boundary": "frozen univariate smooth effects with uncertainty",
    },
    {
        "candidate_id": "random-forest-two-head",
        "family": "bagged-tree",
        "complexity_rank": 3,
        "required_in_future_comparison": True,
        "implementation_status": "implemented",
        "current_implementation": (
            "pipeline.contourcast.candidate_models:fit_predict_classical_candidate"
        ),
        "occurrence_head": "class-balanced random forest probability",
        "cpue_head": "random forest regression on positive log1p cpue",
        "explanation_boundary": "permutation importance and support-aware partial effects",
    },
    {
        "candidate_id": "hist-gradient-boosted-two-head",
        "family": "boosted-tree",
        "complexity_rank": 4,
        "required_in_future_comparison": True,
        "implementation_status": "implemented",
        "current_implementation": (
            "pipeline.contourcast.candidate_models:fit_predict_classical_candidate"
        ),
        "occurrence_head": "regularized histogram gradient boosting classifier",
        "cpue_head": "regularized histogram gradient boosting on positive log1p cpue",
        "explanation_boundary": (
            "held-out permutation importance and calibrated response summaries"
        ),
    },
    {
        "candidate_id": "spatial-hierarchical-two-head",
        "family": "spatial-hierarchical",
        "complexity_rank": 5,
        "required_in_future_comparison": True,
        "implementation_status": "implemented",
        "current_implementation": (
            "pipeline.contourcast.candidate_models:fit_predict_classical_candidate"
        ),
        "occurrence_head": "preregistered partial-pooling spatial occurrence model",
        "cpue_head": "preregistered partial-pooling positive log1p cpue model",
        "explanation_boundary": (
            "site-region-season effects with uncertainty and no locked-test tuning"
        ),
    },
    {
        "candidate_id": "bathymetric-deep-two-head",
        "family": "deep-neural",
        "complexity_rank": 6,
        "required_in_future_comparison": True,
        "implementation_status": "implemented",
        "current_implementation": (
            "pipeline.contourcast.deep_candidate:fit_predict_deep_candidate"
        ),
        "occurrence_head": (
            "terrain-encoder occurrence logit with synthetic masked-patch aggregation"
        ),
        "cpue_head": (
            "terrain-encoder positive log1p cpue with synthetic masked-patch aggregation"
        ),
        "explanation_boundary": (
            "ablations attribution stability and explicit missing-coverage abstention"
        ),
    },
    {
        "candidate_id": "predeclared-hybrid-or-ensemble",
        "family": "hybrid-ensemble",
        "complexity_rank": 7,
        "required_in_future_comparison": False,
        "implementation_status": "conditional-plan-only",
        "current_implementation": None,
        "occurrence_head": (
            "development-only stack of preregistered complementary candidate outputs"
        ),
        "cpue_head": (
            "development-only stack of preregistered complementary candidate outputs"
        ),
        "explanation_boundary": (
            "allowed only with predeclared complementary errors and complete component reporting"
        ),
    },
]

SELECTION_RULE = {
    "deep_learning_is_default": False,
    "locked_test_can_tune_or_create_candidates": False,
    "all_required_metrics_must_be_estimable": True,
    "candidate_must_materially_beat_best_preregistered_baseline": True,
    "calibration_must_clear_frozen_ceiling": True,
    "required_slice_floor_must_hold": True,
    "independent_reproduction_required": True,
    "prefer_simpler_when_statistically_indistinguishable": True,
    "hybrid_requires_predeclared_complementary_error_rationale": True,
    "negative_and_inconclusive_results_must_be_reported": True,
}

RESOURCE_REPORTING = [
    "training-wall-time",
    "inference-p50-latency",
    "inference-p95-latency",
    "peak-memory",
    "serialized-artifact-bytes",
    "runtime-and-platform-compatibility",
    "dependency-license-and-maintenance-risk",
    "operational-complexity",
    "explainability-boundary",
    "missing-coverage-and-abstention-behavior",
]

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def _mapping(value: Any, context: str) -> Mapping[str, Any]:
    """Require an object-like value and preserve its original mapping."""

    if not isinstance(value, Mapping):
        raise ValueError(f"{context} must be an object")
    return value


def _exact_keys(value: Mapping[str, Any], expected: set[str], context: str) -> None:
    """Reject missing or additional keys at a strict contract boundary."""

    actual = set(value)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise ValueError(f"{context} keys changed (missing={missing}, extra={extra})")


def _ordered_unique_slugs(value: Any, expected: list[str], context: str) -> None:
    """Require the exact ordered inventory of unique slug values."""

    if not isinstance(value, list) or value != expected:
        raise ValueError(f"{context} changed")
    if len(set(value)) != len(value) or any(
        SLUG_PATTERN.fullmatch(item) is None for item in value
    ):
        raise ValueError(f"{context} must contain ordered unique slugs")


def canonical_plan_sha256(plan: Mapping[str, Any]) -> str:
    """Return the SHA-256 of the canonical JSON representation of a plan."""

    payload = json.dumps(
        plan,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def load_model_selection_plan(path: Path = DEFAULT_PLAN_PATH) -> Mapping[str, Any]:
    """Load and validate a model-selection plan from disk."""

    try:
        plan = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(
            f"Model-selection plan is unavailable or invalid: {path}"
        ) from exc
    validate_model_selection_plan(plan)
    return plan


def validate_model_selection_plan(plan: Mapping[str, Any]) -> None:
    """Reject authority expansion, candidate omission, or evidence asymmetry."""

    validate_contract_assets()
    plan = _mapping(plan, "plan")
    _exact_keys(
        plan,
        {
            "schema_version",
            "plan_id",
            "plan_version",
            "status",
            "target_taxon_id",
            "contract_versions",
            "authority",
            "data_gates",
            "locally_satisfied_data_gates",
            "candidate_input_contract",
            "common_evaluation",
            "candidate_families",
            "selection_rule",
            "resource_reporting",
        },
        "plan",
    )
    identity = {
        "schema_version": SCHEMA_VERSION,
        "plan_id": PLAN_ID,
        "plan_version": PLAN_VERSION,
        "status": PLAN_STATUS,
        "target_taxon_id": PRODUCTION_TARGET_TAXON_ID,
    }
    for field, expected in identity.items():
        if plan.get(field) != expected:
            raise ValueError(f"plan {field} is unsupported")

    contracts = _mapping(plan["contract_versions"], "plan.contract_versions")
    if dict(contracts) != {
        "model_run": MODEL_RUN_CONTRACT_VERSION,
        "observation": OBSERVATION_CONTRACT_VERSION,
        "taxon_catalog": TAXON_CATALOG_VERSION,
    }:
        raise ValueError("plan contract versions changed")

    authority = _mapping(plan["authority"], "plan.authority")
    if dict(authority) != AUTHORITY:
        raise ValueError("plan authority must remain fully closed")

    _ordered_unique_slugs(plan["data_gates"], DATA_GATES, "plan.data_gates")
    _ordered_unique_slugs(
        plan["locally_satisfied_data_gates"],
        LOCALLY_SATISFIED_DATA_GATES,
        "plan.locally_satisfied_data_gates",
    )
    if not set(LOCALLY_SATISFIED_DATA_GATES).issubset(DATA_GATES):
        raise RuntimeError("locally satisfied model-selection gates are not declared")

    input_reference = _mapping(
        plan["candidate_input_contract"],
        "plan.candidate_input_contract",
    )
    _exact_keys(
        input_reference,
        {"schema_version", "contract_id", "contract_version", "path", "sha256"},
        "plan.candidate_input_contract",
    )
    input_contract = load_model_input_contract(DEFAULT_INPUT_CONTRACT_PATH)
    expected_input_reference = {
        "schema_version": INPUT_CONTRACT_SCHEMA_VERSION,
        "contract_id": INPUT_CONTRACT_ID,
        "contract_version": INPUT_CONTRACT_VERSION,
        "path": INPUT_CONTRACT_REPOSITORY_PATH,
        "sha256": canonical_input_contract_sha256(input_contract),
    }
    if dict(input_reference) != expected_input_reference:
        raise ValueError("plan candidate input contract identity or hash changed")

    evaluation = _mapping(plan["common_evaluation"], "plan.common_evaluation")
    _exact_keys(
        evaluation,
        {
            "unit",
            "required_outputs",
            "candidate_input_contract_frozen",
            "same_rows_folds_and_features_for_every_compatible_candidate",
            "source_separated_development_and_locked_test",
            "geographic_and_temporal_outer_holdouts",
            "participant_cluster_preserved",
            "fold_local_preprocessing_only",
            "development_only_inner_selection",
            "locked_test_single_use",
            "pilot_rows_excluded",
            "legacy_unverified_rows_excluded",
            "required_metrics",
            "final_primary_metric_set_frozen",
            "materiality_thresholds_frozen",
            "uncertainty_method",
            "missing_coverage_rule",
        },
        "plan.common_evaluation",
    )
    if (
        evaluation["unit"]
        != "one-complete-california-halibut-targeted-site-window-attempt"
    ):
        raise ValueError("evaluation unit changed")
    _ordered_unique_slugs(
        evaluation["required_outputs"],
        REQUIRED_OUTPUTS,
        "plan.common_evaluation.required_outputs",
    )
    required_true = {
        "same_rows_folds_and_features_for_every_compatible_candidate",
        "source_separated_development_and_locked_test",
        "geographic_and_temporal_outer_holdouts",
        "participant_cluster_preserved",
        "fold_local_preprocessing_only",
        "development_only_inner_selection",
        "locked_test_single_use",
        "pilot_rows_excluded",
        "legacy_unverified_rows_excluded",
    }
    for field in required_true:
        if evaluation.get(field) is not True:
            raise ValueError(f"evaluation safeguard {field} must remain true")
    if evaluation.get("candidate_input_contract_frozen") is not True:
        raise ValueError("candidate input contract must remain frozen")
    for field in {"final_primary_metric_set_frozen", "materiality_thresholds_frozen"}:
        if evaluation.get(field) is not False:
            raise ValueError(f"open planning gate {field} must remain false")
    _ordered_unique_slugs(
        evaluation["required_metrics"],
        REQUIRED_METRICS,
        "plan.common_evaluation.required_metrics",
    )
    if (
        evaluation["uncertainty_method"]
        != "participant-clustered-and-geography-aware-intervals"
        or evaluation["missing_coverage_rule"]
        != "report-abstention-and-support-separately-never-impute-outside-validated-support"
    ):
        raise ValueError("evaluation uncertainty or missing-coverage boundary changed")

    candidates = plan["candidate_families"]
    if not isinstance(candidates, list) or candidates != CANDIDATE_FAMILIES:
        raise ValueError("candidate family inventory changed")
    candidate_ids = [candidate["candidate_id"] for candidate in candidates]
    complexity = [candidate["complexity_rank"] for candidate in candidates]
    if len(set(candidate_ids)) != len(candidate_ids) or complexity != list(range(8)):
        raise ValueError("candidate identities or complexity ordering are invalid")

    selection = _mapping(plan["selection_rule"], "plan.selection_rule")
    if dict(selection) != SELECTION_RULE:
        raise ValueError("selection rule changed")
    _ordered_unique_slugs(
        plan["resource_reporting"],
        RESOURCE_REPORTING,
        "plan.resource_reporting",
    )


def audit_model_selection_plan(
    plan: Mapping[str, Any] | None = None,
) -> Mapping[str, Any]:
    """Return a content-minimized non-authorizing audit receipt."""

    selected = plan if plan is not None else load_model_selection_plan()
    validate_model_selection_plan(selected)
    implementation_counts: dict[str, int] = {}
    for candidate in selected["candidate_families"]:
        status = candidate["implementation_status"]
        implementation_counts[status] = implementation_counts.get(status, 0) + 1
    return {
        "schema_version": RECEIPT_SCHEMA_VERSION,
        "plan_id": PLAN_ID,
        "plan_version": PLAN_VERSION,
        "plan_sha256": canonical_plan_sha256(selected),
        "status": PLAN_STATUS,
        "target_taxon_id": PRODUCTION_TARGET_TAXON_ID,
        "candidate_family_count": len(selected["candidate_families"]),
        "required_candidate_family_count": sum(
            candidate["required_in_future_comparison"]
            for candidate in selected["candidate_families"]
        ),
        "implementation_counts": dict(sorted(implementation_counts.items())),
        "open_data_gate_count": (
            len(selected["data_gates"]) - len(selected["locally_satisfied_data_gates"])
        ),
        "locally_satisfied_data_gate_count": len(
            selected["locally_satisfied_data_gates"]
        ),
        "candidate_input_contract_sha256": selected["candidate_input_contract"][
            "sha256"
        ],
        "benchmark_execution_authorized": False,
        "target_specific_training_authorized": False,
        "locked_test_access_authorized": False,
        "winner_selection_authorized": False,
        "score_or_serving_change_authorized": False,
        "claim_boundary": (
            "Local model-family inventory only; no benchmark, label access, training, "
            "selection, promotion, score, serving, provider, or deployment action occurred."
        ),
    }


def _write_json(value: Mapping[str, Any], output: Path | None) -> None:
    """Write stable human-readable JSON to stdout or a selected path."""

    payload = json.dumps(value, indent=2, sort_keys=True) + "\n"
    if output is None:
        sys.stdout.write(payload)
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(payload, encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    """Run the non-authorizing plan audit command-line interface."""

    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    audit = subparsers.add_parser(
        "audit", help="validate the plan and emit a minimized receipt"
    )
    audit.add_argument("--plan", type=Path, default=DEFAULT_PLAN_PATH)
    audit.add_argument("--output", type=Path)
    args = parser.parse_args(argv)

    try:
        if args.command == "audit":
            _write_json(
                audit_model_selection_plan(load_model_selection_plan(args.plan)),
                args.output,
            )
            return 0
    except (OSError, RuntimeError, ValueError) as exc:
        parser.error(str(exc))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
