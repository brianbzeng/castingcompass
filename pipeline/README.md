# ContourCast geospatial ML pipeline

This directory contains a reproducible, leakage-aware scaffold for modeling
recreational-fishing occurrence and positive-catch CPUE from coastal bathymetry.
It does **not** include downloaded government data, trained weights, or claimed
real-world performance.

## Lightweight smoke test

The smoke path uses only NumPy, pandas, and scikit-learn. It creates a fictional
UTM raster and fictional catch records, then exercises terrain derivation,
patch extraction, spatially blocked folds, three baselines, four ablations, and
versioned run metadata.

```bash
python3 -m pipeline.contourcast.cli smoke \
  --output-dir /tmp/contourcast-smoke \
  --seed 42

python3 -m unittest discover -s pipeline/tests -v
```

Any numbers under the smoke output are synthetic plumbing-test results, not
habitat, fishing, or model-quality claims.

## Official-source workflow

List source stewards and official access pages:

```bash
python3 -m pipeline.contourcast.cli sources
```

Download the selected NOAA CUDEM/Coastal Relief product and its metadata from
the official viewer. Record the exact product/version, access date, published
CRS, vertical datum, and SHA-256. Reproject externally to a north-up,
metre-based local CRS if needed; do not relabel the CRS.

```bash
python3 -m pipeline.contourcast.cli ingest-bathymetry \
  --input data/raw/noaa_tile.tif \
  --output data/processed/bathymetry.npz \
  --source-id noaa_ncei_cudem \
  --vertical-datum 'PUBLISHED DATUM' \
  --expected-sha256 'REPLACE_WITH_REAL_SHA256'

python3 -m pipeline.contourcast.cli derive-terrain \
  --bathymetry data/processed/bathymetry.npz \
  --output data/processed/terrain.npz
```

Export CRFS sample data or estimates from the official RecFIN warehouse. Keep
the raw file and query parameters. A column map is a JSON object from canonical
name to export column, for example:

```json
{
  "event_id": "SOURCE_SAMPLE_ID",
  "species": "COMMON_NAME",
  "catch_count": "OBSERVED_CATCH",
  "effort_hours": "ANGLER_HOURS",
  "sample_weight": "SAMPLES"
}
```

```bash
python3 -m pipeline.contourcast.cli ingest-observations \
  --input data/raw/recfin_export.csv \
  --output data/processed/observations.csv \
  --source-id cdfw_crfs \
  --column-map data/raw/column_map.json \
  --expected-sha256 'REPLACE_WITH_REAL_SHA256'
```

Area-level rows are retained for aggregate analysis but receive
`terrain_model_eligible=false`. Only legitimately released point coordinates in
the raster's exact projected CRS may enter patch models.

```bash
python3 -m pipeline.contourcast.cli validate \
  --bathymetry data/processed/bathymetry.npz \
  --observations data/processed/observations.csv

python3 -m pipeline.contourcast.cli evaluate-baselines \
  --terrain data/processed/terrain.npz \
  --observations data/processed/observations.csv \
  --output-dir artifacts/real-baseline-v1 \
  --dataset-kind real_observations \
  --splits 5 \
  --buffer-m 250
```

## Optional dependencies

- `rasterio`: read official GeoTIFFs during bathymetry ingestion.
- `pyproj`: independently verify that CRS axes are projected metres.
- `torch`: run the six-channel ResNet self-supervised/fine-tuning scaffold.

Install optional packages in an isolated environment using the platform- and
accelerator-appropriate versions. No Python environment is silently modified by
this repository.

When PyTorch is installed, this checks architecture shapes and finite losses;
it does not train or evaluate a model:

```bash
python3 -m pipeline.contourcast.cli deep-smoke
```

## Outputs

- Canonical bathymetry: compressed NPZ plus provenance JSON.
- Terrain stack: six-channel NPZ plus derivation statistics/provenance JSON.
- Observations: canonical CSV plus provenance JSON.
- Evaluation: per-fold and aggregate JSON for each baseline/ablation.
- Run metadata: input hashes, full configuration, runtime, Git revision,
  experiment version, and model version.

See [the dataset card](../docs/DATASET_CARD.md) and
[the model card](../docs/MODEL_CARD.md) before using real data.
