import unittest

import numpy as np

from pipeline.contourcast.evaluation import ndcg_at_k, score_predictions, spearman_rank


class RankingMetricTests(unittest.TestCase):
    def test_perfect_ranking_scores_one(self):
        target = np.array([0.0, 1.0, 2.0, 4.0])
        prediction = np.array([0.1, 0.3, 0.5, 0.9])
        self.assertAlmostEqual(spearman_rank(target, prediction), 1.0)
        self.assertAlmostEqual(ndcg_at_k(target, prediction, k=4), 1.0)

    def test_score_contract_includes_bootstrap_ranking_intervals(self):
        occurrence = np.array([0, 1, 0, 1, 1, 0])
        cpue = np.array([0.0, 0.5, 0.0, 1.3, 2.0, 0.0])
        probability = np.array([0.1, 0.55, 0.3, 0.7, 0.9, 0.2])
        predicted_cpue = np.array([0.1, 0.7, 0.2, 1.0, 1.8, 0.1])
        metrics = score_predictions(
            occurrence,
            cpue,
            probability,
            predicted_cpue,
            bootstrap_samples=30,
            random_state=7,
        )
        self.assertIn("spearman_rank", metrics)
        self.assertIn("ndcg_at_10", metrics)
        self.assertIsNotNone(metrics["spearman_rank_ci_95_low"])
        self.assertIsNotNone(metrics["ndcg_at_10_ci_95_high"])


if __name__ == "__main__":
    unittest.main()
