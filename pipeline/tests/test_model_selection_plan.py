import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from pipeline.contourcast.model_selection_plan import (
    CANDIDATE_FAMILIES,
    SCHEMA_VERSION,
    audit_model_selection_plan,
    canonical_plan_sha256,
    load_model_selection_plan,
    validate_model_selection_plan,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


class ModelSelectionPlanTests(unittest.TestCase):
    """Exercise the closed, model-neutral selection-plan contract."""

    def setUp(self):
        """Load one validated copy of the checked-in plan."""

        self.plan = load_model_selection_plan()

    def test_plan_is_deterministic_model_neutral_and_fully_closed(self):
        """Keep plan identity deterministic and execution authority closed."""

        validate_model_selection_plan(self.plan)
        self.assertEqual(
            canonical_plan_sha256(self.plan),
            canonical_plan_sha256(copy.deepcopy(self.plan)),
        )
        self.assertEqual(self.plan["candidate_families"], CANDIDATE_FAMILIES)
        self.assertEqual(
            [candidate["family"] for candidate in self.plan["candidate_families"]],
            [
                "naive",
                "regularized-linear",
                "generalized-additive",
                "bagged-tree",
                "boosted-tree",
                "spatial-hierarchical",
                "deep-neural",
                "hybrid-ensemble",
            ],
        )
        self.assertFalse(self.plan["selection_rule"]["deep_learning_is_default"])
        self.assertTrue(
            self.plan["selection_rule"][
                "prefer_simpler_when_statistically_indistinguishable"
            ]
        )
        self.assertTrue(
            all(
                value is False
                for key, value in self.plan["authority"].items()
                if key != "reason"
            )
        )

    def test_plan_rejects_authority_expansion_or_asymmetric_evidence(self):
        """Reject shortcuts that privilege a candidate or expose locked evidence."""

        mutations = []

        changed = copy.deepcopy(self.plan)
        changed["authority"]["benchmark_execution_authorized"] = True
        mutations.append(changed)

        changed = copy.deepcopy(self.plan)
        changed["common_evaluation"][
            "same_rows_folds_and_features_for_every_compatible_candidate"
        ] = False
        mutations.append(changed)

        changed = copy.deepcopy(self.plan)
        changed["common_evaluation"]["locked_test_single_use"] = False
        mutations.append(changed)

        changed = copy.deepcopy(self.plan)
        changed["common_evaluation"]["final_primary_metric_set_frozen"] = True
        mutations.append(changed)

        changed = copy.deepcopy(self.plan)
        changed["candidate_families"].pop(2)
        mutations.append(changed)

        changed = copy.deepcopy(self.plan)
        changed["candidate_families"][0], changed["candidate_families"][1] = (
            changed["candidate_families"][1],
            changed["candidate_families"][0],
        )
        mutations.append(changed)

        changed = copy.deepcopy(self.plan)
        changed["candidate_families"][6]["required_in_future_comparison"] = False
        mutations.append(changed)

        changed = copy.deepcopy(self.plan)
        changed["selection_rule"]["deep_learning_is_default"] = True
        mutations.append(changed)

        changed = copy.deepcopy(self.plan)
        changed["selection_rule"]["locked_test_can_tune_or_create_candidates"] = True
        mutations.append(changed)

        for index, mutation in enumerate(mutations):
            with self.subTest(index=index), self.assertRaises(ValueError):
                validate_model_selection_plan(mutation)

    def test_audit_receipt_is_minimized_and_non_authorizing(self):
        """Limit the plan receipt to inventory and closed-authority facts."""

        receipt = audit_model_selection_plan(self.plan)
        self.assertRegex(receipt["plan_sha256"], r"^[a-f0-9]{64}$")
        self.assertEqual(receipt["candidate_family_count"], 8)
        self.assertEqual(receipt["required_candidate_family_count"], 7)
        self.assertEqual(
            receipt["implementation_counts"],
            {
                "conditional-plan-only": 1,
                "implemented": 7,
            },
        )
        self.assertEqual(receipt["open_data_gate_count"], 12)
        self.assertFalse(receipt["benchmark_execution_authorized"])
        self.assertFalse(receipt["target_specific_training_authorized"])
        self.assertFalse(receipt["locked_test_access_authorized"])
        self.assertFalse(receipt["winner_selection_authorized"])
        self.assertFalse(receipt["score_or_serving_change_authorized"])
        self.assertNotIn("metrics", receipt)
        self.assertNotIn("winner", receipt)

    def test_audit_rejects_an_explicit_empty_mapping(self):
        """Reject an empty supplied plan instead of silently loading defaults."""

        with self.assertRaisesRegex(ValueError, "keys changed"):
            audit_model_selection_plan({})

    def test_schema_identity_and_cli_preserve_the_closed_boundary(self):
        """Keep schema and CLI validation equally non-authorizing."""

        schema = json.loads(
            (
                REPOSITORY_ROOT / "contracts" / "model-selection-plan.schema.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(schema["$id"], SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])

        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "receipt.json"
            result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pipeline.contourcast.model_selection_plan",
                    "audit",
                    "--output",
                    str(output),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            receipt = json.loads(output.read_text(encoding="utf-8"))
            self.assertFalse(receipt["benchmark_execution_authorized"])

            invalid = copy.deepcopy(self.plan)
            invalid["authority"]["locked_test_access_authorized"] = True
            invalid_path = Path(temporary) / "invalid.json"
            invalid_path.write_text(json.dumps(invalid), encoding="utf-8")
            invalid_result = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "pipeline.contourcast.model_selection_plan",
                    "audit",
                    "--plan",
                    str(invalid_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(invalid_result.returncode, 2)
            self.assertIn("authority", invalid_result.stderr)


if __name__ == "__main__":
    unittest.main()
