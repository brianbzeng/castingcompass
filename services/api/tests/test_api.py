from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from services.api.app.main import app, get_repository
from services.api.app.repository import FileRepository


@pytest.fixture
def snapshot_root(tmp_path: Path) -> Path:
    (tmp_path / "data").mkdir()
    (tmp_path / "public" / "data").mkdir(parents=True)
    (tmp_path / "data" / "sites.json").write_text(
        json.dumps(
            {
                "sites": [
                    {
                        "id": "test-pier",
                        "name": "Test Pier",
                        "region": "San Francisco Bay",
                        "latitude": 37.8,
                        "longitude": -122.4,
                        "modes": ["public pier"],
                        "access_notes": "Public pedestrian access during posted hours.",
                        "regulation_url": "https://wildlife.ca.gov/Fishing/Ocean/Regulations/Fishing-Map/sf-bay",
                        "structure_tags": ["channel edge"],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    generated_at = datetime.now(timezone.utc).replace(microsecond=0)
    (tmp_path / "public" / "data" / "opportunities.json").write_text(
        json.dumps(
            {
                "generated_at": generated_at.isoformat(),
                "windows": [
                    {
                        "id": "test-window",
                        "site_id": "test-pier",
                        "species": "california-halibut",
                        "start_time": (generated_at + timedelta(hours=1)).isoformat(),
                        "end_time": (generated_at + timedelta(hours=3)).isoformat(),
                        "opportunity_score": 82,
                        "components": {
                            "habitat_score": 86,
                            "seasonality_score": 78,
                            "dynamic_score": 71,
                            "dynamic_modifier": 0.08,
                        },
                        "confidence": {"level": "high", "score": 0.84},
                        "explanation_factors": [
                            {
                                "label": "Channel edge",
                                "direction": "positive",
                                "impact": 0.3,
                                "detail": "A reachable depth transition is present in the casting zone.",
                            }
                        ],
                        "model_version": "test-v1",
                        "source_freshness": [
                            {
                                "source": "weather",
                                "observed_at": generated_at.isoformat(),
                                "freshness_limit_minutes": 120,
                            },
                            {
                                "source": "tides",
                                "observed_at": "2020-01-01T00:00:00Z",
                                "freshness_limit_minutes": 120,
                            },
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return tmp_path


@pytest.fixture
def client(snapshot_root: Path):
    repository = FileRepository(snapshot_root)
    app.dependency_overrides[get_repository] = lambda: repository
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_lists_map_ready_sites(client: TestClient):
    response = client.get("/v1/sites")
    assert response.status_code == 200
    assert response.headers["cache-control"].startswith("public")
    assert response.json()[0] == {
        "id": "test-pier",
        "name": "Test Pier",
        "region": "San Francisco Bay",
        "locality": None,
        "latitude": 37.8,
        "longitude": -122.4,
        "fishing_modes": ["pier"],
        "access_type": "public",
        "is_accessible": True,
        "structure_tags": ["channel edge"],
        "regulation_url": "https://wildlife.ca.gov/Fishing/Ocean/Regulations/Fishing-Map/sf-bay",
    }


def test_site_detail_and_not_found(client: TestClient):
    response = client.get("/v1/sites/test-pier")
    assert response.status_code == 200
    assert response.json()["access_notes"].startswith("Public pedestrian")
    assert response.json()["official_links"][0]["kind"] == "regulations"
    assert response.json()["next_window"]["opportunity_score"] == 82
    assert response.json()["data_freshness"]
    assert client.get("/v1/sites/does-not-exist").status_code == 404


def test_opportunity_contract_marks_stale_sources_excluded(client: TestClient):
    response = client.get(
        "/v1/opportunities",
        params={"species": "california-halibut", "hours": 4},
    )
    assert response.status_code == 200
    payload = response.json()
    assert datetime.fromisoformat(payload["from"]).tzinfo is not None
    assert "not a catch probability" in payload["score_definition"]
    assert len(payload["windows"]) == 1
    window = payload["windows"][0]
    assert window["rank"] == 1
    assert window["opportunity_score"] == 82
    assert window["status"] == "partial"
    stale = next(item for item in window["source_freshness"] if item["source"] == "tides")
    assert stale["status"] == "stale"
    assert stale["used_in_score"] is False
    assert "limit" in stale["excluded_reason"]


def test_rejects_unsupported_species_and_horizon(client: TestClient):
    assert client.get("/v1/opportunities", params={"species": "striped-bass"}).status_code == 422
    assert client.get("/v1/opportunities", params={"hours": 1000}).status_code == 422


def test_missing_snapshot_returns_explicit_503(tmp_path: Path):
    repository = FileRepository(tmp_path)
    app.dependency_overrides[get_repository] = lambda: repository
    try:
        response = TestClient(app).get("/v1/sites")
    finally:
        app.dependency_overrides.clear()
    assert response.status_code == 503
    assert response.json()["invented_values_used"] is False
    assert response.headers["retry-after"] == "300"
