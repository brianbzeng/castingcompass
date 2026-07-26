"""Exploratory DS182 sediment support inside exact South Coast footprints."""

from __future__ import annotations

from collections import Counter
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, Mapping, Sequence

import numpy as np

from .metadata import (
    build_run_record,
    sha256_file,
    verify_run_record_integrity,
    write_json,
)
from .sediment_dbf_support_audit import (
    DBF_MEMBER,
    MAX_EXHAUSTIVE_SOURCE_GROUPS,
    POINT_MEMBER,
    _bounded_partition_audit,
    _parse_exact_dbf,
    _point_shapefile_coordinates,
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
)
from .sources import assert_source_operation, get_source_manifest


SOUTH_COAST_SOURCE_ID = "usgs_santa_barbara_south_coast_2m"
SOUTH_COAST_SEDIMENT_SCHEMA_VERSION = (
    "castingcompass.usgs-south-coast-sediment-support/1.0.0"
)
REGION_PRIORITY = (
    "offshore_refugio_beach",
    "offshore_coal_oil_point",
    "offshore_santa_barbara",
    "offshore_carpinteria",
)
REGION_RASTER_SPECS: Mapping[str, Mapping[str, Any]] = {
    "offshore_refugio_beach": {
        "geotiff_path": "Bathymetry_OffshoreRefugioBeach.tif",
        "geotiff_sha256": "fba0b0fa9f3dd2c29890a8b1260b4a3d53a74fc3d909e7b98e2656439319259a",
        "crs": "EPSG:32610",
        "transform": [2.0, 0.0, 758070.0, 0.0, -2.0, 3826080.0, 0.0, 0.0, 1.0],
        "width": 8960,
        "height": 8960,
        "bounds": [758070.0, 3808160.0, 775990.0, 3826080.0],
    },
    "offshore_coal_oil_point": {
        "geotiff_path": "Bathymetry_2m_OffshoreCoalOilPoint.tif",
        "geotiff_sha256": "c63ab37fbc9f64b838fabd8d3fcee4b4c9a4de21ecd3410109d9fd12d01c595f",
        "crs": "EPSG:32611",
        "transform": [2.0, 0.0, 223875.0, 0.0, -2.0, 3821420.0, 0.0, 0.0, 1.0],
        "width": 8963,
        "height": 8960,
        "bounds": [223875.0, 3803500.0, 241801.0, 3821420.0],
    },
    "offshore_santa_barbara": {
        "geotiff_path": "Bathymetry_OffshoreSantaBarbara.tif",
        "geotiff_sha256": "877a7ab310b60a5dbb263c47de640234a2254b3b44b4291960254c1a2d5eb408",
        "crs": "EPSG:32611",
        "transform": [
            2.000000000000003,
            0.0,
            241390.0,
            0.0,
            -2.0,
            3819430.0,
            0.0,
            0.0,
            1.0,
        ],
        "width": 8960,
        "height": 8960,
        "bounds": [241390.0, 3801510.0, 259310.00000000003, 3819430.0],
    },
    "offshore_carpinteria": {
        "geotiff_path": "Bathymetry_OffshoreCarpinteria.tif",
        "geotiff_sha256": "eb687e6a5fefeedc094f51f1d23a08d92b2b2c81e7bba3c26d62446558c9abea",
        "crs": "EPSG:32611",
        "transform": [2.0, 0.0, 258760.0, 0.0, -2.0, 3815100.0, 0.0, 0.0, 1.0],
        "width": 8960,
        "height": 8960,
        "bounds": [258760.0, 3797180.0, 276680.0, 3815100.0],
    },
}


def _verify_region_rasters(
    raster_paths: Mapping[str, Path],
    south_coast_manifest: Mapping[str, Any],
    *,
    region_specs: Mapping[str, Mapping[str, Any]] = REGION_RASTER_SPECS,
) -> Mapping[str, Mapping[str, Any]]:
    """Verify exact raster bytes and metadata without reading any pixel."""

    if tuple(region_specs) != REGION_PRIORITY or tuple(raster_paths) != REGION_PRIORITY:
        raise ValueError("South Coast raster priority or inventory disagrees with protocol")
    access = south_coast_manifest.get("access")
    if not isinstance(access, Mapping):
        raise ValueError("South Coast source manifest has no access contract")
    if tuple(access.get("region_priority", ())) != REGION_PRIORITY:
        raise ValueError("South Coast source priority disagrees with protocol")
    raw_regions = access.get("regions")
    if not isinstance(raw_regions, Mapping) or set(raw_regions) != set(REGION_PRIORITY):
        raise ValueError("South Coast source region inventory disagrees with protocol")
    try:
        import rasterio
    except ImportError as error:
        raise RuntimeError("South Coast sediment support audit requires rasterio") from error

    verified: Dict[str, Mapping[str, Any]] = {}
    for region in REGION_PRIORITY:
        specification = region_specs[region]
        raw_region = raw_regions[region]
        if not isinstance(raw_region, Mapping):
            raise ValueError(f"South Coast source region {region} is malformed")
        bathymetry = raw_region.get("bathymetry")
        if not isinstance(bathymetry, Mapping):
            raise ValueError(f"South Coast source region {region} lacks bathymetry")
        if bathymetry.get("geotiff_path") != specification.get(
            "geotiff_path"
        ) or bathymetry.get("geotiff_sha256") != specification.get("geotiff_sha256"):
            raise ValueError(f"South Coast source region {region} disagrees with protocol")
        path = raster_paths[region]
        if path.name != specification.get("geotiff_path"):
            raise ValueError(f"South Coast raster name disagrees for {region}")
        if sha256_file(path) != specification.get("geotiff_sha256"):
            raise ValueError(f"South Coast raster checksum disagrees for {region}")
        with rasterio.open(path) as dataset:
            actual = {
                "sha256": specification["geotiff_sha256"],
                "crs": str(dataset.crs),
                "transform": [float(value) for value in tuple(dataset.transform)],
                "width": int(dataset.width),
                "height": int(dataset.height),
                "bounds": [float(value) for value in tuple(dataset.bounds)],
                "pixels_read": False,
            }
        if actual["crs"] != specification.get("crs"):
            raise ValueError(f"South Coast raster CRS disagrees for {region}")
        if actual["width"] != specification.get("width") or actual[
            "height"
        ] != specification.get("height"):
            raise ValueError(f"South Coast raster shape disagrees for {region}")
        for field in ("transform", "bounds"):
            if not np.allclose(
                actual[field], specification.get(field), rtol=0.0, atol=1e-9
            ):
                raise ValueError(f"South Coast raster {field} disagrees for {region}")
        verified[region] = actual
    return verified


def _assign_region_membership(
    longitudes: Sequence[float],
    latitudes: Sequence[float],
    region_metadata: Mapping[str, Mapping[str, Any]],
) -> tuple[list[str | None], int]:
    transform_coordinates = None
    hits: list[list[str]] = [[] for _ in longitudes]
    for region in REGION_PRIORITY:
        metadata = region_metadata[region]
        target_crs = str(metadata["crs"])
        if target_crs == "EPSG:4326":
            xs, ys = list(longitudes), list(latitudes)
        else:
            if transform_coordinates is None:
                try:
                    from rasterio.warp import transform as transform_coordinates
                except ImportError as error:
                    raise RuntimeError(
                        "South Coast sediment support audit requires rasterio"
                    ) from error
            xs, ys = transform_coordinates(
                "EPSG:4326", target_crs, list(longitudes), list(latitudes)
            )
        left, bottom, right, top = metadata["bounds"]
        for index, (x, y) in enumerate(zip(xs, ys)):
            if left <= x <= right and bottom <= y <= top:
                hits[index].append(region)
    assignments = [region_hits[0] if region_hits else None for region_hits in hits]
    return assignments, sum(len(region_hits) > 1 for region_hits in hits)


def audit_usgs_south_coast_sediment_support(
    archive_path: Path,
    source_table_path: Path,
    raster_paths: Mapping[str, Path],
    output_dir: Path,
    *,
    source_id: str = DS182_SOURCE_ID,
    south_coast_source_id: str = SOUTH_COAST_SOURCE_ID,
    region_specs: Mapping[str, Mapping[str, Any]] = REGION_RASTER_SPECS,
    min_rows: int = 64,
    min_sites: int = 64,
    min_anchor_rows: int = 16,
    min_anchor_sites: int = 16,
    min_train_sources: int = 3,
    coordinate_tolerance_degrees: float = 0.00001,
    max_source_groups: int = MAX_EXHAUSTIVE_SOURCE_GROUPS,
) -> Mapping[str, Path]:
    """Audit exact direct-sediment support across four metadata-only footprints."""

    assert_source_operation(source_id, "endpoint-support-audit")
    assert_source_operation(south_coast_source_id, "endpoint-support-footprint")
    manifest = get_source_manifest(source_id)
    south_coast_manifest = get_source_manifest(south_coast_source_id)
    access = manifest.get("access")
    if not isinstance(access, Mapping):
        raise ValueError("DS182 source manifest has no access contract")
    outcome_spec = access.get("outcome_asset")
    source_spec = access.get("source_table")
    if not isinstance(outcome_spec, Mapping) or not isinstance(source_spec, Mapping):
        raise ValueError("DS182 source manifest is incomplete")

    region_metadata = _verify_region_rasters(
        raster_paths, south_coast_manifest, region_specs=region_specs
    )
    archive = _read_exact_archive(archive_path, outcome_spec)
    outcome_rows, dbf_schema = _parse_exact_dbf(archive[DBF_MEMBER])
    point_coordinates = _point_shapefile_coordinates(archive[POINT_MEMBER])
    record_count = int(outcome_spec["record_count"])
    if len(outcome_rows) != record_count or len(point_coordinates) != record_count:
        raise ValueError("DS182 dBASE and Point record counts disagree with the manifest")
    source_rows = _parse_source_table(source_table_path.read_bytes(), source_spec)

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
    assignments, overlap_assignments = _assign_region_membership(
        longitudes, latitudes, region_metadata
    )

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
        region = assignments[index]
        if region is None:
            reasons.add("outside_south_coast_footprints")
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
            if not Decimal("98") <= sum(measured.values(), Decimal("0")) <= Decimal(
                "102"
            ):
                reasons.add("composition_sum_outside_98_to_102")
        for reason in reasons:
            exclusions[reason] += 1
        if reasons:
            continue
        gravel = composition["gravel"]
        sand = composition["sand"]
        mud = composition["mud"]
        assert region is not None and gravel is not None and sand is not None and mud is not None
        valid_rows.append(
            {
                "dataset_key": dataset_key,
                "site_key": site_key,
                "sample_key": str(row["SampleKey"]),
                "region": region,
                "longitude": longitude,
                "latitude": latitude,
                "gravel": float(gravel),
                "sand": float(sand),
                "mud": float(mud),
                "anchors": _anchor_flags(gravel, sand, mud),
            }
        )

    support_by_region = {
        region: _support_summary(
            [row for row in valid_rows if str(row["region"]) == region]
        )
        for region in REGION_PRIORITY
    }
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
    inside_count = len(canonical_rows) - exclusions["outside_south_coast_footprints"]
    metrics = {
        "schema_version": SOUTH_COAST_SEDIMENT_SCHEMA_VERSION,
        "source_id": source_id,
        "footprint_source_id": south_coast_source_id,
        "experiment_class": "exploratory_preexposed_same_release_geographic_support",
        "prior_exposure": {
            "failed_text_representation": True,
            "dbf_records_previously_parsed": True,
            "south_coast_membership_or_support_inspected_before_protocol": False,
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
            "region_rasters": region_metadata,
        },
        "source_schema": {
            **dbf_schema,
            "point_records": len(point_coordinates),
            "coordinate_pairing_verified": True,
            "repair_or_imputation_performed": False,
        },
        "footprint_assignment": {
            "region_priority": list(REGION_PRIORITY),
            "inside_records": inside_count,
            "outside_records": exclusions["outside_south_coast_footprints"],
            "multi_region_records_assigned_by_priority": overlap_assignments,
            "raster_pixels_read": False,
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
        "support_by_region": support_by_region,
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
            "Exploratory support screen over a preexposed same-release dBASE endpoint and four "
            "metadata-only South Coast bathymetry footprints. No raster pixels were read, no "
            "patch corpus or model was created, and no current habitat, fishing, score, serving, "
            "provider, production, or deployment claim is authorized."
        ),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = output_dir / "metrics.json"
    write_json(metrics_path, metrics)
    input_paths = [archive_path, source_table_path]
    input_paths.extend(raster_paths[region] for region in REGION_PRIORITY)
    run = build_run_record(
        command="audit-usgs-south-coast-sediment-support",
        target_taxon_id=None,
        config={
            "source_id": source_id,
            "footprint_source_id": south_coast_source_id,
            "experiment_class": "exploratory_preexposed_same_release_geographic_support",
            "outcome_member": DBF_MEMBER,
            "endpoint": ["Gravel", "Sand", "Mud"],
            "region_priority": list(REGION_PRIORITY),
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
        input_paths=input_paths,
        dataset_kind="official_sediment_endpoint_exploratory_south_coast_support_audit",
        status="completed",
        metrics={
            "metrics_sha256": sha256_file(metrics_path),
            "source_schema_valid": True,
            "inside_footprint_records": inside_count,
            "endpoint_valid_rows": len(valid_rows),
            "raw_endpoint_support_admissible": admissible,
            "eligible_whole_source_partitions": partition_audit[
                "eligible_partition_count"
            ],
            "independent_confirmatory_evidence": False,
            "model_training_run": False,
        },
        notes=(
            "Exploratory preexposed same-release sediment support screen over exact South Coast "
            "metadata footprints. No raster pixels were read, no patch corpus or model was "
            "created, and no score, serving, provider, production, or deployment state changed."
        ),
    )
    verify_run_record_integrity(run, rehash_inputs=True)
    run_path = output_dir / "run-metadata.json"
    write_json(run_path, run)
    return {"metrics": metrics_path, "run_metadata": run_path}
