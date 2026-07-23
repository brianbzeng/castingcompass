# USGS Santa Barbara South Coast video endpoint admissibility audit v1

**Run date:** 2026-07-22 UTC

**Frozen source commit:** `e9f0bedf180d0eb3e554bd32df61bc0c58f16c8b`

**Receipt:** [`usgs-south-coast-video-endpoint-audit-v1`](../../pipeline/evidence/usgs-south-coast-video-endpoint-audit-v1.receipt.json)

## Question and preregistered boundary

Can direct USGS camera-video observations support a leakage-resistant downstream comparison of
the frozen multiscale bathymetry/backscatter inputs across the Santa Barbara South Coast?

The [protocol](2026-07-22-usgs-south-coast-video-endpoint-admissibility-protocol-v1.md) was committed
before reading `sw109sc` or `z107sc` label values. It froze the unchanged three-class collapse,
16-row-per-class support floor, whole-cruise grouping, exact 32/128/512 m hybrid patch contract,
and a label-blind west-to-east overlap priority. `s1c08sc` and `z206sc` label distributions had
already been seen during source discovery and were disclosed as exploratory.

The evidence footprint is four contiguous official USGS map blocks from Offshore Refugio Beach
through Offshore Carpinteria. This is narrower than the Gaviota-to-Rincon product catalog and
must not be described as model evidence for Gaviota.

## Exact-source audit

Every official archive was downloaded twice; the two byte sets matched. The source manifest locks
four bathymetry GeoTIFFs, eleven survey-specific backscatter GeoTIFFs, four complete video archive
member inventories, and their SHA-256 digests. Strict Point and dBASE parsers rejected ambient or
partial interpretations. Integral numeric fields are canonicalized; fractional or unknown values
fail closed.

The four video archives contain 5,372 total records and 4,251 labeled records:

| Cruise | Records | Labeled | Raw 1 | Raw 2 | Raw 3 | Raw 4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `s1c08sc` | 1,722 | 1,228 | 1,010 | 162 | 56 | 0 |
| `sw109sc` | 2,380 | 1,898 | 1,493 | 269 | 136 | 0 |
| `z107sc` | 667 | 667 | 627 | 19 | 21 | 0 |
| `z206sc` | 603 | 458 | 353 | 30 | 75 | 0 |

The held-unread archives did not rescue the support gap: none of the four archives contains a raw
class-4 observation.

## Hybrid-patch support and result

After projection, valid-center checks, and the complete multiscale hybrid coverage contract, 1,327
rows remain. The frozen region assignment found no cross-block duplicates.

| Assigned map block | Smooth | Mixed/rugose | Mobile coarse | Total |
| --- | ---: | ---: | ---: | ---: |
| Offshore Refugio Beach | 272 | 109 | 0 | 381 |
| Offshore Coal Oil Point | 309 | 75 | 0 | 384 |
| Offshore Santa Barbara | 386 | 52 | 0 | 438 |
| Offshore Carpinteria | 63 | 61 | 0 | 124 |
| **Total** | **1,030** | **297** | **0** | **1,327** |

All four cruises remain represented, but the frozen mobile-coarse class has zero global support.
The four groups yield seven unique whole-cruise bipartitions; zero can leave at least 16 rows of
all three classes in both train and test. Subdividing cruises, randomizing adjacent rows, dropping
class 4 after seeing the result, or relabeling the endpoint would be post-outcome adaptation and is
prohibited.

## Reproduction and decision

Two executions using the two independent video-archive download sets produced byte-identical
metrics at SHA-256 `f3b67cb29f52605a78eb615cff0ca9c32063cdda72ac55bb56c374d389a8a74e`.
After removing run ID/time and normalizing only the download-set directory name, run metadata is
also byte-identical at SHA-256
`6ca0b3b7bf00d0e1adff6eb03e1b6f80cde996596258a920990ff32514b43c0d`.

The endpoint is **not admissible** for the frozen three-class representation comparison. No model
was trained, no encoder was promoted, and no serving, Opportunity Score, or production state
changed.

This result closes an attractive but unsupported route. The next model-data step needs either a
different genuinely independent endpoint whose classes are supported across separable groups, a
prospectively designed visual survey, or a newly preregistered scientific question that does not
pretend this source observed mobile coarse substrate. It is not evidence of current habitat, fish
presence, fishing skill, catch probability, calibration, or deployment readiness.
