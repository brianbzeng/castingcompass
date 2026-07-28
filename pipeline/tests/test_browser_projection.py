import json
import unittest
from pathlib import Path

from scripts.generate_browser_projection import (
    CONDITION_FIELDS,
    compact_browser_payload,
)


class BrowserProjectionTests(unittest.TestCase):
    def test_committed_projection_is_deterministic_and_browser_minimized(self) -> None:
        root = Path(__file__).resolve().parents[2]
        canonical = json.loads(
            (root / "public" / "data" / "opportunities.json").read_text(encoding="utf-8")
        )
        committed = json.loads(
            (root / "public" / "data" / "opportunities-browser.json").read_text(
                encoding="utf-8"
            )
        )
        projected = compact_browser_payload(canonical)
        self.assertEqual(committed, projected)
        self.assertEqual(len(projected["windows"]), len(canonical["windows"]))
        self.assertEqual(
            {window["id"] for window in projected["windows"]},
            {window["id"] for window in canonical["windows"]},
        )
        self.assertTrue(
            all(
                set(window["conditions"]).issubset(CONDITION_FIELDS)
                for window in projected["windows"]
            )
        )
        self.assertTrue(
            all(window["explanationFactors"] == [] for window in projected["windows"])
        )
        self.assertNotIn("scoring_system_sha256", projected["windows"][0])


if __name__ == "__main__":
    unittest.main()
