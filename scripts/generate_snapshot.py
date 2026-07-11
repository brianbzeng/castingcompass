#!/usr/bin/env python3
"""Build the static ContourCast demo snapshot from public forecast endpoints.

The generator is deterministic for a fixed ``--as-of`` timestamp and the same
upstream responses. Missing upstream values stay null and contribute a neutral
value to the dynamic component; they are never replaced by invented weather or
ocean observations.
"""

from __future__ import annotations

import argparse
from bisect import bisect_left, bisect_right
import json
import re
import shutil
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
SITES_PATH = ROOT / "data" / "sites.json"
PUBLIC_DATA = ROOT / "public" / "data"
USER_AGENT = "ContourCast/0.1 (public-data demo; contact: bzeng0000@gmail.com)"
PACIFIC = ZoneInfo("America/Los_Angeles")

WEATHER_ANCHORS = {
    "point-reyes": (38.04, -122.96),
    "marin-coast": (37.90, -122.64),
    "north-bay": (37.94, -122.47),
    "golden-gate": (37.81, -122.48),
    "sf-coast": (37.70, -122.50),
    "central-bay": (37.80, -122.39),
    "east-bay": (37.86, -122.32),
    "south-bay": (37.68, -122.14),
    "peninsula-bay": (37.61, -122.34),
    "half-moon-bay": (37.49, -122.47),
}

BUOY_BY_ANCHOR = {
    "point-reyes": "46013",
    "marin-coast": "46013",
    "north-bay": "46026",
    "golden-gate": "46026",
    "sf-coast": "46026",
    "central-bay": "46026",
    "east-bay": "46026",
    "south-bay": "46026",
    "peninsula-bay": "46026",
    "half-moon-bay": "46012",
}

# Product-design seasonal prior. It remains explicitly a versioned fixture
# until a reproducible monthly RecFIN extract is committed.
SEASONALITY_BY_MONTH = {
    1: 34,
    2: 37,
    3: 44,
    4: 57,
    5: 70,
    6: 82,
    7: 88,
    8: 86,
    9: 79,
    10: 66,
    11: 49,
    12: 38,
}

OPEN_COAST_REGIONS = {
    "Point Reyes",
    "Marin Coast",
    "San Francisco Coast",
    "San Mateo Coast",
    "Half Moon Bay",
}


def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def request_json(url: str, timeout: int = 20) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def request_text(url: str, timeout: int = 20) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/plain"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8")


def next_even_hour(value: datetime) -> datetime:
    value = value.astimezone(timezone.utc)
    if value.minute or value.second or value.microsecond:
        value = value.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    if value.hour % 2:
        value += timedelta(hours=1)
    return value


def fetch_tides(station: str, start: datetime, end: datetime) -> dict[str, Any]:
    params = {
        "product": "predictions",
        "application": "ContourCast",
        "begin_date": start.strftime("%Y%m%d"),
        "end_date": end.strftime("%Y%m%d"),
        "datum": "MLLW",
        "station": station,
        "time_zone": "gmt",
        "units": "metric",
        "interval": "60",
        "format": "json",
    }
    url = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?" + urllib.parse.urlencode(params)
    try:
        payload = request_json(url)
        predictions = []
        for item in payload.get("predictions", []):
            stamp = datetime.strptime(item["t"], "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
            predictions.append((stamp, float(item["v"])))
        if not predictions:
            raise ValueError(payload.get("error", {}).get("message", "no predictions returned"))
        return {"status": "fresh", "url": url, "values": predictions, "error": None}
    except (OSError, ValueError, KeyError, urllib.error.URLError) as exc:
        return {"status": "unavailable-excluded", "url": url, "values": [], "error": str(exc)}


def fetch_hourly_weather(anchor: str) -> dict[str, Any]:
    lat, lon = WEATHER_ANCHORS[anchor]
    points_url = f"https://api.weather.gov/points/{lat:.4f},{lon:.4f}"
    try:
        points = request_json(points_url)
        forecast_url = points["properties"]["forecastHourly"]
        payload = request_json(forecast_url)
        periods = []
        for item in payload["properties"]["periods"]:
            speed_match = re.search(r"\d+(?:\s+to\s+(\d+))?", str(item.get("windSpeed", "")))
            wind = None
            if speed_match:
                numbers = [float(number) for number in re.findall(r"\d+", speed_match.group(0))]
                wind = sum(numbers) / len(numbers)
            periods.append(
                {
                    "start": parse_iso(item["startTime"]),
                    "end": parse_iso(item["endTime"]),
                    "windMph": wind,
                    "temperatureF": float(item["temperature"]) if item.get("temperatureUnit") == "F" else None,
                    "isDaytime": bool(item.get("isDaytime")),
                    "shortForecast": item.get("shortForecast"),
                }
            )
        updated_raw = payload.get("properties", {}).get("updated") or payload.get("properties", {}).get("updateTime")
        return {
            "status": "fresh",
            "url": forecast_url,
            "updated": parse_iso(updated_raw) if updated_raw else None,
            "periods": periods,
            "error": None,
        }
    except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError) as exc:
        return {
            "status": "unavailable-excluded",
            "url": points_url,
            "updated": None,
            "periods": [],
            "error": str(exc),
        }


def fetch_buoy_observation(station: str) -> dict[str, Any]:
    url = f"https://www.ndbc.noaa.gov/data/realtime2/{station}.txt"
    try:
        lines = [line for line in request_text(url).splitlines() if line.strip()]
        headers = lines[0].lstrip("#").split()
        row = lines[2].split() if len(lines) > 2 and lines[1].startswith("#") else lines[1].split()
        values = dict(zip(headers, row))
        observed = datetime(
            int(values["YY"]),
            int(values["MM"]),
            int(values["DD"]),
            int(values["hh"]),
            int(values["mm"]),
            tzinfo=timezone.utc,
        )

        def numeric(key: str) -> float | None:
            raw = values.get(key)
            if raw in {None, "MM", "99.0", "999.0"}:
                return None
            return float(raw)

        wave_m = numeric("WVHT")
        water_c = numeric("WTMP")
        return {
            "status": "fresh",
            "url": url,
            "observed": observed,
            "swellFeet": round(wave_m * 3.28084, 1) if wave_m is not None else None,
            "waterTempF": round((water_c * 9 / 5) + 32, 1) if water_c is not None else None,
            "error": None,
        }
    except (OSError, ValueError, KeyError, IndexError, urllib.error.URLError) as exc:
        return {
            "status": "unavailable-excluded",
            "url": url,
            "observed": None,
            "swellFeet": None,
            "waterTempF": None,
            "error": str(exc),
        }


def nearest_tide(values: list[tuple[datetime, float]], target: datetime) -> float | None:
    if not values:
        return None
    stamp, value = min(values, key=lambda item: abs((item[0] - target).total_seconds()))
    if abs((stamp - target).total_seconds()) > 75 * 60:
        return None
    return value


def tide_for_window(values: list[tuple[datetime, float]], start: datetime, end: datetime) -> tuple[str, float | None]:
    first = nearest_tide(values, start)
    last = nearest_tide(values, end)
    if first is None or last is None:
        return "unavailable", None
    change = last - first
    if change > 0.08:
        return "rising", round(abs(change), 2)
    if change < -0.08:
        return "falling", round(abs(change), 2)
    before = nearest_tide(values, start - timedelta(hours=2))
    after = nearest_tide(values, end + timedelta(hours=2))
    if before is not None and after is not None and first >= before and last >= after:
        return "near high slack", round(abs(change), 2)
    if before is not None and after is not None and first <= before and last <= after:
        return "near low slack", round(abs(change), 2)
    return "slack", round(abs(change), 2)


def weather_for_window(periods: list[dict[str, Any]], midpoint: datetime) -> dict[str, Any] | None:
    matches = [period for period in periods if period["start"] <= midpoint < period["end"]]
    if matches:
        return matches[0]
    if not periods:
        return None
    nearest = min(periods, key=lambda period: abs((period["start"] - midpoint).total_seconds()))
    return nearest if abs((nearest["start"] - midpoint).total_seconds()) <= 90 * 60 else None


def daylight_fallback(midpoint: datetime) -> bool:
    local = midpoint.astimezone(PACIFIC)
    # Conservative Bay Area summer fallback used only when NWS is unavailable.
    return (local.hour, local.minute) >= (6, 0) and (local.hour, local.minute) < (20, 30)


def tide_subscore(change_m: float | None) -> float:
    if change_m is None:
        return 50
    if change_m < 0.08:
        return 35
    if change_m < 0.2:
        return 62
    if change_m <= 0.75:
        return 86
    if change_m <= 1.15:
        return 70
    return 50


def wind_subscore(wind_mph: float | None) -> float:
    if wind_mph is None:
        return 50
    if wind_mph <= 7:
        return 88
    if wind_mph <= 12:
        return 75
    if wind_mph <= 18:
        return 55
    if wind_mph <= 25:
        return 30
    return 12


def swell_subscore(swell_feet: float | None) -> float:
    if swell_feet is None:
        return 50
    if 1.5 <= swell_feet <= 4.5:
        return 82
    if swell_feet < 1.5:
        return 68
    if swell_feet <= 6.5:
        return 55
    if swell_feet <= 8:
        return 32
    return 12


def dynamic_score(
    tide_change: float | None,
    wind_mph: float | None,
    swell_feet: float | None,
    daylight: bool,
    open_coast: bool,
) -> int:
    weighted = [(tide_subscore(tide_change), 0.42), (wind_subscore(wind_mph), 0.38), (72 if daylight else 48, 0.20)]
    if open_coast:
        weighted = [(value, weight * 0.82) for value, weight in weighted]
        weighted.append((swell_subscore(swell_feet), 0.18))
    raw = sum(value * weight for value, weight in weighted) / sum(weight for _, weight in weighted)
    # Conditions are deliberately bounded so a transient forecast cannot erase
    # long-term habitat evidence in the combined rank.
    return round(max(30, min(78, raw)))


def factor_text(
    site: dict[str, Any],
    seasonality: int,
    tide_stage: str,
    tide_change: float | None,
    wind_mph: float | None,
    swell_feet: float | None,
    daylight: bool,
) -> list[str]:
    tags = ", ".join(site["structureTags"][:2]).replace("-", " ")
    factors = [f"Habitat proxy favors the site's {tags}; this demo value is not yet the trained bathymetry model."]
    factors.append(f"July seasonal index is {seasonality}/100 from the provisional fixture pending a reproducible RecFIN export.")
    if tide_change is None:
        factors.append("NOAA tide prediction was unavailable, so tide contributed a neutral value and is marked excluded.")
    else:
        factors.append(f"NOAA predicts a {tide_stage} tide with {tide_change:.2f} m of change across this window.")
    if wind_mph is None:
        factors.append("NWS wind forecast was unavailable, so wind contributed a neutral value and is marked excluded.")
    else:
        factors.append(f"NWS hourly wind is approximately {wind_mph:.0f} mph for the middle of the window.")
    if site["region"] in OPEN_COAST_REGIONS:
        if swell_feet is None:
            factors.append("The latest buoy observation is outside its six-hour freshness limit for this window, so swell and SST are excluded.")
        else:
            factors.append(f"Fresh NDBC swell observation is {swell_feet:.1f} ft; treat it as a near-term observation, not a 72-hour forecast.")
    factors.append("Daylight is included." if daylight else "This is a nighttime window; verify access hours before traveling.")
    return factors


def source_status(results: list[dict[str, Any]]) -> str:
    statuses = {result["status"] for result in results}
    if statuses == {"fresh"}:
        return "fresh"
    if "fresh" in statuses:
        return "partial; missing inputs excluded"
    return "unavailable; excluded"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--as-of", help="UTC ISO timestamp used to anchor the 72-hour snapshot")
    args = parser.parse_args()

    generated_at = parse_iso(args.as_of) if args.as_of else datetime.now(timezone.utc)
    start = next_even_hour(generated_at)
    end = start + timedelta(hours=72)
    sites = json.loads(SITES_PATH.read_text())

    tide_results = {
        station: fetch_tides(station, start - timedelta(hours=3), end + timedelta(hours=3))
        for station in sorted({site["tideStation"] for site in sites})
    }
    weather_results = {
        anchor: fetch_hourly_weather(anchor) for anchor in sorted({site["weatherAnchor"] for site in sites})
    }
    buoy_results = {
        station: fetch_buoy_observation(station) for station in sorted(set(BUOY_BY_ANCHOR.values()))
    }

    windows: list[dict[str, Any]] = []
    for site in sites:
        habitat = int(site["habitatPrior"])
        tide_result = tide_results[site["tideStation"]]
        weather_result = weather_results[site["weatherAnchor"]]
        buoy_result = buoy_results[BUOY_BY_ANCHOR[site["weatherAnchor"]]]
        for index in range(36):
            window_start = start + timedelta(hours=index * 2)
            window_end = window_start + timedelta(hours=2)
            midpoint = window_start + timedelta(hours=1)
            seasonality = SEASONALITY_BY_MONTH[midpoint.astimezone(PACIFIC).month]
            tide_stage, tide_change = tide_for_window(tide_result["values"], window_start, window_end)
            weather = weather_for_window(weather_result["periods"], midpoint)
            wind_mph = round(weather["windMph"], 1) if weather and weather["windMph"] is not None else None
            daylight = weather["isDaytime"] if weather else daylight_fallback(midpoint)
            open_coast = site["region"] in OPEN_COAST_REGIONS

            buoy_fresh = (
                open_coast
                and buoy_result["status"] == "fresh"
                and buoy_result["observed"] is not None
                and timedelta(hours=-1) <= window_start - buoy_result["observed"] <= timedelta(hours=6)
            )
            swell_feet = buoy_result["swellFeet"] if buoy_fresh else None
            water_temp_f = buoy_result["waterTempF"] if buoy_fresh else None
            dynamic = dynamic_score(
                tide_change,
                wind_mph,
                swell_feet,
                daylight,
                open_coast,
            )
            raw_score = (0.52 * habitat) + (0.18 * seasonality) + (0.30 * dynamic)
            available_primary = int(tide_change is not None) + int(wind_mph is not None)
            confidence = "medium" if available_primary == 2 else "low"
            freshness = {
                "tides": tide_result["status"],
                "weather": weather_result["status"] if weather else "unavailable-excluded",
                "buoy": (
                    "fresh"
                    if buoy_fresh
                    else "not-applicable-excluded"
                    if not open_coast
                    else "stale-or-unavailable-excluded"
                ),
                "currents": "not-integrated-excluded",
                "satellite": "not-integrated-excluded",
            }
            windows.append(
                {
                    "id": f"{site['id']}--{window_start.strftime('%Y%m%dT%H%MZ')}",
                    "siteId": site["id"],
                    "start": isoformat(window_start),
                    "end": isoformat(window_end),
                    "score": 0,
                    "habitatScore": habitat,
                    "seasonalityScore": seasonality,
                    "dynamicScore": dynamic,
                    "confidence": confidence,
                    "rank": 0,
                    "explanationFactors": factor_text(
                        site,
                        seasonality,
                        tide_stage,
                        tide_change,
                        wind_mph,
                        swell_feet,
                        daylight,
                    ),
                    "conditions": {
                        "tideStage": tide_stage,
                        "currentKnots": None,
                        "windMph": wind_mph,
                        "swellFeet": swell_feet,
                        "waterTempF": water_temp_f,
                        "daylight": daylight,
                    },
                    "sourceFreshness": freshness,
                    "_rawScore": round(raw_score, 6),
                }
            )

    ordered = sorted(windows, key=lambda item: (-item["_rawScore"], item["start"], item["siteId"]))
    denominator = max(1, len(ordered) - 1)
    ascending_raw_scores = sorted(item["_rawScore"] for item in ordered)
    for rank, item in enumerate(ordered, start=1):
        item["rank"] = rank
        # Equal combined values receive the same empirical percentile even
        # though rank remains deterministic for list ordering.
        lower_index = bisect_left(ascending_raw_scores, item["_rawScore"])
        upper_index = bisect_right(ascending_raw_scores, item["_rawScore"]) - 1
        tie_midpoint = (lower_index + upper_index) / 2
        item["score"] = round(100 * tie_midpoint / denominator)
        del item["_rawScore"]

    retrieved_at = isoformat(generated_at)
    tide_status = source_status(list(tide_results.values()))
    weather_status = source_status(list(weather_results.values()))
    buoy_status = source_status(list(buoy_results.values()))
    sources = [
        {
            "name": "NOAA CO-OPS hourly tide predictions",
            "observedAt": retrieved_at,
            "status": tide_status,
            "url": "https://api.tidesandcurrents.noaa.gov/api/prod/",
            "freshnessLimitHours": 84,
        },
        {
            "name": "National Weather Service hourly forecasts",
            "observedAt": isoformat(max((result["updated"] for result in weather_results.values() if result["updated"]), default=generated_at)),
            "status": weather_status,
            "url": "https://api.weather.gov/",
            "freshnessLimitHours": 6,
        },
        {
            "name": "NOAA NDBC buoy observations",
            "observedAt": isoformat(max((result["observed"] for result in buoy_results.values() if result["observed"]), default=generated_at)),
            "status": buoy_status + "; observations excluded from windows more than six hours ahead",
            "url": "https://www.ndbc.noaa.gov/",
            "freshnessLimitHours": 6,
        },
        {
            "name": "Provisional monthly California halibut seasonality fixture",
            "observedAt": "2024-12-31T00:00:00Z",
            "status": "prototype prior only; not yet reproduced from a RecFIN export",
            "url": "https://reports.psmfc.org/recfin/",
        },
        {
            "name": "NOAA NCEI bathymetry / curated habitat proxy",
            "observedAt": "2018-01-01T00:00:00Z",
            "status": "demo proxy; trained raster model not yet integrated",
            "url": "https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ngdc.mgg.dem%3Asan_francisco_bay_P090_2018",
        },
        {
            "name": "NOAA currents and CoastWatch satellite inputs",
            "observedAt": retrieved_at,
            "status": "not integrated; excluded from scoring",
            "url": "https://coastwatch.noaa.gov/erddap/index.html",
        },
    ]

    payload = {
        "schemaVersion": "1.0.0",
        "generatedAt": retrieved_at,
        "validFrom": isoformat(start),
        "validThrough": isoformat(end),
        "modelVersion": "contourcast-hybrid-demo-0.1.0",
        "status": "demo-public-data-snapshot",
        "species": "california-halibut",
        "scoreDefinition": f"A score of 80 means this site/window ranks above 80% of the {len(ordered):,} options in this snapshot; it is not an 80% catch probability.",
        "notice": "Conditions are informational only. Check official access and CDFW rules. Bathymetry is not for navigation.",
        "sources": sources,
        "windows": ordered,
    }

    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SITES_PATH, PUBLIC_DATA / "sites.json")
    (PUBLIC_DATA / "opportunities.json").write_text(json.dumps(payload, indent=2) + "\n")

    failures = {
        "tides": {station: result["error"] for station, result in tide_results.items() if result["error"]},
        "weather": {anchor: result["error"] for anchor, result in weather_results.items() if result["error"]},
        "buoys": {station: result["error"] for station, result in buoy_results.items() if result["error"]},
    }
    print(
        json.dumps(
            {
                "siteCount": len(sites),
                "windowCount": len(ordered),
                "validFrom": payload["validFrom"],
                "validThrough": payload["validThrough"],
                "upstreamFailures": failures,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
