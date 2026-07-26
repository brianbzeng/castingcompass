#!/usr/bin/env python3
"""Bind provisional East Bay Parks mappings to the official BeachWatch registry.

The registry establishes public station identity only. It does not establish a
current advisory, clean water, seafood safety, spatial coverage, or any numeric
fishing-score contribution, and this tool cannot modify policy automatically.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import urllib.parse
import urllib.request
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from refresh_water_quality import (
    BEACHWATCH_STATION_ID_PATTERN,
    EAST_BAY_PARKS_BEACHWATCH_SOURCE_ID,
    SITES_PATH,
    USER_AGENT,
    WaterQualityError,
    clean_text,
    isoformat,
    load_inputs,
    parse_as_of,
    sha256,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = (
    ROOT / "water-quality" / "audits" / "east-bay-parks-beachwatch-station-mappings.json"
)
REGISTRY_MACHINE_URL = "https://beachwatch.waterboards.ca.gov/public/getstation.php"
MAX_RESPONSE_BYTES = 64 * 1024
MAX_STATION_COUNT = 200
EXPECTED_MAPPED_SITE_IDS = (
    "keller-beach",
    "crown-memorial-state-beach",
)
UNMAPPED_REVIEW_SITE_IDS = (
    "ferry-point-pier",
    "point-isabel-shoreline",
    "albany-bulb",
    "berkeley-marina-north-basin",
    "cesar-chavez-park",
    "emeryville-marina-pier",
    "port-view-park-pier",
    "middle-harbor-shoreline",
    "alameda-south-shore-rockwall",
    "oyster-bay-shoreline",
    "san-leandro-marina-shore",
)
REJECTED_CANDIDATES = {
    "ferry-point-pier": "Keller North Beach",
    "alameda-south-shore-rockwall": "Crown Windsurfer Corner",
}


class StationOptionParser(HTMLParser):
    """Parse only the bounded option fragments returned by getstation.php."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._value: str | None = None
        self._parts: list[str] = []
        self.options: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "option":
            return
        if self._value is not None:
            raise WaterQualityError("invalid-station-registry")
        values = [value for key, value in attrs if key == "value"]
        if len(values) != 1 or values[0] is None:
            raise WaterQualityError("invalid-station-registry")
        self._value = values[0]
        self._parts = []

    def handle_data(self, data: str) -> None:
        if self._value is not None:
            self._parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "option" or self._value is None:
            return
        name = clean_text(" ".join(self._parts), maximum=96)
        if name is None:
            raise WaterQualityError("invalid-station-registry")
        self.options.append((self._value, name))
        self._value = None
        self._parts = []


def fetch_registry(county_id: str) -> bytes:
    data = urllib.parse.urlencode({"county": county_id}).encode("ascii")
    request = urllib.request.Request(
        REGISTRY_MACHINE_URL,
        data=data,
        headers={
            "Accept": "text/html",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310 -- fixed HTTPS allowlist
            if response.geturl() != REGISTRY_MACHINE_URL:
                raise WaterQualityError("unexpected-source-redirect")
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > MAX_RESPONSE_BYTES:
                raise WaterQualityError("source-response-too-large")
            body = response.read(MAX_RESPONSE_BYTES + 1)
    except WaterQualityError:
        raise
    except Exception as exc:
        raise WaterQualityError("source-request-failed") from exc
    if len(body) > MAX_RESPONSE_BYTES:
        raise WaterQualityError("source-response-too-large")
    return body


def parse_registry(body: bytes) -> dict[str, str]:
    try:
        text = body.decode("utf-8")
    except UnicodeError as exc:
        raise WaterQualityError("invalid-station-registry") from exc
    parser = StationOptionParser()
    try:
        parser.feed(text)
        parser.close()
    except Exception as exc:
        if isinstance(exc, WaterQualityError):
            raise
        raise WaterQualityError("invalid-station-registry") from exc
    if (
        not parser.options
        or parser.options[0] != ("", "All Stations")
        or len(parser.options) - 1 > MAX_STATION_COUNT
        or parser._value is not None
    ):
        raise WaterQualityError("invalid-station-registry")
    records: dict[str, str] = {}
    query_ids: set[str] = set()
    for query_id, station_name in parser.options[1:]:
        if (
            not query_id.isdigit()
            or query_id in query_ids
            or station_name in records
            or not BEACHWATCH_STATION_ID_PATTERN.fullmatch(station_name)
        ):
            raise WaterQualityError("invalid-station-registry")
        query_ids.add(query_id)
        records[station_name] = query_id
    if not records:
        raise WaterQualityError("invalid-station-registry")
    return records


def coordinate(value: Any, *, latitude: bool) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise WaterQualityError("invalid-site-coordinate") from exc
    limit = 90 if latitude else 180
    if not math.isfinite(parsed) or not -limit <= parsed <= limit:
        raise WaterQualityError("invalid-site-coordinate")
    return parsed


def build_audit(
    *,
    as_of: datetime,
    policy: dict[str, Any],
    sites: list[dict[str, Any]],
    source_body: bytes,
) -> dict[str, Any]:
    source = policy["sources"][EAST_BAY_PARKS_BEACHWATCH_SOURCE_ID]
    if (
        source.get("county_id") != "19"
        or source.get("county_name") != "East Bay Parks District"
        or source.get("station_registry_machine_url") != REGISTRY_MACHINE_URL
        or source.get("global_station_ids") != []
    ):
        raise WaterQualityError("untrusted-station-registry")
    registry = parse_registry(source_body)

    mappings = {
        site_id: mapping
        for site_id, mapping in policy["site_mappings"].items()
        if mapping["source_id"] == EAST_BAY_PARKS_BEACHWATCH_SOURCE_ID
    }
    if tuple(mappings) != EXPECTED_MAPPED_SITE_IDS:
        raise WaterQualityError("unexpected-east-bay-parks-mapping-set")
    sites_by_id = {site["id"]: site for site in sites}
    mapped_sites: list[dict[str, Any]] = []
    for site_id, mapping in mappings.items():
        site = sites_by_id[site_id]
        support = []
        for station_name in mapping["station_ids"]:
            query_id = registry.get(station_name)
            if query_id is None:
                raise WaterQualityError("mapped-station-missing-from-registry")
            support.append({"stationName": station_name, "registryQueryId": query_id})
        mapped_sites.append(
            {
                "siteId": site_id,
                "siteName": site["name"],
                "siteCoordinate": {
                    "latitude": coordinate(site.get("latitude"), latitude=True),
                    "longitude": coordinate(site.get("longitude"), latitude=False),
                },
                "policyMapped": True,
                "identityBasis": "reviewed public beach identity with exact official registry station names",
                "reviewStatus": "local-preliminary-independent-review-required",
                "automaticMappingAllowed": False,
                "stationSupport": support,
            }
        )

    unresolved: list[dict[str, Any]] = []
    for site_id in UNMAPPED_REVIEW_SITE_IDS:
        if site_id in policy["site_mappings"]:
            raise WaterQualityError("unsupported-site-was-mapped")
        site = sites_by_id[site_id]
        rejected_candidate = None
        candidate_name = REJECTED_CANDIDATES.get(site_id)
        if candidate_name is not None:
            query_id = registry.get(candidate_name)
            if query_id is None:
                raise WaterQualityError("expected-review-candidate-missing")
            rejected_candidate = {
                "stationName": candidate_name,
                "registryQueryId": query_id,
                "rejectionReason": "different-public-location-identity",
            }
        unresolved.append(
            {
                "siteId": site_id,
                "siteName": site["name"],
                "policyMapped": False,
                "status": "unresolved-no-exact-registry-identity",
                "automaticMappingAllowed": False,
                "rejectedCandidate": rejected_candidate,
            }
        )

    return {
        "schemaVersion": "castingcompass.water-quality-mapping-audit/1.1.0",
        "generatedAt": isoformat(as_of),
        "sourceId": EAST_BAY_PARKS_BEACHWATCH_SOURCE_ID,
        "meaning": "official station identity evidence only; never current status, spatial coverage, clean-water evidence, seafood safety, or a fishing-score input",
        "automaticMappingAllowed": False,
        "independentReviewRequired": True,
        "source": {
            "agency": source["agency"],
            "registryUrl": source["station_registry_url"],
            "registryMachineUrl": REGISTRY_MACHINE_URL,
            "countyId": source["county_id"],
            "countyName": source["county_name"],
            "stationCount": len(registry),
            "globalStationIds": source["global_station_ids"],
            "registryUse": "exact public station identity only; never current advisory status",
            "responseSha256": hashlib.sha256(source_body).hexdigest(),
        },
        "policySha256": sha256(ROOT / "water-quality" / "policy.json"),
        "auditToolSha256": sha256(Path(__file__)),
        "siteCatalogSha256": sha256(SITES_PATH),
        "mappedSites": mapped_sites,
        "unmappedSites": unresolved,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", help="UTC ISO timestamp for a deterministic receipt")
    parser.add_argument("--source-file", type=Path, help="Read a registry fixture instead of the network")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    as_of = parse_as_of(args.as_of)
    policy, sites, _ = load_inputs()
    source = policy["sources"][EAST_BAY_PARKS_BEACHWATCH_SOURCE_ID]
    body = args.source_file.read_bytes() if args.source_file else fetch_registry(source["county_id"])
    payload = build_audit(as_of=as_of, policy=policy, sites=sites, source_body=body)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "mappedSiteCount": len(payload["mappedSites"]),
                "unmappedSiteCount": len(payload["unmappedSites"]),
                "stationCount": payload["source"]["stationCount"],
                "independentReviewRequired": True,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
