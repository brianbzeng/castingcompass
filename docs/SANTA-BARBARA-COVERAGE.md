# Santa Barbara South Coast coverage

**Status:** repository implementation; not a production-release receipt

CastingCompass extends its explainable California-halibut relative ranker across
13 public South Coast access locations from Gaviota through Goleta and Santa
Barbara to Rincon. This is geographic product coverage, not a trained Santa
Barbara catch model and not evidence of improved accuracy.

## Included planning areas

- **Gaviota Coast:** Gaviota State Park beach, Refugio State Beach, and El
  Capitán State Beach.
- **Goleta:** Haskell's Beach and the ocean side of Goleta Beach.
- **Santa Barbara:** Arroyo Burro, Mesa Lane Steps, Leadbetter, Santa Barbara
  Harbor Breakwater, Stearns Wharf, and East Beach.
- **Carpinteria:** Carpinteria State Beach and Rincon Beach Park.

Each catalog entry names its public-access source, applicable CDFW regulation
map, access caveat, casting-zone direction and exposure, and an explicit date for
the access review. Access, regulations, surf, construction, and wildlife closures
can change; the user must recheck official sources and posted signs before travel.

## Exclusions and boundary safeguards

- Campus Point and the adjacent no-take coastline are not catalog locations.
- Goleta Slough is no-take. The Goleta listing covers the ocean beach only and
  does not assert that every portion of its pier is open.
- The El Capitán casting zone is kept outside the Naples no-take boundary.
- Gaviota's public beach is listed, while the storm-damaged Gaviota Pier remains
  explicitly closed and is not a ranked site.
- Private, uncertain, or poorly sourced access is omitted rather than inferred.

These product boundaries are conservative aids, not legal geofences. Official
CDFW maps, current regulations, and posted closures control.

## Forecast and scoring inputs

All regional sites use NOAA CO-OPS station `9411340` for Santa Barbara tide
predictions. Four NWS/Open-Meteo anchors cover Gaviota, Goleta, Santa Barbara,
and Carpinteria, and NOAA NDBC station `46053` supplies East Santa Barbara Channel
observations. Missing or stale values remain missing or stale; the generator does
not invent replacements.

The live configuration combines a curated habitat prior, provisional monthly
seasonality, public conditions, practical fishability, and a small transparent
access-pressure modifier. Habitat priors were not fit to Santa Barbara trip logs.
The final 0–100 value is a relative percentile across every active site/window in
the current catalog, not a calibrated chance of catching a fish.

## Trip and validation boundary

Friends and other anglers may submit complete trips and skunks through the normal
private review workflow. Those reports do not automatically alter scores or
publish. They are ordinary product observations and are ineligible for the frozen
Bay Area feasibility pilot.

The original 47-site catalog is archived byte-for-byte at
`validation/catalogs/california-halibut-bay-area-v1.json`. A future Santa Barbara
performance study would require a new prospective protocol, frozen population,
recruitment plan, privacy review, and activation before any eligible outcome is
known.

## Release checkpoint

This branch makes no Cloudflare, database, provider, indexing, or production
change. Review and protected CI can proceed independently, but deployment remains
blocked by the existing security and guarded-release checklist.
