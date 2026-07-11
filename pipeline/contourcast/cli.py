"""Command-line entry point for reproducible ContourCast data and ML work."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Sequence

from .deep_model import architecture_smoke_test
from .geo import validate_observation_extent, verify_projected_crs
from .ingest import ingest_bathymetry, ingest_observations, load_grid, load_model_observations
from .metadata import sha256_file, write_json
from .sources import summarize_sources
from .terrain import (
    derive_terrain_channels,
    robust_channel_stats,
    save_terrain_stack,
)
from .workflow import run_baseline_workflow, run_smoke_workflow


def _path(value: str) -> Path:
    return Path(value).expanduser()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="contourcast-pipeline",
        description="Bathymetry ingestion, terrain features, and spatially blocked ML evaluation.",
    )
    subcommands = parser.add_subparsers(dest="command", required=True)

    subcommands.add_parser("sources", help="List official source manifests")

    bathymetry = subcommands.add_parser("ingest-bathymetry")
    bathymetry.add_argument("--input", required=True, type=_path)
    bathymetry.add_argument("--output", required=True, type=_path)
    bathymetry.add_argument("--source-id", required=True)
    bathymetry.add_argument("--vertical-datum", required=True)
    bathymetry.add_argument("--expected-sha256")
    bathymetry.add_argument("--crs-override")

    observations = subcommands.add_parser("ingest-observations")
    observations.add_argument("--input", required=True, type=_path)
    observations.add_argument("--output", required=True, type=_path)
    observations.add_argument("--source-id", required=True)
    observations.add_argument("--column-map", type=_path)
    observations.add_argument("--expected-sha256")

    terrain = subcommands.add_parser("derive-terrain")
    terrain.add_argument("--bathymetry", required=True, type=_path)
    terrain.add_argument("--output", required=True, type=_path)
    terrain.add_argument("--local-radius", type=int, default=2)
    terrain.add_argument("--broad-radius", type=int, default=6)

    validate = subcommands.add_parser("validate")
    validate.add_argument("--bathymetry", required=True, type=_path)
    validate.add_argument("--observations", required=True, type=_path)

    evaluate = subcommands.add_parser("evaluate-baselines")
    evaluate.add_argument("--terrain", required=True, type=_path)
    evaluate.add_argument("--observations", required=True, type=_path)
    evaluate.add_argument("--output-dir", required=True, type=_path)
    evaluate.add_argument("--dataset-kind", default="real_observations")
    evaluate.add_argument("--patch-size", type=int, default=17)
    evaluate.add_argument("--splits", type=int, default=5)
    evaluate.add_argument("--buffer-m", type=float, default=250.0)
    evaluate.add_argument("--seed", type=int, default=42)

    smoke = subcommands.add_parser("smoke")
    smoke.add_argument("--output-dir", required=True, type=_path)
    smoke.add_argument("--seed", type=int, default=42)
    smoke.add_argument("--observations", type=int, default=480)

    deep_smoke = subcommands.add_parser("deep-smoke")
    deep_smoke.add_argument("--batch-size", type=int, default=4)
    deep_smoke.add_argument("--patch-size", type=int, default=17)
    return parser


def _print(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True, default=str))


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "sources":
        _print(list(summarize_sources()))
    elif args.command == "ingest-bathymetry":
        _print(
            ingest_bathymetry(
                args.input,
                args.output,
                source_id=args.source_id,
                vertical_datum=args.vertical_datum,
                expected_sha256=args.expected_sha256,
                crs_override=args.crs_override,
            )
        )
    elif args.command == "ingest-observations":
        _print(
            ingest_observations(
                args.input,
                args.output,
                source_id=args.source_id,
                column_map_path=args.column_map,
                expected_sha256=args.expected_sha256,
            )
        )
    elif args.command == "derive-terrain":
        grid = load_grid(args.bathymetry)
        channels, metadata = derive_terrain_channels(
            grid, local_radius=args.local_radius, broad_radius=args.broad_radius
        )
        save_terrain_stack(args.output, channels, grid, metadata)
        provenance = {
            "status": "completed",
            "input_sha256": sha256_file(args.bathymetry),
            "output_sha256": sha256_file(args.output),
            "derivation": metadata,
            "channel_stats": robust_channel_stats(channels),
        }
        write_json(args.output.with_suffix(".provenance.json"), provenance)
        _print(provenance)
    elif args.command == "validate":
        grid = load_grid(args.bathymetry)
        frame = load_model_observations(args.observations, grid.crs)
        _print(
            {
                "status": "valid",
                "crs": verify_projected_crs(grid.crs),
                "extent": validate_observation_extent(grid, frame["x"], frame["y"]),
                "vertical_datum": grid.vertical_datum,
            }
        )
    elif args.command == "evaluate-baselines":
        _print(
            run_baseline_workflow(
                args.terrain,
                args.observations,
                args.output_dir,
                dataset_kind=args.dataset_kind,
                patch_size=args.patch_size,
                n_splits=args.splits,
                buffer_m=args.buffer_m,
                random_state=args.seed,
            )
        )
    elif args.command == "smoke":
        _print(
            run_smoke_workflow(
                args.output_dir, seed=args.seed, observations=args.observations
            )
        )
    elif args.command == "deep-smoke":
        _print(architecture_smoke_test(args.batch_size, args.patch_size))
    else:  # pragma: no cover
        raise AssertionError(args.command)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
