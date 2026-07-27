"""Validate the frozen pre-label input boundary for future model candidates.

This module does not read fishing observations, fit a candidate, compute model
metrics, open a locked test set, change the public score, or authorize serving.
It makes the eventual comparison harder to bias by fixing the information that
may exist at prediction time and the architecture-specific views derived from
the same upstream terrain evidence.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Mapping


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT_CONTRACT_PATH = (
    REPOSITORY_ROOT / "model" / "selection" / "california-halibut-input-v1.json"
)
SCHEMA_VERSION = "castingcompass.model-input-contract/1.0.0"
CONTRACT_ID = "california-halibut-model-input-v1"
CONTRACT_VERSION = "1.0.0"
CONTRACT_STATUS = "frozen-local-template-no-label-authority"
TARGET_TAXON_ID = "california-halibut"
PREDICTION_UNIT = "one-public-site-by-two-hour-window-before-outcome"

REQUIRED_CANDIDATE_IDS = [
    "naive-prevalence-mean-cpue",
    "regularized-linear-two-head",
    "spline-gam-two-head",
    "random-forest-two-head",
    "hist-gradient-boosted-two-head",
    "spatial-hierarchical-two-head",
    "bathymetric-deep-two-head",
]

NUMERIC_CONTEXT_FEATURES = [
    "month_sin",
    "month_cos",
    "local_hour_sin",
    "local_hour_cos",
    "tide_level_midpoint_ft",
    "tide_change_m",
    "current_knots",
    "current_direction_sin",
    "current_direction_cos",
    "wind_mph",
    "swell_feet",
    "swell_period_seconds",
    "swell_direction_sin",
    "swell_direction_cos",
    "wave_power_kw_m",
    "water_temp_f",
    "cloud_cover_fraction",
    "pressure_hpa",
    "pressure_trend_hpa_3h",
    "moon_illumination_fraction",
    "expected_access_pressure_fraction",
    "casting_bearing_sin",
    "casting_bearing_cos",
    "forecast_lead_hours",
    "tide_source_age_hours",
    "weather_source_age_hours",
    "buoy_source_age_hours",
    "marine_source_age_hours",
]
CATEGORICAL_CONTEXT_FEATURES = [
    "fishing_mode",
    "region_panel",
    "tide_stage",
    "casting_exposure",
    "beach_slope_class",
]
BINARY_CONTEXT_FEATURES = ["daylight"]
AVAILABILITY_MASKS = [
    "tide_available",
    "weather_available",
    "buoy_available",
    "marine_forecast_available",
    "terrain_available",
]
TERRAIN_CHANNELS = [
    "depth_m",
    "slope_deg",
    "roughness_m",
    "curvature",
    "tpi_local_m",
    "tpi_broad_m",
]
TERRAIN_RADII_M = [64.0, 256.0, 1024.0]
TERRAIN_SUMMARIES = ["center", "mean", "std", "min", "max"]
FOLD_LOCAL_OPERATIONS = [
    "imputation",
    "normalization",
    "categorical-encoding",
    "feature-selection",
    "calibration",
]
SAFETY_GATES = [
    "current-access-closure",
    "current-fishing-regulation",
    "current-water-quality-action",
]
PROHIBITED_INPUTS = [
    "target-outcome",
    "catch-counts",
    "post-trip-observations",
    "trip-notes",
    "trip-photo",
    "bait-lure-rig-or-gear-selected-after-score-exposure",
    "participant-account-or-reporter-identity",
    "participant-personal-history",
    "exact-private-gps",
    "score-influenced-choice",
    "current-or-prior-opportunity-score",
    "current-or-prior-component-scores",
    "future-weather-or-revised-source-values",
    "moderation-output",
    "protected-or-scraped-platform-content",
]


def _mapping(value: Any, context: str) -> Mapping[str, Any]:
    """Require an object-like value and preserve its original mapping."""

    if not isinstance(value, Mapping):
        raise ValueError(f"{context} must be an object")
    return value


def _exact_keys(value: Mapping[str, Any], expected: set[str], context: str) -> None:
    """Reject missing or additional keys at a strict contract boundary."""

    actual = set(value)
    if actual != expected:
        raise ValueError(
            f"{context} keys changed "
            f"(missing={sorted(expected - actual)}, extra={sorted(actual - expected)})"
        )


def _exact_list(value: Any, expected: list[Any], context: str) -> None:
    """Require one exact ordered list with no duplicate entries."""

    if not isinstance(value, list) or value != expected:
        raise ValueError(f"{context} changed")
    serialized = [json.dumps(item, sort_keys=True) for item in value]
    if len(set(serialized)) != len(serialized):
        raise ValueError(f"{context} contains duplicates")


def canonical_input_contract_sha256(contract: Mapping[str, Any]) -> str:
    """Return the SHA-256 of a contract's canonical JSON representation."""

    payload = json.dumps(
        contract,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def classical_terrain_feature_order() -> tuple[str, ...]:
    """Return the exact fold-local summary order for classical candidates."""

    return tuple(
        f"terrain_r{int(radius)}m__{channel}__{summary}"
        for radius in TERRAIN_RADII_M
        for channel in TERRAIN_CHANNELS
        for summary in TERRAIN_SUMMARIES
    )


def deep_context_feature_order() -> tuple[str, ...]:
    """Return the shared pre-trip context order required by the deep candidate."""

    return tuple(
        NUMERIC_CONTEXT_FEATURES
        + CATEGORICAL_CONTEXT_FEATURES
        + BINARY_CONTEXT_FEATURES
        + AVAILABILITY_MASKS
    )


def deep_context_feature_order_sha256() -> str:
    """Hash the ordered deep-candidate context names independently of weights."""

    payload = json.dumps(
        deep_context_feature_order(),
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def classical_candidate_feature_order() -> tuple[str, ...]:
    """Return the exact raw context plus terrain-summary feature order."""

    return deep_context_feature_order() + classical_terrain_feature_order()


def classical_candidate_feature_order_sha256() -> str:
    """Hash the ordered classical input names independently of model weights."""

    payload = json.dumps(
        classical_candidate_feature_order(),
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def load_model_input_contract(
    path: Path = DEFAULT_INPUT_CONTRACT_PATH,
) -> Mapping[str, Any]:
    """Load and validate the checked-in model input contract."""

    try:
        contract = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Model input contract is unavailable or invalid: {path}") from exc
    validate_model_input_contract(contract)
    return contract


def validate_model_input_contract(contract: Mapping[str, Any]) -> None:
    """Reject leakage, candidate asymmetry, lookahead, or authority expansion."""

    contract = _mapping(contract, "input contract")
    _exact_keys(
        contract,
        {
            "schema_version",
            "contract_id",
            "contract_version",
            "status",
            "target_taxon_id",
            "prediction_unit",
            "prediction_time_boundary",
            "candidate_parity",
            "context_features",
            "terrain_view",
            "label_contract",
            "missingness_and_abstention",
            "safety_gate_boundary",
            "prohibited_inputs",
            "source_binding",
            "authority",
        },
        "input contract",
    )
    identity = {
        "schema_version": SCHEMA_VERSION,
        "contract_id": CONTRACT_ID,
        "contract_version": CONTRACT_VERSION,
        "status": CONTRACT_STATUS,
        "target_taxon_id": TARGET_TAXON_ID,
        "prediction_unit": PREDICTION_UNIT,
    }
    for field, expected in identity.items():
        if contract.get(field) != expected:
            raise ValueError(f"input contract {field} changed")

    time_boundary = _mapping(
        contract["prediction_time_boundary"],
        "input contract.prediction_time_boundary",
    )
    if dict(time_boundary) != {
        "anchor": "before-score-exposure-and-before-trip-start",
        "forecast_values": "only-values-issued-or-observed-at-or-before-the-anchor",
        "future_or_revised_values_allowed": False,
        "post_start_values_allowed": False,
    }:
        raise ValueError("prediction-time or no-lookahead boundary changed")

    parity = _mapping(contract["candidate_parity"], "input contract.candidate_parity")
    _exact_keys(
        parity,
        {
            "required_candidate_ids",
            "same_eligible_rows",
            "same_outer_and_inner_folds",
            "same_context_features",
            "same_raw_terrain_sources_and_centers",
            "same_source_snapshots",
            "candidate_exclusive_upstream_source_allowed",
            "architecture_view_rule",
        },
        "input contract.candidate_parity",
    )
    _exact_list(
        parity["required_candidate_ids"],
        REQUIRED_CANDIDATE_IDS,
        "input contract.candidate_parity.required_candidate_ids",
    )
    for field in {
        "same_eligible_rows",
        "same_outer_and_inner_folds",
        "same_context_features",
        "same_raw_terrain_sources_and_centers",
        "same_source_snapshots",
    }:
        if parity[field] is not True:
            raise ValueError(f"candidate parity safeguard {field} must remain true")
    if parity["candidate_exclusive_upstream_source_allowed"] is not False:
        raise ValueError("candidate-exclusive upstream sources remain prohibited")
    if parity["architecture_view_rule"] != (
        "classical-candidates-receive-fold-local-summaries-of-the-exact-"
        "multiscale-terrain-bags-received-by-the-deep-candidate"
    ):
        raise ValueError("architecture-specific terrain view rule changed")

    context = _mapping(contract["context_features"], "input contract.context_features")
    _exact_keys(
        context,
        {"numeric", "categorical", "binary", "availability_masks"},
        "input contract.context_features",
    )
    _exact_list(context["numeric"], NUMERIC_CONTEXT_FEATURES, "numeric context features")
    _exact_list(
        context["categorical"],
        CATEGORICAL_CONTEXT_FEATURES,
        "categorical context features",
    )
    _exact_list(context["binary"], BINARY_CONTEXT_FEATURES, "binary context features")
    _exact_list(
        context["availability_masks"],
        AVAILABILITY_MASKS,
        "context availability masks",
    )
    all_context = (
        NUMERIC_CONTEXT_FEATURES
        + CATEGORICAL_CONTEXT_FEATURES
        + BINARY_CONTEXT_FEATURES
        + AVAILABILITY_MASKS
    )
    if len(set(all_context)) != len(all_context):
        raise RuntimeError("model input feature inventory contains duplicate names")

    terrain = _mapping(contract["terrain_view"], "input contract.terrain_view")
    _exact_keys(
        terrain,
        {
            "source_channels",
            "radii_m",
            "output_size",
            "minimum_valid_fraction_each_scale",
            "classical_summary_statistics",
            "deep_patch_bag",
            "fold_local_only",
        },
        "input contract.terrain_view",
    )
    _exact_list(terrain["source_channels"], TERRAIN_CHANNELS, "terrain channels")
    _exact_list(terrain["radii_m"], TERRAIN_RADII_M, "terrain radii")
    if terrain["output_size"] != 33:
        raise ValueError("terrain output size changed")
    if terrain["minimum_valid_fraction_each_scale"] != 0.8:
        raise ValueError("terrain minimum valid fraction changed")
    _exact_list(
        terrain["classical_summary_statistics"],
        TERRAIN_SUMMARIES,
        "terrain summaries",
    )
    _exact_list(
        terrain["fold_local_only"],
        FOLD_LOCAL_OPERATIONS,
        "fold-local operations",
    )
    deep = _mapping(terrain["deep_patch_bag"], "input contract.terrain_view.deep_patch_bag")
    if dict(deep) != {
        "shape": "rows-by-sitesupportpatches-by-3-scales-by-6-channels-by-33-by-33",
        "mask_required": True,
        "maximum_site_support_patches": 32,
        "empty_bag_action": "abstain",
    }:
        raise ValueError("deep terrain patch-bag boundary changed")

    labels = _mapping(contract["label_contract"], "input contract.label_contract")
    if dict(labels) != {
        "observation_contract_version": "castingcompass.observation/2.0.0",
        "eligible_contract_status": "valid",
        "primary_target_taxon_id": TARGET_TAXON_ID,
        "complete_attempt_required": True,
        "expanded_estimate_allowed": False,
        "occurrence_label": "target-encounter-count-greater-than-zero",
        "positive_cpue_label": (
            "target-encounter-count-divided-by-positive-target-effort"
        ),
        "non_encounter_cpue": 0,
        "pilot_rows_allowed": False,
        "legacy_unverified_rows_allowed": False,
    }:
        raise ValueError("eligible-label boundary changed")

    missingness = _mapping(
        contract["missingness_and_abstention"],
        "input contract.missingness_and_abstention",
    )
    if dict(missingness) != {
        "invented_neutral_values_allowed": False,
        "missingness_masks_required": True,
        "missing_dynamic_values_may_be_fold_locally_imputed": True,
        "missing_terrain_or_subthreshold_coverage_action": "abstain",
        "outside_validated_geography_or_mode_action": "abstain",
        "abstentions_reported_separately": True,
    }:
        raise ValueError("missingness or abstention boundary changed")

    safety = _mapping(
        contract["safety_gate_boundary"],
        "input contract.safety_gate_boundary",
    )
    _exact_keys(
        safety,
        {
            "candidate_inputs",
            "ordered_before_ranking",
            "unsafe_or_unknown_action",
            "pollution_or_advisory_status_may_increase_opportunity",
            "reason",
        },
        "input contract.safety_gate_boundary",
    )
    _exact_list(safety["candidate_inputs"], [], "candidate safety inputs")
    _exact_list(safety["ordered_before_ranking"], SAFETY_GATES, "pre-ranking safety gates")
    if (
        safety["unsafe_or_unknown_action"]
        != "withhold-or-clearly-downgrade-through-a-separate-reviewed-safety-policy"
        or safety["pollution_or_advisory_status_may_increase_opportunity"] is not False
        or safety["reason"]
        != "a-catch-model-must-not-learn-that-polluted-closed-or-illegal-water-is-a-better-destination"
    ):
        raise ValueError("safety-gate separation changed")

    _exact_list(contract["prohibited_inputs"], PROHIBITED_INPUTS, "prohibited inputs")

    source_binding = _mapping(contract["source_binding"], "input contract.source_binding")
    if dict(source_binding) != {
        "raw_source_id_required": True,
        "raw_sha256_required": True,
        "source_revision_required": True,
        "retrieved_at_required": True,
        "issued_or_observed_at_required": True,
        "transform_version_required": True,
        "feature_order_hash_required": True,
        "feature_order_sha256": classical_candidate_feature_order_sha256(),
        "timezone": "America/Los_Angeles",
        "no_lookahead_enforced": True,
    }:
        raise ValueError("source provenance or no-lookahead binding changed")

    authority = _mapping(contract["authority"], "input contract.authority")
    expected_authority = {
        "eligible_labeled_data_available": False,
        "benchmark_execution_authorized": False,
        "target_specific_training_authorized": False,
        "locked_test_access_authorized": False,
        "winner_selection_authorized": False,
        "score_change_authorized": False,
        "serving_change_authorized": False,
        "deployment_authorized": False,
    }
    if dict(authority) != expected_authority:
        raise ValueError("model input contract must remain fully non-authorizing")


def audit_model_input_contract(
    contract: Mapping[str, Any] | None = None,
) -> Mapping[str, Any]:
    """Return a minimized receipt without features, labels, metrics, or results."""

    selected = contract if contract is not None else load_model_input_contract()
    validate_model_input_contract(selected)
    return {
        "schema_version": "castingcompass.model-input-contract-audit/1.0.0",
        "contract_id": CONTRACT_ID,
        "contract_version": CONTRACT_VERSION,
        "contract_sha256": canonical_input_contract_sha256(selected),
        "context_feature_count": (
            len(NUMERIC_CONTEXT_FEATURES)
            + len(CATEGORICAL_CONTEXT_FEATURES)
            + len(BINARY_CONTEXT_FEATURES)
            + len(AVAILABILITY_MASKS)
        ),
        "terrain_channel_count": len(TERRAIN_CHANNELS),
        "terrain_scale_count": len(TERRAIN_RADII_M),
        "classical_terrain_feature_count": (
            len(TERRAIN_CHANNELS) * len(TERRAIN_RADII_M) * len(TERRAIN_SUMMARIES)
        ),
        "classical_candidate_feature_count": len(classical_candidate_feature_order()),
        "classical_candidate_feature_order_sha256": (
            classical_candidate_feature_order_sha256()
        ),
        "deep_context_feature_count": len(deep_context_feature_order()),
        "deep_context_feature_order_sha256": deep_context_feature_order_sha256(),
        "required_candidate_count": len(REQUIRED_CANDIDATE_IDS),
        "safety_gate_count": len(SAFETY_GATES),
        "prohibited_input_count": len(PROHIBITED_INPUTS),
        "all_execution_authority_closed": True,
        "claim_boundary": (
            "Frozen local pre-label input inventory only; no observation access, "
            "benchmark, training, selection, score, serving, provider, or deployment "
            "action occurred."
        ),
    }
