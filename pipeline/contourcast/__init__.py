"""Reproducible bathymetry and recreational-fishing ML utilities."""

from .geo import GeoGrid, GridValidationError
from .terrain import TERRAIN_CHANNELS, derive_terrain_channels

__all__ = [
    "GeoGrid",
    "GridValidationError",
    "TERRAIN_CHANNELS",
    "derive_terrain_channels",
]

__version__ = "0.1.0"
