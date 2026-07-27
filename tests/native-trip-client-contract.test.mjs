import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateNativeTripPolicy,
  verifyNativeTripClientContract,
} from "../scripts/verify-native-trip-client-contract.mjs";

const policy = JSON.parse(await readFile(
  new URL("../security/native-trip-client-policy.json", import.meta.url),
  "utf8",
));

test("native trip contract is schema-valid and bound to runtime routes and receipts", () => {
  assert.deepEqual(verifyNativeTripClientContract(), policy);
});

test("native trip contract refuses success-only, automatic, or production-authorizing drift", () => {
  for (const mutate of [
    (candidate) => { candidate.recovery.success_requires = "local-optimistic-state"; },
    (candidate) => { candidate.recovery.automatic_replay_allowed = true; },
    (candidate) => { candidate.offline.terminal_write_may_claim_success_offline = true; },
    (candidate) => { candidate.operations[0].receipt.exact_top_level_fields = ["receipt", "trip"]; },
    (candidate) => { candidate.operations[0].receipt.success_status = 200; },
    (candidate) => { candidate.privacy.exact_gps_collected = true; },
    (candidate) => { candidate.authority.testflight_release = true; },
    (candidate) => { candidate.authority.model_training = true; },
  ]) {
    const candidate = structuredClone(policy);
    mutate(candidate);
    assert.throws(() => validateNativeTripPolicy(candidate));
  }
});

test("native client fields keep complete attempts, negative outcomes, and device continuity explicit", () => {
  const [start, complete, cancel] = policy.operations;
  assert.equal(policy.collection.target_taxon_id, "california-halibut");
  assert.deepEqual(policy.collection.modes, ["shore", "beach", "pier", "jetty"]);
  assert.equal(policy.collection.curated_site_id_only, true);
  assert.equal(policy.collection.combined_halibut_count_maximum, 40);
  assert.deepEqual(start.required_fields.slice(0, 3), ["clientTripId", "requestToken", "reporterKey"]);
  assert.equal(start.required_fields.includes("scoreInfluencedChoice"), true);
  assert.equal(complete.required_fields.includes("completeAttempt"), true);
  assert.equal(complete.required_fields.includes("keeperCount"), true);
  assert.equal(complete.required_fields.includes("shortReleasedCount"), true);
  assert.equal(complete.required_fields.includes("otherCatchCount"), true);
  assert.deepEqual(cancel.required_fields, ["token", "reason"]);
  assert.deepEqual(policy.operations.map(({ receipt }) => receipt.operation), ["start", "complete", "cancel"]);
  assert.deepEqual(policy.operations.map(({ receipt }) => receipt.success_status), [201, 200, 200]);
  assert.deepEqual(
    policy.operations.map(({ receipt }) => receipt.exact_top_level_fields),
    [["receipt"], ["receipt"], ["receipt"]],
  );
  assert.equal(policy.offline.offline_completion_model_use.startsWith("exclude-from-"), true);
});
