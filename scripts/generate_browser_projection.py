"""Build the compact browser projection from the canonical opportunity snapshot.

This emitter intentionally lives outside ``generate_snapshot.py`` so changing
transport-only projection logic cannot change the content-addressed identity of
the heuristic scoring source.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "public" / "data" / "opportunities.json"
DEFAULT_OUTPUT = ROOT / "public" / "data" / "opportunities-browser.json"

CONDITION_FIELDS = (
    "tideStage",
    "tideLevelsFeet",
    "currentKnots",
    "currentDirection",
    "windMph",
    "swellFeet",
    "swellPeriodSeconds",
    "swellDirection",
    "wavePowerKwM",
    "breakingIntensity",
    "breakingWaveHeightFeet",
    "fishabilityLabel",
    "fishabilityReasons",
    "waterTempF",
    "ndbcObservedWaterTempF",
    "ndbcObservedAt",
    "daylight",
    "cloudCoverPct",
    "pressureHpa",
    "pressureTrendHpa3h",
    "moonPhase",
    "moonIlluminationPct",
    "fishingPressure",
    "fishingPressurePct",
    "accessAdjustmentPoints",
)


def compact_browser_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Remove contract and audit repetition that the browser never reads."""

    windows = []
    for window in payload["windows"]:
        conditions = window.get("conditions", {})
        windows.append(
            {
                "id": window["id"],
                "siteId": window["siteId"],
                "start": window["start"],
                "end": window["end"],
                "score": window["score"],
                "habitatScore": window["habitatScore"],
                "seasonalityScore": window["seasonalityScore"],
                "dynamicScore": window["dynamicScore"],
                "fishabilityScore": window["fishabilityScore"],
                "confidence": window["confidence"],
                "explanationFactors": [],
                "conditions": {
                    field: conditions[field]
                    for field in CONDITION_FIELDS
                    if field in conditions
                },
            }
        )
    return {
        "generatedAt": payload["generatedAt"],
        "modelVersion": payload["modelVersion"],
        "methodology": payload["scoreDefinition"],
        "sources": payload["sources"],
        "windows": windows,
    }


def write_browser_projection(input_path: Path, output_path: Path) -> None:
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    projection = compact_browser_payload(payload)
    temporary_path = output_path.with_suffix(f"{output_path.suffix}.tmp")
    temporary_path.write_text(
        json.dumps(projection, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    temporary_path.replace(output_path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    write_browser_projection(args.input, args.output)


if __name__ == "__main__":
    main()
