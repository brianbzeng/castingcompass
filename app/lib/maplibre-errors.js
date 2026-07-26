const MAPLIBRE_ABORT_NAME = "AbortError";
const MAPLIBRE_RASTER_ABORT_MESSAGE = "signal is aborted without reason";
const MAPLIBRE_ABORT_TILE_FRAME = /\b_?abortTile\b/;
const MAPLIBRE_MODULE_FRAME = /\bmaplibre-gl(?:-[A-Za-z0-9_-]+)?\.js\b/;

/**
 * MapLibre GL 5.24 can leave its expected raster-tile cancellation rejected when a
 * viewport change removes an in-flight tile. Keep this predicate deliberately
 * narrower than a general AbortError filter: application fetch cancellations and
 * unrelated failures must continue to reach normal error reporting.
 *
 * @param {unknown} reason
 */
export function isExpectedMapLibreRasterTileAbort(reason) {
  if (reason === null || typeof reason !== "object") return false;

  const candidate = /** @type {{ name?: unknown; message?: unknown; stack?: unknown }} */ (reason);
  return candidate.name === MAPLIBRE_ABORT_NAME
    && candidate.message === MAPLIBRE_RASTER_ABORT_MESSAGE
    && typeof candidate.stack === "string"
    && MAPLIBRE_ABORT_TILE_FRAME.test(candidate.stack)
    && MAPLIBRE_MODULE_FRAME.test(candidate.stack);
}

/**
 * @param {{ reason: unknown; preventDefault: () => void; stopImmediatePropagation?: () => void }} event
 */
export function suppressExpectedMapLibreRasterTileAbort(event) {
  if (!isExpectedMapLibreRasterTileAbort(event.reason)) return;
  event.preventDefault();
  event.stopImmediatePropagation?.();
}
