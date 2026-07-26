import copy
import json
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest import mock

import numpy as np

from pipeline.contourcast.candidate_models import (
    CAPABILITY_STATUS,
    CLASSICAL_CANDIDATE_IDS,
    DEEP_CANDIDATE_ID,
    HYBRID_CANDIDATE_ID,
    audit_synthetic_candidate_capabilities,
    fit_predict_classical_candidate,
    synthetic_capability_scope,
    validate_registry_against_plan,
)
from pipeline.contourcast.model_selection_plan import load_model_selection_plan


class CandidateModelTests(unittest.TestCase):
    """Exercise the synthetic-only candidate adapter and authority boundary."""

    def setUp(self):
        """Build one deterministic fictional two-head training fixture."""

        generator = np.random.default_rng(20260726)
        self.train_features = generator.normal(size=(160, 6))
        self.test_features = generator.normal(size=(30, 6))
        logits = (
            0.3 * self.train_features[:, 0]
            - 0.2 * np.square(self.train_features[:, 1])
            + 0.1 * self.train_features[:, 2]
        )
        probability = 1.0 / (1.0 + np.exp(-logits))
        self.occurrence = generator.binomial(1, probability).astype(int)
        positive_cpue = np.exp(
            0.2
            + 0.25 * self.train_features[:, 0]
            + generator.normal(0.0, 0.1, size=len(self.train_features))
        )
        self.cpue = np.where(self.occurrence == 1, positive_cpue, 0.0)
        self.train_groups = np.asarray(
            [
                f"synthetic-region-{index % 4}"
                for index in range(len(self.train_features))
            ]
        )
        self.test_groups = np.asarray(
            [
                f"synthetic-region-{index % 5}"
                for index in range(len(self.test_features))
            ]
        )
        self.scope = synthetic_capability_scope()

    def fit(self, candidate_id, **overrides):
        """Fit one candidate while allowing a test to replace selected inputs."""

        values = {
            "train_features": self.train_features,
            "train_occurrence": self.occurrence,
            "train_cpue": self.cpue,
            "test_features": self.test_features,
            "train_group_ids": self.train_groups,
            "test_group_ids": self.test_groups,
            "scope": self.scope,
            "random_state": 73,
        }
        values.update(overrides)
        return fit_predict_classical_candidate(candidate_id, **values)

    def test_registry_matches_the_frozen_plan(self):
        """Require the callable registry to match the plan inventory exactly."""

        plan = validate_registry_against_plan()
        self.assertEqual(plan, load_model_selection_plan())
        self.assertEqual(
            tuple(
                candidate["candidate_id"]
                for candidate in plan["candidate_families"][:6]
            ),
            CLASSICAL_CANDIDATE_IDS,
        )

    def test_every_classical_adapter_is_deterministic_and_bounded(self):
        """Require stable, finite, bounded outputs from every classical family."""

        for candidate_id in CLASSICAL_CANDIDATE_IDS:
            with self.subTest(candidate_id=candidate_id):
                first = self.fit(candidate_id)
                second = self.fit(candidate_id)
                np.testing.assert_array_equal(
                    first.occurrence_probability,
                    second.occurrence_probability,
                )
                np.testing.assert_array_equal(
                    first.positive_catch_cpue,
                    second.positive_catch_cpue,
                )
                self.assertEqual(
                    first.occurrence_probability.shape,
                    (len(self.test_features),),
                )
                self.assertTrue(np.all(np.isfinite(first.occurrence_probability)))
                self.assertTrue(np.all(np.isfinite(first.positive_catch_cpue)))
                self.assertTrue(
                    np.all(
                        (first.occurrence_probability >= 0)
                        & (first.occurrence_probability <= 1)
                    )
                )
                self.assertTrue(np.all(first.positive_catch_cpue >= 0))

    def test_scope_refuses_real_targets_datasets_and_authority(self):
        """Reject any scope that resembles real data or execution authority."""

        rejected_scopes = [
            replace(self.scope, dataset_kind="eligible_observations"),
            replace(self.scope, target_taxon_id="174933"),
            replace(self.scope, benchmark_execution_authorized=True),
            replace(self.scope, locked_test_access_authorized=True),
            replace(self.scope, winner_selection_authorized=True),
            replace(self.scope, score_change_authorized=True),
            replace(self.scope, serving_change_authorized=True),
        ]
        for scope in rejected_scopes:
            with self.subTest(scope=scope), self.assertRaises(ValueError):
                self.fit(CLASSICAL_CANDIDATE_IDS[0], scope=scope)
        with self.assertRaises(TypeError):
            self.fit(CLASSICAL_CANDIDATE_IDS[0], scope={})

    def test_deep_hybrid_and_unknown_candidates_remain_closed(self):
        """Keep unwired and unknown candidate families unavailable."""

        for candidate_id in (DEEP_CANDIDATE_ID, HYBRID_CANDIDATE_ID, "invented-model"):
            with self.subTest(candidate_id=candidate_id), self.assertRaises(ValueError):
                self.fit(candidate_id)

    def test_invalid_features_labels_and_groups_fail_closed(self):
        """Reject malformed inputs before a candidate can fit."""

        invalid_cases = [
            {"train_features": np.asarray([1.0, 2.0])},
            {
                "test_features": np.column_stack(
                    [self.test_features, np.ones(len(self.test_features))]
                )
            },
            {
                "train_features": np.where(
                    np.arange(self.train_features.size).reshape(
                        self.train_features.shape
                    )
                    == 0,
                    np.nan,
                    self.train_features,
                )
            },
            {"train_occurrence": np.ones(len(self.train_features), dtype=int)},
            {
                "train_occurrence": np.where(
                    np.arange(len(self.train_features)) == 0,
                    1e300,
                    self.occurrence,
                )
            },
            {
                "train_cpue": np.where(
                    self.occurrence == 0,
                    1.0,
                    self.cpue,
                )
            },
            {"train_group_ids": self.train_groups[:-1]},
            {
                "train_group_ids": np.asarray(
                    [7] + list(self.train_groups[1:]),
                    dtype=object,
                )
            },
            {
                "test_group_ids": np.asarray(
                    [""] + list(self.test_groups[1:]),
                    dtype=object,
                )
            },
            {"random_state": 7.5},
            {"random_state": True},
        ]
        for overrides in invalid_cases:
            with (
                self.subTest(overrides=tuple(overrides)),
                self.assertRaises(ValueError),
            ):
                self.fit(CLASSICAL_CANDIDATE_IDS[0], **overrides)

        sparse_occurrence = np.zeros(len(self.train_features), dtype=int)
        sparse_occurrence[:7] = 1
        sparse_cpue = np.where(sparse_occurrence == 1, 1.0, 0.0)
        with self.assertRaisesRegex(ValueError, "at least 8 positive rows"):
            self.fit(
                "spline-gam-two-head",
                train_occurrence=sparse_occurrence,
                train_cpue=sparse_cpue,
            )
        with (
            mock.patch(
                "pipeline.contourcast.candidate_models.Ridge.fit",
                side_effect=ValueError("duplicate quantile knots"),
            ),
            self.assertRaisesRegex(
                ValueError, "adequate positive-row feature variation"
            ),
        ):
            self.fit("spline-gam-two-head")

    def test_spatial_adapter_partially_pools_known_groups_and_falls_back_for_unseen(
        self,
    ):
        """Shrink known group effects and use the global base for unseen groups."""

        generator = np.random.default_rng(11)
        paired_features = generator.normal(size=(40, 4))
        train_features = np.vstack([paired_features, paired_features])
        occurrence = np.asarray(
            [1] * 32 + [0] * 8 + [1] * 8 + [0] * 32,
            dtype=int,
        )
        cpue = np.concatenate(
            [
                np.where(occurrence[:40] == 1, 4.0, 0.0),
                np.where(occurrence[40:] == 1, 1.0, 0.0),
            ]
        )
        test_features = np.zeros((3, 4), dtype=float)
        predictions = fit_predict_classical_candidate(
            "spatial-hierarchical-two-head",
            train_features,
            occurrence,
            cpue,
            test_features,
            train_group_ids=np.asarray(["high"] * 40 + ["low"] * 40),
            test_group_ids=np.asarray(["high", "unseen", "low"]),
            scope=self.scope,
            random_state=9,
        )
        self.assertGreater(
            predictions.occurrence_probability[0],
            predictions.occurrence_probability[1],
        )
        self.assertGreater(
            predictions.occurrence_probability[1],
            predictions.occurrence_probability[2],
        )
        self.assertGreater(
            predictions.positive_catch_cpue[0],
            predictions.positive_catch_cpue[1],
        )
        self.assertGreater(
            predictions.positive_catch_cpue[1],
            predictions.positive_catch_cpue[2],
        )

    def test_registry_rejects_unfrozen_implementation_truth(self):
        """Reject a plan that understates or rewires implemented candidates."""

        plan = copy.deepcopy(load_model_selection_plan())
        plan["candidate_families"][2]["implementation_status"] = "planned"
        with self.assertRaisesRegex(ValueError, "not marked implemented"):
            validate_registry_against_plan(plan)

    def test_metric_free_audit_and_cli_preserve_the_closed_boundary(self):
        """Emit capability facts and identical CLI output, never model metrics."""

        receipt = audit_synthetic_candidate_capabilities()
        self.assertEqual(receipt["status"], CAPABILITY_STATUS)
        self.assertEqual(receipt["candidate_count"], len(CLASSICAL_CANDIDATE_IDS))
        self.assertTrue(
            all(check["deterministic"] for check in receipt["candidate_checks"])
        )
        self.assertFalse(receipt["benchmark_execution_authorized"])
        self.assertFalse(receipt["locked_test_access_authorized"])
        self.assertFalse(receipt["winner_selection_authorized"])
        self.assertFalse(receipt["score_or_serving_change_authorized"])
        self.assertNotIn("metrics", receipt)
        self.assertNotIn("winner", receipt)
        self.assertNotIn("scores", json.dumps(receipt).lower())

        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "candidate-capabilities.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pipeline.contourcast.candidate_models",
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

        isolated = subprocess.run(
            [
                sys.executable,
                "-c",
                (
                    "import sys; "
                    "from pipeline.contourcast.candidate_models import "
                    "audit_synthetic_candidate_capabilities; "
                    "audit_synthetic_candidate_capabilities(); "
                    "raise SystemExit("
                    "'pipeline.contourcast.deep_model' in sys.modules)"
                ),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(isolated.returncode, 0, isolated.stderr)


if __name__ == "__main__":
    unittest.main()
