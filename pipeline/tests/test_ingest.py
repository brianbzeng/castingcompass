import tempfile
import unittest
from pathlib import Path

import pandas as pd

from pipeline.contourcast.ingest import ingest_observations, load_model_observations


class ObservationIngestTests(unittest.TestCase):
    def test_aggregate_rows_are_not_promoted_to_points(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "raw.csv"
            output = root / "normalized.csv"
            pd.DataFrame(
                {
                    "event_id": ["a", "b"],
                    "species": ["rockfish", "rockfish"],
                    "catch_count": [2, 0],
                    "effort_hours": [1.5, 2.0],
                    "area_id": ["district-1", "district-1"],
                    "spatial_resolution": ["area", "area"],
                }
            ).to_csv(source, index=False)
            provenance = ingest_observations(
                source, output, source_id="psmfc_recfin"
            )
            normalized = pd.read_csv(output)
            self.assertEqual(provenance["terrain_model_eligible_rows"], 0)
            self.assertFalse(normalized["terrain_model_eligible"].any())
            with self.assertRaisesRegex(ValueError, "no point-resolution observations"):
                load_model_observations(output, "EPSG:32610")


if __name__ == "__main__":
    unittest.main()
