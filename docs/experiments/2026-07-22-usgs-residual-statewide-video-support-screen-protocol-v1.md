# USGS residual statewide video support screen protocol v1

**Frozen before archive-label inspection:** 2026-07-22 UTC  
**Status:** protocol only; no outcome, raster acquisition, model fit, promotion, score, serving, or deployment authority

## Question

Do the six official U.S. Geological Survey Data Series 781 camera-video archives that were not
used by the San Francisco or Santa Barbara South Coast audits distribute every frozen seafloor
class across separable whole cruises? This is a source-support screen only. It does not ask which
representation performs best and cannot authorize training.

The official statewide catalog lists twelve video-observation archives. The earlier audits used
`f208nc`, `f307nc`, `s1c08sc`, `sw109sc`, `z107sc`, and `z206sc`. This protocol fixes the residual
set before reading its DBF `CLASS` values:

| Cruise | Official archive | Metadata record count | Published geographic extent |
| --- | --- | ---: | --- |
| `c0111sc` | `c0111sc_video_observations.zip` | 4,688 | Point Dume through Imperial Beach |
| `c109nc` | `c109nc_video_observations.zip` | 1,615 | far northern California |
| `c210nc` | `c210nc_video_observations.zip` | 2,718 | Eureka through Point Arena |
| `c0212sc` | `c0212sc_video_observations.zip` | 5,937 | central and south-central California |
| `l908nc` | `l908nc_video_observations.zip` | 1,917 | north-central California |
| `s2210mb` | `s2210mb_video_observations.zip` | 1,848 | Monterey Bay region |

The fixed source catalog is
`https://pubs.usgs.gov/ds/781/video_observations/data_catalog_video_observations.html`.
The six archive URLs are the catalog-relative paths
`https://pubs.usgs.gov/ds/781/video_observations/data/<archive>`. Published metadata, including
record counts, bounding coordinates, field definitions, one-minute observation cadence, and
approximately 10 m variable horizontal accuracy, may be used to freeze this design. Archive DBF
label values may not be inspected until this protocol commit exists.

## Endpoint and classes

The endpoint is the direct scientist-recorded `CLASS` value in each official video-observation
DBF. The class collapse is unchanged from the two earlier audits:

- raw `1` -> `smooth_fine_medium_sediment`;
- raw `2` or `3` -> `mixed_or_rugose_rock`;
- raw `4` -> `mobile_coarse_sediment`.

Blank `CLASS` rows are unlabeled and excluded. Any nonblank value outside `1` through `4`, a
missing required `CLASS`, `LINE`, or `TAPE` field, an empty `LINE` or `TAPE` on a labeled row, a
record-count mismatch, an unsafe archive member, or a checksum mismatch fails the audit closed.
No class may be dropped, merged differently, oversampled, or inferred from another field after
the values are read.

## Content and reproduction boundary

The first official download records the SHA-256 of every ZIP and every member plus exact member
byte counts in a repository manifest. A second clean download must match the manifest before a
result is accepted. The parser admits only an exact content-addressed member inventory and reads
Point shapefile and dBASE III bytes without an ambient GIS reader.

The screen reports, for each cruise, total records, labeled records, raw and collapsed class
counts, and whole-cruise support. It also records the full six-cruise totals. Raw source archives
and extracted DBFs are not committed.

## Leakage and support gate

The indivisible split unit is the entire `cruise_id`. `LINE`, `TAPE`, date, coordinate, archive
order, and adjacent one-minute rows may not be used to subdivide a cruise. Every unique nonempty
whole-cruise bipartition is enumerated once by fixing the lexicographically first cruise on the
train side. A partition is support-eligible only when both train and test contain at least 16
rows of all three collapsed classes.

This raw screen does not prove spatial independence. If at least one partition passes, a separate
protocol must acquire exact source-specific bathymetry and backscatter, preserve survey-bound
intensity and availability masks, apply the existing 32/128/512 m patch contract, and remove
cross-boundary observations within at least 512 m before any representation comparison. Patch
coverage, source alignment, and buffered support can still reject the endpoint.

## Fixed decisions

- Zero eligible whole-cruise partitions: stop. Do not train. Seek additional independent tracks,
  design a prospective survey, or preregister a materially different scientific question before
  reading its outcomes.
- One or more eligible partitions: report the admissible support boundary only. Do not choose a
  model, acquire a preferred outcome after seeing performance, or train until a separate reviewed
  raster/alignment/split protocol is committed.
- Under either result: no encoder is promoted, no artifact enters scoring, and no browser, API,
  Worker, D1/R2/Queue, provider, production, public model claim, or deployment authority changes.

## Claim boundary

This screen can establish only whether historical, targeted USGS sonar-validation cruises have
enough raw class support for a later independent endpoint design. It cannot validate current
habitat, fish presence, California-halibut catch skill, score calibration, navigation safety,
model generalization, or product readiness.
