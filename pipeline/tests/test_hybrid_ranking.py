import unittest

from pipeline.contourcast.hybrid_ranking import (
    ROOT,
    TARGET_TAXON_IDS,
    build_evaluation_audit,
    load_profiles,
    rank_windows,
)


class HybridRankingTests(unittest.TestCase):
    def test_profiles_are_closed_versioned_and_keep_rockfish_deferred(self) -> None:
        document = load_profiles()
        self.assertEqual(tuple(document["profiles"]), TARGET_TAXON_IDS)
        self.assertEqual(document["training_status"], "expert-configured-untrained")
        self.assertEqual(document["rockfish_status"], "deferred-behaviorally-heterogeneous")
        self.assertEqual(
            document["profiles"]["surfperch"]["target_kind"],
            "family-profile",
        )
        self.assertEqual(
            len(set(document["profiles"]["jacksmelt"]["seasonality_by_month"])),
            1,
            "jacksmelt month stays neutral where no defensible seasonal curve exists",
        )

    def test_shared_ranker_is_deterministic_bounded_and_target_specific(self) -> None:
        sites = [
            {
                "id": "beach",
                "type": "Beach",
                "region": "Coast",
                "habitatPrior": 70,
                "structureTags": ["sand-trough", "sand-bar"],
                "castingZone": {"exposure": "open-coast"},
            },
            {
                "id": "pier",
                "type": "Pier",
                "region": "Bay",
                "habitatPrior": 55,
                "structureTags": ["pier-pilings", "current-seam"],
                "castingZone": {"exposure": "bay"},
            },
        ]
        windows = [
            {
                "id": "beach-window",
                "siteId": "beach",
                "start": "2026-10-01T08:00:00Z",
                "dynamicScore": 65,
                "fishabilityScore": 80,
                "conditions": {"tideStage": "rising"},
            },
            {
                "id": "pier-window",
                "siteId": "pier",
                "start": "2026-10-01T08:00:00Z",
                "dynamicScore": 65,
                "fishabilityScore": 80,
                "conditions": {"tideStage": "rising"},
            },
        ]
        surfperch = rank_windows(windows, sites, "surfperch")
        jacksmelt = rank_windows(windows, sites, "jacksmelt")
        self.assertEqual(surfperch, rank_windows(windows, sites, "surfperch"))
        self.assertTrue(all(0 <= item["score"] <= 100 for item in surfperch + jacksmelt))
        self.assertGreater(surfperch[0]["score"], surfperch[1]["score"])
        self.assertGreater(jacksmelt[1]["score"], jacksmelt[0]["score"])

    def test_audit_reports_null_skill_metrics_without_eligible_labels(self) -> None:
        audit = build_evaluation_audit(
            ROOT / "data" / "sites.json",
            ROOT / "public" / "data" / "opportunities.json",
        )
        self.assertEqual(
            audit["evaluation_status"],
            "implementation-evaluated-predictive-skill-not-estimable",
        )
        self.assertEqual(audit["available_evidence"]["eligible_supervised_observation_rows"], 0)
        self.assertIsNone(audit["ranking_metrics_when_identifiable"]["ndcg_at_10"])
        self.assertEqual(set(audit["ranking_smoke"]), set(TARGET_TAXON_IDS))
        self.assertEqual(audit["rockfish"]["status"], "deferred")


if __name__ == "__main__":
    unittest.main()
