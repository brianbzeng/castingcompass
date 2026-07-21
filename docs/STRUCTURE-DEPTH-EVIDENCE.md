# Santa Barbara structure and depth evidence

**Status:** source-bound repository slice; independent site and visual review still required

## Frozen meaning

`castingcompass.structure-depth-evidence/1.0.0` is planning context for the 14
Santa Barbara South Coast catalog locations. It shows broad NOAA chart depth
bands intersecting a configured offshore sector and selected chart-feature
classes within one kilometer. It is not:

- an exact depth at the map marker;
- a promise that a depth is shore-reachable or castable;
- a navigational, wading, access, or habitat-safety product;
- proof that uncharted structure is absent; or
- an opportunity-score, habitat-prior, or catch-probability input.

Every site has `scoreDelta: null`, `navigationUseAllowed: false`, and catalog
mutation disabled. The checked-in site catalog, provisional target-depth fields,
habitat priors, opportunity snapshot, and validation geography are unchanged.

## Why NOAA ENC Direct is the regional baseline

The source review compared three official datasets on 2026-07-21:

1. [NOAA BlueTopo](https://nauticalcharts.noaa.gov/data/bluetopo_specs.html)
   has explicit elevation, uncertainty, and contributor layers, but the current
   `BlueTopo_Tile_Scheme_20260626_132625.gpkg` exposes a published tile at only
   Gaviota, Refugio, and El Capitán. The remaining 11 site tiles have no current
   download link, so BlueTopo cannot support a consistent regional claim.
2. [USGS Data Series 702](https://pubs.usgs.gov/ds/702/data.html) provides a
   stable 2012 Santa Barbara Channel 10 m NAVD88 grid. Only six configured site
   sectors contained valid grid cells, and the nearshore coverage is too
   incomplete to use as the sole 14-site baseline.
3. [NOAA ENC Direct to GIS](https://nauticalcharts.noaa.gov/learn/encdirect/)
   returned a depth-area intersection for every configured site sector. The
   collector uses only the `Approach` usage band because NOAA recommends one
   scale band per extraction to avoid mixed-resolution duplicates.

The BlueTopo tile-scheme SHA-256 is
`dc854cc98608eaae19e5cc8e4ccf92f9f61af998cc135c61c649d2052c3fc319`.
The downloaded USGS archive SHA-256 is
`5ae764fe1d154b43deb2dcd1c1a1de253c737abb5b2221529783ccbead79453b`.
These receipts explain source selection; neither rejected source is silently
substituted for a missing ENC value.

## Geometry and interpretation

For each site, the collector constructs a WGS84 sector from the public catalog
coordinate, the existing bearing, the existing radius, and a fixed ±45-degree
half-width. Depth areas, contours, and soundings are intersected with that
sector. A separate 1,000 m circle provides nearby point-sounding and selected
structure-class context.

The sector is a reproducible query footprint, not a measured cast envelope. A
band such as `0–9.1 m` means one or more ENC depth-area features with that range
intersect the sector. Overlapping bands can come from adjacent or overlapping
ENC cells and are preserved rather than blended into invented precision.
Negative-to-zero bands describe drying/shoreline transitions and are retained in
the artifact but omitted from the compact public water-band list.

Depth units are meters. NOAA tidal-chart depths use Mean Lower Low Water (MLLW),
while the selected feature records do not consistently populate `VERDAT`.
ENC Direct is vector chart data, not a raster with a fixed grid resolution. The
selected layers also do not publish numeric positional accuracy or vertical
uncertainty. Those fields therefore remain explicit `not-exposed` states rather
than zeros.

## Captured 14-site inventory

The normalized source snapshot was captured at `2026-07-21T08:14:38Z` from the
fixed NOAA `enc_approach` ArcGIS service. Point-sounding counts are deduplicated
across overlapping ENC cells. “No selected feature record” never means “no
structure.”

| Location | Submerged ENC bands intersecting sector | Deduplicated soundings within 1 km | Selected chart-feature classes within 1 km |
| --- | --- | ---: | --- |
| Gaviota State Park Beach | 0–9.1 m | 6 | Shoreline construction |
| Refugio State Beach | 0–9.1 m | 4 | No selected feature record |
| El Capitán State Beach | 0–9.1 m | 2 | No selected feature record |
| Haskell's Beach | 0–9.1 m | 1 | Shoreline construction |
| Goleta Beach | 0–9.1 m | 3 | Shoreline construction |
| Arroyo Burro Beach | 0–9.1 m; 9.1–18.2 m | 6 | No selected feature record |
| Mesa Lane Steps Beach | 0–9.1 m | 9 | No selected feature record |
| Leadbetter Beach | 0–3.6 m; 1.8–3.6 m; 3.6–5.4 m; 5.4–10.9 m | 12 | Pile/piling; seabed description; shoreline construction |
| Santa Barbara Harbor Breakwater | 0–3.6 m; 3.6–5.4 m; 5.4–10.9 m | 16 | Obstruction; pile/piling; seabed description; shoreline construction |
| Stearns Wharf | 3.6–5.4 m; 5.4–10.9 m | 19 | Obstruction; pile/piling; shoreline construction; wreck |
| East Beach | 5.4–10.9 m; 10.9–18.2 m | 22 | Seabed description; wreck |
| Summerland Beach from Lookout Park | 1.8–3.6 m; 3.6–5.4 m; 5.4–10.9 m | 7 | No selected feature record |
| Carpinteria State Beach | 0–1.8 m; 3.6–5.4 m; 5.4–10.9 m | 9 | Shoreline construction |
| Rincon Beach Park | 1.8–3.6 m; 3.6–5.4 m; 5.4–10.9 m; 10.9–14.6 m | 14 | Obstruction; shoreline construction |

The exact full-date depth records range from 2000 through 2019, and every site
also intersects at least one depth-area record without a full `SORDAT`. One
charted wreck near Stearns Wharf supplies only the year `2005`; the artifact
preserves the feature and sets `hasUndatedRecords` instead of inventing a month
or day. Source age is displayed because weekly service refresh does not make an
old underlying survey new.

## Integrity and failure behavior

`scripts/refresh_structure_depth.py`:

- allows only the fixed HTTPS NOAA Approach service and rejects redirects;
- verifies every reviewed layer ID and name against service metadata before
  querying;
- caps responses and feature counts, rejects transfer-limit truncation,
  unexpected fields, malformed geometry, invalid depths, invalid source cells,
  and unreviewed dates;
- stores normalized feature attributes plus point geometry or a geometry hash,
  avoiding public exact structure coordinates;
- deduplicates overlapping-cell soundings and geometry-identical structure
  records without treating a missing class as absence;
- binds the public artifact to SHA-256 digests of the policy, collector, exact
  site catalog, and normalized source snapshot; and
- can regenerate deterministically from the checked-in snapshot for offline and
  adversarial tests.

Any required depth-query failure makes that site's depth unavailable. Any
selected structure-query failure makes the structure section unavailable while
retaining catalog clues as explicitly unvalidated. Service metadata drift makes
all 14 sites unavailable. Errors are fixed categories and never expose local
paths or exception text.

## Remaining acceptance work

This completes one regional source-bound inventory slice, not the parent map
goal. Before a location can be called fully reviewed:

1. a local reviewer must confirm the sector orientation, public access context,
   and whether the displayed chart classes are useful rather than misleading;
2. dynamic sand bars, troughs, reef edges, vegetation, and other catalog clues
   need separate reproducible sources or must remain generic field clues;
3. BlueTopo or another qualified source with explicit uncertainty should be
   added where complete coverage becomes available;
4. mobile visual acceptance must confirm that bands, datum, age, uncertainty,
   and non-navigation language remain legible; and
5. any scoring use needs a separately frozen policy, independent habitat review,
   and prospective validation against the unchanged baseline.

No production, Cloudflare, database, provider, or deployment change is part of
this repository slice.
