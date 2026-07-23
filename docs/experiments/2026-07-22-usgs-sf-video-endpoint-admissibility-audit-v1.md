# USGS Offshore San Francisco video endpoint admissibility audit v1

**Run date:** 2026-07-22 UTC

**Source commit:** `1a89ba02f40bdaa7124d637f9bbcfb219e7194b9`

**Receipt:** [`usgs-sf-video-endpoint-audit-v1`](../../pipeline/evidence/usgs-sf-video-endpoint-audit-v1.receipt.json)

## Question and frozen boundary

Can the official raw USGS camera observations provide a more independent
downstream test of the frozen bathymetry/backscatter representations without
leaking adjacent observations across train and test?

The endpoint measurement is direct: USGS and NOAA scientists watched camera
video and recorded a ten-second seafloor observation once per minute. It is
more independent of sonar interpretation than the published seafloor-character
map. The sampling design is not independent, however: camera tracks were placed
at selected locations to validate sonar interpretations, were not collected
under a uniform protocol, and have highly variable horizontal accuracy on the
order of 10 m.

Before reading the official rows, the audit froze these controls:

- exact archive and member byte inventories for cruises `f208nc` and `f307nc`;
- strict Point-shapefile and dBASE parsing with no ambient shapefile library;
- class 1 as smooth sediment, classes 2/3 as mixed or rugose rock, and class 4
  as mobile coarse sediment;
- the same 32 m, 128 m, and 512 m radius hybrid patch contract;
- one indivisible group per exact cruise, `LINE`, and `TAPE` combination;
- no random row split of adjacent one-minute observations; and
- at least 16 rows of every class on both train and test sides.

The habitat polygons were rejected as an independent alternative before any
probe: their official metadata names bathymetry, backscatter, and hillshade as
primary interpretation sources, with video and sediment samples as support.

## Support audit

The two archives contain 3,893 records, of which 3,759 have a class. After
projecting the direct observations onto the exact 2 m reference, 188 fall in
the rectangular bathymetry bounds, 187 have a valid bathymetry center, and 166
retain the entire three-scale hybrid patch contract.

| Retained group | Smooth | Mixed/rugose | Mobile coarse |
| --- | ---: | ---: | ---: |
| `f208nc:100:74` | 6 | 0 | 0 |
| `f208nc:101:74` | 15 | 0 | 0 |
| `f307nc:26:29` | 60 | 1 | 0 |
| `f307nc:27:30` | 13 | 21 | 50 |
| **Total** | **94** | **22** | **50** |

All 50 mobile-coarse rows and 21 of 22 mixed/rugose rows occur in the final
track group. Four groups yield seven unique nonempty whole-group bipartitions;
none leaves 16 rows of every class on both sides. The tempting alternative—an
ordinary row split—would distribute adjacent observations from the same camera
track across train and test and therefore is prohibited.

The retained center-availability patterns are also source-concentrated: 144
rows have only the 2004 backscatter source, 21 have only the 2007 source, and
one has no measured backscatter source. This endpoint cannot resolve the
previously documented survey-footprint risk.

## Reproduction and decision

Two clean-commit executions produced byte-identical metrics at SHA-256
`a1afb8321a61dc1f871f2e43521614ec0e805365f8a83f5bd692311a1e831a65`.
Run metadata differs only in execution-specific run ID, timestamp, and absolute
output paths.

The video probe is **not admissible** under the frozen support gate. No model
was trained, no encoder was promoted, and no serving or Opportunity Score path
changed. More direct video coverage across multiple coarse and mixed/rock track
groups—or a prospectively designed independent survey—is required before this
endpoint can support a leakage-resistant representation comparison.

This is an endpoint-support result for historical visual seafloor classes. It
is not evidence of current habitat, fish presence, fishing skill, catch
probability, calibration, or deployment readiness.
