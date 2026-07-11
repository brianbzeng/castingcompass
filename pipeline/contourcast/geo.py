"""Small geospatial data structures with explicit alignment validation.

The lightweight path deliberately avoids requiring GDAL. GeoTIFF loading is
available through the optional rasterio dependency in :mod:`ingest`, while the
canonical intermediate representation is a compressed NumPy archive.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence, Tuple

import numpy as np


class GridValidationError(ValueError):
    """Raised when spatial metadata would make a join or model unsafe."""


@dataclass(frozen=True)
class GeoGrid:
    """A north-up single-band raster and the metadata needed to interpret it.

    ``transform`` follows GDAL order: x origin, x pixel size, x rotation,
    y origin, y rotation, y pixel size. North-up rasters require zero rotation,
    positive x pixel size, and negative y pixel size.
    """

    values: np.ndarray
    crs: str
    transform: Tuple[float, float, float, float, float, float]
    vertical_datum: str
    horizontal_units: str = "metre"
    nodata: float | None = None
    source_id: str = "unknown"

    def __post_init__(self) -> None:
        object.__setattr__(self, "values", np.asarray(self.values, dtype=np.float32))
        object.__setattr__(self, "transform", tuple(float(v) for v in self.transform))
        self.validate()

    @property
    def height(self) -> int:
        return int(self.values.shape[0])

    @property
    def width(self) -> int:
        return int(self.values.shape[1])

    @property
    def pixel_size(self) -> Tuple[float, float]:
        return self.transform[1], abs(self.transform[5])

    @property
    def bounds(self) -> Tuple[float, float, float, float]:
        x0, dx, _, y0, _, dy = self.transform
        x1 = x0 + self.width * dx
        y1 = y0 + self.height * dy
        return min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)

    @property
    def valid_mask(self) -> np.ndarray:
        valid = np.isfinite(self.values)
        if self.nodata is not None and np.isfinite(self.nodata):
            valid &= ~np.isclose(self.values, self.nodata)
        return valid

    def validate(self) -> None:
        if self.values.ndim != 2:
            raise GridValidationError("GeoGrid values must be a 2-D raster")
        if min(self.values.shape) < 3:
            raise GridValidationError("GeoGrid must be at least 3 x 3 cells")
        if len(self.transform) != 6:
            raise GridValidationError("transform must contain six GDAL coefficients")
        _, dx, rx, _, ry, dy = self.transform
        if not np.isclose(rx, 0.0) or not np.isclose(ry, 0.0):
            raise GridValidationError("rotated rasters must be warped north-up before ingestion")
        if dx <= 0 or dy >= 0:
            raise GridValidationError("expected positive x and negative y pixel sizes")
        if not self.crs or self.crs.upper() in {"EPSG:4326", "WGS84"}:
            raise GridValidationError(
                "a projected CRS in metres is required; geographic degrees are unsafe for terrain derivatives"
            )
        if self.horizontal_units.lower() not in {"m", "meter", "meters", "metre", "metres"}:
            raise GridValidationError("horizontal_units must be metres")
        if not self.vertical_datum or self.vertical_datum.lower() in {"unknown", "unspecified"}:
            raise GridValidationError("vertical_datum must be explicit")
        if not np.any(self.valid_mask):
            raise GridValidationError("raster contains no valid cells")

    def xy_to_row_col(self, x: np.ndarray, y: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        x0, dx, _, y0, _, dy = self.transform
        cols = np.floor((np.asarray(x) - x0) / dx).astype(int)
        rows = np.floor((np.asarray(y) - y0) / dy).astype(int)
        return rows, cols

    def contains_xy(self, x: np.ndarray, y: np.ndarray) -> np.ndarray:
        rows, cols = self.xy_to_row_col(x, y)
        return (rows >= 0) & (rows < self.height) & (cols >= 0) & (cols < self.width)


def validate_alignment(reference: GeoGrid, candidate: GeoGrid, atol: float = 1e-6) -> None:
    """Require exact pixel alignment before channel stacking."""

    errors = []
    if reference.crs.strip().upper() != candidate.crs.strip().upper():
        errors.append(f"CRS differs ({reference.crs!r} vs {candidate.crs!r})")
    if reference.values.shape != candidate.values.shape:
        errors.append(f"shape differs ({reference.values.shape} vs {candidate.values.shape})")
    if not np.allclose(reference.transform, candidate.transform, atol=atol, rtol=0):
        errors.append("affine transforms differ")
    if reference.horizontal_units.lower() != candidate.horizontal_units.lower():
        errors.append("horizontal units differ")
    if errors:
        raise GridValidationError("unsafe raster alignment: " + "; ".join(errors))


def validate_observation_extent(grid: GeoGrid, x: Sequence[float], y: Sequence[float]) -> Mapping[str, float]:
    """Validate observation coordinates and report raster coverage."""

    xs = np.asarray(x, dtype=float)
    ys = np.asarray(y, dtype=float)
    if xs.shape != ys.shape or xs.ndim != 1:
        raise GridValidationError("x and y must be one-dimensional arrays of equal length")
    if len(xs) == 0:
        raise GridValidationError("no observations supplied")
    if not np.all(np.isfinite(xs)) or not np.all(np.isfinite(ys)):
        raise GridValidationError("observation coordinates must be finite")
    inside = grid.contains_xy(xs, ys)
    coverage = float(np.mean(inside))
    if not np.all(inside):
        outside = int(np.sum(~inside))
        raise GridValidationError(
            f"{outside}/{len(xs)} observations fall outside raster bounds {grid.bounds}"
        )
    return {"observations": float(len(xs)), "inside_fraction": coverage}


def verify_projected_crs(crs: str) -> Mapping[str, str | bool]:
    """Inspect a CRS with pyproj when available, otherwise return a conservative check.

    The fallback never claims datum-level verification; it only accepts strings that
    look projected and leaves a warning for provenance metadata.
    """

    try:
        from pyproj import CRS  # type: ignore
    except ImportError:
        upper = crs.upper()
        projected_hint = upper.startswith("EPSG:") and upper not in {"EPSG:4326", "EPSG:4269"}
        return {
            "verified": False,
            "projected": projected_hint,
            "unit": "unverified",
            "warning": "pyproj is not installed; CRS semantics were not independently verified",
        }

    parsed = CRS.from_user_input(crs)
    units = {axis.unit_name.lower() for axis in parsed.axis_info if axis.unit_name}
    projected = bool(parsed.is_projected)
    metre_units = bool(units & {"metre", "meter"})
    if not projected or not metre_units:
        raise GridValidationError(f"CRS {crs!r} must be projected with metre axes")
    return {
        "verified": True,
        "projected": projected,
        "unit": ", ".join(sorted(units)),
        "warning": "",
    }
