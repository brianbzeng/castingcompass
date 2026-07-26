import assert from "node:assert/strict";
import test from "node:test";
import {
  isExpectedMapLibreRasterTileAbort,
  suppressExpectedMapLibreRasterTileAbort,
} from "../app/lib/maplibre-errors.js";

const EXPECTED_MESSAGE = "signal is aborted without reason";

function rejection(overrides = {}) {
  return {
    name: "AbortError",
    message: EXPECTED_MESSAGE,
    stack: `AbortError: ${EXPECTED_MESSAGE}\n    at q.abortTile (https://castingcompass.com/assets/maplibre-gl-2DjS9JS6.js:1:2)`,
    ...overrides,
  };
}

test("recognizes only the pinned MapLibre raster-tile cancellation signature", () => {
  assert.equal(isExpectedMapLibreRasterTileAbort(rejection()), true);
  assert.equal(isExpectedMapLibreRasterTileAbort(rejection({
    stack: `AbortError: ${EXPECTED_MESSAGE}\n    at Fe._abortTile (http://localhost:3000/node_modules/.vite/deps/maplibre-gl.js:21024:15)`,
  })), true);

  assert.equal(isExpectedMapLibreRasterTileAbort(rejection({
    stack: `AbortError: ${EXPECTED_MESSAGE}\n    at loadDiscussion (https://castingcompass.com/assets/app.js:4:8)`,
  })), false, "application request aborts remain observable");
  assert.equal(isExpectedMapLibreRasterTileAbort(rejection({
    stack: `AbortError: ${EXPECTED_MESSAGE}\n    at abortTile (https://castingcompass.com/assets/app.js:4:8)`,
  })), false, "an application function named abortTile is not enough");
  assert.equal(isExpectedMapLibreRasterTileAbort(rejection({ message: "The operation was aborted." })), false);
  assert.equal(isExpectedMapLibreRasterTileAbort(rejection({ name: "TypeError" })), false);
  assert.equal(isExpectedMapLibreRasterTileAbort(rejection({ stack: undefined })), false);
  assert.equal(isExpectedMapLibreRasterTileAbort(null), false);
  assert.equal(isExpectedMapLibreRasterTileAbort(EXPECTED_MESSAGE), false);
});

test("prevents only the expected MapLibre rejection", () => {
  let expectedPrevented = false;
  let expectedPropagationStopped = false;
  suppressExpectedMapLibreRasterTileAbort({
    reason: rejection(),
    preventDefault() {
      expectedPrevented = true;
    },
    stopImmediatePropagation() {
      expectedPropagationStopped = true;
    },
  });
  assert.equal(expectedPrevented, true);
  assert.equal(expectedPropagationStopped, true);

  let applicationPrevented = false;
  let applicationPropagationStopped = false;
  suppressExpectedMapLibreRasterTileAbort({
    reason: rejection({ stack: "AbortError: signal is aborted without reason\n    at abortTile (app.js:1:1)" }),
    preventDefault() {
      applicationPrevented = true;
    },
    stopImmediatePropagation() {
      applicationPropagationStopped = true;
    },
  });
  assert.equal(applicationPrevented, false);
  assert.equal(applicationPropagationStopped, false);
});
