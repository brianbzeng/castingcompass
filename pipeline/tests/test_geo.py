import unittest

import numpy as np

from pipeline.contourcast.geo import (
    GeoGrid,
    GridValidationError,
    validate_alignment,
    validate_observation_extent,
)


def grid(transform=(500000, 10, 0, 4200000, 0, -10), crs="EPSG:32610"):
    return GeoGrid(
        np.ones((12, 12), dtype=np.float32) * -5,
        crs,
        transform,
        "NAVD88",
        source_id="test",
    )


class GeoValidationTests(unittest.TestCase):
    def test_rejects_geographic_degrees(self):
        with self.assertRaisesRegex(GridValidationError, "projected CRS"):
            grid(crs="EPSG:4326")

    def test_alignment_requires_same_transform(self):
        reference = grid()
        shifted = grid(transform=(500001, 10, 0, 4200000, 0, -10))
        with self.assertRaisesRegex(GridValidationError, "transforms differ"):
            validate_alignment(reference, shifted)

    def test_observation_extent_rejects_outside_points(self):
        reference = grid()
        with self.assertRaisesRegex(GridValidationError, "outside raster bounds"):
            validate_observation_extent(reference, [500005, 999999], [4199995, 4199995])


if __name__ == "__main__":
    unittest.main()
