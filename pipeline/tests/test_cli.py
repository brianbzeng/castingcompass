from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from pipeline.contourcast.cli import main


class CliReceiptTests(unittest.TestCase):
    def test_finalization_stdout_is_an_allowlisted_receipt(self) -> None:
        private_result = {
            "manifest_path": "/private/result.json",
            "manifest_role": "finalization",
            "manifest_sha256": "private-manifest-digest",
            "census_export_canonical_sha256": "private-census-digest",
            "eligible_source_count": 42,
        }
        output = io.StringIO()
        with patch(
            "pipeline.contourcast.cli.seal_validation_finalization",
            return_value=private_result,
        ), redirect_stdout(output):
            status = main(
                [
                    "seal-validation-finalization",
                    "--protocol",
                    "protocol.json",
                    "--label-free-evidence",
                    "label-free.json",
                    "--opportunity-ledger",
                    "opportunity.json",
                    "--predictions",
                    "predictions.json",
                    "--census-export",
                    "private-census.json",
                    "--manifest-chain",
                    "activation.json",
                    "split.json",
                    "--output",
                    "finalization.json",
                ]
            )

        self.assertEqual(status, 0)
        self.assertEqual(
            json.loads(output.getvalue()),
            {
                "status": "sealed",
                "manifest_path": "finalization.json",
                "manifest_role": "finalization",
            },
        )
        for private_value in private_result.values():
            if isinstance(private_value, str) and private_value.startswith("private-"):
                self.assertNotIn(private_value, output.getvalue())


if __name__ == "__main__":
    unittest.main()
