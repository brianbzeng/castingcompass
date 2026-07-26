"""Exploratory, fail-closed DS182 dBASE sediment support audit.

This module is deliberately separate from the failed PAC_EXT.txt experiment.
It reads only the exact companion dBASE representation frozen by the v1 DBF
protocol and stops before raster pixels, patch construction, or model fitting.
"""

from __future__ import annotations

import math
import re
import struct
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Dict, Mapping, Sequence

from .metadata import (
    build_run_record,
    sha256_file,
    verify_run_record_integrity,
    write_json,
)
from .sediment_endpoint_audit import (
    DS182_SOURCE_ID,
    IDENTIFIER_PATTERN,
    _anchor_flags,
    _optional_measurement,
    _parse_source_table,
    _read_exact_archive,
    _required_decimal,
    _support_summary,
    _verify_reference_raster,
    _whole_source_partition_audit,
)
from .sources import assert_source_operation, get_source_manifest


SEDIMENT_DBF_SUPPORT_SCHEMA_VERSION = (
    "castingcompass.usgs-ds182-sediment-dbf-support/1.0.0"
)
DBF_MEMBER = "pac_ext.dbf"
POINT_MEMBER = "pac_ext.shp"
MAX_EXHAUSTIVE_SOURCE_GROUPS = 14
DBF_HEADER_LENGTH = 1057
DBF_RECORD_LENGTH = 265

DBF_FIELD_SPECS = (
    ("LATITUDE", "N", 13, 5, "Latitude"),
    ("LONGITUDE", "N", 15, 5, "Longitude"),
    ("WATERDEPTH", "N", 4, 0, "WaterDepth"),
    ("SAMPLETOP", "N", 6, 2, "SampleTop"),
    ("SAMPLEBASE", "N", 6, 2, "SampleBase"),
    ("SITENAME", "C", 35, 0, "SiteName"),
    ("DATASETKEY", "N", 3, 0, "DataSetKey"),
    ("SITEKEY", "N", 5, 0, "SiteKey"),
    ("SAMPLEKEY", "N", 5, 0, "SampleKey"),
    ("SAMPLER", "C", 35, 0, "Sampler"),
    ("DATATYPES", "C", 19, 0, "DataTypes"),
    ("GRAVEL", "N", 3, 0, "Gravel"),
    ("SAND", "N", 3, 0, "Sand"),
    ("MUD", "N", 3, 0, "Mud"),
    ("CLAY", "N", 3, 0, "Clay"),
    ("GRAINSIZE", "N", 7, 1, "Grainsize"),
    ("SORTING", "N", 9, 2, "Sorting"),
    ("SEABEDCLS", "C", 2, 0, "SeabedCls"),
    ("CLSMSHP", "N", 3, 0, "ClsMshp"),
    ("FOLKCODE", "C", 5, 0, "FolkCode"),
    ("SHEPARDCOD", "C", 17, 0, "ShepardCode"),
    ("ROCKMSHP", "N", 3, 0, "RockMshp"),
    ("WEEDMSHP", "N", 3, 0, "WeedMshp"),
    ("CARBONATE", "N", 3, 0, "Carbonate"),
    ("MUNSLCODE", "C", 7, 0, "MunslCode"),
    ("ORGCARBON", "N", 5, 1, "OrgCarbon"),
    ("LGSHEARSTR", "N", 7, 1, "LgShearStr"),
    ("POROSITY", "N", 3, 0, "Porosity"),
    ("PWAVEVEL", "N", 3, 0, "PWaveVel"),
    ("ROUGHNESS", "C", 4, 0, "Roughness"),
    ("LGCRSHST", "N", 3, 0, "LgCrShSt"),
    ("SAMPLEPHAS", "C", 22, 0, "SamplePhase"),
)

_NUMERIC_PATTERN = re.compile(r"^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$")


def _parse_dbf_descriptor(data: bytes) -> tuple[str, str, int, int]:
    raw_name = data[:11]
    name_bytes, separator, padding = raw_name.partition(b"\0")
    if separator and any(padding):
        raise ValueError("DS182 dBASE field name has nonzero padding")
    try:
        name = name_bytes.decode("ascii")
        field_type = chr(data[11])
    except (UnicodeDecodeError, ValueError) as error:
        raise ValueError("DS182 dBASE field descriptor is not ASCII") from error
    return name, field_type, data[16], data[17]


def _decode_character_field(raw: bytes, *, field: str, record: int) -> str:
    if any(value < 0x20 or value > 0x7E for value in raw):
        raise ValueError(
            f"DS182 dBASE record {record} field {field} is not printable ASCII"
        )
    return raw.decode("ascii").rstrip(" ")


def _decode_numeric_field(
    raw: bytes,
    *,
    field: str,
    decimals: int,
    record: int,
) -> str:
    if any(value not in b" 0123456789+-." for value in raw):
        raise ValueError(
            f"DS182 dBASE record {record} field {field} has invalid numeric bytes"
        )
    value = raw.decode("ascii").strip(" ")
    if value == "":
        return ""
    if _NUMERIC_PATTERN.fullmatch(value) is None:
        raise ValueError(
            f"DS182 dBASE record {record} field {field} is not an ordinary decimal"
        )
    fractional_digits = len(value.partition(".")[2]) if "." in value else 0
    if fractional_digits > decimals:
        raise ValueError(
            f"DS182 dBASE record {record} field {field} exceeds declared precision"
        )
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise ValueError(
            f"DS182 dBASE record {record} field {field} is malformed"
        ) from error
    if not parsed.is_finite():
        raise ValueError(
            f"DS182 dBASE record {record} field {field} is non-finite"
        )
    return value


def _parse_exact_dbf(data: bytes) -> tuple[list[dict[str, str]], Mapping[str, Any]]:
    """Parse the one frozen fixed-width dBASE III representation exactly."""

    if len(data) < DBF_HEADER_LENGTH + 1 or data[0] != 0x03:
        raise ValueError("DS182 dBASE member is not the frozen dBASE III representation")
    record_count = struct.unpack_from("<I", data, 4)[0]
    header_length, record_length = struct.unpack_from("<2H", data, 8)
    if header_length != DBF_HEADER_LENGTH or record_length != DBF_RECORD_LENGTH:
        raise ValueError("DS182 dBASE header or record length disagrees with protocol")
    expected_length = header_length + record_count * record_length + 1
    if len(data) != expected_length or data[-1] != 0x1A:
        raise ValueError("DS182 dBASE length or exact file terminator is invalid")
    if data[header_length - 1] != 0x0D:
        raise ValueError("DS182 dBASE descriptor terminator is invalid")

    descriptors = tuple(
        _parse_dbf_descriptor(data[offset : offset + 32])
        for offset in range(32, header_length - 1, 32)
    )
    expected_descriptors = tuple(spec[:4] for spec in DBF_FIELD_SPECS)
    if descriptors != expected_descriptors:
        raise ValueError("DS182 dBASE field descriptors disagree with frozen schema")
    if 1 + sum(spec[2] for spec in DBF_FIELD_SPECS) != record_length:
        raise RuntimeError("frozen DS182 dBASE field widths are internally inconsistent")

    rows: list[dict[str, str]] = []
    for record_index in range(record_count):
        record_number = record_index + 1
        start = header_length + record_index * record_length
        record = data[start : start + record_length]
        if record[0] != 0x20:
            raise ValueError(
                f"DS182 dBASE record {record_number} has a deleted or unknown flag"
            )
        row: dict[str, str] = {}
        offset = 1
        for dbf_name, field_type, width, decimals, canonical_name in DBF_FIELD_SPECS:
            raw = record[offset : offset + width]
            offset += width
            if field_type == "C":
                value = _decode_character_field(
                    raw, field=dbf_name, record=record_number
                )
            else:
                value = _decode_numeric_field(
                    raw,
                    field=dbf_name,
                    decimals=decimals,
                    record=record_number,
                )
            row[canonical_name] = value
        rows.append(row)
    return rows, {
        "valid": True,
        "version": 3,
        "records": record_count,
        "header_length": header_length,
        "record_length": record_length,
        "field_count": len(descriptors),
        "deleted_records": 0,
        "exact_file_terminator": True,
    }


def _point_shapefile_coordinates(data: bytes) -> list[tuple[float, float]]:
    if len(data) < 100:
        raise ValueError("DS182 Point shapefile is truncated")
    if struct.unpack_from(">i", data, 0)[0] != 9994:
        raise ValueError("DS182 Point shapefile file code is invalid")
    if any(struct.unpack_from(">5i", data, 4)):
        raise ValueError("DS182 Point shapefile reserved header is invalid")
    if struct.unpack_from(">i", data, 24)[0] * 2 != len(data):
        raise ValueError("DS182 Point shapefile length is invalid")
    version, shape_type = struct.unpack_from("<2i", data, 28)
    if version != 1000 or shape_type != 1:
        raise ValueError("DS182 geometry must be an ESRI Point shapefile")
    offset = 100
    expected_record = 1
    coordinates: list[tuple[float, float]] = []
    while offset < len(data):
        if offset + 28 > len(data):
            raise ValueError("DS182 Point record is truncated")
        record_number, content_words = struct.unpack_from(">2i", data, offset)
        if record_number != expected_record or content_words != 10:
            raise ValueError("DS182 Point record sequence or size is invalid")
        record_type, longitude, latitude = struct.unpack_from("<idd", data, offset + 8)
        if record_type != 1 or not math.isfinite(longitude) or not math.isfinite(latitude):
            raise ValueError("DS182 Point shapefile contains an invalid point")
        coordinates.append((longitude, latitude))
        offset += 28
        expected_record += 1
    return coordinates


def _bounded_partition_audit(
    rows: Sequence[Mapping[str, Any]],
    *,
    min_rows: int,
    min_sites: int,
    min_anchor_rows: int,
    min_anchor_sites: int,
    min_train_sources: int,
    max_source_groups: int,
) -> Mapping[str, Any]:
    groups = tuple(sorted({str(row["dataset_key"]) for row in rows}, key=int))
    candidate_count = (1 << (len(groups) - 1)) - 1 if groups else 0
    if len(groups) > max_source_groups:
        return {
            "performed": False,
            "group_definition": "whole DataSetKey",
            "row_random_split_allowed": False,
            "site_random_split_allowed": False,
            "unique_groups": list(groups),
            "candidate_partition_count": candidate_count,
            "eligible_partition_count": 0,
            "eligible_partitions": [],
            "maximum_exhaustive_source_groups": max_source_groups,
            "failure": "source_group_count_exceeds_exhaustive_limit",
        }
    result = dict(
        _whole_source_partition_audit(
            rows,
            min_rows=min_rows,
            min_sites=min_sites,
            min_anchor_rows=min_anchor_rows,
            min_anchor_sites=min_anchor_sites,
            min_train_sources=min_train_sources,
        )
    )
    result["performed"] = True
    result["maximum_exhaustive_source_groups"] = max_source_groups
    return result


def audit_usgs_ds182_sediment_dbf_support(
    archive_path: Path,
    source_table_path: Path,
    reference_raster_path: Path,
    output_dir: Path,
    *,
    source_id: str = DS182_SOURCE_ID,
    min_rows: int = 64,
    min_sites: int = 64,
    min_anchor_rows: int = 16,
    min_anchor_sites: int = 16,
    min_train_sources: int = 3,
    coordinate_tolerance_degrees: float = 0.00001,
    max_source_groups: int = MAX_EXHAUSTIVE_SOURCE_GROUPS,
) -> Mapping[str, Path]:
    """Run the frozen exploratory dBASE support audit without reading pixels."""

    assert_source_operation(source_id, "endpoint-support-audit")
    manifest = get_source_manifest(source_id)
    access = manifest.get("access")
    if not isinstance(access, Mapping):
        raise ValueError("DS182 source manifest has no access contract")
    outcome_spec = access.get("outcome_asset")
    source_spec = access.get("source_table")
    reference_spec = access.get("reference_raster")
    if not all(isinstance(item, Mapping) for item in (outcome_spec, source_spec, reference_spec)):
        raise ValueError("DS182 source manifest is incomplete")
    assert isinstance(outcome_spec, Mapping)
    assert isinstance(source_spec, Mapping)
    assert isinstance(reference_spec, Mapping)

    reference_source = get_source_manifest(str(reference_spec["source_id"]))
    reference_access = reference_source.get("access")
    if not isinstance(reference_access, Mapping) or reference_access.get(
        "bathymetry_geotiff_sha256"
    ) != reference_spec.get("geotiff_sha256"):
        raise ValueError("DS182 reference raster is not bound to the admitted source manifest")

    archive = _read_exact_archive(archive_path, outcome_spec)
    outcome_rows, dbf_schema = _parse_exact_dbf(archive[DBF_MEMBER])
    point_coordinates = _point_shapefile_coordinates(archive[POINT_MEMBER])
    record_count = int(outcome_spec["record_count"])
    if len(outcome_rows) != record_count or len(point_coordinates) != record_count:
        raise ValueError("DS182 dBASE and Point record counts disagree with the manifest")

    source_rows = _parse_source_table(source_table_path.read_bytes(), source_spec)
    reference = _verify_reference_raster(reference_raster_path, reference_spec)

    rows_with_geometry: list[dict[str, Any]] = []
    for record_number, (row, point) in enumerate(
        zip(outcome_rows, point_coordinates), start=1
    ):
        latitude = _required_decimal(
            row["Latitude"], field="Latitude", row_number=record_number
        )
        longitude = _required_decimal(
            row["Longitude"], field="Longitude", row_number=record_number
        )
        if latitude == Decimal("-99") or longitude == Decimal("-99"):
            raise ValueError(f"DS182 dBASE record {record_number} has sentinel coordinates")
        if not Decimal("-90") <= latitude <= Decimal("90") or not Decimal(
            "-180"
        ) <= longitude <= Decimal("180"):
            raise ValueError(f"DS182 dBASE record {record_number} has invalid coordinates")
        if (
            abs(float(longitude) - point[0]) > coordinate_tolerance_degrees
            or abs(float(latitude) - point[1]) > coordinate_tolerance_degrees
        ):
            raise ValueError(
                f"DS182 dBASE record {record_number} disagrees with Point geometry"
            )
        materialized = dict(row)
        materialized["_longitude"] = float(longitude)
        materialized["_latitude"] = float(latitude)
        rows_with_geometry.append(materialized)

    canonical_by_sample: Dict[str, Mapping[str, Any]] = {}
    exact_duplicate_rows = 0
    for record_number, row in enumerate(rows_with_geometry, start=1):
        dataset_key = str(row["DataSetKey"])
        site_key = str(row["SiteKey"])
        sample_key = str(row["SampleKey"])
        if IDENTIFIER_PATTERN.fullmatch(dataset_key) is None or dataset_key not in source_rows:
            raise ValueError(
                f"DS182 dBASE record {record_number} has an invalid DataSetKey"
            )
        if IDENTIFIER_PATTERN.fullmatch(site_key) is None:
            raise ValueError(f"DS182 dBASE record {record_number} has an invalid SiteKey")
        if IDENTIFIER_PATTERN.fullmatch(sample_key) is None:
            raise ValueError(f"DS182 dBASE record {record_number} has an invalid SampleKey")
        prior = canonical_by_sample.get(sample_key)
        if prior is None:
            canonical_by_sample[sample_key] = row
        elif prior == row:
            exact_duplicate_rows += 1
        else:
            raise ValueError(f"DS182 SampleKey {sample_key} has conflicting records")

    canonical_rows = list(canonical_by_sample.values())
    longitudes = [float(row["_longitude"]) for row in canonical_rows]
    latitudes = [float(row["_latitude"]) for row in canonical_rows]
    try:
        from rasterio.warp import transform as transform_coordinates
    except ImportError as error:
        raise RuntimeError("DS182 dBASE support audit requires rasterio") from error
    transformed_x, transformed_y = transform_coordinates(
        "EPSG:4326", reference["crs"], longitudes, latitudes
    )

    left, bottom, right, top = reference["bounds"]
    exclusions: Counter[str] = Counter()
    valid_rows: list[Mapping[str, Any]] = []
    site_identity: Dict[str, tuple[str, float, float]] = {}
    for index, row in enumerate(canonical_rows):
        dataset_key = str(row["DataSetKey"])
        site_key = str(row["SiteKey"])
        longitude = longitudes[index]
        latitude = latitudes[index]
        identity = site_identity.get(site_key)
        if identity is None:
            site_identity[site_key] = (dataset_key, longitude, latitude)
        elif identity[0] != dataset_key:
            raise ValueError(f"DS182 SiteKey {site_key} crosses DataSetKey groups")
        elif (
            abs(identity[1] - longitude) > coordinate_tolerance_degrees
            or abs(identity[2] - latitude) > coordinate_tolerance_degrees
        ):
            raise ValueError(f"DS182 SiteKey {site_key} has conflicting coordinates")

        reasons: set[str] = set()
        if not (
            left <= transformed_x[index] <= right
            and bottom <= transformed_y[index] <= top
        ):
            reasons.add("outside_reference_raster_footprint")
        if row["DataTypes"] not in {"GRZ", "TXR"}:
            reasons.add("unsupported_data_type")
        if row["SamplePhase"] != "":
            reasons.add("nonblank_sample_phase")

        sample_top = _optional_measurement(
            str(row["SampleTop"]), field="SampleTop", row_number=index + 1
        )
        if sample_top is None:
            reasons.add("sample_top_unreported")
        elif not Decimal("0") <= sample_top <= Decimal("0.1"):
            reasons.add("sample_top_outside_0_to_0_1_m")

        composition = {
            field.lower(): _optional_measurement(
                str(row[field]), field=field, row_number=index + 1
            )
            for field in ("Gravel", "Sand", "Mud")
        }
        if any(value is None for value in composition.values()):
            reasons.add("composition_unreported")
        else:
            measured = {
                name: value for name, value in composition.items() if value is not None
            }
            if any(
                not Decimal("0") <= value <= Decimal("100")
                for value in measured.values()
            ):
                reasons.add("composition_outside_0_to_100")
            total = sum(measured.values(), Decimal("0"))
            if not Decimal("98") <= total <= Decimal("102"):
                reasons.add("composition_sum_outside_98_to_102")

        for reason in reasons:
            exclusions[reason] += 1
        if reasons:
            continue
        gravel = composition["gravel"]
        sand = composition["sand"]
        mud = composition["mud"]
        assert gravel is not None and sand is not None and mud is not None
        valid_rows.append(
            {
                "dataset_key": dataset_key,
                "site_key": site_key,
                "sample_key": str(row["SampleKey"]),
                "longitude": longitude,
                "latitude": latitude,
                "gravel": float(gravel),
                "sand": float(sand),
                "mud": float(mud),
                "anchors": _anchor_flags(gravel, sand, mud),
            }
        )

    support_by_source = {
        group: {
            "source_name": source_rows[group]["DataSet_{DataFile}"],
            "navigation_method": source_rows[group]["NavMethod"],
            **_support_summary(
                [row for row in valid_rows if str(row["dataset_key"]) == group]
            ),
        }
        for group in sorted({str(row["dataset_key"]) for row in valid_rows}, key=int)
    }
    partition_audit = _bounded_partition_audit(
        valid_rows,
        min_rows=min_rows,
        min_sites=min_sites,
        min_anchor_rows=min_anchor_rows,
        min_anchor_sites=min_anchor_sites,
        min_train_sources=min_train_sources,
        max_source_groups=max_source_groups,
    )
    admissible = (
        partition_audit.get("performed") is True
        and int(partition_audit["eligible_partition_count"]) > 0
    )

    metrics = {
        "schema_version": SEDIMENT_DBF_SUPPORT_SCHEMA_VERSION,
        "source_id": source_id,
        "experiment_class": "exploratory_same_release_representation",
        "prior_exposure": {
            "failed_text_representation": True,
            "text_outcome_values_aggregated": False,
            "dbf_header_and_descriptors_previously_inspected": True,
            "dbf_record_values_inspected_before_protocol": False,
            "independent_confirmatory_evidence": False,
        },
        "official_inputs": {
            "outcome_archive": {
                "sha256": outcome_spec["archive_sha256"],
                "bytes": outcome_spec["archive_bytes"],
                "member_inventory_verified": True,
                "outcome_member": DBF_MEMBER,
            },
            "source_table": {
                "sha256": source_spec["sha256"],
                "bytes": source_spec["bytes"],
                "records": source_spec["record_count"],
            },
            "reference_raster": {
                "sha256": reference_spec["geotiff_sha256"],
                **reference,
                "pixels_read": False,
            },
        },
        "source_schema": {
            **dbf_schema,
            "published_metadata_record_count": outcome_spec[
                "published_metadata_record_count"
            ],
            "exact_archive_record_count": record_count,
            "point_records": len(point_coordinates),
            "coordinate_pairing_verified": True,
            "field_name_mapping": {
                spec[0]: spec[4] for spec in DBF_FIELD_SPECS
            },
            "repair_or_imputation_performed": False,
            "text_representation_used_for_values": False,
        },
        "row_flow": {
            "official_records": record_count,
            "exact_duplicate_rows_removed": exact_duplicate_rows,
            "distinct_sample_keys": len(canonical_rows),
            "endpoint_valid_rows": len(valid_rows),
            "endpoint_valid_sites": len({str(row["site_key"]) for row in valid_rows}),
            "endpoint_valid_source_groups": len(support_by_source),
        },
        "exclusion_counts_nonexclusive": dict(sorted(exclusions.items())),
        "overall_support": _support_summary(valid_rows),
        "support_by_source": support_by_source,
        "partition_audit": partition_audit,
        "decision": {
            "source_schema_valid": True,
            "raw_endpoint_support_admissible": admissible,
            "source_accuracy_review_authorized": admissible,
            "raster_alignment_authorized": False,
            "independent_confirmation_required": True,
            "confirmatory_claim_authorized": False,
            "patch_corpus_built": False,
            "model_training_run": False,
            "encoder_promoted": False,
            "live_score_changed": False,
            "production_or_provider_state_changed": False,
        },
        "claim_boundary": (
            "Exploratory raw support audit of the fixed-width dBASE representation from the "
            "same release whose text representation failed schema validation. Even a support "
            "pass is not independent confirmation. No raster pixels were read, no patch corpus "
            "or model was created, and no fishing, score, serving, provider, production, or "
            "deployment state changed."
        ),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = output_dir / "metrics.json"
    write_json(metrics_path, metrics)
    run = build_run_record(
        command="audit-usgs-ds182-sediment-dbf-support",
        target_taxon_id=None,
        config={
            "source_id": source_id,
            "experiment_class": "exploratory_same_release_representation",
            "outcome_member": DBF_MEMBER,
            "endpoint": ["Gravel", "Sand", "Mud"],
            "accepted_data_types": ["GRZ", "TXR"],
            "sample_top_m": [0.0, 0.1],
            "composition_sum_percent": [98.0, 102.0],
            "anchors": {
                "gravel_bearing_min_percent": 5.0,
                "mud_bearing_min_percent": 20.0,
                "sand_dominant_min_percent": 80.0,
            },
            "min_rows_per_side": min_rows,
            "min_sites_per_side": min_sites,
            "min_anchor_rows_per_side": min_anchor_rows,
            "min_anchor_sites_per_side": min_anchor_sites,
            "min_train_sources": min_train_sources,
            "coordinate_tolerance_degrees": coordinate_tolerance_degrees,
            "max_exhaustive_source_groups": max_source_groups,
            "raster_pixels_read": False,
        },
        input_paths=(archive_path, source_table_path, reference_raster_path),
        dataset_kind="official_sediment_endpoint_exploratory_dbf_support_audit",
        status="completed",
        metrics={
            "metrics_sha256": sha256_file(metrics_path),
            "source_schema_valid": True,
            "raw_endpoint_support_admissible": admissible,
            "endpoint_valid_rows": len(valid_rows),
            "eligible_whole_source_partitions": partition_audit[
                "eligible_partition_count"
            ],
            "independent_confirmatory_evidence": False,
            "model_training_run": False,
        },
        notes=(
            "Exploratory same-release dBASE support audit after the exact text representation "
            "failed closed. No raster pixels were read, no patch corpus or model was created, "
            "and no score, serving, provider, production, or deployment state changed."
        ),
    )
    verify_run_record_integrity(run, rehash_inputs=True)
    run_path = output_dir / "run-metadata.json"
    write_json(run_path, run)
    return {"metrics": metrics_path, "run_metadata": run_path}
