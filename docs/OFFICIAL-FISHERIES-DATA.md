# Official fisheries data register and acquisition gate

This is the repository-controlled register for public CDFW/CRFS/RecFIN inputs. A source is
not model-ready merely because it is official or downloadable. Every snapshot must preserve
its exact source version, query, dictionary, checksum, license label, attribution, sampling
design, denominator, and honest spatial and temporal support.

No private-group, authenticated-social, credentialed, or user-account data belongs in this
workflow. Raw public snapshots are archived outside Git because their byte-binding receipts are
enough for repository review and the official service can be reacquired. Never place a snapshot
in a public release until its current license and redistribution terms have been reviewed.
The exact admitted inventory and operation boundaries are enforced by
`pipeline/source-admissibility-policy.json`; the loader rejects any unreviewed manifest.

## Accepted aggregate snapshots

| Dataset | Exact service revision | Features | Canonical snapshot SHA-256 | Allowed use |
| --- | ---: | ---: | --- | --- |
| CDFW CRFS ds3186, all catch / all effort | `dataLastEditDate=1753738461560` | 6,936 | `872cdef85230f9fa60ef34bfbf7475c8eaab39913761e18e4f233ce3a205eaec` | Descriptive block/time-bin context only |
| CDFW CRFS ds3185, RCGL catch / Bottomfish effort | `dataLastEditDate=1753737060466` | 4,471 | `51b1c5f64c6917791438883fc3ad31cd195b8dfb354780306a4c237bc4fb7e93` | Descriptive block/time-bin context only |

The snapshots were retrieved and independently re-canonicalized twice on 2026-07-18 UTC. The
snapshot hashes remained identical. Exact receipts are committed under
`pipeline/sources/receipts/`; machine source contracts are in `pipeline/sources/`.

Both layers are polygon aggregates over one-minute CRFS `BlockBox` areas and broad time bins.
They are not event rows, complete attempts, expanded population estimates, exact fishing
locations, or catch probabilities. Their `Samples` field reflects released survey samples and
every published row passed the dataset's three-trip release floor.

The eight period-specific `All_*` and `Kept_*` fields use `-9999` where a bin lacks a published
value. That observed sentinel is preserved in the raw snapshot and must become an explicit
missing value in any derived table. It is never negative catch and is never zero.

## Truthful source boundaries

### ds3186

The numerator pools all caught species and the denominator pools surveyed anglers across all
trip types. It can describe broad spatial fishing activity but cannot identify California
halibut target effort, encounters, skunks, or species-specific catch rate. It is disabled for
model training, validation, production scoring, and point labels.

### ds3185

The numerator pools rockfish, cabezon, greenling, and lingcod as `RCGL`; the denominator is the
much broader `Bottomfish` trip category. It cannot become a named rockfish/cabezon/greenling/
lingcod target or validation label. It is disabled for model training, validation, production
scoring, and point labels.

### CRFS/RecFIN complete-effort data

The two accepted layers do not satisfy the observation-v2 contract. A separate official RecFIN
or CDFW export must retain complete effort segments, legitimate zero-catch attempts, target,
mode, sampling fields, query parameters, and its own raw checksum before supervised use can
even be reviewed. Expanded estimates and catch-only exports remain rejected. The prospective
first-party cohort also remains open.

### Public SD002 discovery

On 2026-07-25 the public RecFIN `nobody` role exposed SD002, “Recreational Fishery Sample
Report: Sample Records,” including California trip date, county, trip type, primary target, mode,
species, and catch fields. A public Santa Barbara County query showed California-halibut-target
rows with target catches, non-target catches, and blank species/catch rows. This establishes that
a technically relevant official sample source exists. It does not establish that blank rows are
confirmed complete zero-catch attempts.

RecFIN's public 71-field SD002/SD502 dictionary includes stable sample, angler, catch, and
location identifiers plus target, mode, angler count, catch dispositions, survey, and spatial
fields. The exact observed 62,835-byte workbook is bound by SHA-256
`b17ebe6ec617014a0a4c0e0b70f502f50554e41e85f234f6126f8d7c524e2139`. It documents
`NUMBER_HOURS_FISHED` as Oregon-only, so no California effort duration may be inferred.

The public report's default output omits those stable identifiers. RecFIN's own QueryBuilder
manual states that raw-data queries require an active authorized account, and the large-export
manual binds large exports to a user profile. No official automated-bulk, commercial-ML,
derived-product, retention, or redistribution permission was found. Public visibility is not a
license. The source therefore remains unadmitted for normalization or any model role.

The exact discovery evidence is in
`pipeline/sources/receipts/recfin-sd002-public-discovery-20260725.receipt.json`; a minimal,
copyable official request and post-response acceptance boundary are in
`docs/RECFIN_COMPLETE_EFFORT_REQUEST.md`. No raw sample corpus was acquired.

## Source drift caught during acquisition

The ArcGIS convenience-download endpoint for ds3185 returned an older 4,154-feature export with
`All_21_23`, `Kept_21_23`, and `Block`, while the authoritative FeatureServer published 4,471
features with `All_21_24`, `Kept_21_24`, and `BlockBox`. The stale export was rejected. The
accepted acquisition queries the exact FeatureServer layer, pins its identity/revision/field
dictionary, orders by `OBJECTID`, captures pre/post metadata and ID sets, and fails closed if the
source changes during transfer.

This discrepancy is also why a portal page's display date or convenience link is not accepted
as source identity. The service revision, exact dictionary, object IDs, canonical bytes, and
receipt must agree.

## Reacquisition

With normal network access, write to a private artifact directory outside the repository:

```bash
python3 scripts/acquire_cdfw_crfs.py \
  --dataset ds3185 \
  --dataset ds3186 \
  --output-dir /private/path/cdfw-crfs
```

In a sandbox where only an approved download command has network access, capture the exact
metadata, object-ID, and `OBJECTID`-ordered GeoJSON pages first, then run the same verifier with:

```bash
python3 scripts/acquire_cdfw_crfs.py \
  --dataset ds3185 \
  --dataset ds3186 \
  --page-size 2000 \
  --offline-input-dir /private/path/cdfw-crfs \
  --output-dir /private/path/cdfw-crfs
```

The verifier allows only the reviewed HTTPS ArcGIS origin and layer paths, caps responses,
requires exact schema and revision identity, validates every feature, checks the missing-value
sentinel and aggregation labels, compares pre/post revisions and object IDs, and writes files
atomically with owner-only permissions.

## License and attribution boundary

The California Open Data pages label both datasets `Creative Commons Attribution` and do not
state a version number on the dataset page. The manifests preserve that exact label without
inventing a version. Retain the CDFW/CRFS attribution, link the official landing page, and
re-check current portal terms before redistribution or commercial use. This register records
source evidence; it is not legal advice or a substitute for counsel.

## Next acceptance gates

- Send the drafted request or obtain an authorized QueryBuilder account, then obtain a
  reproducible, permitted complete-effort CRFS/RecFIN sample export with stable identities,
  confirmed zero-catch semantics, a valid California effort unit, query and dictionary receipts,
  and written intended-use terms; do not substitute these aggregate layers or scrape the public
  report.
- Define a source-specific transformation that preserves survey design and missingness and
  cannot create point labels from blocks.
- Begin the consented prospective first-party cohort under the still-closed validation gate.
- Review training, validation, context, and redistribution permissions for each future source
  before any model or public-product use, then land a protected policy change before manifest or
  ingestion code.
