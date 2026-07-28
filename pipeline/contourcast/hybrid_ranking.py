"""Shared expert-configured planning ranker and evidence-bound evaluation audit.

This module deliberately does not train on catch labels. It evaluates contract
coverage, deterministic ranking behavior, and the availability of legitimate
holdout evidence. Predictive metrics stay null until admissible labels exist.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from bisect import bisect_left, bisect_right
from datetime import datetime
from pathlib import Path
from typing import Any, Mapping, Sequence


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROFILES_PATH = ROOT / "model" / "hybrid" / "species-profiles-v1.json"
TARGET_TAXON_IDS = (
    "california-halibut",
    "striped-bass",
    "surfperch",
    "jacksmelt",
)


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_profiles(path: Path = DEFAULT_PROFILES_PATH) -> Mapping[str, Any]:
    document = _load_json(path)
    if document.get("schema_version") != "castingcompass.hybrid-species-profiles/1.0.0":
        raise ValueError("unsupported hybrid species-profile contract")
    profiles = document.get("profiles")
    if not isinstance(profiles, dict) or tuple(profiles) != TARGET_TAXON_IDS:
        raise ValueError("hybrid species profiles must declare the exact reviewed target order")
    if document.get("rockfish_status") != "deferred-behaviorally-heterogeneous":
        raise ValueError("rockfish must remain explicitly deferred")
    for taxon_id, profile in profiles.items():
        weights = profile.get("component_weights")
        if not isinstance(weights, dict) or set(weights) != {
            "habitat", "seasonality", "dynamic", "fishability"
        }:
            raise ValueError(f"{taxon_id} has an invalid component-weight contract")
        if abs(sum(float(value) for value in weights.values()) - 1.0) > 1e-9:
            raise ValueError(f"{taxon_id} component weights must sum to one")
        seasonality = profile.get("seasonality_by_month")
        if not isinstance(seasonality, list) or len(seasonality) != 12:
            raise ValueError(f"{taxon_id} must declare exactly twelve monthly priors")
        if any(not isinstance(value, int) or value < 5 or value > 98 for value in seasonality):
            raise ValueError(f"{taxon_id} monthly priors must stay within score bounds")
    return document


def _clamp(value: float) -> int:
    return round(max(5, min(98, value)))


def _fishability_cap(score: int) -> int:
    if score < 25:
        return 32
    if score < 40:
        return 48
    if score < 55:
        return 66
    if score < 65:
        return 80
    if score < 75:
        return 90
    return 100


def _habitat_score(profile: Mapping[str, Any], site: Mapping[str, Any]) -> int:
    habitat = profile["habitat"]
    site_prior = site.get("habitatPrior")
    if not isinstance(site_prior, (int, float)):
        site_prior = 50
    tag_adjustment = sum(
        float(habitat["tag_adjustments"].get(tag, 0))
        for tag in site.get("structureTags", [])
    )
    exposure = site.get("castingZone", {}).get("exposure", "")
    return _clamp(
        float(habitat["baseline"])
        + ((float(site_prior) - 50) * float(habitat["site_prior_weight"]))
        + tag_adjustment
        + float(habitat["type_adjustments"].get(site.get("type"), 0))
        + float(habitat["exposure_adjustments"].get(exposure, 0))
    )


def _seasonality_score(profile: Mapping[str, Any], start: str) -> int:
    month_index = datetime.fromisoformat(start.replace("Z", "+00:00")).month - 1
    return _clamp(float(profile["seasonality_by_month"][month_index]))


def _dynamic_score(profile: Mapping[str, Any], window: Mapping[str, Any]) -> int:
    tide_stage = str(window.get("conditions", {}).get("tideStage", "")).lower()
    return _clamp(
        float(window["dynamicScore"])
        + float(profile["tide_stage_adjustments"].get(tide_stage, 0))
    )


def rank_windows(
    windows: Sequence[Mapping[str, Any]],
    sites: Sequence[Mapping[str, Any]],
    target_taxon_id: str,
    *,
    profiles_document: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    profiles_document = profiles_document or load_profiles()
    profiles = profiles_document["profiles"]
    if target_taxon_id not in profiles:
        raise ValueError("unsupported planning target")
    profile = profiles[target_taxon_id]
    sites_by_id = {site["id"]: site for site in sites}
    scored: list[dict[str, Any]] = []
    for window in windows:
        site = sites_by_id.get(window.get("siteId"))
        if site is None:
            continue
        habitat = _habitat_score(profile, site)
        seasonality = _seasonality_score(profile, str(window["start"]))
        dynamic = _dynamic_score(profile, window)
        fishability = _clamp(float(window["fishabilityScore"]))
        access_adjustment = float(
            window.get("conditions", {}).get("accessAdjustmentPoints", 0)
        )
        weights = profile["component_weights"]
        raw_score = round(
            (float(weights["habitat"]) * habitat)
            + (float(weights["seasonality"]) * seasonality)
            + (float(weights["dynamic"]) * dynamic)
            + (float(weights["fishability"]) * fishability)
            + (access_adjustment * float(profile["access_adjustment_scale"])),
            6,
        )
        scored.append({
            "id": window["id"],
            "site_id": window["siteId"],
            "start": window["start"],
            "raw_score": raw_score,
            "habitat_score": habitat,
            "seasonality_score": seasonality,
            "dynamic_score": dynamic,
            "fishability_score": fishability,
        })

    ascending = sorted(item["raw_score"] for item in scored)
    denominator = max(1, len(ascending) - 1)
    for item in scored:
        lower = bisect_left(ascending, item["raw_score"])
        upper = bisect_right(ascending, item["raw_score"]) - 1
        percentile = round(100 * ((lower + upper) / 2) / denominator)
        item["score"] = min(percentile, _fishability_cap(item["fishability_score"]))
    return scored


def build_evaluation_audit(
    sites_path: Path,
    opportunities_path: Path,
    profiles_path: Path = DEFAULT_PROFILES_PATH,
) -> dict[str, Any]:
    sites = _load_json(sites_path)
    snapshot = _load_json(opportunities_path)
    profiles_document = load_profiles(profiles_path)
    windows = snapshot["windows"]
    profile_sha256 = hashlib.sha256(profiles_path.read_bytes()).hexdigest()

    ranking_smoke: dict[str, Any] = {}
    for taxon_id in TARGET_TAXON_IDS:
        ranked = rank_windows(
            windows,
            sites,
            taxon_id,
            profiles_document=profiles_document,
        )
        ordered = sorted(ranked, key=lambda item: (-item["score"], item["start"], item["site_id"]))
        ranking_smoke[taxon_id] = {
            "window_count": len(ranked),
            "minimum_score": min(item["score"] for item in ranked),
            "maximum_score": max(item["score"] for item in ranked),
            "distinct_score_count": len({item["score"] for item in ranked}),
            "top_site_ids": list(dict.fromkeys(item["site_id"] for item in ordered))[:5],
        }

    region_counts: dict[str, int] = {}
    for site in sites:
        region = str(site["region"])
        region_counts[region] = region_counts.get(region, 0) + 1

    return {
        "schema_version": "castingcompass.hybrid-ranking-evaluation/1.0.0",
        "baseline_version": profiles_document["configuration_version"],
        "profile_sha256": profile_sha256,
        "evaluation_status": "implementation-evaluated-predictive-skill-not-estimable",
        "claim_boundary": (
            "Determinism, score bounds, target differentiation, and feature coverage are "
            "evaluated. Catch-prediction and ranking-skill metrics are null because no "
            "admissible complete-effort label corpus is available."
        ),
        "available_evidence": {
            "eligible_supervised_observation_rows": 0,
            "public_aggregate_context_is_training_label": False,
            "first_party_validation_gate_open": False,
            "snapshot_window_count": len(windows),
            "site_count": len(sites),
            "region_count": len(region_counts),
        },
        "leakage_controls": [
            "planning-time features only",
            "no outcomes, post-trip observations, user history, prior score, or moderation output",
            "fold-local preprocessing required once labels exist",
            "source-separated development and locked-test data required",
            "participant groups cannot cross folds",
        ],
        "predeclared_holdouts": {
            "geographic": {
                "method": "leave-one-coastal-region-group-out",
                "groups": sorted(region_counts),
                "minimum_sites_per_group": min(region_counts.values()),
            },
            "temporal": {
                "method": "forward-chaining-calendar-quarter",
                "folds": ["Q1->Q2", "Q1-Q2->Q3", "Q1-Q3->Q4"],
                "planning_time_cutoff_required": True,
            },
        },
        "ranking_metrics_when_identifiable": {
            "ndcg_at_10": None,
            "spearman_rank_correlation": None,
            "pairwise_concordance": None,
            "top_decile_target_encounter_rate": None,
            "reason": "No eligible complete-effort labels; null is required rather than a fabricated result.",
        },
        "ranking_smoke": ranking_smoke,
        "rockfish": {
            "status": "deferred",
            "reason": "The generic category is behaviorally heterogeneous and outside this phase.",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["audit"])
    parser.add_argument("--sites", type=Path, default=ROOT / "data" / "sites.json")
    parser.add_argument(
        "--opportunities",
        type=Path,
        default=ROOT / "public" / "data" / "opportunities.json",
    )
    parser.add_argument("--profiles", type=Path, default=DEFAULT_PROFILES_PATH)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    document = build_evaluation_audit(args.sites, args.opportunities, args.profiles)
    rendered = json.dumps(document, indent=2, sort_keys=True) + "\n"
    if args.output is None:
        print(rendered, end="")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")


if __name__ == "__main__":
    main()
