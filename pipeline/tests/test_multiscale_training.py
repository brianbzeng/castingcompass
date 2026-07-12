import tempfile
import unittest
from pathlib import Path

import numpy as np

from pipeline.contourcast.geo import GeoGrid
from pipeline.contourcast.patches import (
    extract_multiscale_patches,
    load_patch_corpus,
    sample_water_centers,
    save_patch_corpus,
)
from pipeline.contourcast.structure import STRUCTURE_CHANNELS, derive_structure_channels
from pipeline.contourcast.training import normalize_patches, robust_patch_normalization
from pipeline.contourcast.training import build_geotiff_pretraining_corpus

try:
    import rasterio
    from rasterio.transform import from_origin
except ImportError:
    rasterio = None
    from_origin = None


class MultiScaleTrainingTests(unittest.TestCase):
    def setUp(self):
        rows, cols = np.mgrid[0:81, 0:81]
        elevation = -(4 + 0.01 * rows + 0.03 * cols + np.sin(cols / 4))
        self.grid = GeoGrid(
            elevation.astype(np.float32),
            "EPSG:32610",
            (500000, 5, 0, 4200000, 0, -5),
            "MLLW",
            source_id="multiscale-test",
        )
        self.channels, _ = derive_structure_channels(self.grid, broad_radius=6)

    def test_physical_scales_and_corpus_round_trip(self):
        x, y = sample_water_centers(
            self.channels, self.grid, stride_m=100, max_centers=12, seed=4
        )
        patches, metadata = extract_multiscale_patches(
            self.channels,
            self.grid,
            x,
            y,
            radii_m=(20, 60, 150),
            output_size=17,
            min_valid_fraction=1.0,
        )
        keep = np.asarray(metadata.pop("retained_mask"), dtype=bool)
        self.assertEqual(patches.shape, (int(np.sum(keep)), 3, 10, 17, 17))
        self.assertEqual(metadata["diameters_m"], [40.0, 120.0, 300.0])
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "corpus.npz"
            save_patch_corpus(
                path,
                patches,
                x[keep],
                y[keep],
                STRUCTURE_CHANNELS,
                metadata,
            )
            loaded, loaded_x, loaded_y, names, loaded_metadata = load_patch_corpus(path)
        np.testing.assert_allclose(loaded, patches)
        np.testing.assert_allclose(loaded_x, x[keep])
        np.testing.assert_allclose(loaded_y, y[keep])
        self.assertEqual(names, STRUCTURE_CHANNELS)
        self.assertIn("resampling_warning", loaded_metadata)

    def test_fold_local_robust_normalization(self):
        patches = np.arange(8 * 2 * 3 * 5 * 5, dtype=np.float32).reshape(8, 2, 3, 5, 5)
        train_indices = np.arange(6)
        median, scale = robust_patch_normalization(patches, train_indices)
        normalized = normalize_patches(patches, median, scale)
        self.assertEqual(median.shape, (3,))
        self.assertEqual(scale.shape, (3,))
        self.assertEqual(normalized.shape, patches.shape)
        training_values = normalized[train_indices]
        np.testing.assert_allclose(np.median(training_values, axis=(0, 1, 3, 4)), 0, atol=1e-6)

    @unittest.skipIf(rasterio is None, "rasterio is optional")
    def test_windowed_geotiff_corpus_uses_full_source_contract(self):
        rows, cols = np.mgrid[0:256, 0:256]
        elevation = -(5 + 0.02 * rows + np.sin(cols / 8)).astype(np.float32)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "source.tif"
            output = root / "corpus.npz"
            with rasterio.open(
                source,
                "w",
                driver="GTiff",
                height=256,
                width=256,
                count=1,
                dtype="float32",
                crs="EPSG:32610",
                transform=from_origin(500000, 4200000, 2, 2),
                nodata=-9999,
            ) as dataset:
                dataset.write(elevation, 1)
            report = build_geotiff_pretraining_corpus(
                source,
                output,
                source_id="usgs_sf_state_waters_2m",
                vertical_datum="NAVD88",
                radii_m=(8, 16, 32),
                output_size=9,
                stride_m=16,
                max_centers=16,
                min_valid_fraction=1.0,
                local_radius=2,
                broad_radius=4,
                relief_radius=2,
                horizontal_accuracy_m=2,
                tile_size=128,
                seed=7,
            )
            patches, x, y, names, metadata = load_patch_corpus(output)
        self.assertEqual(report["patches"], 16)
        self.assertEqual(patches.shape, (16, 3, 10, 9, 9))
        self.assertEqual(len(x), len(y))
        self.assertEqual(names, STRUCTURE_CHANNELS)
        self.assertEqual(metadata["source_shape"], [256, 256])
        self.assertGreaterEqual(metadata["sampling"]["tiles_processed"], 1)


if __name__ == "__main__":
    unittest.main()
