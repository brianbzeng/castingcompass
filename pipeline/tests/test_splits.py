import unittest

import numpy as np

from pipeline.contourcast.splits import spatial_block_folds


class SpatialSplitTests(unittest.TestCase):
    def test_every_row_is_held_out_once_and_buffered(self):
        rng = np.random.default_rng(7)
        centers = np.array([[0, 0], [4000, 0], [0, 4000], [4000, 4000]], dtype=float)
        xy = np.vstack([center + rng.normal(0, 350, size=(40, 2)) for center in centers])
        folds = spatial_block_folds(
            xy[:, 0], xy[:, 1], n_splits=4, buffer_m=250, random_state=3
        )
        held_out = np.concatenate([fold.test_indices for fold in folds])
        np.testing.assert_array_equal(np.sort(held_out), np.arange(len(xy)))
        for fold in folds:
            deltas = xy[fold.train_indices, None, :] - xy[fold.test_indices][None, :, :]
            distances = np.sqrt(np.sum(np.square(deltas), axis=2))
            self.assertGreaterEqual(float(np.min(distances)), 250.0)
            self.assertEqual(
                len(set(fold.train_indices) & set(fold.test_indices)),
                0,
            )


if __name__ == "__main__":
    unittest.main()
