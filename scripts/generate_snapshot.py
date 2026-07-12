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
import math
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


def grid_value_for_time(values: list[dict[str, Any]], target: datetime) -> float | None:
    """Read a numeric value from an NWS forecastGridData valid-time interval."""

    for item in values:
        try:
            start_raw, duration_raw = item["validTime"].split("/", 1)
            match = re.fullmatch(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?", duration_raw)
            if not match:
                continue
            duration = timedelta(
                days=int(match.group(1) or 0),
                hours=int(match.group(2) or 0),
                minutes=int(match.group(3) or 0),
            )
            start = parse_iso(start_raw)
            value = item.get("value")
            if start <= target < start + duration and value is not None:
                return float(value)
        except (KeyError, TypeError, ValueError):
            continue
    return None


def request_json(url: str, timeout: int = 20) -> Any:
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
        grid_url = points["properties"].get("forecastGridData")
        payload = request_json(forecast_url)
        sky_cover_values: list[dict[str, Any]] = []
        grid_error = None
        if grid_url:
            try:
                grid_payload = request_json(grid_url)
                sky_cover_values = grid_payload.get("properties", {}).get("skyCover", {}).get("values", [])
            except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError) as exc:
                grid_error = str(exc)
        periods = []
        for item in payload["properties"]["periods"]:
            speed_match = re.search(r"\d+(?:\s+to\s+(\d+))?", str(item.get("windSpeed", "")))
            wind = None
            if speed_match:
                numbers = [float(number) for number in re.findall(r"\d+", speed_match.group(0))]
                wind = sum(numbers) / len(numbers)
            period_start = parse_iso(item["startTime"])
            period_end = parse_iso(item["endTime"])
            periods.append(
                {
                    "start": period_start,
                    "end": period_end,
                    "windMph": wind,
                    "temperatureF": float(item["temperature"]) if item.get("temperatureUnit") == "F" else None,
                    "isDaytime": bool(item.get("isDaytime")),
                    "shortForecast": item.get("shortForecast"),
                    "cloudCoverPct": grid_value_for_time(sky_cover_values, period_start + (period_end - period_start) / 2),
                }
            )
        updated_raw = payload.get("properties", {}).get("updated") or payload.get("properties", {}).get("updateTime")
        return {
            "status": "fresh",
            "url": forecast_url,
            "gridUrl": grid_url,
            "gridError": grid_error,
            "updated": parse_iso(updated_raw) if updated_raw else None,
            "periods": periods,
            "error": None,
        }
    except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError) as exc:
        return {
            "status": "unavailable-excluded",
            "url": points_url,
            "gridUrl": None,
            "gridError": None,
            "updated": None,
            "periods": [],
            "error": str(exc),
        }


def fetch_buoy_observation(station: str) -> dict[str, Any]:
    url = f"https://www.ndbc.noaa.gov/data/realtime2/{station}.txt"
    try:
        lines = [line for line in request_text(url).splitlines() if line.strip()]
        headers = lines[0].lstrip("#").split()
        records: list[tuple[datetime, dict[str, str]]] = []
        for line in lines[1:]:
            if line.startswith("#"):
                continue
            values = dict(zip(headers, line.split()))
            try:
                observed = datetime(
                    int(values["YY"]),
                    int(values["MM"]),
                    int(values["DD"]),
                    int(values["hh"]),
                    int(values["mm"]),
                    tzinfo=timezone.utc,
                )
            except (KeyError, TypeError, ValueError):
                continue
            records.append((observed, values))
        if not records:
            raise ValueError("no parseable buoy observations")
        records.sort(key=lambda item: item[0], reverse=True)

        def numeric(values: dict[str, str], key: str) -> float | None:
            raw = values.get(key)
            if raw in {None, "MM"}:
                return None
            try:
                value = float(raw)
            except (TypeError, ValueError):
                return None
            if not math.isfinite(value):
                return None
            if key == "WVHT" and value >= 99:
                return None
            if key == "WTMP" and value >= 999:
                return None
            return value

        def latest_valid(key: str) -> tuple[datetime | None, float | None]:
            for stamp, values in records:
                value = numeric(values, key)
                if value is not None:
                    return stamp, value
            return None, None

        swell_observed, wave_m = latest_valid("WVHT")
        water_observed, water_c = latest_valid("WTMP")
        pressure_observed, pressure_hpa = latest_valid("PRES")
        pressure_trend_hpa_3h = None
        if pressure_observed is not None and pressure_hpa is not None:
            target = pressure_observed - timedelta(hours=3)
            historical_pressure = None
            historical_stamp = None
            for stamp, values in records:
                candidate = numeric(values, "PRES")
                if candidate is None:
                    continue
                if historical_stamp is None or abs((stamp - target).total_seconds()) < abs((historical_stamp - target).total_seconds()):
                    historical_stamp = stamp
                    historical_pressure = candidate
            if (
                historical_stamp is not None
                and historical_pressure is not None
                and abs((historical_stamp - target).total_seconds()) <= 90 * 60
            ):
                pressure_trend_hpa_3h = round(pressure_hpa - historical_pressure, 1)
        observed = records[0][0]
        if wave_m is None and water_c is None and pressure_hpa is None:
            raise ValueError("no valid WVHT, WTMP, or PRES values in buoy observations")
        return {
            "status": "fresh",
            "url": url,
            "observed": observed,
            "swellObserved": swell_observed,
            "waterObserved": water_observed,
            "pressureObserved": pressure_observed,
            "swellFeet": round(wave_m * 3.28084, 1) if wave_m is not None else None,
            "waterTempF": round((water_c * 9 / 5) + 32, 1) if water_c is not None else None,
            "pressureHpa": round(pressure_hpa, 1) if pressure_hpa is not None else None,
            "pressureTrendHpa3h": pressure_trend_hpa_3h,
            "error": None,
        }
    except (OSError, ValueError, KeyError, IndexError, urllib.error.URLError) as exc:
        return {
            "status": "unavailable-excluded",
            "url": url,
            "observed": None,
            "swellObserved": None,
            "waterObserved": None,
            "pressureObserved": None,
            "swellFeet": None,
            "waterTempF": None,
            "pressureHpa": None,
            "pressureTrendHpa3h": None,
            "error": str(exc),
        }


def fetch_marine_sst(anchors: list[str], start: datetime, end: datetime) -> dict[str, dict[str, Any]]:
    """Fetch hourly SST for all weather anchors in one Open-Meteo request.

    The public endpoint is appropriate for this non-commercial prototype only.
    A paid customer endpoint and API key are required before subscriptions,
    advertising, or another commercial launch.
    """

    ordered_anchors = list(dict.fromkeys(anchors))
    if not ordered_anchors:
        return {}
    params = {
        "latitude": ",".join(f"{WEATHER_ANCHORS[anchor][0]:.4f}" for anchor in ordered_anchors),
        "longitude": ",".join(f"{WEATHER_ANCHORS[anchor][1]:.4f}" for anchor in ordered_anchors),
        "hourly": "sea_surface_temperature",
        "timezone": "GMT",
        "cell_selection": "sea",
        "start_hour": start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M"),
        "end_hour": end.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M"),
    }
    url = "https://marine-api.open-meteo.com/v1/marine?" + urllib.parse.urlencode(params)
    results = {
        anchor: {"status": "unavailable-excluded", "url": url, "values": [], "error": None}
        for anchor in ordered_anchors
    }
    try:
        payload = request_json(url)
        locations = payload if isinstance(payload, list) else [payload]
        if len(locations) != len(ordered_anchors):
            raise ValueError(f"expected {len(ordered_anchors)} marine locations, received {len(locations)}")
        for anchor, location in zip(ordered_anchors, locations):
            hourly = location.get("hourly", {})
            times = hourly.get("time", [])
            temperatures = hourly.get("sea_surface_temperature", [])
            values: list[tuple[datetime, float]] = []
            for raw_time, raw_temperature in zip(times, temperatures):
                if raw_temperature is None:
                    continue
                try:
                    temperature_c = float(raw_temperature)
                except (TypeError, ValueError):
                    continue
                if not math.isfinite(temperature_c):
                    continue
                values.append((parse_iso(raw_time), round((temperature_c * 9 / 5) + 32, 1)))
            if values:
                results[anchor] = {"status": "fresh", "url": url, "values": values, "error": None}
            else:
                results[anchor]["error"] = "no valid sea-surface-temperature values returned"
        return results
    except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError) as exc:
        for result in results.values():
            result["error"] = str(exc)
        return results


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


def tide_levels_for_window(
    values: list[tuple[datetime, float]], start: datetime, end: datetime
) -> list[float] | None:
    levels_m = [
        nearest_tide(values, start - timedelta(hours=2)),
        nearest_tide(values, start),
        nearest_tide(values, end),
        nearest_tide(values, end + timedelta(hours=2)),
    ]
    if any(level is None for level in levels_m):
        return None
    return [round(float(level) * 3.28084, 2) for level in levels_m]


def weather_for_window(periods: list[dict[str, Any]], midpoint: datetime) -> dict[str, Any] | None:
    matches = [period for period in periods if period["start"] <= midpoint < period["end"]]
    if matches:
        return matches[0]
    if not periods:
        return None
    nearest = min(periods, key=lambda period: abs((period["start"] - midpoint).total_seconds()))
    return nearest if abs((nearest["start"] - midpoint).total_seconds()) <= 90 * 60 else None


def sst_for_window(values: list[tuple[datetime, float]], midpoint: datetime) -> float | None:
    if not values:
        return None
    stamp, temperature_f = min(values, key=lambda item: abs((item[0] - midpoint).total_seconds()))
    if abs((stamp - midpoint).total_seconds()) > 90 * 60:
        return None
    return temperature_f


def daylight_fallback(midpoint: datetime) -> bool:
    local = midpoint.astimezone(PACIFIC)
    # Conservative Bay Area summer fallback used only when NWS is unavailable.
    return (local.hour, local.minute) >= (6, 0) and (local.hour, local.minute) < (20, 30)


def moon_details(moment: datetime) -> tuple[str, float, float]:
    """Return display phase, illuminated percent, and lunar age in days."""

    reference_new_moon = datetime(2000, 1, 6, 18, 14, tzinfo=timezone.utc)
    synodic_month = 29.53058867
    age = ((moment - reference_new_moon).total_seconds() / 86400) % synodic_month
    illumination = 50 * (1 - math.cos(2 * math.pi * age / synodic_month))
    phase_index = int(((age / synodic_month) * 8) + 0.5) % 8
    phase_names = [
        "new moon",
        "waxing crescent",
        "first quarter",
        "waxing gibbous",
        "full moon",
        "waning gibbous",
        "last quarter",
        "waning crescent",
    ]
    return phase_names[phase_index], round(illumination, 1), age


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


def cloud_subscore(cloud_cover_pct: float | None) -> float:
    if cloud_cover_pct is None:
        return 50
    # Moderate cover can extend low-light feeding without treating a fully
    # overcast forecast as automatically superior.
    if 35 <= cloud_cover_pct <= 80:
        return 76
    if cloud_cover_pct < 15:
        return 58
    return 66


def pressure_subscore(pressure_trend_hpa_3h: float | None) -> float:
    if pressure_trend_hpa_3h is None:
        return 50
    change = abs(pressure_trend_hpa_3h)
    if change <= 1.5:
        return 72
    if change <= 3:
        return 62
    if change <= 5:
        return 46
    return 30


def water_temp_subscore(water_temp_f: float | None) -> float:
    if water_temp_f is None:
        return 50
    if 54 <= water_temp_f <= 65:
        return 78
    if 50 <= water_temp_f <= 69:
        return 64
    return 45


def moon_subscore(lunar_age_days: float) -> float:
    # This stays deliberately low-weight. Tide predictions already contain
    # much of the lunar signal, so a second large lunar boost would double-count it.
    spring_tide_proximity = abs(math.cos(2 * math.pi * lunar_age_days / 29.53058867))
    return 52 + (18 * spring_tide_proximity)


def dynamic_score(
    tide_change: float | None,
    wind_mph: float | None,
    swell_feet: float | None,
    daylight: bool,
    open_coast: bool,
    cloud_cover_pct: float | None,
    pressure_trend_hpa_3h: float | None,
    water_temp_f: float | None,
    lunar_age_days: float,
) -> int:
    weighted = [
        (tide_subscore(tide_change), 0.34),
        (wind_subscore(wind_mph), 0.24),
        (72 if daylight else 48, 0.07),
        (cloud_subscore(cloud_cover_pct), 0.05),
        (pressure_subscore(pressure_trend_hpa_3h), 0.07),
        (water_temp_subscore(water_temp_f), 0.08),
        (moon_subscore(lunar_age_days), 0.05),
    ]
    if open_coast:
        weighted = [(value, weight * 0.85) for value, weight in weighted]
        weighted.append((swell_subscore(swell_feet), 0.15))
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
    water_temp_f: float | None,
    ndbc_water_temp_f: float | None,
    daylight: bool,
    cloud_cover_pct: float | None,
    pressure_hpa: float | None,
    pressure_trend_hpa_3h: float | None,
    moon_phase: str,
    moon_illumination_pct: float,
) -> list[str]:
    tags = ", ".join(site["structureTags"][:2]).replace("-", " ")
    factors = [f"Look for {tags}.", f"Time of year: {seasonality}/100."]
    if tide_change is None:
        factors.append("Tide forecast unavailable.")
    else:
        factors.append(f"Tide: {tide_stage}, changing {tide_change:.2f} m.")
    condition_bits = []
    if wind_mph is not None:
        condition_bits.append(f"{wind_mph:.0f} mph wind")
    if cloud_cover_pct is not None:
        condition_bits.append(f"{cloud_cover_pct:.0f}% cloud")
    if water_temp_f is not None:
        condition_bits.append(f"{water_temp_f:.1f}°F water")
    if condition_bits:
        factors.append("Conditions: " + ", ".join(condition_bits) + ".")
    if site["region"] in OPEN_COAST_REGIONS:
        if swell_feet is None:
            factors.append("Fresh swell reading unavailable.")
        else:
            factors.append(f"Nearby swell: {swell_feet:.1f} ft.")
    sky_bits = []
    if pressure_hpa is not None:
        trend = "steady" if pressure_trend_hpa_3h is None or abs(pressure_trend_hpa_3h) <= 1.5 else "changing"
        sky_bits.append(f"pressure {trend} at {pressure_hpa:.0f} hPa")
    sky_bits.append(f"{moon_phase} moon, {moon_illumination_pct:.0f}% lit")
    factors.append("Sky: " + "; ".join(sky_bits) + ".")
    factors.append("Daylight window." if daylight else "After dark—check access hours.")
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
    active_sites = [site for site in sites if site.get("accessStatus") != "closed"]

    tide_results = {
        station: fetch_tides(station, start - timedelta(hours=3), end + timedelta(hours=3))
        for station in sorted({site["tideStation"] for site in active_sites})
    }
    weather_results = {
        anchor: fetch_hourly_weather(anchor) for anchor in sorted({site["weatherAnchor"] for site in active_sites})
    }
    buoy_results = {
        station: fetch_buoy_observation(station)
        for station in sorted({BUOY_BY_ANCHOR[site["weatherAnchor"]] for site in active_sites})
    }
    marine_sst_results = fetch_marine_sst(
        sorted({site["weatherAnchor"] for site in active_sites}), start, end
    )

    windows: list[dict[str, Any]] = []
    for site in active_sites:
        habitat = int(site["habitatPrior"])
        tide_result = tide_results[site["tideStation"]]
        weather_result = weather_results[site["weatherAnchor"]]
        buoy_result = buoy_results[BUOY_BY_ANCHOR[site["weatherAnchor"]]]
        marine_sst_result = marine_sst_results[site["weatherAnchor"]]
        for index in range(36):
            window_start = start + timedelta(hours=index * 2)
            window_end = window_start + timedelta(hours=2)
            midpoint = window_start + timedelta(hours=1)
            seasonality = SEASONALITY_BY_MONTH[midpoint.astimezone(PACIFIC).month]
            tide_stage, tide_change = tide_for_window(tide_result["values"], window_start, window_end)
            tide_levels_feet = tide_levels_for_window(tide_result["values"], window_start, window_end)
            weather = weather_for_window(weather_result["periods"], midpoint)
            wind_mph = round(weather["windMph"], 1) if weather and weather["windMph"] is not None else None
            cloud_cover_pct = round(weather["cloudCoverPct"], 1) if weather and weather["cloudCoverPct"] is not None else None
            daylight = weather["isDaytime"] if weather else daylight_fallback(midpoint)
            moon_phase, moon_illumination_pct, lunar_age_days = moon_details(midpoint)
            open_coast = site["region"] in OPEN_COAST_REGIONS

            swell_fresh = (
                open_coast
                and buoy_result["status"] == "fresh"
                and buoy_result["swellObserved"] is not None
                and timedelta(hours=-1) <= window_start - buoy_result["swellObserved"] <= timedelta(hours=6)
            )
            ndbc_water_fresh = (
                buoy_result["status"] == "fresh"
                and buoy_result["waterObserved"] is not None
                and timedelta(hours=-1) <= generated_at - buoy_result["waterObserved"] <= timedelta(hours=6)
            )
            pressure_fresh = (
                buoy_result["status"] == "fresh"
                and buoy_result["pressureObserved"] is not None
                and timedelta(hours=-1) <= generated_at - buoy_result["pressureObserved"] <= timedelta(hours=6)
                and window_start <= generated_at + timedelta(hours=6)
            )
            swell_feet = buoy_result["swellFeet"] if swell_fresh else None
            water_temp_f = sst_for_window(marine_sst_result["values"], midpoint)
            ndbc_water_temp_f = buoy_result["waterTempF"] if ndbc_water_fresh else None
            pressure_hpa = buoy_result["pressureHpa"] if pressure_fresh else None
            pressure_trend_hpa_3h = buoy_result["pressureTrendHpa3h"] if pressure_fresh else None
            dynamic = dynamic_score(
                tide_change,
                wind_mph,
                swell_feet,
                daylight,
                open_coast,
                cloud_cover_pct,
                pressure_trend_hpa_3h,
                water_temp_f,
                lunar_age_days,
            )
            raw_score = (0.52 * habitat) + (0.18 * seasonality) + (0.30 * dynamic)
            available_primary = int(tide_change is not None) + int(wind_mph is not None)
            confidence = "medium" if available_primary == 2 else "low"
            conditions = {
                "tideStage": tide_stage,
                "tideLevelsFeet": tide_levels_feet,
                "windMph": wind_mph,
                "swellFeet": swell_feet,
                "waterTempF": water_temp_f,
                "daylight": daylight,
                "cloudCoverPct": cloud_cover_pct,
                "pressureHpa": pressure_hpa,
                "pressureTrendHpa3h": pressure_trend_hpa_3h,
                "moonPhase": moon_phase,
                "moonIlluminationPct": moon_illumination_pct,
            }
            conditions = {key: value for key, value in conditions.items() if value is not None}
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
                        water_temp_f,
                        ndbc_water_temp_f,
                        daylight,
                        cloud_cover_pct,
                        pressure_hpa,
                        pressure_trend_hpa_3h,
                        moon_phase,
                        moon_illumination_pct,
                    ),
                    "conditions": conditions,
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
    marine_sst_status = source_status(list(marine_sst_results.values()))
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
            "status": weather_status + "; wind, daylight, and sky cover are scored when available",
            "url": "https://api.weather.gov/",
            "freshnessLimitHours": 6,
        },
        {
            "name": "NOAA NDBC buoy observations",
            "observedAt": isoformat(max((result["observed"] for result in buoy_results.values() if result["observed"]), default=generated_at)),
            "status": buoy_status + "; fresh swell and three-hour atmospheric-pressure trend are scored near term",
            "url": "https://www.ndbc.noaa.gov/",
            "freshnessLimitHours": 6,
        },
        {
            "name": "Open-Meteo Marine SST forecast (Météo-France)",
            "observedAt": retrieved_at,
            "status": marine_sst_status + "; sea-surface temperature is a small, bounded score input",
            "url": "https://open-meteo.com/en/docs/marine-weather-api",
            "freshnessLimitHours": 30,
            "attribution": "Weather data by Open-Meteo.com; sea-surface-temperature model data by Météo-France.",
            "license": "CC BY 4.0",
            "usageNote": "The free endpoint is non-commercial only; use Open-Meteo's paid customer endpoint before enabling subscriptions, advertising, or other commercial use.",
        },
        {
            "name": "Calculated moon phase",
            "observedAt": retrieved_at,
            "status": "calculated locally; low-weight signal to avoid double-counting the lunar effect already present in tides",
            "url": "https://aa.usno.navy.mil/data/MoonFraction",
            "freshnessLimitHours": 168,
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
        "modelVersion": "contourcast-hybrid-demo-0.2.0",
        "status": "demo-public-data-snapshot",
        "species": "california-halibut",
        "scoreDefinition": f"A score of 80 means this site/window ranks above 80% of the {len(ordered):,} options in this snapshot; it is not an 80% catch probability.",
        "notice": "Conditions are informational only. Check official access and CDFW rules. Bathymetry is not for navigation.",
        "sources": sources,
        "windows": ordered,
    }

    PUBLIC_DATA.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SITES_PATH, PUBLIC_DATA / "sites.json")
    # Keep the browser payload compact. This file is parsed during startup on
    # mobile, so repeated per-window source metadata and pretty-printing have a
    # measurable interaction cost. Source freshness remains available once at
    # the snapshot level.
    (PUBLIC_DATA / "opportunities.json").write_text(
        json.dumps(payload, separators=(",", ":")) + "\n"
    )

    failures = {
        "tides": {station: result["error"] for station, result in tide_results.items() if result["error"]},
        "weather": {anchor: result["error"] for anchor, result in weather_results.items() if result["error"]},
        "buoys": {station: result["error"] for station, result in buoy_results.items() if result["error"]},
        "marineSst": {anchor: result["error"] for anchor, result in marine_sst_results.items() if result["error"]},
    }
    print(
        json.dumps(
            {
                "siteCount": len(sites),
                "rankedSiteCount": len(active_sites),
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
