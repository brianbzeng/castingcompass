import tempfile
import unittest
from pathlib import Path

import numpy as np

from pipeline.contourcast.geo import GeoGrid
from pipeline.contourcast.patches import extract_patches, summarize_patches
from pipeline.contourcast.terrain import (
    TERRAIN_CHANNELS,
    derive_terrain_channels,
    load_terrain_stack,
    save_terrain_stack,
)


class TerrainTests(unittest.TestCase):
    def setUp(self):
        row, col = np.mgrid[0:25, 0:25]
        elevation = -(5 + 0.2 * col + 0.1 * row).astype(np.float32)
        self.grid = GeoGrid(
            elevation,
            "EPSG:32610",
            (500000, 10, 0, 4200000, 0, -10),
            "NAVD88",
            source_id="test",
        )

    def test_six_channels_and_slope(self):
        channels, metadata = derive_terrain_channels(self.grid, local_radius=2, broad_radius=4)
        self.assertEqual(channels.shape, (6, 25, 25))
        self.assertEqual(tuple(metadata["channels"]), TERRAIN_CHANNELS)
        expected_slope = np.degrees(np.arctan(np.hypot(0.2 / 10, 0.1 / 10)))
        self.assertAlmostEqual(float(channels[1, 12, 12]), float(expected_slope), places=4)

    def test_round_trip_and_patch_summary(self):
        channels, metadata = derive_terrain_channels(self.grid, local_radius=2, broad_radius=4)
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "terrain.npz"
            save_terrain_stack(path, channels, self.grid, metadata)
            loaded, reference, loaded_metadata = load_terrain_stack(path)
        np.testing.assert_allclose(loaded, channels)
        self.assertEqual(reference.crs, self.grid.crs)
        self.assertEqual(tuple(loaded_metadata["channels"]), TERRAIN_CHANNELS)
        patches = extract_patches(loaded, reference, [500125], [4199875], patch_size=7)
        features, names = summarize_patches(patches)
        self.assertEqual(patches.shape, (1, 6, 7, 7))
        self.assertEqual(features.shape, (1, 30))
        self.assertEqual(len(names), 30)


if __name__ == "__main__":
    unittest.main()
