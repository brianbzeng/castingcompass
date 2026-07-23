#!/usr/bin/env python3
"""Bind every uncovered launch-catalog site to explicit negative evidence.

This audit never creates a station mapping or interprets current water quality.
It verifies that existing source-specific receipts cover every site already
published as not covered, then records the remaining Dumbarton directory review.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from refresh_water_quality import (
    BEACHWATCH_STATION_ID_PATTERN,
    SITES_PATH,
    USER_AGENT,
    WaterQualityError,
    clean_text,
    isoformat,
    parse_as_of,
)


ROOT = Path(__file__).resolve().parents[1]
POLICY_PATH = ROOT / "water-quality" / "policy.json"
OVERLAY_PATH = ROOT / "public" / "data" / "water-quality.json"
DEFAULT_OUTPUT = ROOT / "water-quality" / "audits" / "launch-catalog-coverage.json"
DIRECTORY_URL = "https://beachwatch.waterboards.ca.gov/public/result.php"
REGISTRY_MACHINE_URL = "https://beachwatch.waterboards.ca.gov/public/getstation.php"
ALAMEDA_CONTEXT_URL = "https://deh.acgov.org/operations/recreational-health.page"
MAX_RESPONSE_BYTES = 64 * 1024
MAX_STATION_COUNT = 200
DUMBARTON_SITE_ID = "dumbarton-pier"
RELEVANT_PROGRAM_IDS = ("19", "20")
EXPECTED_COUNTY_PROGRAMS = (
    ("19", "East Bay Parks District"),
    ("3", "Humboldt"),
    ("4", "Long Beach City"),
    ("5", "Los Angeles"),
    ("6", "Marin"),
    ("7", "Mendocino"),
    ("8", "Monterey"),
    ("9", "Orange"),
    ("10", "San Diego"),
    ("11", "San Francisco"),
    ("12", "San Luis Obispo"),
    ("13", "San Mateo"),
    ("14", "Santa Barbara"),
    ("15", "Santa Cruz"),
    ("16", "Sonoma"),
    ("17", "Ventura"),
    ("20", "Water Boards"),
)
NEGATIVE_AUDITS = (
    ("water-quality/audits/sf-unmapped-station-candidates.json", "sites"),
    ("water-quality/audits/san-mateo-station-mappings.json", "unmappedSites"),
    ("water-quality/audits/marin-beachwatch-station-mappings.json", "unmappedSites"),
    (
        "water-quality/audits/east-bay-parks-beachwatch-station-mappings.json",
        "unmappedSites",
    ),
)


def sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def load_json(path: Path) -> tuple[dict[str, Any], bytes]:
    body = path.read_bytes()
    try:
        payload = json.loads(body)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise WaterQualityError("invalid-local-json") from exc
    if not isinstance(payload, dict):
        raise WaterQualityError("invalid-local-json")
    return payload, body


def read_response(response: Any, expected_url: str) -> bytes:
    if response.geturl() != expected_url:
        raise WaterQualityError("unexpected-source-redirect")
    content_length = response.headers.get("Content-Length")
    if content_length and int(content_length) > MAX_RESPONSE_BYTES:
        raise WaterQualityError("source-response-too-large")
    body = response.read(MAX_RESPONSE_BYTES + 1)
    if len(body) > MAX_RESPONSE_BYTES:
        raise WaterQualityError("source-response-too-large")
    return body


def fetch_directory() -> bytes:
    request = urllib.request.Request(
        DIRECTORY_URL,
        headers={"Accept": "text/html", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310
            return read_response(response, DIRECTORY_URL)
    except WaterQualityError:
        raise
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise WaterQualityError("source-request-failed") from exc


def fetch_registry(program_id: str) -> bytes:
    data = urllib.parse.urlencode({"county": program_id}).encode("ascii")
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
        with urllib.request.urlopen(request, timeout=20) as response:  # noqa: S310
            return read_response(response, REGISTRY_MACHINE_URL)
    except WaterQualityError:
        raise
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise WaterQualityError("source-request-failed") from exc


class CountyDirectoryParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_county_select = False
        self.county_select_count = 0
        self.option_value: str | None = None
        self.option_parts: list[str] = []
        self.programs: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "select" and attributes.get("id") == "County":
            if self.in_county_select:
                raise WaterQualityError("invalid-county-directory")
            self.in_county_select = True
            self.county_select_count += 1
            return
        if tag == "option" and self.in_county_select:
            if self.option_value is not None:
                raise WaterQualityError("invalid-county-directory")
            self.option_value = attributes.get("value", "")
            self.option_parts = []

    def handle_data(self, data: str) -> None:
        if self.in_county_select and self.option_value is not None:
            self.option_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "option" and self.in_county_select and self.option_value is not None:
            name = clean_text(" ".join(self.option_parts), maximum=64)
            value = self.option_value.strip()
            if value:
                if name is None or not value.isdigit():
                    raise WaterQualityError("invalid-county-directory")
                self.programs.append((value, name))
            elif name != "Select a County":
                raise WaterQualityError("invalid-county-directory")
            self.option_value = None
            self.option_parts = []
            return
        if tag == "select" and self.in_county_select:
            if self.option_value is not None:
                raise WaterQualityError("invalid-county-directory")
            self.in_county_select = False


class StationOptionParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.option_value: str | None = None
        self.option_parts: list[str] = []
        self.stations: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "option":
            return
        if self.option_value is not None:
            raise WaterQualityError("invalid-station-registry")
        values = [value for key, value in attrs if key == "value"]
        if len(values) != 1 or values[0] is None:
            raise WaterQualityError("invalid-station-registry")
        self.option_value = values[0]
        self.option_parts = []

    def handle_data(self, data: str) -> None:
        if self.option_value is not None:
            self.option_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "option" or self.option_value is None:
            return
        value = self.option_value.strip()
        name = clean_text(" ".join(self.option_parts), maximum=96)
        if not value:
            if name != "All Stations":
                raise WaterQualityError("invalid-station-registry")
        elif name is None or not BEACHWATCH_STATION_ID_PATTERN.fullmatch(value):
            raise WaterQualityError("invalid-station-registry")
        else:
            self.stations.append((value, name))
        self.option_value = None
        self.option_parts = []


def parse_directory(body: bytes) -> list[tuple[str, str]]:
    try:
        text = body.decode("utf-8")
    except UnicodeError as exc:
        raise WaterQualityError("invalid-county-directory") from exc
    parser = CountyDirectoryParser()
    parser.feed(text)
    parser.close()
    if (
        parser.county_select_count != 1
        or parser.in_county_select
        or parser.option_value is not None
        or tuple(parser.programs) != EXPECTED_COUNTY_PROGRAMS
    ):
        raise WaterQualityError("county-directory-drift")
    return parser.programs


def parse_registry(body: bytes) -> list[tuple[str, str]]:
    try:
        text = body.decode("utf-8")
    except UnicodeError as exc:
        raise WaterQualityError("invalid-station-registry") from exc
    parser = StationOptionParser()
    parser.feed(text)
    parser.close()
    if parser.option_value is not None or len(parser.stations) > MAX_STATION_COUNT:
        raise WaterQualityError("invalid-station-registry")
    if len({station_id for station_id, _ in parser.stations}) != len(parser.stations):
        raise WaterQualityError("invalid-station-registry")
    return parser.stations


def audit_existing_negative_receipts(site_catalog_sha256: str) -> tuple[list[dict[str, Any]], list[str]]:
    receipts: list[dict[str, Any]] = []
    site_ids: list[str] = []
    for relative_path, records_key in NEGATIVE_AUDITS:
        path = ROOT / relative_path
        payload, body = load_json(path)
        records = payload.get(records_key)
        if (
            payload.get("automaticMappingAllowed") is not False
            or payload.get("siteCatalogSha256") != site_catalog_sha256
            or not isinstance(records, list)
        ):
            raise WaterQualityError("invalid-negative-evidence-receipt")
        receipt_site_ids = []
        for record in records:
            site_id = record.get("siteId") if isinstance(record, dict) else None
            if not isinstance(site_id, str):
                raise WaterQualityError("invalid-negative-evidence-receipt")
            receipt_site_ids.append(site_id)
            site_ids.append(site_id)
        receipts.append(
            {
                "path": relative_path,
                "sha256": sha256(body),
                "siteIds": receipt_site_ids,
            }
        )
    duplicates = [site_id for site_id, count in Counter(site_ids).items() if count != 1]
    if duplicates:
        raise WaterQualityError("duplicate-negative-evidence")
    return receipts, site_ids


def build_audit(
    *,
    as_of: datetime,
    directory_body: bytes,
    registry_bodies: dict[str, bytes],
) -> dict[str, Any]:
    programs = parse_directory(directory_body)
    registries = {program_id: parse_registry(body) for program_id, body in registry_bodies.items()}
    if set(registries) != set(RELEVANT_PROGRAM_IDS):
        raise WaterQualityError("invalid-relevant-program-set")

    dumbarton_matches = [
        {"programId": program_id, "stationId": station_id, "stationName": station_name}
        for program_id, stations in registries.items()
        for station_id, station_name in stations
        if "dumbarton" in station_name.casefold()
    ]
    if dumbarton_matches:
        raise WaterQualityError("dumbarton-candidate-requires-review")

    sites_body = SITES_PATH.read_bytes()
    site_catalog_sha256 = sha256(sites_body)
    try:
        sites = json.loads(sites_body)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise WaterQualityError("invalid-site-catalog") from exc
    if not isinstance(sites, list):
        raise WaterQualityError("invalid-site-catalog")
    sites_by_id = {site.get("id"): site for site in sites if isinstance(site, dict)}
    if len(sites_by_id) != len(sites) or None in sites_by_id:
        raise WaterQualityError("invalid-site-catalog")
    dumbarton = sites_by_id.get(DUMBARTON_SITE_ID)
    if (
        not isinstance(dumbarton, dict)
        or dumbarton.get("name") != "Dumbarton Fishing Pier"
        or dumbarton.get("region") != "South Bay"
    ):
        raise WaterQualityError("invalid-dumbarton-site")

    policy, policy_body = load_json(POLICY_PATH)
    overlay, overlay_body = load_json(OVERLAY_PATH)
    overlay_sites = overlay.get("sites")
    mappings = policy.get("site_mappings")
    if not isinstance(overlay_sites, dict) or not isinstance(mappings, dict):
        raise WaterQualityError("invalid-water-quality-contract")
    if overlay.get("siteCatalogSha256") != site_catalog_sha256:
        raise WaterQualityError("site-catalog-hash-mismatch")
    if set(overlay_sites) != set(sites_by_id):
        raise WaterQualityError("site-catalog-coverage-mismatch")

    not_covered_site_ids = sorted(
        site_id
        for site_id, record in overlay_sites.items()
        if isinstance(record, dict) and record.get("status") == "not-covered"
    )
    for site_id in not_covered_site_ids:
        record = overlay_sites[site_id]
        if (
            site_id in mappings
            or record.get("recommendationEffect") != "unknown"
            or record.get("scoreDelta") is not None
        ):
            raise WaterQualityError("unsafe-uncovered-site-state")

    receipts, prior_audited_ids = audit_existing_negative_receipts(site_catalog_sha256)
    expected_prior_ids = sorted(set(not_covered_site_ids) - {DUMBARTON_SITE_ID})
    if sorted(prior_audited_ids) != expected_prior_ids:
        raise WaterQualityError("incomplete-negative-evidence-inventory")
    if DUMBARTON_SITE_ID not in not_covered_site_ids:
        raise WaterQualityError("dumbarton-not-fail-closed")

    evidence_by_site = {
        site_id: receipt["path"]
        for receipt in receipts
        for site_id in receipt["siteIds"]
    }
    evidence_by_site[DUMBARTON_SITE_ID] = "this-receipt:official-directory-review"
    reviewed_sites = [
        {"siteId": site_id, "evidence": evidence_by_site[site_id]}
        for site_id in not_covered_site_ids
    ]

    return {
        "schemaVersion": "castingcompass.water-quality-coverage-inventory/1.0.0",
        "generatedAt": isoformat(as_of),
        "meaning": "negative station-mapping evidence for launch-catalog coverage; never current water quality, clean-water, seafood-safety, or fishing-score evidence",
        "automaticMappingAllowed": False,
        "independentReviewRequired": True,
        "counts": {
            "catalogSites": len(sites),
            "mappedSites": len(sites) - len(not_covered_site_ids),
            "notCoveredSites": len(not_covered_site_ids),
            "priorAuditedNotCoveredSites": len(prior_audited_ids),
            "remainingAfterThisAudit": 0,
        },
        "officialDirectory": {
            "directoryUrl": DIRECTORY_URL,
            "stationRegistryMachineUrl": REGISTRY_MACHINE_URL,
            "alamedaCountyContextUrl": ALAMEDA_CONTEXT_URL,
            "directoryResponseSha256": sha256(directory_body),
            "countyPrograms": [
                {"programId": program_id, "programName": name}
                for program_id, name in programs
            ],
            "alamedaCountyProgramPresent": any(
                name.casefold() == "alameda" for _, name in programs
            ),
            "registryUse": "public station identity and directory scope only; never current status",
            "relevantRegistries": [
                {
                    "programId": program_id,
                    "programName": dict(programs)[program_id],
                    "responseSha256": sha256(registry_bodies[program_id]),
                    "stationCount": len(registries[program_id]),
                    "dumbartonMatches": [],
                }
                for program_id in RELEVANT_PROGRAM_IDS
            ],
        },
        "dumbartonReview": {
            "siteId": DUMBARTON_SITE_ID,
            "siteName": dumbarton["name"],
            "siteCoordinate": {
                "latitude": dumbarton.get("latitude"),
                "longitude": dumbarton.get("longitude"),
            },
            "policyMapped": False,
            "reviewStatus": "local-preliminary-do-not-map",
            "automaticMappingAllowed": False,
            "result": "no-exact-official-station-identity-in-reviewed-directory-scope",
            "reason": "The State directory exposes no Alameda County program, and neither the East Bay Parks District nor Water Boards option set contains a Dumbarton station identity.",
        },
        "negativeEvidenceReceipts": receipts,
        "reviewedNotCoveredSites": reviewed_sites,
        "policySha256": sha256(policy_body),
        "siteCatalogSha256": site_catalog_sha256,
        "overlaySha256": sha256(overlay_body),
        "auditToolSha256": sha256(Path(__file__).read_bytes()),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", help="UTC ISO timestamp for the audit receipt")
    parser.add_argument("--directory-source-file", type=Path)
    parser.add_argument("--east-bay-source-file", type=Path)
    parser.add_argument("--water-boards-source-file", type=Path)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    as_of = parse_as_of(args.as_of) if args.as_of else datetime.now(timezone.utc)
    try:
        directory_body = (
            args.directory_source_file.read_bytes()
            if args.directory_source_file
            else fetch_directory()
        )
        registry_bodies = {
            "19": (
                args.east_bay_source_file.read_bytes()
                if args.east_bay_source_file
                else fetch_registry("19")
            ),
            "20": (
                args.water_boards_source_file.read_bytes()
                if args.water_boards_source_file
                else fetch_registry("20")
            ),
        }
    except OSError as exc:
        raise WaterQualityError("source-file-unavailable") from exc
    payload = build_audit(
        as_of=as_of,
        directory_body=directory_body,
        registry_bodies=registry_bodies,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                **payload["counts"],
                "dumbartonResult": payload["dumbartonReview"]["result"],
                "independentReviewRequired": payload["independentReviewRequired"],
                "output": str(args.output),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
