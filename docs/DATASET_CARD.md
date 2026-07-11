# ContourCast dataset card

**Status:** data-contract and processing pipeline implemented; official data not
bundled; no production training dataset has been assembled or approved.

**Version:** 0.1.0

## Intended dataset

ContourCast is designed to join a bathymetric terrain grid with recreational
fishing observations for Bay and coastal California research. The intended
learning unit is a point-resolution fishing event with effort, a target species,
an occurrence label, and catch per unit effort (CPUE). Aggregated survey
estimates remain separate and must not be treated as exact-point labels.

This dataset is for exploratory habitat and product research. It is not a
nautical chart, navigation aid, regulatory source, biological stock assessment,
or guarantee that fish will be present.

## Official sources and stewardship

The machine-readable manifests are in `pipeline/sources/`.

| Source | Steward | Intended use | Official access |
| --- | --- | --- | --- |
| CUDEM / Coastal Relief bathymetry | NOAA National Centers for Environmental Information | Elevation/bathymetry raster and published metadata | [NOAA Coastal Elevation Models](https://www.ncei.noaa.gov/products/coastal-elevation-models), [NOAA Bathymetry](https://www.ncei.noaa.gov/products/bathymetry) |
| California Recreational Fisheries Survey (CRFS) | California Department of Fish and Wildlife | California marine recreational catch/effort samples or estimates | [CDFW CRFS](https://wildlife.ca.gov/Conservation/Marine/CRFS/Additional-Information) |
| RecFIN Data Warehouse | Pacific States Marine Fisheries Commission | Official distribution/query system for Pacific Coast recreational-fisheries data, including CRFS | [RecFIN](https://www.recfin.org/) |

CRFS and RecFIN are not NOAA bathymetry products. Their actual stewards are
preserved because survey ownership, design documentation, and citation matter.
CDFW states that CRFS data and estimates from 2004 onward are available through
RecFIN. Raw query exports, query filters, access dates, and checksums must be
retained.

## Data contracts

### Bathymetry

The canonical NPZ contains:

- `values`: one 2-D, positive-upward elevation raster in metres;
- `metadata.crs`: a projected CRS with metre axes;
- `metadata.transform`: six-coefficient, north-up GDAL affine transform;
- `metadata.vertical_datum`: the datum published with the selected product;
- `metadata.source_id`, nodata value, units, and schema version.

Geographic degrees, rotated grids, unknown vertical datums, empty rasters, and
non-metre horizontal units are rejected. `pyproj`, when installed, performs an
independent CRS semantics check. Without it, the provenance record explicitly
marks CRS semantics as unverified.

Elevation products from different vertical datums must not be stacked or
compared until a documented vertical transformation is performed. Resolution
is not treated as positional or vertical accuracy. NOAA elevation products are
explicitly **not for navigation**.

### Fishing observations

Canonical fields are:

| Field | Meaning |
| --- | --- |
| `event_id` | Stable source event/sample identifier |
| `observed_at` | Observation time when released |
| `species` | Target taxon/name from the source export |
| `catch_count` | Nonnegative observed or documented count field |
| `effort_hours` | Positive effort denominator |
| `sample_weight` | Positive released sample-count/reliability weight; defaults to 1 when unavailable |
| `occurrence` | `1` when canonical catch count is positive, otherwise `0` |
| `cpue` | `catch_count / effort_hours` |
| `x`, `y`, `crs` | Legitimately released projected point coordinates and CRS |
| `area_id` | Source geography when only an aggregate area is released |
| `spatial_resolution` | `point`, `area`, or source-specific resolution |
| `source_id` | Manifest identifier |
| `terrain_model_eligible` | True only for point/GPS/exact rows with both coordinates |

The importer never converts an area centroid, port, district, or survey stratum
into a purported catch location. An area-only record may support aggregate
descriptive analysis, but it cannot enter the point-level terrain model.

Sample data and expanded survey estimates have different meanings. Expansion
weights, strata, modes, uncertainty fields, and source documentation must be
retained in the raw layer. The current canonical point pipeline is not a
survey-weighted estimator; expanded estimates should not be mixed with raw
events until that estimator is explicitly implemented and validated.

## Derived terrain channels

All six channels are aligned to the bathymetry raster in this fixed order:

1. `depth_m`: positive-down depth, `max(-elevation, 0)`;
2. `slope_deg`: gradient magnitude converted to degrees;
3. `roughness_m`: local depth standard deviation;
4. `curvature`: horizontal Laplacian of elevation;
5. `tpi_local_m`: depth minus local-window mean;
6. `tpi_broad_m`: depth minus broad-window mean.

Defaults use radii of two and six cells. Pixel size, radii, sign convention,
channel names, source datum, and robust summary statistics are saved with each
artifact. Nodata pixels stay invalid after derivation; finite fill is used only
internally to avoid derivative explosions at holes.

## Spatial alignment and leakage controls

- Raster channels must match CRS, shape, affine transform, and units exactly.
- Observations must use the same projected CRS and lie within raster bounds.
- Terrain patches are extracted only after these checks.
- Evaluation creates spatially contiguous K-means regions and holds out each
  complete region once.
- An optional metre buffer removes training observations close to held-out
  points. Preprocessing and model fitting occur inside each fold.
- Random row splits are not accepted as evidence of spatial generalization.

The K-means regions are an evaluation scaffold, not a claim that they correspond
to ecological management areas. Before a reported experiment, region count and
buffer distance should be chosen from sampling density and the intended product
use, then fixed before inspecting test results.

## Known biases and limitations

- CRFS/RecFIN measure fishing activity and observed catches, not complete fish
  presence/absence. Angler choices, access, regulations, gear, skill, season,
  weather, and survey coverage shape the labels.
- A zero catch is not a confirmed biological absence.
- Popular or accessible areas and commonly retained species can be
  overrepresented.
- Bathymetry surveys have heterogeneous age, density, and uncertainty.
- Public survey geography may be much coarser than a DEM pixel.
- CPUE values can be heavy-tailed and are not automatically comparable across
  modes or survey designs.
- Sensitive user-contributed fishing locations require access controls,
  coordinate minimization, and an explicit retention/deletion policy before
  collection. No private user data is included here.

## Reproducibility and versioning

Every real-data run must preserve:

- immutable raw files and SHA-256 hashes;
- exact source product/query, filters, access date, citation, and manifest ID;
- CRS and vertical-datum transformation history;
- terrain configuration and fixed channel order;
- observation eligibility counts and rejected-row reasons;
- geographic split seed/count/buffer;
- Git revision, Python runtime, input hashes, experiment version, and model
  version from `run_metadata.json`.

Run the synthetic plumbing check with:

```bash
python3 -m pipeline.contourcast.cli smoke --output-dir /tmp/contourcast-smoke
```

Synthetic fixture metrics are labeled `synthetic_fixture` and are not real-data
results.

## Current results

**Unrun on official data.** No row counts, class balance, coverage statistics,
model metrics, or habitat conclusions are claimed in this card.
