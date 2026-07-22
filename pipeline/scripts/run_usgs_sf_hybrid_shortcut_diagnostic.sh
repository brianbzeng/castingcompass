#!/usr/bin/env bash
set -euo pipefail

# Reproduce the post-hoc survey-seam and missingness diagnostic.
# Run run_usgs_sf_hybrid_pretraining.sh first, or point HYBRID_ROOT at its output.

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
DEVICE="${DEVICE:-mps}"
HYBRID_ROOT="${HYBRID_ROOT:-$ROOT_DIR/work/usgs-sf-hybrid-v1}"
OUTPUT_ROOT="${1:-$ROOT_DIR/work/usgs-sf-hybrid-shortcut-diagnostic-v1}"
RAW_DIR="$OUTPUT_ROOT/raw"
RESULT_DIR="$OUTPUT_ROOT/results"
LABEL_ARCHIVE="$RAW_DIR/SeafloorCharacter_OffshoreSanFrancisco.zip"
LABEL_TIF="$RAW_DIR/seafloor-character/SeafloorCharacter_OffshoreSanFrancisco.tif"

CORPUS_PATH="${CORPUS_PATH:-$HYBRID_ROOT/processed/usgs-sf-hybrid-corpus-v1.npz}"
BATHYMETRY_CHECKPOINT="${BATHYMETRY_CHECKPOINT:-$HYBRID_ROOT/artifacts/bathymetry/bathymetry_hybrid_encoder.pt}"
BACKSCATTER_CHECKPOINT="${BACKSCATTER_CHECKPOINT:-$HYBRID_ROOT/artifacts/backscatter/backscatter_hybrid_encoder.pt}"
FUSED_CHECKPOINT="${FUSED_CHECKPOINT:-$HYBRID_ROOT/artifacts/fused/fused_hybrid_encoder.pt}"

LABEL_URL="https://pubs.usgs.gov/ds/781/OffshoreSanFrancisco/data/SeafloorCharacter_OffshoreSanFrancisco.zip"
LABEL_ARCHIVE_SHA256="a826cca8611ff4b5445ae398f1ad419813435876db2aa5810e76a73c83225c3b"
LABEL_SHA256="224ea4ed70c02769e08b3b971b9adae6c5853f2af7130587604e8f49ba6d035e"
CORPUS_SHA256="dd88342209522d12726208259640fe7ac9379a61fa79cd9e606475945dd9af4a"
BATHYMETRY_CHECKPOINT_SHA256="3261b5328290d5e9992c6ae19d3670eff5ad4d0b47027442bcd04bfaa36edbce"
BACKSCATTER_CHECKPOINT_SHA256="edb8e6579bac3f76b74b11b3ba91d7bb363605172fa6d5abc52edf4bc0b8d5e2"
FUSED_CHECKPOINT_SHA256="7ccff84da4ea0799cc4f87b0d63b39ccb6e943d95ca082da6b38e6aa8a6f7156"

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

require_hash() {
  local path="$1"
  local expected="$2"
  if [[ ! -f "$path" ]]; then
    echo "Required artifact is absent: $path" >&2
    exit 1
  fi
  if [[ "$(hash_file "$path")" != "$expected" ]]; then
    echo "Artifact checksum mismatch: $path" >&2
    exit 1
  fi
}

mkdir -p "$RAW_DIR" "$RESULT_DIR"
if [[ ! -f "$LABEL_ARCHIVE" ]]; then
  curl -L --fail --retry 3 -o "$LABEL_ARCHIVE" "$LABEL_URL"
fi
require_hash "$LABEL_ARCHIVE" "$LABEL_ARCHIVE_SHA256"
if [[ ! -f "$LABEL_TIF" ]]; then
  mkdir -p "$(dirname "$LABEL_TIF")"
  unzip -o "$LABEL_ARCHIVE" -d "$(dirname "$LABEL_TIF")" >/dev/null
fi
require_hash "$LABEL_TIF" "$LABEL_SHA256"
require_hash "$CORPUS_PATH" "$CORPUS_SHA256"
require_hash "$BATHYMETRY_CHECKPOINT" "$BATHYMETRY_CHECKPOINT_SHA256"
require_hash "$BACKSCATTER_CHECKPOINT" "$BACKSCATTER_CHECKPOINT_SHA256"
require_hash "$FUSED_CHECKPOINT" "$FUSED_CHECKPOINT_SHA256"

cd "$ROOT_DIR"
"$PYTHON_BIN" -m pipeline.contourcast.cli diagnose-hybrid-seafloor-shortcuts \
  --corpus "$CORPUS_PATH" \
  --bathymetry-checkpoint "$BATHYMETRY_CHECKPOINT" \
  --backscatter-checkpoint "$BACKSCATTER_CHECKPOINT" \
  --fused-checkpoint "$FUSED_CHECKPOINT" \
  --labels "$LABEL_TIF" \
  --output-dir "$RESULT_DIR" \
  --label-sha256 "$LABEL_SHA256" \
  --validation-fold 3 \
  --split-regions 5 \
  --min-domain-rows 32 \
  --min-domain-class-rows 16 \
  --batch-size 64 \
  --device "$DEVICE" \
  --bootstrap-samples 1000 \
  --seed 42

echo "Shortcut diagnostic metrics: $RESULT_DIR/hybrid_shortcut_diagnostic_metrics.json"
