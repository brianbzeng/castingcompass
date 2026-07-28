import copy
import json
import unittest
from pathlib import Path

from pipeline.contourcast.model_input_contract import (
    CONTRACT_ID,
    REQUIRED_CANDIDATE_IDS,
    SAFETY_GATES,
    SCHEMA_VERSION,
    audit_model_input_contract,
    canonical_input_contract_sha256,
    classical_candidate_feature_order,
    classical_candidate_feature_order_sha256,
    load_model_input_contract,
    validate_model_input_contract,
)


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


class ModelInputContractTests(unittest.TestCase):
    """Exercise the pre-label, candidate-neutral model input boundary."""

    def setUp(self):
        """Load one validated copy of the checked-in contract."""

        self.contract = load_model_input_contract()

    def test_contract_is_deterministic_candidate_neutral_and_closed(self):
        """Bind every candidate to the same upstream evidence without authority."""

        validate_model_input_contract(self.contract)
        self.assertEqual(
            canonical_input_contract_sha256(self.contract),
            canonical_input_contract_sha256(copy.deepcopy(self.contract)),
        )
        self.assertEqual(
            self.contract["candidate_parity"]["required_candidate_ids"],
            REQUIRED_CANDIDATE_IDS,
        )
        self.assertTrue(
            all(
                value is False
                for value in self.contract["authority"].values()
            )
        )
        self.assertFalse(
            self.contract["candidate_parity"][
                "candidate_exclusive_upstream_source_allowed"
            ]
        )

    def test_contract_rejects_leakage_lookahead_or_candidate_asymmetry(self):
        """Reject common ways a future comparison could be biased."""

        mutations = []

        changed = copy.deepcopy(self.contract)
        changed["prediction_time_boundary"]["post_start_values_allowed"] = True
        mutations.append(changed)

        changed = copy.deepcopy(self.contract)
        changed["candidate_parity"]["same_eligible_rows"] = False
        mutations.append(changed)

        changed = copy.deepcopy(self.contract)
        changed["candidate_parity"]["required_candidate_ids"].pop()
        mutations.append(changed)

        changed = copy.deepcopy(self.contract)
        changed["prohibited_inputs"].remove("target-outcome")
        mutations.append(changed)

        changed = copy.deepcopy(self.contract)
        changed["safety_gate_boundary"]["candidate_inputs"].append(
            "current-water-quality-action"
        )
        mutations.append(changed)

        changed = copy.deepcopy(self.contract)
        changed["safety_gate_boundary"][
            "pollution_or_advisory_status_may_increase_opportunity"
        ] = True
        mutations.append(changed)

        changed = copy.deepcopy(self.contract)
        changed["terrain_view"]["radii_m"] = [64.0, 128.0, 1024.0]
        mutations.append(changed)

        changed = copy.deepcopy(self.contract)
        changed["authority"]["target_specific_training_authorized"] = True
        mutations.append(changed)

        for index, mutation in enumerate(mutations):
            with self.subTest(index=index), self.assertRaises(ValueError):
                validate_model_input_contract(mutation)

    def test_missingness_and_safety_are_separate_from_catch_optimization(self):
        """Keep abstention explicit and safety actions outside the catch model."""

        self.assertFalse(
            self.contract["missingness_and_abstention"][
                "invented_neutral_values_allowed"
            ]
        )
        self.assertEqual(
            self.contract["missingness_and_abstention"][
                "missing_terrain_or_subthreshold_coverage_action"
            ],
            "abstain",
        )
        self.assertEqual(
            self.contract["safety_gate_boundary"]["ordered_before_ranking"],
            SAFETY_GATES,
        )
        self.assertEqual(
            self.contract["safety_gate_boundary"]["candidate_inputs"],
            [],
        )

    def test_audit_receipt_is_minimized_and_non_authorizing(self):
        """Expose inventory counts and identity without model evidence."""

        receipt = audit_model_input_contract(self.contract)
        self.assertEqual(receipt["contract_id"], CONTRACT_ID)
        self.assertRegex(receipt["contract_sha256"], r"^[a-f0-9]{64}$")
        self.assertEqual(receipt["context_feature_count"], 39)
        self.assertEqual(receipt["terrain_channel_count"], 6)
        self.assertEqual(receipt["terrain_scale_count"], 3)
        self.assertEqual(receipt["classical_terrain_feature_count"], 90)
        self.assertEqual(receipt["classical_candidate_feature_count"], 129)
        self.assertEqual(len(classical_candidate_feature_order()), 129)
        self.assertEqual(
            receipt["classical_candidate_feature_order_sha256"],
            classical_candidate_feature_order_sha256(),
        )
        self.assertRegex(
            receipt["classical_candidate_feature_order_sha256"],
            r"^[a-f0-9]{64}$",
        )
        self.assertEqual(receipt["required_candidate_count"], 7)
        self.assertEqual(receipt["safety_gate_count"], 3)
        self.assertTrue(receipt["all_execution_authority_closed"])
        self.assertNotIn("metrics", receipt)
        self.assertNotIn("winner", receipt)

    def test_schema_identity_matches_contract(self):
        """Keep the JSON Schema identity aligned with the Python validator."""

        schema = json.loads(
            (
                REPOSITORY_ROOT / "contracts" / "model-input-contract.schema.json"
            ).read_text(encoding="utf-8")
        )
        self.assertEqual(schema["$id"], SCHEMA_VERSION)
        self.assertFalse(schema["additionalProperties"])
        self.assertEqual(
            schema["properties"]["contract_id"]["const"],
            CONTRACT_ID,
        )


if __name__ == "__main__":
    unittest.main()
