#!/usr/bin/env bash
set -euo pipefail

# Audit direct USGS video labels under a whole-track-group leakage gate.
# This command never fits a model and never changes serving configuration.

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python3}"
HYBRID_ROOT="${HYBRID_ROOT:-$ROOT_DIR/work/usgs-sf-hybrid-v1}"
OUTPUT_ROOT="${1:-$ROOT_DIR/work/usgs-sf-video-endpoint-audit-v1}"
EXTRACTED_DIR="${EXTRACTED_DIR:-$HYBRID_ROOT/raw/extracted}"
RAW_DIR="$OUTPUT_ROOT/raw"
RESULT_DIR="$OUTPUT_ROOT/results"

GEOTIFFS=(
  "Bathymetry_OffshoreSanFrancisco.tif"
  "BackscatterA_8101_2004_OffshoreSanFrancisco.tif"
  "BackscatterB_8101_2007_OffshoreSanFrancisco.tif"
  "BackscatterC_8101_2008_OffshoreSanFrancisco.tif"
  "BackscatterD_7125_2006_OffshoreSanFrancisco.tif"
)
GEOTIFF_SHA256=(
  "75629f6a8bc7e3ea78fb6b3b22c737ec75a8cba1621f2c0066a2343ab61a242a"
  "6fd2b9d9b9109d7a2b8f7cf3eaee2dbda9102c09295e8760a663015b92162bf0"
  "9910dc1a1b5726f4866eee8d4a07702fa85048a78c993dc522d0213ae141be34"
  "8885f1414fd4638981f8a0ede253b825b9d331c73ca3d4c7004665127ed3d8d2"
  "f44b5ebbabe5f979fbc49ce65704cf3b4f354a826cf7cab61f22f0dc64bdd972"
)
LAYER_NAMES=(
  ""
  "backscatter_intensity_8101_2004"
  "backscatter_intensity_8101_2007"
  "backscatter_intensity_8101_2008"
  "backscatter_intensity_7125_2006"
)
CRUISE_IDS=("f208nc" "f307nc")
VIDEO_URLS=(
  "https://pubs.usgs.gov/ds/781/video_observations/data/f208nc_video_observations.zip"
  "https://pubs.usgs.gov/ds/781/video_observations/data/f307nc_video_observations.zip"
)
VIDEO_SHA256=(
  "ed61ba3112690f69af0cdfc27d8b391d44e755931b5b22453c50552c056f4daf"
  "5a524a75155d953ac7b0808213741c9f0681d63a2c4f682fc39238413dec1d07"
)

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
    echo "Run pipeline/scripts/run_usgs_sf_hybrid_pretraining.sh first." >&2
    exit 1
  fi
  if [[ "$(hash_file "$path")" != "$expected" ]]; then
    echo "Artifact checksum mismatch: $path" >&2
    exit 1
  fi
}

mkdir -p "$RAW_DIR" "$RESULT_DIR"
for index in "${!GEOTIFFS[@]}"; do
  require_hash "$EXTRACTED_DIR/${GEOTIFFS[$index]}" "${GEOTIFF_SHA256[$index]}"
done

VIDEO_ARGS=()
for index in "${!CRUISE_IDS[@]}"; do
  archive="$RAW_DIR/${CRUISE_IDS[$index]}_video_observations.zip"
  if [[ ! -f "$archive" ]]; then
    curl -L --fail --retry 3 -o "$archive" "${VIDEO_URLS[$index]}"
  fi
  require_hash "$archive" "${VIDEO_SHA256[$index]}"
  VIDEO_ARGS+=(--video-archive "${CRUISE_IDS[$index]}=$archive")
done

ALIGNED_ARGS=()
for index in 1 2 3 4; do
  ALIGNED_ARGS+=(
    --aligned-layer "${LAYER_NAMES[$index]}=$EXTRACTED_DIR/${GEOTIFFS[$index]}"
  )
done

cd "$ROOT_DIR"
"$PYTHON_BIN" -m pipeline.contourcast.cli audit-usgs-sf-video-endpoint \
  --bathymetry "$EXTRACTED_DIR/${GEOTIFFS[0]}" \
  --output-dir "$RESULT_DIR" \
  --source-id usgs_sf_state_waters_2m \
  --vertical-datum NAVD88 \
  --radii-m 32 128 512 \
  --output-size 33 \
  --min-valid-fraction 0.8 \
  --min-aligned-valid-fraction 0.5 \
  --local-radius 4 \
  --broad-radius 24 \
  --relief-radius 8 \
  --horizontal-accuracy-m 2 \
  --tile-size 1024 \
  --min-group-class-rows 16 \
  "${ALIGNED_ARGS[@]}" \
  "${VIDEO_ARGS[@]}"

echo "Video endpoint audit: $RESULT_DIR/usgs_video_endpoint_audit_metrics.json"
