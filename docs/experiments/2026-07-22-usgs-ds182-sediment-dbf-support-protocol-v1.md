# USGS Data Series 182 dBASE sediment support protocol v1

**Frozen before dBASE outcome aggregation:** 2026-07-22 UTC  
**Status:** exploratory source-representation protocol only; no confirmatory evidence, raster-pixel
read, patch construction, model fit, promotion, score, serving, provider, production, or deployment
authority

## Why this is a separate experiment

The first [direct sediment endpoint protocol](2026-07-22-usgs-ds182-sediment-endpoint-support-protocol-v1.md)
precommitted to the exact `PAC_EXT.txt` member. That representation failed closed: 14,950 of its
16,485 data rows have 31 fields under a 32-field header. No composition values were aggregated and
no partition was evaluated. This protocol does not pad, reinterpret, supersede, or turn that
negative result into a pass.

Instead, this is a new **exploratory** audit of the companion fixed-width `pac_ext.dbf` member from
the same content-addressed official archive. It asks only whether that separately encoded table is
structurally usable and has enough raw, source-separable support to justify later source-method and
alignment review. The dBASE table is not independent evidence: it belongs to the same release and
likely encodes the same underlying records as the failed text member. A passing result can never be
called confirmatory and cannot authorize model promotion.

## Prior-exposure disclosure

Before this protocol was frozen, the following source facts had already been observed:

- the full archive SHA-256, archive byte count, 14-member inventory, and every member checksum;
- the `PAC_EXT.txt` header, its 16,485 rows, and the 14,950/1,535 split between 31- and 32-field
  rows;
- the dBASE version, header record count, header length, record length, field descriptors, field
  types, widths, and decimal counts, but no dBASE record values or outcome aggregates;
- the Point shapefile type and 16,485-record sequence, but no pairing with dBASE outcomes;
- the exact source-table schema and the exact reference-raster metadata and transform;
- the endpoint fields, surface rule, anchors, support thresholds, and whole-source split rules
  frozen for the failed text representation.

The v1 text audit's existing code contains a success path for a hypothetical structurally valid
text table. That code was tested only with synthetic fixtures; the official table stopped before
outcome parsing. This dBASE protocol deliberately retains the same scientific endpoint and support
thresholds rather than adapting them to the observed archive. Only representation-specific parser
and cross-representation consistency rules are new.

## Exact official inputs and representation

The source remains U.S. Geological Survey Data Series 182, *usSEABED: Pacific Coast (California,
Oregon, Washington) Offshore Surficial-Sediment Data Release*:

- publication: `https://pubs.usgs.gov/publication/ds182`;
- data catalog: `https://pubs.usgs.gov/ds/2006/182/data_cata.html`;
- exact archive: `https://pubs.usgs.gov/ds/2006/182/data/pac_ext.zip`;
- extracted-data metadata: `https://pubs.usgs.gov/ds/2006/182/data/metadata_pac_ext.html`;
- source table: `https://pubs.usgs.gov/ds/2006/182/data/pac_src.txt`;
- source descriptions: `https://pubs.usgs.gov/ds/2006/182/PAC_SRC.html`;
- usSEABED methodology: `https://pubs.usgs.gov/ds/2006/182/usseabed.html`.

The exact archive is 1,087,605 bytes at SHA-256
`0643827168d4a91e8f2ed6df7962dee16ff39bdf203a263a833e7f3d7faa51ff`. The sole outcome
representation in this experiment is `pac_ext.dbf`: 4,369,583 bytes at SHA-256
`0617c5e83a0bd4de5b423bc1cf8774bd753ffdb5ed87f9bc32699fb6292c8afa`. The exact source table
and reference raster remain those locked in the source manifest. Two independent official archive
and source-table downloads must match byte-for-byte before a result is accepted. Raw source bytes
are not committed.

The parser must require dBASE III version `0x03`, exactly 16,485 records, a 1,057-byte header,
265-byte records, a `0x0D` descriptor terminator, and the exact final `0x1A` file terminator. Every
record deletion flag must be an ASCII space; a deleted or unknown flag fails the audit rather than
silently changing the source population.

The following exact ordered field descriptors are frozen as `(name, type, width, decimals)`:

```text
LATITUDE,N,13,5        LONGITUDE,N,15,5      WATERDEPTH,N,4,0
SAMPLETOP,N,6,2        SAMPLEBASE,N,6,2       SITENAME,C,35,0
DATASETKEY,N,3,0       SITEKEY,N,5,0          SAMPLEKEY,N,5,0
SAMPLER,C,35,0         DATATYPES,C,19,0        GRAVEL,N,3,0
SAND,N,3,0             MUD,N,3,0              CLAY,N,3,0
GRAINSIZE,N,7,1        SORTING,N,9,2          SEABEDCLS,C,2,0
CLSMSHP,N,3,0          FOLKCODE,C,5,0         SHEPARDCOD,C,17,0
ROCKMSHP,N,3,0         WEEDMSHP,N,3,0         CARBONATE,N,3,0
MUNSLCODE,C,7,0        ORGCARBON,N,5,1        LGSHEARSTR,N,7,1
POROSITY,N,3,0         PWAVEVEL,N,3,0         ROUGHNESS,C,4,0
LGCRSHST,N,3,0         SAMPLEPHAS,C,22,0
```

Character fields must contain printable seven-bit ASCII or spaces and are decoded by removing
trailing ASCII spaces only. Numeric fields must contain only ASCII spaces and an optional signed
ordinary decimal form (no exponent); surrounding spaces are removed and an all-space field is
missing. No locale conversion, overflow clipping, implicit zero, field shifting, encoding repair,
or fallback to `PAC_EXT.txt` is allowed. The exact dBASE names map one-to-one to the mixed-case
protocol names; notably `DATATYPES` maps to `DataTypes`, `SHEPARDCOD` to `ShepardCode`, and
`SAMPLEPHAS` to `SamplePhase`. No fuzzy or case-insensitive field discovery is allowed.

The companion Point shapefile must remain an exact 16,485-record ESRI Point sequence. Each dBASE
`LONGITUDE`/`LATITUDE` pair must agree with its same-position Point geometry to within
`0.00001` degree on each axis. A count, order, coordinate, or geometry disagreement fails closed.
The malformed text member remains recorded but is not parsed for values or used to repair dBASE.

## Frozen endpoint and exclusions

The exploratory endpoint remains the continuous bulk-sediment composition vector
`(Gravel, Sand, Mud)` in source-reported percent. Derived classifications, descriptions, parsed or
calculated outputs, and interpreted maps remain prohibited as outcomes, filters, repairs, or
tie-breakers.

A dBASE record is endpoint-valid only when all of the following hold:

1. finite `Latitude` and `Longitude` agree with the paired Point and fall inside the exact existing
   San Francisco hybrid reference-raster footprint;
2. `DataSetKey`, `SiteKey`, and `SampleKey` are positive integer identifiers and `DataSetKey`
   exists exactly once in the locked source table;
3. decoded `DataTypes` is exactly `GRZ` or `TXR`;
4. decoded `SamplePhase` is blank;
5. `SampleTop` is reported, is not the published `-99` sentinel, and lies from 0.0 through 0.1 m;
6. `Gravel`, `Sand`, and `Mud` are all reported, are not `-99`, are finite, and each lies from 0
   through 100; and
7. their unmodified sum lies from 98 through 102 percent.

The explicitly allowed `-99` sentinel in `SampleTop`, `Gravel`, `Sand`, or `Mud` is a declared
row-level exclusion. Blank required identities or coordinates, a sentinel identity or coordinate,
malformed numeric bytes, non-finite values, an unknown source key, or any structural violation
fails the entire audit. Well-formed records that fail declared endpoint criteria are counted under
every applicable reason and excluded without imputation, normalization, rounding, or substitution.

## Identity, duplication, leakage, and support

`SampleKey` remains the measurement identity, `SiteKey` the indivisible location identity, and
`DataSetKey` the indivisible source-domain identity. Repeated byte-equivalent decoded records for a
`SampleKey` are counted once; conflicting records fail closed. A `SiteKey` crossing source groups
or moving by more than `0.00001` degree fails closed. Multiple measurements at one site remain
together. Row-random, coordinate-random, and site-random splits are prohibited.

The same three predeclared, overlapping support diagnostics remain fixed:

- `gravel_bearing`: `Gravel >= 5` percent;
- `mud_bearing`: `Mud >= 20` percent;
- `sand_dominant`: `Sand >= 80` percent.

Each unique nonempty whole-`DataSetKey` bipartition is enumerated once by fixing the numerically
smallest source group on the train side. A partition is raw-support eligible only when train and
test each have at least 64 valid rows, 64 distinct sites, and at least 16 rows and 16 sites for each
anchor; train must contain at least three source groups and test at least one. All eligible
partitions are reported, and none may be selected from outcome balance. The audit reads only the
reference transform and bounds, never raster pixels.

### Pre-outcome computational bound

Before any official dBASE record was parsed, implementation review identified that exhaustive
bipartition reporting grows exponentially. The exact audit therefore admits at most 14
endpoint-valid source groups, which bounds the unique candidate set at 8,191. More than 14 does
not trigger sampling, pruning, greedy selection, or an outcome-adaptive split search: the audit
fails closed with `source_group_count_exceeds_exhaustive_limit`, reports the observed group count
and theoretical candidate count, and authorizes no next stage. This is a computational integrity
limit, not a scientific support threshold; all endpoint, anchor, and per-side minimums above are
unchanged.

## Fixed decisions and claim boundary

- Structural, identity, geometry, or provenance failure: stop and preserve the failure.
- No raw eligible whole-source partition: stop. Do not review rasters or train.
- One or more raw eligible partitions: authorize only a separately committed source-method,
  horizontal-accuracy, raster-alignment, 512 m leakage-buffer, and post-coverage support protocol.
- Under every result, this remains exploratory because the same release and records were exposed
  through the failed text representation. An independent endpoint or prospectively collected
  dataset is required before confirmatory representation claims.
- Under every result, no patch corpus is built, no model is trained or promoted, no fishing or
  current-habitat claim is made, and no browser, API, Worker, D1/R2/Queue, provider, production,
  public score, or deployment state changes.
