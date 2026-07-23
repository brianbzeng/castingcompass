# USGS Data Series 182 sediment endpoint support v1

**Run date:** 2026-07-22 UTC  
**Frozen source commit:** `f28e25e6265a49933165c0170c0f13fda59cfda2`  
**Receipt:** [`usgs-ds182-sediment-endpoint-support-v1`](../../pipeline/evidence/usgs-ds182-sediment-endpoint-support-v1.receipt.json)

## Question and frozen boundary

Can direct laboratory-extracted bulk-surficial `Gravel`, `Sand`, and `Mud` percentages provide a
continuous, source-separable endpoint inside the exact San Francisco hybrid-raster footprint?

The [protocol](2026-07-22-usgs-ds182-sediment-endpoint-support-protocol-v1.md) fixed the exact
USGS Data Series 182 EXT archive, strict `PAC_EXT.txt` schema, surface-sample rule, direct
composition fields, whole-`DataSetKey` grouping, three operational composition anchors, and
minimum support before an aggregate or partition result was computed. Derived dbSEABED classes,
parsed/calculated outputs, interpreted maps, row-random splits, imputation, and post-result
threshold changes were prohibited.

This is a source-support audit only. It cannot authorize source-accuracy admission, raster
pairing, patch construction, representation comparison, training, promotion, scoring, serving,
or deployment.

## Exact official inputs

Two independent downloads matched exactly:

- `pac_ext.zip`: 1,087,605 bytes, SHA-256
  `0643827168d4a91e8f2ed6df7962dee16ff39bdf203a263a833e7f3d7faa51ff`;
- `pac_src.txt`: 19,495 bytes, SHA-256
  `89bc35fd455f623cae5c3c7ab3942e9bd933bac7a56f447f7ec236f000af4a1e`.

Every one of the archive's 14 members matched its locked byte count and SHA-256. The exact
reference GeoTIFF also matched the prior admitted USGS San Francisco source at SHA-256
`75629f6a8bc7e3ea78fb6b3b22c737ec75a8cba1621f2c0066a2343ab61a242a`. The audit verified its
EPSG:26910 CRS, 2 m affine transform, 8,850 by 8,845 shape, and exact bounds without reading any
raster pixel.

The published metadata says 16,486 points, while `PAC_EXT.txt`, the dBASE header, and the Point
shapefile independently agree on 16,485 records. The manifest preserves both counts and enforces
the internally consistent archive count. Metadata calls the type field `DataType`; the exact text
and dBASE schemas call it `DataTypes`. The one exact name mapping was recorded before the audit
and changes no accepted values or support rule.

## Fail-closed schema result

The frozen `PAC_EXT.txt` representation is **not structurally valid** under the 32-field protocol:

| Parsed data-row width | Rows |
| ---: | ---: |
| 31 fields | 14,950 |
| 32 fields | 1,535 |
| **Total** | **16,485** |

The 14,950 short rows omit a field relative to the exact header. The audit does not assume that
the omitted value is the trailing blank `SamplePhase`, pad a comma, shift fields, switch to the
companion dBASE member, or read a different source representation after seeing the failure.

Consequently, no `Gravel`/`Sand`/`Mud` values were aggregated, no endpoint-valid row/site/source
count was computed, and no whole-source partition was evaluated. The raw endpoint is not
admissible under v1. No raster pixels were read, no patch corpus was built, and no model, encoder,
score, serving path, provider, production state, or deployment authority changed.

## Reproduction and next step

Executions over the two independent source-download sets produced byte-identical metrics at
SHA-256 `b175ea0024c25be0db59e859e3cc7e8c9e14b4b64e944a2e016f7720615cb964`. After removing only
run ID and creation time and replacing absolute input paths with basenames, run metadata was also
byte-identical at SHA-256
`2584e25d56c9e460266bb07628d2e73a55d4386fc9a476ce6799c54a5d9a30cb`.

A separately committed exploratory protocol may audit the exact fixed-width dBASE member, whose
header and Point companion agree on 16,485 records. That would be a new source representation,
not a repair or passing reinterpretation of v1, and prior structural/raw-row exposure must remain
disclosed. Even a passing exploratory support result would still require source-method and
horizontal-accuracy review, exact raster alignment, a 512 m split buffer, and an independent
confirmatory endpoint before representation claims or model promotion.
