"""Post-hoc source-seam and missingness diagnostics for frozen hybrid encoders.

This module deliberately cannot promote a model.  It tests whether the already
reported seafloor-character probes are sensitive to survey footprints or
availability-mask geometry before any independent habitat endpoint is used.
"""

from __future__ import annotations

from collections import Counter
import json
from pathlib import Path
from typing import Any, Dict, Mapping, Sequence, Tuple

import numpy as np
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score

from .habitat_probe import (
    PROBE_CLASS_NAMES,
    _fit_probe,
    decode_substrate_probe_target,
    sample_seafloor_character_labels,
    summarize_multiscale_patches,
)
from .hybrid_probe import (
    _hybrid_encoder_embeddings,
    _load_hybrid_checkpoint,
    _paired_bootstrap_pairs,
)
from .metadata import build_run_record, sha256_file, verify_run_record_integrity, write_json
from .patches import load_patch_corpus
from .splits import spatial_block_folds
from .training import HYBRID_PRETRAINING_MODALITIES

from shared.species_contract import (
    MODEL_RUN_CONTRACT_VERSION,
    TAXON_CATALOG_VERSION,
    target_scope,
)


HYBRID_SHORTCUT_DIAGNOSTIC_SCHEMA_VERSION = (
    "castingcompass.hybrid-seafloor-shortcut-diagnostic/1.0.0"
)


def _availability_diagnostic_features(
    patches: np.ndarray,
    channel_names: Sequence[str],
) -> Tuple[np.ndarray, Tuple[str, ...], np.ndarray, np.ndarray, Tuple[str, ...]]:
    """Return label-free mask summaries and exact center-source domains."""

    if patches.ndim != 5 or patches.shape[2] != len(channel_names):
        raise ValueError("patches must be (N,S,C,H,W) with declared channel names")
    availability_indices = tuple(
        index for index, name in enumerate(channel_names) if name.endswith("__available")
    )
    if not availability_indices:
        raise ValueError("shortcut diagnostic requires explicit availability channels")
    availability_names = tuple(str(channel_names[index]) for index in availability_indices)
    masks = patches[:, :, availability_indices]
    if not np.all(np.isfinite(masks)) or not np.all((masks == 0) | (masks == 1)):
        raise ValueError("availability channels must contain exact finite zero-or-one values")

    center_row = patches.shape[-2] // 2
    center_col = patches.shape[-1] // 2
    centers = masks[:, 0, :, center_row, center_col].astype(np.int8)
    feature_values = []
    feature_names = []
    for source_offset, availability_name in enumerate(availability_names):
        feature_values.append(centers[:, source_offset].astype(np.float32))
        feature_names.append(f"{availability_name}__center")
        for scale_index in range(patches.shape[1]):
            layer = masks[:, scale_index, source_offset]
            fraction = np.mean(layer, axis=(1, 2)).astype(np.float32)
            seam = ((fraction > 0) & (fraction < 1)).astype(np.float32)
            feature_values.extend((fraction, seam))
            feature_names.extend(
                (
                    f"{availability_name}__scale_{scale_index}__fraction",
                    f"{availability_name}__scale_{scale_index}__seam",
                )
            )

    patterns = np.asarray(
        ["".join(str(int(value)) for value in row) for row in centers],
        dtype=f"<U{len(availability_indices)}",
    )
    value_names = tuple(name.removesuffix("__available") for name in availability_names)
    domains = []
    for row in centers:
        present = np.flatnonzero(row)
        if len(present) == 1:
            domains.append(value_names[int(present[0])])
        elif len(present) == 0:
            domains.append("none")
        else:
            domains.append("overlap")
    max_domain_length = max(len(value) for value in (*value_names, "none", "overlap"))
    return (
        np.column_stack(feature_values).astype(np.float32),
        tuple(feature_names),
        np.asarray(domains, dtype=f"<U{max_domain_length}"),
        patterns,
        value_names,
    )


def _coordinate_diagnostic_features(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    """A small label-free geographic baseline for contextualizing source masks."""

    if x.shape != y.shape or x.ndim != 1 or not len(x):
        raise ValueError("coordinate diagnostic requires equal nonempty vectors")
    if not np.all(np.isfinite(x)) or not np.all(np.isfinite(y)):
        raise ValueError("coordinate diagnostic requires finite coordinates")
    x_scale = max(float(np.ptp(x)), 1.0)
    y_scale = max(float(np.ptp(y)), 1.0)
    normalized_x = (x - float(np.mean(x))) / x_scale
    normalized_y = (y - float(np.mean(y))) / y_scale
    return np.column_stack(
        (
            normalized_x,
            normalized_y,
            normalized_x**2,
            normalized_y**2,
            normalized_x * normalized_y,
        )
    ).astype(np.float32)


def _class_counts(labels: np.ndarray, indices: np.ndarray) -> Mapping[str, int]:
    return {
        class_name: int(np.sum(labels[indices] == class_index))
        for class_index, class_name in enumerate(PROBE_CLASS_NAMES)
    }


def _source_audit(
    patches: np.ndarray,
    channel_names: Sequence[str],
    domains: np.ndarray,
    patterns: np.ndarray,
    indices: np.ndarray,
) -> Mapping[str, Any]:
    availability_indices = tuple(
        index for index, name in enumerate(channel_names) if name.endswith("__available")
    )
    sources: Dict[str, Any] = {}
    center_row = patches.shape[-2] // 2
    center_col = patches.shape[-1] // 2
    for index in availability_indices:
        mask = patches[indices, :, index]
        center = mask[:, 0, center_row, center_col] > 0.5
        full = np.all(mask > 0.5, axis=(1, 2, 3))
        any_available = np.any(mask > 0.5, axis=(1, 2, 3))
        sources[str(channel_names[index]).removesuffix("__available")] = {
            "center_available_rows": int(np.sum(center)),
            "any_patch_available_rows": int(np.sum(any_available)),
            "fully_available_rows": int(np.sum(full)),
            "center_seam_rows": int(np.sum(center & ~full)),
        }
    return {
        "rows": int(len(indices)),
        "center_pattern_counts": dict(sorted(Counter(patterns[indices].tolist()).items())),
        "center_domain_counts": dict(sorted(Counter(domains[indices].tolist()).items())),
        "sources": sources,
    }


def _diagnostic_feature_sets(
    patches: np.ndarray,
    x: np.ndarray,
    y: np.ndarray,
    channel_names: Sequence[str],
    checkpoints: Mapping[str, Mapping[str, Any]],
    availability_features: np.ndarray,
    availability_feature_names: Sequence[str],
    *,
    device: str,
    batch_size: int,
    seed: int,
) -> Tuple[Mapping[str, np.ndarray], Mapping[str, Any]]:
    feature_sets: Dict[str, np.ndarray] = {}
    contract: Dict[str, Any] = {}
    for modality in HYBRID_PRETRAINING_MODALITIES:
        checkpoint = checkpoints[modality]
        input_contract = checkpoint["config"]["hybrid_pretraining_contract"]
        selected_indices = tuple(int(value) for value in input_contract["input_channel_indices"])
        selected_names = tuple(str(value) for value in input_contract["input_channel_names"])
        encoder_name = f"{modality}_pretrained_frozen_encoder"
        classical_name = f"{modality}_classical_summaries"
        feature_sets[encoder_name] = _hybrid_encoder_embeddings(
            patches,
            checkpoint,
            device=device,
            batch_size=batch_size,
            random_encoder=False,
            seed=seed,
        )
        summaries, summary_names = summarize_multiscale_patches(
            patches[:, :, selected_indices],
            selected_names,
        )
        feature_sets[classical_name] = summaries
        contract[modality] = {
            "pretrained_model_version": checkpoint["model_version"],
            "input_channel_names": list(selected_names),
            "embedding_dimensions": int(feature_sets[encoder_name].shape[1]),
            "classical_feature_names": list(summary_names),
        }

    bathymetry_classical = feature_sets["bathymetry_classical_summaries"]
    feature_sets["availability_only_summaries"] = availability_features
    feature_sets["bathymetry_plus_availability_summaries"] = np.column_stack(
        (bathymetry_classical, availability_features)
    ).astype(np.float32)
    feature_sets["coordinate_polynomial_summaries"] = _coordinate_diagnostic_features(x, y)
    contract["diagnostic_baselines"] = {
        "availability_feature_names": list(availability_feature_names),
        "bathymetry_plus_availability_feature_count": int(
            feature_sets["bathymetry_plus_availability_summaries"].shape[1]
        ),
        "coordinate_feature_names": ["x", "y", "x_squared", "y_squared", "x_times_y"],
        "coordinate_use": "post-hoc context baseline only; coordinates are not encoder inputs",
    }
    return feature_sets, contract


def _fit_feature_set_collection(
    feature_sets: Mapping[str, np.ndarray],
    labels: np.ndarray,
    train_indices: np.ndarray,
    test_indices: np.ndarray,
    *,
    seed: int,
) -> Tuple[Mapping[str, Any], Mapping[str, np.ndarray], Mapping[str, np.ndarray]]:
    metrics: Dict[str, Any] = {}
    predictions: Dict[str, np.ndarray] = {}
    probabilities: Dict[str, np.ndarray] = {}
    for offset, (name, features) in enumerate(feature_sets.items()):
        result, prediction, probability = _fit_probe(
            features,
            labels,
            train_indices,
            test_indices,
            seed=seed + offset,
        )
        metrics[name] = {**result, "feature_count": int(features.shape[1])}
        predictions[name] = prediction
        probabilities[name] = probability
    return metrics, predictions, probabilities


def _seam_strata(
    patches: np.ndarray,
    channel_names: Sequence[str],
    domains: np.ndarray,
    labels: np.ndarray,
    test_indices: np.ndarray,
    predictions: Mapping[str, np.ndarray],
    *,
    min_class_rows: int,
) -> Mapping[str, Any]:
    if min_class_rows < 1:
        raise ValueError("min_class_rows must be positive")
    single_domains = sorted(
        domain
        for domain in set(domains[test_indices].tolist())
        if domain not in {"none", "overlap"}
    )
    if len(single_domains) != 1:
        return {
            "status": "not_evaluable",
            "reason": "fixed held-out rows do not have one exact single-source domain",
        }
    source = single_domains[0]
    availability_name = f"{source}__available"
    if availability_name not in channel_names:
        raise ValueError("held-out source domain has no matching availability channel")
    mask = patches[test_indices, :, channel_names.index(availability_name)]
    center_row = patches.shape[-2] // 2
    center_col = patches.shape[-1] // 2
    center = mask[:, 0, center_row, center_col] > 0.5
    full = np.all(mask > 0.5, axis=(1, 2, 3))
    strata = {
        "interior": full,
        "seam": center & ~full,
        "unavailable_center": ~center,
    }
    output: Dict[str, Any] = {"status": "completed", "source_domain": source, "strata": {}}
    truth = labels[test_indices]
    selected_models = (
        "bathymetry_pretrained_frozen_encoder",
        "fused_pretrained_frozen_encoder",
        "bathymetry_classical_summaries",
        "fused_classical_summaries",
        "availability_only_summaries",
        "bathymetry_plus_availability_summaries",
    )
    for stratum, admitted in strata.items():
        local = np.flatnonzero(admitted)
        class_counts = _class_counts(truth, local)
        record: Dict[str, Any] = {
            "rows": int(len(local)),
            "class_counts": class_counts,
        }
        if len(local) == 0 or any(count == 0 for count in class_counts.values()):
            record.update(
                status="not_evaluable",
                reason="stratum does not contain every probe class",
            )
        else:
            if any(count < min_class_rows for count in class_counts.values()):
                record.update(
                    status="descriptive_low_support",
                    reason=(
                        "at least one class is below the predeclared per-class support "
                        "floor; metrics are descriptive and cannot support a seam comparison"
                    ),
                )
            else:
                record["status"] = "completed"
            record["models"] = {
                name: {
                    "accuracy": float(accuracy_score(truth[local], predictions[name][local])),
                    "balanced_accuracy": float(
                        balanced_accuracy_score(truth[local], predictions[name][local])
                    ),
                    "macro_f1": float(
                        f1_score(
                            truth[local],
                            predictions[name][local],
                            labels=np.arange(len(PROBE_CLASS_NAMES)),
                            average="macro",
                            zero_division=0,
                        )
                    ),
                }
                for name in selected_models
            }
        output["strata"][stratum] = record
    return output


def _source_domain_holdouts(
    feature_sets: Mapping[str, np.ndarray],
    labels: np.ndarray,
    domains: np.ndarray,
    source_names: Sequence[str],
    *,
    min_domain_rows: int,
    min_domain_class_rows: int,
    bootstrap_samples: int,
    seed: int,
) -> Tuple[Mapping[str, Any], Mapping[str, np.ndarray]]:
    if min_domain_rows < 1:
        raise ValueError("min_domain_rows must be positive")
    if min_domain_class_rows < 1:
        raise ValueError("min_domain_class_rows must be positive")
    valid = labels >= 0
    single = np.isin(domains, source_names)
    selected_features = {
        name: feature_sets[name]
        for name in (
            "bathymetry_pretrained_frozen_encoder",
            "backscatter_pretrained_frozen_encoder",
            "fused_pretrained_frozen_encoder",
            "bathymetry_classical_summaries",
            "fused_classical_summaries",
            "availability_only_summaries",
            "bathymetry_plus_availability_summaries",
        )
    }
    comparisons = (
        ("fused_pretrained_frozen_encoder", "bathymetry_pretrained_frozen_encoder"),
        ("fused_pretrained_frozen_encoder", "fused_classical_summaries"),
        ("bathymetry_plus_availability_summaries", "bathymetry_classical_summaries"),
    )
    output: Dict[str, Any] = {}
    arrays: Dict[str, np.ndarray] = {}
    for domain_offset, source in enumerate(source_names):
        train_indices = np.flatnonzero(valid & single & (domains != source))
        test_indices = np.flatnonzero(valid & (domains == source))
        train_counts = _class_counts(labels, train_indices)
        test_counts = _class_counts(labels, test_indices)
        record: Dict[str, Any] = {
            "train_rows": int(len(train_indices)),
            "test_rows": int(len(test_indices)),
            "train_class_counts": train_counts,
            "test_class_counts": test_counts,
            "overlap_and_no_source_rows_excluded": True,
        }
        if (
            len(train_indices) < min_domain_rows
            or len(test_indices) < min_domain_rows
            or any(count < min_domain_class_rows for count in train_counts.values())
            or any(count < min_domain_class_rows for count in test_counts.values())
        ):
            record.update(
                status="not_evaluable",
                reason=(
                    "predeclared total-row or per-class support is absent; the source "
                    "domain is not pooled or substituted"
                ),
            )
            output[source] = record
            continue
        metrics, predictions, probabilities = _fit_feature_set_collection(
            selected_features,
            labels,
            train_indices,
            test_indices,
            seed=seed + 100 + domain_offset * 20,
        )
        truth = labels[test_indices]
        bootstrap = _paired_bootstrap_pairs(
            truth,
            predictions,
            comparisons,
            samples=bootstrap_samples,
            seed=seed + 2000 + domain_offset,
        )
        record.update(
            status="completed",
            models=metrics,
            paired_bootstrap=bootstrap,
        )
        key = f"domain_{domain_offset}"
        arrays[f"{key}__source"] = np.asarray(source)
        arrays[f"{key}__corpus_indices"] = test_indices
        arrays[f"{key}__truth"] = truth
        for name, prediction in predictions.items():
            arrays[f"{key}__prediction__{name}"] = prediction
            arrays[f"{key}__probability__{name}"] = probabilities[name]
        output[source] = record
    return output, arrays


def run_hybrid_shortcut_diagnostic(
    corpus_path: Path,
    checkpoint_paths: Mapping[str, Path],
    label_raster_path: Path,
    output_dir: Path,
    *,
    label_raster_sha256: str | None = None,
    validation_fold: int = 3,
    split_regions: int = 5,
    min_domain_rows: int = 32,
    min_domain_class_rows: int = 16,
    batch_size: int = 64,
    device: str = "cpu",
    bootstrap_samples: int = 1000,
    seed: int = 42,
) -> Mapping[str, Any]:
    """Run a frozen, post-hoc source-footprint shortcut diagnostic."""

    if set(checkpoint_paths) != set(HYBRID_PRETRAINING_MODALITIES):
        raise ValueError("exact bathymetry, backscatter, and fused checkpoints are required")
    if bootstrap_samples < 1:
        raise ValueError("bootstrap_samples must be positive")
    patches, x, y, channel_names, corpus_metadata = load_patch_corpus(corpus_path)
    corpus_sha256 = sha256_file(corpus_path)
    checkpoints = {
        modality: _load_hybrid_checkpoint(
            checkpoint_paths[modality],
            corpus_sha256=corpus_sha256,
            modality=modality,
            channel_names=channel_names,
            corpus_metadata=corpus_metadata,
        )
        for modality in HYBRID_PRETRAINING_MODALITIES
    }
    frozen_split = {
        (
            checkpoint["config"].get("validation_fold"),
            checkpoint["config"].get("split_regions"),
            checkpoint["config"].get("seed"),
        )
        for checkpoint in checkpoints.values()
    }
    if frozen_split != {(validation_fold, split_regions, seed)}:
        raise ValueError("diagnostic split must exactly match every pretraining holdout")

    raw_labels, label_metadata = sample_seafloor_character_labels(
        label_raster_path,
        x,
        y,
        str(corpus_metadata["crs"]),
        expected_sha256=label_raster_sha256,
    )
    labels = decode_substrate_probe_target(raw_labels)
    valid = labels >= 0
    folds = spatial_block_folds(
        x,
        y,
        n_splits=split_regions,
        random_state=seed,
        min_train=max(64, batch_size),
        min_test=16,
    )
    if not 0 <= validation_fold < len(folds):
        raise ValueError("validation_fold is out of range")
    fold = folds[validation_fold]
    train_indices = fold.train_indices[valid[fold.train_indices]]
    test_indices = fold.test_indices[valid[fold.test_indices]]
    for name, indices in (("training", train_indices), ("held-out", test_indices)):
        if len(np.unique(labels[indices])) != len(PROBE_CLASS_NAMES):
            raise ValueError(f"{name} geography does not contain every probe class")

    (
        availability_features,
        availability_feature_names,
        domains,
        patterns,
        source_names,
    ) = _availability_diagnostic_features(patches, channel_names)
    feature_sets, feature_contract = _diagnostic_feature_sets(
        patches,
        x,
        y,
        channel_names,
        checkpoints,
        availability_features,
        availability_feature_names,
        device=device,
        batch_size=batch_size,
        seed=seed,
    )
    fixed_metrics, fixed_predictions, fixed_probabilities = _fit_feature_set_collection(
        feature_sets,
        labels,
        train_indices,
        test_indices,
        seed=seed,
    )
    fixed_comparisons = (
        ("bathymetry_plus_availability_summaries", "bathymetry_classical_summaries"),
        ("bathymetry_plus_availability_summaries", "availability_only_summaries"),
        ("fused_classical_summaries", "bathymetry_plus_availability_summaries"),
        ("fused_pretrained_frozen_encoder", "bathymetry_pretrained_frozen_encoder"),
        ("fused_pretrained_frozen_encoder", "fused_classical_summaries"),
        ("availability_only_summaries", "coordinate_polynomial_summaries"),
    )
    fixed_bootstrap = _paired_bootstrap_pairs(
        labels[test_indices],
        fixed_predictions,
        fixed_comparisons,
        samples=bootstrap_samples,
        seed=seed + 1000,
    )
    domain_holdouts, domain_arrays = _source_domain_holdouts(
        feature_sets,
        labels,
        domains,
        source_names,
        min_domain_rows=min_domain_rows,
        min_domain_class_rows=min_domain_class_rows,
        bootstrap_samples=bootstrap_samples,
        seed=seed,
    )

    fixed_single_domains = sorted(
        domain
        for domain in set(domains[test_indices].tolist())
        if domain not in {"none", "overlap"}
    )
    source_degenerate = len(fixed_single_domains) < 2
    availability_delta = fixed_bootstrap[
        "bathymetry_plus_availability_summaries_minus_bathymetry_classical_summaries"
    ]
    reliable_availability_lift = availability_delta["ci_95_low"] > 0
    completed_domains = [
        source for source, record in domain_holdouts.items() if record["status"] == "completed"
    ]
    conclusion = {
        "fixed_holdout_source_degenerate": source_degenerate,
        "fixed_holdout_single_source_domains": fixed_single_domains,
        "availability_adds_reliable_macro_f1_over_bathymetry_classical": (
            reliable_availability_lift
        ),
        "eligible_leave_one_source_domains": completed_domains,
        "shortcut_risk_resolved": False,
        "encoder_promoted": False,
        "serving_or_score_changed": False,
        "reason": (
            "This post-hoc diagnostic can identify source-footprint dependence but cannot "
            "establish an independent habitat or biological endpoint. A source-degenerate "
            "fixed holdout, reliable availability-only lift, or incomplete leave-one-source "
            "support blocks cross-survey generalization claims; absence of those findings "
            "would still not authorize promotion."
        ),
    }
    claim_boundary = (
        "This is a post-hoc shortcut diagnostic over historical USGS seafloor-character labels. "
        "It measures survey-footprint and availability dependence only. It cannot validate "
        "current habitat, fish presence, fishing skill, catch probability, calibration, the live "
        "Opportunity Score, or model promotion and deployment."
    )
    config = {
        "diagnostic_contract": HYBRID_SHORTCUT_DIAGNOSTIC_SCHEMA_VERSION,
        "validation_fold": validation_fold,
        "split_regions": split_regions,
        "min_domain_rows": min_domain_rows,
        "min_domain_class_rows": min_domain_class_rows,
        "batch_size": batch_size,
        "device": device,
        "bootstrap_samples": bootstrap_samples,
        "seed": seed,
        "source_domain_rule": "exactly one smallest-scale center availability channel",
        "domain_eligibility": (
            "minimum total rows and minimum per-class rows in train and held-out source"
        ),
        "declared_fixed_comparisons": [list(pair) for pair in fixed_comparisons],
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = output_dir / "hybrid_shortcut_diagnostic_metrics.json"
    prediction_path = output_dir / "hybrid_shortcut_diagnostic_predictions.npz"
    ordered_checkpoints = tuple(
        checkpoint_paths[modality] for modality in HYBRID_PRETRAINING_MODALITIES
    )
    run_record = build_run_record(
        command="diagnose-hybrid-seafloor-shortcuts",
        target_taxon_id=None,
        config=config,
        input_paths=(corpus_path, *ordered_checkpoints, label_raster_path),
        dataset_kind="official_seafloor_character_probe",
        status="completed",
        metrics={
            "metrics_artifact": str(metrics_path.resolve()),
            "predictions_artifact": str(prediction_path.resolve()),
        },
        notes=claim_boundary,
    )
    result_payload: Dict[str, Any] = {
        "schema_version": HYBRID_SHORTCUT_DIAGNOSTIC_SCHEMA_VERSION,
        "model_run_contract_version": MODEL_RUN_CONTRACT_VERSION,
        "observation_contract_version": None,
        "taxon_catalog_version": TAXON_CATALOG_VERSION,
        "target_taxon_id": None,
        "target_scope": target_scope(None),
        "experiment_version": run_record["experiment_version"],
        "model_version": run_record["model_version"],
        "status": "completed",
        "corpus_sha256": corpus_sha256,
        "checkpoint_sha256": {
            modality: sha256_file(checkpoint_paths[modality])
            for modality in HYBRID_PRETRAINING_MODALITIES
        },
        "label_metadata": dict(label_metadata),
        "feature_contract": feature_contract,
        "fixed_pretraining_holdout": {
            "validation_fold": validation_fold,
            "train_rows": int(len(train_indices)),
            "test_rows": int(len(test_indices)),
            "train_class_counts": _class_counts(labels, train_indices),
            "test_class_counts": _class_counts(labels, test_indices),
            "training_source_audit": _source_audit(
                patches, channel_names, domains, patterns, train_indices
            ),
            "held_out_source_audit": _source_audit(
                patches, channel_names, domains, patterns, test_indices
            ),
            "models": fixed_metrics,
            "paired_bootstrap": fixed_bootstrap,
            "seam_strata": _seam_strata(
                patches,
                channel_names,
                domains,
                labels,
                test_indices,
                fixed_predictions,
                min_class_rows=min_domain_class_rows,
            ),
        },
        "leave_one_source_domain_out": {
            "domain_rule": "exactly one smallest-scale center availability channel",
            "overlap_and_no_source_rows_excluded": True,
            "min_domain_rows": min_domain_rows,
            "min_domain_class_rows": min_domain_class_rows,
            "domains": domain_holdouts,
        },
        "conclusion": conclusion,
        "claim_boundary": claim_boundary,
    }
    write_json(metrics_path, result_payload)
    identity = {
        "schema_version": HYBRID_SHORTCUT_DIAGNOSTIC_SCHEMA_VERSION,
        "model_run_contract_version": MODEL_RUN_CONTRACT_VERSION,
        "observation_contract_version": None,
        "taxon_catalog_version": TAXON_CATALOG_VERSION,
        "target_scope": target_scope(None),
        "target_taxon_id": None,
        "experiment_version": run_record["experiment_version"],
        "model_version": run_record["model_version"],
    }
    np.savez_compressed(
        prediction_path,
        contract_identity_json=json.dumps(identity, sort_keys=True, separators=(",", ":")),
        fixed_corpus_indices=test_indices,
        fixed_x=x[test_indices],
        fixed_y=y[test_indices],
        fixed_truth=labels[test_indices],
        fixed_source_domain=domains[test_indices],
        fixed_source_pattern=patterns[test_indices],
        **{
            f"fixed_prediction__{name}": value
            for name, value in fixed_predictions.items()
        },
        **{
            f"fixed_probability__{name}": value
            for name, value in fixed_probabilities.items()
        },
        **domain_arrays,
    )
    run_record["metrics"]["metrics_sha256"] = sha256_file(metrics_path)
    run_record["metrics"]["predictions_sha256"] = sha256_file(prediction_path)
    verify_run_record_integrity(
        run_record,
        rehash_inputs=True,
        artifact_paths={
            "metrics_sha256": metrics_path,
            "predictions_sha256": prediction_path,
        },
    )
    run_metadata_path = output_dir / "hybrid_shortcut_diagnostic_run_metadata.json"
    write_json(run_metadata_path, run_record)
    return {
        "status": "completed",
        "metrics": metrics_path,
        "predictions": prediction_path,
        "run_metadata": run_metadata_path,
        "claim_boundary": claim_boundary,
    }
