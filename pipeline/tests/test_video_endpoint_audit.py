import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

import numpy as np

from pipeline.contourcast.video_endpoint_audit import (
    VIDEO_CLASS_NAMES,
    _parse_dbf_required_fields,
    _parse_point_shapefile,
    _read_archive,
    _whole_group_partition_audit,
    audit_usgs_sf_video_endpoint,
)


def _sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _point_shapefile(points):
    xmin = min(point[0] for point in points)
    ymin = min(point[1] for point in points)
    xmax = max(point[0] for point in points)
    ymax = max(point[1] for point in points)
    records = []
    for index, (x, y) in enumerate(points, start=1):
        content = struct.pack("<idd", 1, x, y)
        records.append(struct.pack(">2i", index, len(content) // 2) + content)
    size = 100 + sum(map(len, records))
    header = bytearray(100)
    struct.pack_into(">i", header, 0, 9994)
    struct.pack_into(">i", header, 24, size // 2)
    struct.pack_into("<2i", header, 28, 1000, 1)
    struct.pack_into("<8d", header, 36, xmin, ymin, xmax, ymax, 0, 0, 0, 0)
    return bytes(header) + b"".join(records)


def _dbf(rows):
    fields = (("CLASS", 8), ("LINE", 8), ("TAPE", 8))
    header_length = 32 + 32 * len(fields) + 1
    record_length = 1 + sum(length for _, length in fields)
    header = bytearray(header_length)
    header[0] = 0x03
    struct.pack_into("<I", header, 4, len(rows))
    struct.pack_into("<2H", header, 8, header_length, record_length)
    for index, (name, length) in enumerate(fields):
        offset = 32 + index * 32
        encoded = name.encode("ascii")
        header[offset : offset + len(encoded)] = encoded
        header[offset + 11] = ord("C")
        header[offset + 16] = length
    header[-1] = 0x0D
    records = []
    for row in rows:
        record = bytearray(b" ")
        for value, (_, length) in zip(row, fields):
            record.extend(str(value).encode("ascii").ljust(length, b" "))
        records.append(bytes(record))
    return bytes(header) + b"".join(records) + b"\x1a"


def _archive(path, cruise, rows, *, extra=None):
    stem = f"{cruise.upper()}_video_observations"
    members = {
        f"{stem}.shp": _point_shapefile(
            [(-122.50 + index * 0.001, 37.75 + index * 0.001) for index in range(len(rows))]
        ),
        f"{stem}.dbf": _dbf(rows),
        f"{stem}.prj": b"WGS84",
    }
    if extra:
        members.update(extra)
    with ZipFile(path, "w", compression=ZIP_DEFLATED) as archive:
        for name, value in members.items():
            archive.writestr(name, value)
    specs = [
        {"path": name, "bytes": len(value), "sha256": _sha(value)}
        for name, value in members.items()
    ]
    return {
        "cruise_id": cruise,
        "dataset_stem": stem,
        "archive_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "record_count": len(rows),
        "members": specs,
    }


class VideoEndpointAuditTests(unittest.TestCase):
    def test_strict_point_and_dbf_parsers(self):
        points = [(-122.5, 37.7), (-122.4, 37.8)]
        parsed_points = _parse_point_shapefile(_point_shapefile(points))
        np.testing.assert_allclose(parsed_points, points)
        fields = _parse_dbf_required_fields(_dbf((("1", "26", "29"), ("4", "27", "30"))))
        self.assertEqual(fields["CLASS"], ["1", "4"])
        self.assertEqual(fields["LINE"], ["26", "27"])
        self.assertEqual(fields["TAPE"], ["29", "30"])

        invalid = bytearray(_point_shapefile(points))
        struct.pack_into(">i", invalid, 24, 1)
        with self.assertRaisesRegex(ValueError, "header"):
            _parse_point_shapefile(bytes(invalid))
        deleted = bytearray(_dbf((("1", "26", "29"),)))
        deleted[129] = ord("*")
        with self.assertRaisesRegex(ValueError, "deleted"):
            _parse_dbf_required_fields(bytes(deleted))

    def test_archive_inventory_is_exact_and_content_addressed(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive_path = Path(temporary) / "video.zip"
            spec = _archive(archive_path, "f208nc", (("1", "100", "74"),))
            members = _read_archive(archive_path, spec)
            self.assertEqual(set(members), {member["path"] for member in spec["members"]})

            bad_spec = json.loads(json.dumps(spec))
            bad_spec["members"][0]["sha256"] = "0" * 64
            with self.assertRaisesRegex(ValueError, "member checksum"):
                _read_archive(archive_path, bad_spec)
            unsafe = json.loads(json.dumps(spec))
            unsafe["members"][0]["path"] = "../escape.shp"
            with self.assertRaisesRegex(ValueError, "unsafe"):
                _read_archive(archive_path, unsafe)

    def test_whole_group_gate_refuses_adjacent_row_split(self):
        labels = np.asarray([0] * 6 + [0] * 15 + [0] * 60 + [1] + [0] * 13 + [1] * 21 + [2] * 50)
        groups = np.asarray(
            ["f208:100:74"] * 6
            + ["f208:101:74"] * 15
            + ["f307:26:29"] * 61
            + ["f307:27:30"] * 84
        )
        result = _whole_group_partition_audit(labels, groups, min_rows_per_class=16)
        self.assertEqual(result["candidate_partition_count"], 7)
        self.assertEqual(result["eligible_partition_count"], 0)
        self.assertFalse(result["adjacent_row_split_allowed"])

        supported_labels = np.tile(np.arange(len(VIDEO_CLASS_NAMES)), 32)
        supported_groups = np.asarray(["a"] * 48 + ["b"] * 48)
        supported = _whole_group_partition_audit(
            supported_labels, supported_groups, min_rows_per_class=16
        )
        self.assertEqual(supported["eligible_partition_count"], 1)

    def test_end_to_end_audit_writes_no_training_decision(self):
        try:
            import rasterio
            from rasterio.transform import from_origin
        except ImportError:
            self.skipTest("rasterio is not installed")
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bathymetry = root / "bathy.tif"
            with rasterio.open(
                bathymetry,
                "w",
                driver="GTiff",
                width=100,
                height=100,
                count=1,
                dtype="float32",
                crs="EPSG:4326",
                transform=from_origin(-123, 38, 0.01, 0.01),
            ) as dataset:
                dataset.write(np.ones((1, 100, 100), dtype=np.float32))
            layer_paths = {}
            backscatter_specs = []
            for survey in ("8101_2004", "8101_2007", "8101_2008", "7125_2006"):
                path = root / f"{survey}.tif"
                path.write_bytes(survey.encode("ascii"))
                name = f"backscatter_intensity_{survey}"
                layer_paths[name] = path
                backscatter_specs.append(
                    {"survey": survey, "geotiff_sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                )
            first_archive = root / "f208.zip"
            second_archive = root / "f307.zip"
            first_spec = _archive(
                first_archive,
                "f208nc",
                (("1", "100", "74"), ("1", "100", "74"), ("2", "100", "74")),
            )
            second_spec = _archive(
                second_archive,
                "f307nc",
                (("1", "27", "30"), ("3", "27", "30"), ("4", "27", "30")),
            )
            manifest = {
                "access": {
                    "bathymetry_geotiff_sha256": hashlib.sha256(bathymetry.read_bytes()).hexdigest(),
                    "backscatter_assets": backscatter_specs,
                    "video_observation_assets": [first_spec, second_spec],
                }
            }
            channels = tuple(
                item
                for name in layer_paths
                for item in (name, f"{name}__available")
            )
            patches = np.ones((6, 3, len(channels), 33, 33), dtype=np.float32)
            with (
                patch(
                    "pipeline.contourcast.video_endpoint_audit.get_source_manifest",
                    return_value=manifest,
                ),
                patch(
                    "pipeline.contourcast.video_endpoint_audit._extract_hybrid_patches_at_coordinates",
                    return_value=(
                        patches,
                        np.arange(6),
                        channels,
                        {"patch_design": {"radii_m": [32, 128, 512], "output_size": 33}},
                    ),
                ),
            ):
                result = audit_usgs_sf_video_endpoint(
                    bathymetry,
                    layer_paths,
                    {"f208nc": first_archive, "f307nc": second_archive},
                    root / "output",
                    min_group_class_rows=1,
                )
            metrics = json.loads(result["metrics"].read_text(encoding="utf-8"))
            run = json.loads(result["run_metadata"].read_text(encoding="utf-8"))
            self.assertFalse(metrics["decision"]["video_probe_admissible"])
            self.assertFalse(metrics["decision"]["model_training_run"])
            self.assertEqual(run["dataset_kind"], "official_video_endpoint_admissibility_audit")
            self.assertIsNone(run["target_taxon_id"])


if __name__ == "__main__":
    unittest.main()
