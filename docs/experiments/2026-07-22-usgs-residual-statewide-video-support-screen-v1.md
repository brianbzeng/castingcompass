# USGS residual statewide video support screen v1

**Run date:** 2026-07-22 UTC  
**Frozen source commit:** `f7490b42676a4da08adf9e4314ee778b8186f709`  
**Receipt:** [`usgs-residual-statewide-video-support-screen-v1`](../../pipeline/evidence/usgs-residual-statewide-video-support-screen-v1.receipt.json)

## Question and frozen boundary

Do the six official USGS Data Series 781 video-observation archives not used by the earlier San
Francisco or Santa Barbara South Coast audits distribute all three frozen seafloor classes across
separable whole cruises?

The [protocol](2026-07-22-usgs-residual-statewide-video-support-screen-protocol-v1.md) fixed the
six-cruise catalog selection, class collapse, whole-cruise split, and minimum 16 rows per class on
both sides before reading archive `CLASS` values. This is a raw source-support screen only. It
cannot authorize raster acquisition, representation comparison, training, promotion, scoring, or
deployment.

Two pre-result source issues were disclosed and corrected before any aggregate result was
accepted. Published `c0212sc` metadata says 5,937 records, while its exact SHP and DBF each contain
5,936; the manifest preserves both counts and enforces the internally consistent archive count.
`l908nc` stores `Class`, `Line`, and `Tape`; the parser canonicalizes field-name case only. Neither
change selected rows, reinterpreted class values, or changed the support rule.

## Exact-source screen

Every ZIP and every archive member is content-addressed. Two independent official download sets
matched exactly. The six archives contain 18,722 records, of which 15,335 have a nonblank `CLASS`.

| Cruise | Records | Nonblank class | Raw 1 | Raw 2 | Raw 3 | Raw 4 | Other | Missing line/tape |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `c0111sc` | 4,688 | 3,590 | 2,627 | 580 | 383 | 0 | 0 | 0 |
| `c109nc` | 1,615 | 1,087 | 673 | 99 | 315 | 0 | 0 | 0 |
| `c210nc` | 2,718 | 2,251 | 1,156 | 428 | 667 | 0 | 0 | 0 |
| `c0212sc` | 5,936 | 4,899 | 2,987 | 587 | 1,272 | 53 | 0 | 0 |
| `l908nc` | 1,917 | 1,660 | 988 | 182 | 490 | 0 | 0 | 0 |
| `s2210mb` | 1,848 | 1,848 | 780 | 242 | 297 | 85 | 444 class `0` | 26 |
| **Total** | **18,722** | **15,335** | **9,211** | **2,118** | **3,424** | **138** | **444** | **26** |

The 14,884 rows with recognized values `1` through `4` collapse to 9,204 smooth/fine/medium,
5,542 mixed/rugose, and 138 mobile-coarse observations. The smooth total is seven lower than the
raw-1 total because seven recognized `s2210mb` rows are among the 26 rows without complete
`LINE`/`TAPE` identity; invalid categories can overlap.

## Fail-closed result

The source schema is **not valid** under the frozen protocol. `s2210mb` contains 444 nonblank raw
class-`0` values outside the declared `1` through `4` domain, and 26 nonblank rows lack `LINE` or
`TAPE` identity. The audit does not guess what class `0` means, repair group identity, silently
drop the archive, or revise the endpoint after reading the outcome.

For transparency, the audit enumerated all 31 whole-cruise bipartitions over recognized rows.
Sixteen would meet the raw 16-row-per-class support floor. That diagnostic is not authoritative
for admission because it depends on the invalid archive: among the five schema-valid archives,
only `c0212sc` contains class 4, so no valid whole-cruise split can distribute that class across
both train and test.

The raw endpoint is therefore **not admissible**. Raster acquisition is not authorized, no patch
corpus was built, no model was trained, no encoder was promoted, and no score, serving path,
provider, production state, or deployment authority changed.

## Reproduction and next step

Two executions over the two independent download sets produced byte-identical metrics at SHA-256
`af8d14f4326ebb688aebc0253536678477765a9bd02874543bc3d554791beeea`. After removing run ID and
creation time and replacing only absolute input paths with their basenames, run metadata was also
byte-identical at SHA-256
`c633195a571b9b58a5ff678140a2572cebfe01b37d7d76f99de9fa27c1834325`.

The next representation comparison still requires a genuinely support-complete independent
endpoint. Safe routes include obtaining additional schema-valid direct-video cruises that place
every frozen class in separable groups, prospectively collecting a visual survey, or committing a
materially different scientific question before inspecting its outcomes. This screen is not
evidence of current habitat, fish presence, fishing skill, catch probability, calibration, model
generalization, or product readiness.
