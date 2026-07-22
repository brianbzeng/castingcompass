import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from pipeline.contourcast.hybrid_probe import (
    _load_hybrid_checkpoint,
    _paired_bootstrap_pairs,
)
from pipeline.contourcast.hybrid_shortcut_diagnostic import (
    _availability_diagnostic_features,
    _source_domain_holdouts,
)
from pipeline.contourcast.rare_structure_probe import (
    RARE_CLASS_NAMES,
    RARE_CORPUS_SCHEMA_VERSION,
    _cluster_bootstrap_pairs,
    _component_folds,
    _load_rare_corpus,
    _take_component_diverse,
)
from pipeline.contourcast.structure import STRUCTURE_CHANNELS
from pipeline.contourcast.training import resolve_hybrid_pretraining_contract
from shared.species_contract import MODEL_RUN_CONTRACT_VERSION, TAXON_CATALOG_VERSION, target_scope


def _hybrid_fixture():
    value = "backscatter_intensity_8101_2004"
    availability = f"{value}__available"
    names = STRUCTURE_CHANNELS + (value, availability)
    metadata = {
        "source_id": "usgs_sf_state_waters_2m",
        "feature_metadata": {
            "aligned_layers": {
                value: {
                    "source_id": "usgs_sf_state_waters_2m",
                    "valid_fraction": 0.75,
                    "missingness_channel": availability,
                }
            }
        },
    }
    contract = resolve_hybrid_pretraining_contract(names, metadata, modality="fused")
    digest = "a" * 64
    checkpoint = {
        "model_run_contract_version": MODEL_RUN_CONTRACT_VERSION,
        "observation_contract_version": None,
        "taxon_catalog_version": TAXON_CATALOG_VERSION,
        "target_taxon_id": None,
        "target_scope": target_scope(None),
        "experiment_version": f"exp-target-agnostic-{'b' * 64}",
        "model_version": f"model-target-agnostic-{'c' * 64}",
        "corpus_sha256": digest,
        "config": {
            "objective": "spatial-contrastive-plus-masked-reconstruction",
            "hybrid_pretraining_contract": contract,
            "base_width": 8,
            "blocks_per_stage": 1,
            "projection_dim": 16,
            "scales": 3,
        },
        "normalization": {
            "median": [0.0] * len(names),
            "iqr": [1.0] * len(names),
        },
        "state_dict": {"encoder.example": object()},
    }
    return digest, names, metadata, checkpoint


class HybridProbeTests(unittest.TestCase):
    def test_availability_diagnostic_freezes_mask_geometry_and_domains(self):
        names = (
            "depth_m",
            "survey_a",
            "survey_a__available",
            "survey_b",
            "survey_b__available",
        )
        patches = np.zeros((4, 2, len(names), 5, 5), dtype=np.float32)
        patches[0, :, 2] = 1
        patches[1, :, 4] = 1
        patches[2, :, 2] = 1
        patches[2, :, 4] = 1
        patches[3, 0, 2, 2, 2] = 1
        features, feature_names, domains, patterns, sources = (
            _availability_diagnostic_features(patches, names)
        )
        self.assertEqual(features.shape, (4, 10))
        self.assertEqual(len(feature_names), features.shape[1])
        self.assertEqual(sources, ("survey_a", "survey_b"))
        self.assertEqual(domains.tolist(), ["survey_a", "survey_b", "overlap", "survey_a"])
        self.assertEqual(patterns.tolist(), ["10", "01", "11", "10"])
        patches[0, 0, 2, 0, 0] = 0.5
        with self.assertRaisesRegex(ValueError, "zero-or-one"):
            _availability_diagnostic_features(patches, names)

    def test_source_domain_holdouts_are_exhaustive_and_do_not_pool_failures(self):
        source_names = ("survey_a", "survey_b", "survey_c")
        labels = np.tile(np.repeat(np.arange(3), 2), len(source_names))
        domains = np.repeat(np.asarray(source_names), 6)
        base = np.eye(3, dtype=np.float32)[labels]
        feature_names = (
            "bathymetry_pretrained_frozen_encoder",
            "backscatter_pretrained_frozen_encoder",
            "fused_pretrained_frozen_encoder",
            "bathymetry_classical_summaries",
            "fused_classical_summaries",
            "availability_only_summaries",
            "bathymetry_plus_availability_summaries",
        )
        feature_sets = {name: base.copy() for name in feature_names}
        first, arrays = _source_domain_holdouts(
            feature_sets,
            labels,
            domains,
            source_names,
            min_domain_rows=6,
            bootstrap_samples=10,
            seed=7,
        )
        second, _ = _source_domain_holdouts(
            feature_sets,
            labels,
            domains,
            source_names,
            min_domain_rows=6,
            bootstrap_samples=10,
            seed=7,
        )
        self.assertEqual(first, second)
        self.assertTrue(all(record["status"] == "completed" for record in first.values()))
        self.assertEqual(arrays["domain_0__corpus_indices"].tolist(), list(range(6)))
        failed_labels = labels.copy()
        failed_labels[domains == "survey_c"] = 0
        failed, _ = _source_domain_holdouts(
            feature_sets,
            failed_labels,
            domains,
            source_names,
            min_domain_rows=6,
            bootstrap_samples=10,
            seed=7,
        )
        self.assertEqual(failed["survey_c"]["status"], "not_evaluable")
        self.assertIn("not pooled", failed["survey_c"]["reason"])

    def test_hybrid_checkpoint_reconciles_complete_input_contract(self):
        digest, names, metadata, checkpoint = _hybrid_fixture()
        with (
            patch("pipeline.contourcast.hybrid_probe.require_torch"),
            patch("pipeline.contourcast.hybrid_probe.torch") as torch_mock,
        ):
            torch_mock.load.return_value = checkpoint
            loaded = _load_hybrid_checkpoint(
                Path("fused.pt"),
                corpus_sha256=digest,
                modality="fused",
                channel_names=names,
                corpus_metadata=metadata,
            )
        self.assertIs(loaded, checkpoint)
        drifted = dict(metadata)
        drifted["feature_metadata"] = {
            "aligned_layers": {
                "backscatter_intensity_8101_2004": {
                    "source_id": "usgs_sf_state_waters_2m",
                    "valid_fraction": 0.5,
                    "missingness_channel": "backscatter_intensity_8101_2004__available",
                }
            }
        }
        with (
            patch("pipeline.contourcast.hybrid_probe.require_torch"),
            patch("pipeline.contourcast.hybrid_probe.torch") as torch_mock,
            self.assertRaisesRegex(ValueError, "differs from the corpus"),
        ):
            torch_mock.load.return_value = checkpoint
            _load_hybrid_checkpoint(
                Path("fused.pt"),
                corpus_sha256=digest,
                modality="fused",
                channel_names=names,
                corpus_metadata=drifted,
            )

    def test_declared_bootstrap_is_class_stratified_and_deterministic(self):
        truth = np.repeat(np.arange(3), [60, 12, 8])
        perfect = truth.copy()
        weak = np.zeros_like(truth)
        first = _paired_bootstrap_pairs(
            truth,
            {"perfect": perfect, "weak": weak},
            (("perfect", "weak"),),
            samples=50,
            seed=4,
        )
        second = _paired_bootstrap_pairs(
            truth,
            {"perfect": perfect, "weak": weak},
            (("perfect", "weak"),),
            samples=50,
            seed=4,
        )
        self.assertEqual(first, second)
        result = first["perfect_minus_weak"]
        self.assertGreater(result["ci_95_low"], 0)
        self.assertEqual(result["resampling_unit"], "held-out-row-within-class")

    def test_component_diverse_selection_visits_groups_before_repeats(self):
        indices = np.arange(12)
        groups = np.asarray(["a"] * 6 + ["b"] * 3 + ["c"] * 3)
        selected = _take_component_diverse(indices, groups, 3, seed=8)
        self.assertEqual(set(groups[selected]), {"a", "b", "c"})
        np.testing.assert_array_equal(
            selected,
            _take_component_diverse(indices, groups, 3, seed=8),
        )

    def test_geographic_folds_keep_whole_components_and_all_classes(self):
        rows = []
        for region, center in enumerate(((0.0, 0.0), (5000.0, 0.0), (0.0, 5000.0))):
            for rare_class in (1, 2):
                for component in range(3):
                    group = f"r{region}-c{rare_class}-{component}"
                    base_x = center[0] + rare_class * 100 + component * 20
                    base_y = center[1] + rare_class * 50 + component * 20
                    rows.extend(
                        [
                            (base_x, base_y, rare_class, group),
                            (base_x + 5, base_y + 5, 0, group),
                        ]
                    )
        x = np.asarray([row[0] for row in rows])
        y = np.asarray([row[1] for row in rows])
        labels = np.asarray([row[2] for row in rows])
        groups = np.asarray([row[3] for row in rows])
        folds, selected, summary = _component_folds(
            x,
            y,
            labels,
            groups,
            split_regions=3,
            seed=42,
        )
        self.assertIn(selected, (0, 1, 2))
        self.assertTrue(summary[str(selected)]["eligible"])
        for group in np.unique(groups):
            self.assertEqual(len(np.unique(folds[groups == group])), 1)

    def test_component_bootstrap_resamples_structure_not_pixels(self):
        truth = []
        components = []
        for rare_class in (1, 2):
            for component in range(3):
                group = f"c{rare_class}-{component}"
                truth.extend([0, rare_class])
                components.extend([group, group])
        truth_array = np.asarray(truth)
        perfect = truth_array.copy()
        weak = np.zeros_like(truth_array)
        result = _cluster_bootstrap_pairs(
            truth_array,
            {"perfect": perfect, "weak": weak},
            np.asarray(components),
            (("perfect", "weak"),),
            samples=50,
            seed=12,
        )["perfect_minus_weak"]
        self.assertGreater(result["ci_95_low"], 0)
        self.assertEqual(
            result["resampling_unit"],
            "held-out-connected-component-within-rare-class",
        )

    def test_rare_corpus_loader_fails_closed_on_contract_drift(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "rare.npz"
            names = np.asarray(["depth_m"])
            metadata = {
                "schema_version": RARE_CORPUS_SCHEMA_VERSION,
                "class_names": list(RARE_CLASS_NAMES),
                "class_counts": [2, 2, 2],
            }
            np.savez_compressed(
                path,
                patches=np.ones((6, 1, 1, 9, 9), dtype=np.float32),
                x=np.arange(6, dtype=float),
                y=np.arange(6, dtype=float),
                labels=np.repeat(np.arange(3), 2),
                component_ids=np.asarray(["a", "a", "b", "c", "d", "e"]),
                geographic_fold=np.asarray([0, 0, 1, 1, 2, 2]),
                channel_names=names,
                metadata=json.dumps(metadata),
            )
            loaded = _load_rare_corpus(path)
            self.assertEqual(loaded[0].shape, (6, 1, 1, 9, 9))
            metadata["class_counts"] = [3, 1, 2]
            np.savez_compressed(
                path,
                patches=np.ones((6, 1, 1, 9, 9), dtype=np.float32),
                x=np.arange(6, dtype=float),
                y=np.arange(6, dtype=float),
                labels=np.repeat(np.arange(3), 2),
                component_ids=np.asarray(["a", "a", "b", "c", "d", "e"]),
                geographic_fold=np.asarray([0, 0, 1, 1, 2, 2]),
                channel_names=names,
                metadata=json.dumps(metadata),
            )
            with self.assertRaisesRegex(ValueError, "class counts"):
                _load_rare_corpus(path)


if __name__ == "__main__":
    unittest.main()
