#!/usr/bin/env bash
set -euo pipefail

# Reproduce the strict frozen-embedding seafloor-character probe.

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
OUTPUT_ROOT="${1:-$ROOT_DIR/work/usgs-sf-2m-seafloor-probe}"
SOURCE_URL="https://pubs.usgs.gov/ds/781/OffshoreSanFrancisco/data/SeafloorCharacter_OffshoreSanFrancisco.zip"
ARCHIVE_SHA256="a826cca8611ff4b5445ae398f1ad419813435876db2aa5810e76a73c83225c3b"
LABEL_SHA256="224ea4ed70c02769e08b3b971b9adae6c5853f2af7130587604e8f49ba6d035e"

RAW_DIR="$OUTPUT_ROOT/raw"
RESULT_DIR="$OUTPUT_ROOT/results"
ZIP_PATH="$RAW_DIR/SeafloorCharacter_OffshoreSanFrancisco.zip"
LABEL_TIF="$RAW_DIR/seafloor-character/SeafloorCharacter_OffshoreSanFrancisco.tif"
CORPUS_PATH="${CORPUS_PATH:-$ROOT_DIR/data/processed/usgs-sf-2m-full-corpus.npz}"
CHECKPOINT_PATH="${CHECKPOINT_PATH:-$ROOT_DIR/artifacts/usgs-sf-2m-full-ssl-v1/bathymetry_encoder.pt}"

mkdir -p "$RAW_DIR" "$RESULT_DIR"
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
  echo "USGS seafloor-character archive checksum mismatch" >&2
  exit 1
fi
if [[ ! -f "$LABEL_TIF" ]]; then
  mkdir -p "$(dirname "$LABEL_TIF")"
  unzip -o "$ZIP_PATH" -d "$(dirname "$LABEL_TIF")" >/dev/null
fi
if [[ "$(hash_file "$LABEL_TIF")" != "$LABEL_SHA256" ]]; then
  echo "USGS seafloor-character GeoTIFF checksum mismatch" >&2
  exit 1
fi

cd "$ROOT_DIR"
"$PYTHON_BIN" -m pipeline.contourcast.cli probe-seafloor-character \
  --corpus "$CORPUS_PATH" \
  --checkpoint "$CHECKPOINT_PATH" \
  --labels "$LABEL_TIF" \
  --output-dir "$RESULT_DIR" \
  --label-sha256 "$LABEL_SHA256" \
  --validation-fold 0 \
  --split-regions 5 \
  --batch-size 64 \
  --device mps \
  --bootstrap-samples 1000 \
  --seed 42

echo "Probe metrics: $RESULT_DIR/seafloor_probe_metrics.json"
