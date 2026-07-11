from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .models import HealthResponse, OpportunityResponse, SiteDetail, SiteSummary
from .repository import DataUnavailableError, Repository, build_repository, utc_now

API_VERSION = "0.1.0"
LOGGER = logging.getLogger(__name__)

repository = build_repository()


def _origins() -> list[str]:
    configured = os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,https://contourcast.brianbzeng.com",
    )
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


app = FastAPI(
    title="ContourCast API",
    version=API_VERSION,
    description=(
        "Explainable, relative California-halibut opportunity rankings for public shore and pier sites. "
        "Scores are percentiles among currently evaluated options, not catch probabilities. "
        "Bathymetry is not navigational data; regulation links are informational, not legal advice."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins(),
    allow_credentials=False,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "If-None-Match"],
)


def get_repository() -> Repository:
    return repository


RepositoryDependency = Annotated[Repository, Depends(get_repository)]


@app.middleware("http")
async def cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET":
        if request.url.path == "/health":
            response.headers["Cache-Control"] = "no-store"
        elif request.url.path.startswith("/v1/opportunities"):
            response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=600"
        elif request.url.path.startswith("/v1/sites"):
            response.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400"
        response.headers["X-ContourCast-Data-Source"] = getattr(repository, "source", "unknown")
    return response


@app.exception_handler(DataUnavailableError)
async def unavailable_handler(_: Request, exc: DataUnavailableError):
    LOGGER.error("Published data is unavailable: %s", exc)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "The latest verified ContourCast data snapshot is unavailable.",
            "reason": str(exc),
            "invented_values_used": False,
        },
        headers={"Cache-Control": "no-store", "Retry-After": "300"},
    )


@app.get("/health", response_model=HealthResponse, tags=["operations"])
def health(repo: RepositoryDependency) -> HealthResponse:
    try:
        repo.list_sites()
        status = "ok"
    except Exception:
        status = "degraded"
    return HealthResponse(
        status=status,
        version=API_VERSION,
        repository=getattr(repo, "source", "unknown"),
        checked_at=utc_now(),
    )


@app.get("/v1/sites", response_model=list[SiteSummary], tags=["sites"])
def list_sites(repo: RepositoryDependency) -> list[SiteSummary]:
    """Return public, reachable fishing sites and the metadata needed to draw map markers."""
    return [SiteSummary.model_validate(site.model_dump()) for site in repo.list_sites()]


@app.get("/v1/sites/{site_id}", response_model=SiteDetail, tags=["sites"])
def get_site(site_id: str, repo: RepositoryDependency) -> SiteDetail:
    """Return access notes, structure context, official links, and available freshness metadata."""
    site = repo.get_site(site_id)
    if site is None:
        raise HTTPException(status_code=404, detail=f"Unknown fishing site: {site_id}")
    now = utc_now()
    try:
        windows, _ = repo.list_opportunities("california-halibut", now, now + timedelta(hours=72))
        next_window = next((window for window in windows if window.site.id == site_id), None)
    except DataUnavailableError:
        next_window = None
    if next_window is None:
        return site
    return site.model_copy(
        update={
            "current_conditions": next_window.conditions,
            "data_freshness": next_window.source_freshness,
            "next_window": {
                "id": next_window.id,
                "start_time": next_window.start_time,
                "end_time": next_window.end_time,
                "opportunity_score": next_window.opportunity_score,
                "components": next_window.components.model_dump(),
                "confidence": next_window.confidence.model_dump(),
                "status": next_window.status,
                "model_version": next_window.model_version,
            },
        }
    )


@app.get("/v1/opportunities", response_model=OpportunityResponse, tags=["opportunities"])
def list_opportunities(
    repo: RepositoryDependency,
    species: Annotated[
        str,
        Query(pattern="^california-halibut$", description="The v1 model supports California halibut only."),
    ] = "california-halibut",
    from_time: Annotated[
        datetime | None,
        Query(alias="from", description="Inclusive ISO-8601 start time; defaults to the current UTC time."),
    ] = None,
    hours: Annotated[int, Query(ge=2, le=168, description="Forecast horizon, from 2 hours to 7 days.")] = 72,
) -> OpportunityResponse:
    """Rank verified two-hour site windows within the requested horizon."""
    requested_from = from_time or utc_now()
    if requested_from.tzinfo is None:
        requested_from = requested_from.replace(tzinfo=timezone.utc)
    else:
        requested_from = requested_from.astimezone(timezone.utc)
    through = requested_from + timedelta(hours=hours)
    windows, generated_at = repo.list_opportunities(species, requested_from, through)
    return OpportunityResponse(
        species=species,
        from_time=requested_from,
        through=through,
        hours=hours,
        generated_at=generated_at,
        repository=getattr(repo, "source", "unknown"),
        windows=windows,
    )
