import assert from "node:assert/strict";
import test from "node:test";

import { selectLocalSettleCandidate } from "../app/lib/marketing-scroll-settle.ts";

test("settle correction chooses the nearest story on either side of its center", () => {
  const targets = [500, 1000, 1500];

  assert.deepEqual(selectLocalSettleCandidate(targets, 1080, 140), {
    distance: 80,
    story: 2,
    target: 1000,
  });
  assert.deepEqual(selectLocalSettleCandidate(targets, 920, 140), {
    distance: 80,
    story: 2,
    target: 1000,
  });
});

test("settle correction does not reach into a different section", () => {
  const targets = [500, 1000, 1500];

  assert.equal(selectLocalSettleCandidate(targets, 1700, 140), null);
  assert.equal(selectLocalSettleCandidate(targets, 760, 140), null);
});

test("settle correction resolves close boundaries to the nearest story", () => {
  const targets = [500, 700];

  assert.deepEqual(selectLocalSettleCandidate(targets, 610, 140), {
    distance: 90,
    story: 2,
    target: 700,
  });
});
