import json
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

import numpy as np

from pipeline.contourcast import deep_model
from pipeline.contourcast.deep_candidate import (
    DEEP_CAPABILITY_STATUS,
    audit_synthetic_deep_candidate_capability,
    fit_predict_deep_candidate,
)
from pipeline.contourcast.candidate_models import synthetic_capability_scope
from pipeline.contourcast.model_input_contract import (
    deep_context_feature_order,
    deep_context_feature_order_sha256,
)


class DeepCandidateTests(unittest.TestCase):
    """Exercise the synthetic-only masked site-window adapter."""

    def setUp(self):
        """Build fictional single-scale bags with deliberately masked padding."""

        generator = np.random.default_rng(20260726)
        self.train_bags = generator.normal(size=(16, 3, 4, 7, 7)).astype(np.float32)
        self.test_bags = generator.normal(size=(5, 3, 4, 7, 7)).astype(np.float32)
        context_columns = len(deep_context_feature_order())
        self.train_context = generator.normal(
            size=(16, context_columns)
        ).astype(np.float32)
        self.test_context = generator.normal(
            size=(5, context_columns)
        ).astype(np.float32)
        self.train_mask = np.ones((16, 3), dtype=bool)
        self.test_mask = np.ones((5, 3), dtype=bool)
        self.train_mask[::3, -1] = False
        self.test_mask[::2, -1] = False
        self.train_bags[~self.train_mask] = 500.0
        self.test_bags[~self.test_mask] = -500.0
        self.occurrence = (np.arange(16) % 2).astype(int)
        positive_cpue = np.exp(
            0.2
            + 0.1
            * np.mean(
                np.where(
                    self.train_mask[:, :, None, None, None],
                    self.train_bags,
                    0.0,
                ),
                axis=(1, 2, 3, 4),
            )
        )
        self.cpue = np.where(self.occurrence == 1, positive_cpue, 0.0)
        self.scope = synthetic_capability_scope()

    def fit(self, **overrides):
        """Fit the deep adapter while replacing selected test inputs."""

        values = {
            "train_patch_bags": self.train_bags,
            "train_context_features": self.train_context,
            "train_occurrence": self.occurrence,
            "train_cpue": self.cpue,
            "test_patch_bags": self.test_bags,
            "test_context_features": self.test_context,
            "train_patch_mask": self.train_mask,
            "test_patch_mask": self.test_mask,
            "scope": self.scope,
            "random_state": 73,
        }
        values.update(overrides)
        return fit_predict_deep_candidate(**values)

    def test_scope_refuses_real_data_and_every_authority_expansion(self):
        """Reject real targets, datasets, and all execution authority first."""

        rejected_scopes = [
            replace(self.scope, dataset_kind="eligible_observations"),
            replace(self.scope, target_taxon_id="california-halibut"),
            replace(self.scope, target_specific_training_authorized=True),
            replace(self.scope, benchmark_execution_authorized=True),
            replace(self.scope, locked_test_access_authorized=True),
            replace(self.scope, winner_selection_authorized=True),
            replace(self.scope, score_change_authorized=True),
            replace(self.scope, serving_change_authorized=True),
            replace(self.scope, deployment_authorized=True),
        ]
        for scope in rejected_scopes:
            with self.subTest(scope=scope), self.assertRaises(ValueError):
                self.fit(scope=scope)

    def test_invalid_patch_bags_masks_and_labels_fail_before_training(self):
        """Reject malformed patch contracts before constructing a model."""

        invalid_cases = [
            {"train_patch_bags": self.train_bags[:, 0]},
            {"train_patch_bags": self.train_bags[:, :1]},
            {
                "train_patch_bags": np.zeros(
                    (257, 2, 1, 5, 5),
                    dtype=np.float32,
                )
            },
            {
                "train_patch_bags": np.zeros(
                    (16, 17, 1, 5, 5),
                    dtype=np.float32,
                )
            },
            {
                "train_patch_bags": np.zeros(
                    (16, 2, 5, 1, 5, 5),
                    dtype=np.float32,
                )
            },
            {
                "train_patch_bags": np.zeros(
                    (16, 2, 33, 5, 5),
                    dtype=np.float32,
                )
            },
            {
                "train_patch_bags": np.zeros(
                    (16, 2, 1, 66, 5),
                    dtype=np.float32,
                )
            },
            {
                "train_patch_bags": np.broadcast_to(
                    np.float32(0),
                    (256, 16, 4, 1, 16, 16),
                )
            },
            {
                "train_patch_bags": np.full(
                    self.train_bags.shape,
                    "not-numeric",
                    dtype=object,
                )
            },
            {
                "train_patch_bags": np.full(
                    self.train_bags.shape,
                    1e300,
                    dtype=np.float64,
                )
            },
            {
                "train_patch_bags": np.full(
                    self.train_bags.shape,
                    np.finfo(np.float32).max,
                    dtype=np.float32,
                ),
                "test_patch_bags": np.full(
                    self.test_bags.shape,
                    -np.finfo(np.float32).max,
                    dtype=np.float32,
                ),
            },
            {
                "train_patch_bags": np.where(
                    np.arange(self.train_bags.size).reshape(self.train_bags.shape) == 0,
                    np.nan,
                    self.train_bags,
                )
            },
            {"test_patch_bags": self.test_bags[:, :, :3]},
            {
                "train_patch_mask": self.train_mask.astype(np.int8),
            },
            {
                "train_context_features": self.train_context[:, :-1],
            },
            {
                "test_context_features": self.test_context[:-1],
            },
            {
                "test_context_features": np.full(
                    self.test_context.shape,
                    np.nan,
                ),
            },
            {
                "test_patch_mask": self.test_mask[:, :-1],
            },
            {
                "test_patch_mask": np.zeros_like(self.test_mask),
            },
            {
                "train_occurrence": np.ones(len(self.train_bags), dtype=int),
            },
            {
                "random_state": 4.5,
            },
        ]
        for overrides in invalid_cases:
            with (
                self.subTest(overrides=tuple(overrides)),
                self.assertRaises(ValueError),
            ):
                self.fit(**overrides)

    def test_dependency_guard_or_deterministic_masked_predictions(self):
        """Require PyTorch or stable bounded outputs unaffected by padding."""

        if deep_model.torch is None:
            with self.assertRaisesRegex(RuntimeError, "PyTorch is required"):
                self.fit()
            return
        first = self.fit()
        changed_train = self.train_bags.copy()
        changed_test = self.test_bags.copy()
        changed_train[~self.train_mask] = -np.finfo(np.float32).max
        changed_test[~self.test_mask] = np.finfo(np.float32).max
        second = self.fit(
            train_patch_bags=changed_train,
            test_patch_bags=changed_test,
        )
        np.testing.assert_array_equal(
            first.occurrence_probability,
            second.occurrence_probability,
        )
        np.testing.assert_array_equal(
            first.positive_catch_cpue,
            second.positive_catch_cpue,
        )
        self.assertEqual(first.occurrence_probability.shape, (5,))
        self.assertTrue(np.all(np.isfinite(first.occurrence_probability)))
        self.assertTrue(np.all(np.isfinite(first.positive_catch_cpue)))
        self.assertTrue(
            np.all(
                (first.occurrence_probability >= 0)
                & (first.occurrence_probability <= 1)
            )
        )
        self.assertTrue(np.all(first.positive_catch_cpue >= 0))

        changed_context = self.fit(
            test_context_features=self.test_context + np.float32(3.0),
        )
        self.assertFalse(
            np.array_equal(
                first.occurrence_probability,
                changed_context.occurrence_probability,
            )
        )

    @unittest.skipIf(deep_model.torch is None, "PyTorch is optional")
    def test_metric_free_multiscale_audit_and_cli(self):
        """Emit deterministic multiscale capability facts without metrics."""

        for overrides in (
            {"train_rows": True},
            {"train_rows": 15},
            {"train_rows": 257},
            {"test_rows": 3},
            {"test_rows": 257},
        ):
            with (
                self.subTest(overrides=overrides),
                self.assertRaises(ValueError),
            ):
                audit_synthetic_deep_candidate_capability(**overrides)

        receipt = audit_synthetic_deep_candidate_capability()
        self.assertEqual(receipt["status"], DEEP_CAPABILITY_STATUS)
        self.assertEqual(receipt["train_rows"], 16)
        self.assertEqual(receipt["test_rows"], 4)
        self.assertEqual(receipt["scales"], 3)
        self.assertEqual(receipt["channels"], 6)
        self.assertEqual(receipt["patch_size"], [33, 33])
        self.assertEqual(
            receipt["shared_context_feature_count"],
            len(deep_context_feature_order()),
        )
        self.assertEqual(
            receipt["shared_context_feature_order_sha256"],
            deep_context_feature_order_sha256(),
        )
        self.assertEqual(
            receipt["context_normalization"],
            "training-fold-only-standardization",
        )
        self.assertTrue(receipt["deterministic"])
        self.assertTrue(receipt["finite"])
        self.assertTrue(receipt["probability_bounded"])
        self.assertTrue(receipt["cpue_nonnegative"])
        self.assertFalse(receipt["target_specific_training_authorized"])
        self.assertFalse(receipt["benchmark_execution_authorized"])
        self.assertFalse(receipt["locked_test_access_authorized"])
        self.assertFalse(receipt["winner_selection_authorized"])
        self.assertFalse(receipt["score_or_serving_change_authorized"])
        self.assertFalse(receipt["deployment_authorized"])
        self.assertNotIn("metrics", receipt)
        self.assertNotIn("winner", receipt)

        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "deep-capability.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pipeline.contourcast.deep_candidate",
                    "--output",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(
                json.loads(output.read_text(encoding="utf-8")),
                receipt,
            )

            rejected = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pipeline.contourcast.deep_candidate",
                    "--train-rows",
                    "257",
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(rejected.returncode, 0)
            self.assertIn("training rows must be within", rejected.stderr)


if __name__ == "__main__":
    unittest.main()
