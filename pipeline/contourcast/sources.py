"""Load and validate official-source manifests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Iterable, Mapping


SOURCE_DIR = Path(__file__).resolve().parents[1] / "sources"
REQUIRED_FIELDS = {
    "manifest_version",
    "source_id",
    "title",
    "steward",
    "official_landing_page",
    "access",
    "limitations",
}


def load_source_manifests(source_dir: Path | None = None) -> Dict[str, Mapping[str, object]]:
    root = source_dir or SOURCE_DIR
    manifests: Dict[str, Mapping[str, object]] = {}
    for path in sorted(root.glob("*.json")):
        with path.open("r", encoding="utf-8") as handle:
            manifest = json.load(handle)
        missing = REQUIRED_FIELDS - set(manifest)
        if missing:
            raise ValueError(f"{path} is missing manifest fields: {sorted(missing)}")
        source_id = str(manifest["source_id"])
        if source_id in manifests:
            raise ValueError(f"duplicate source_id {source_id!r}")
        manifests[source_id] = manifest
    if not manifests:
        raise ValueError(f"no source manifests found under {root}")
    return manifests


def get_source_manifest(source_id: str) -> Mapping[str, object]:
    manifests = load_source_manifests()
    try:
        return manifests[source_id]
    except KeyError as error:
        raise ValueError(
            f"unknown source_id {source_id!r}; choose from {sorted(manifests)}"
        ) from error


def summarize_sources() -> Iterable[Mapping[str, object]]:
    for manifest in load_source_manifests().values():
        yield {
            "source_id": manifest["source_id"],
            "title": manifest["title"],
            "steward": manifest["steward"],
            "official_landing_page": manifest["official_landing_page"],
            "access_mode": manifest["access"]["mode"],  # type: ignore[index]
        }
