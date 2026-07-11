import json
import tempfile
import unittest
from pathlib import Path

from pipeline.contourcast.workflow import run_smoke_workflow


class SmokeWorkflowTests(unittest.TestCase):
    def test_synthetic_end_to_end_is_labeled(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "smoke"
            artifacts = run_smoke_workflow(output, seed=12, observations=160)
            with Path(artifacts["metrics"]).open(encoding="utf-8") as handle:
                metrics = json.load(handle)
            with Path(artifacts["run_metadata"]).open(encoding="utf-8") as handle:
                metadata = json.load(handle)
        self.assertEqual(metrics["dataset_kind"], "synthetic_fixture")
        self.assertIn("not evidence of real-world", metrics["result_scope"])
        self.assertEqual(metadata["status"], "completed")
        self.assertEqual(metadata["dataset_kind"], "synthetic_fixture")
        self.assertTrue(metadata["experiment_version"].startswith("exp-"))
        self.assertTrue(metadata["model_version"].startswith("model-"))


if __name__ == "__main__":
    unittest.main()
