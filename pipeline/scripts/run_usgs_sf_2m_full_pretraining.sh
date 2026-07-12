#!/usr/bin/env bash
set -euo pipefail

# Reproduce the full-survey USGS 2 m ContourCast SSL v1 experiment.

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
OUTPUT_ROOT="${1:-$ROOT_DIR/work/usgs-sf-2m-full}"
SOURCE_URL="https://pubs.usgs.gov/ds/781/OffshoreSanFrancisco/data/Bathymetry_OffshoreSanFrancisco.zip"
ARCHIVE_SHA256="79c93fac3ae3d35213b808b3913115744676c03aead72a686651817e86d5be53"
GEOTIFF_SHA256="75629f6a8bc7e3ea78fb6b3b22c737ec75a8cba1621f2c0066a2343ab61a242a"

RAW_DIR="$OUTPUT_ROOT/raw"
PROCESSED_DIR="$OUTPUT_ROOT/processed"
ARTIFACT_DIR="$OUTPUT_ROOT/artifacts/pretraining"
ZIP_PATH="$RAW_DIR/Bathymetry_OffshoreSanFrancisco.zip"
SOURCE_TIF="$RAW_DIR/usgs-sf-2m/Bathymetry_OffshoreSanFrancisco.tif"
CORPUS_PATH="$PROCESSED_DIR/usgs-sf-2m-full-corpus.npz"

mkdir -p "$RAW_DIR" "$PROCESSED_DIR" "$ARTIFACT_DIR"
if [[ ! -f "$ZIP_PATH" ]]; then
  curl -L --fail --retry 3 -o "$ZIP_PATH" "$SOURCE_URL"
fi

hash_file() {
  "$PYTHON_BIN" - "$1" <<'PY'
import hashlib
import sys
from pathlib import Path

digest = hashlib.sha256()
with Path(sys.argv[1]).open("rb") as handle:
    for chunk in iter(lambda: handle.read(1024 * 1024), b""):
        digest.update(chunk)
print(digest.hexdigest())
PY
}

if [[ "$(hash_file "$ZIP_PATH")" != "$ARCHIVE_SHA256" ]]; then
  echo "USGS archive checksum mismatch" >&2
  exit 1
fi
if [[ ! -f "$SOURCE_TIF" ]]; then
  mkdir -p "$(dirname "$SOURCE_TIF")"
  unzip -o "$ZIP_PATH" -d "$(dirname "$SOURCE_TIF")" >/dev/null
fi
if [[ "$(hash_file "$SOURCE_TIF")" != "$GEOTIFF_SHA256" ]]; then
  echo "USGS GeoTIFF checksum mismatch" >&2
  exit 1
fi

cd "$ROOT_DIR"
"$PYTHON_BIN" -m pipeline.contourcast.cli build-geotiff-pretraining-corpus \
  --input "$SOURCE_TIF" \
  --output "$CORPUS_PATH" \
  --source-id usgs_sf_state_waters_2m \
  --vertical-datum NAVD88 \
  --expected-sha256 "$GEOTIFF_SHA256" \
  --radii-m 32 128 512 \
  --output-size 33 \
  --stride-m 64 \
  --max-centers 4096 \
  --min-valid-fraction 0.8 \
  --local-radius 4 \
  --broad-radius 24 \
  --relief-radius 8 \
  --horizontal-accuracy-m 2 \
  --tile-size 1024 \
  --seed 42

"$PYTHON_BIN" -m pipeline.contourcast.cli pretrain-bathymetry \
  --corpus "$CORPUS_PATH" \
  --output-dir "$ARTIFACT_DIR" \
  --epochs 20 \
  --batch-size 64 \
  --learning-rate 0.0003 \
  --weight-decay 0.0001 \
  --base-width 32 \
  --blocks-per-stage 2 \
  --projection-dim 128 \
  --temperature 0.2 \
  --min-negative-distance-m 512 \
  --split-regions 5 \
  --validation-fold 0 \
  --device mps \
  --seed 42

echo "Full-survey corpus: $CORPUS_PATH"
echo "Full-survey checkpoint: $ARTIFACT_DIR/bathymetry_encoder.pt"
