import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateSantaBarbaraAccessReview,
  verifySantaBarbaraAccessReview,
} from "../scripts/verify-santa-barbara-access-review.mjs";

const root = new URL("../", import.meta.url);

async function fixtures() {
  const [policy, catalog, guide] = await Promise.all([
    readFile(new URL("field-review/santa-barbara-access-review-policy.json", root), "utf8").then(JSON.parse),
    readFile(new URL("public/data/sites.json", root), "utf8").then(JSON.parse),
    readFile(new URL("docs/SANTA-BARBARA-LOCAL-ACCESS-REVIEW.md", root), "utf8"),
  ]);
  return { policy, catalog, guide };
}

test("Santa Barbara access-review policy exactly covers the regional catalog and remains unexecuted", async () => {
  assert.deepEqual(await verifySantaBarbaraAccessReview(), {
    schemaVersion: "castingcompass.santa-barbara-access-review/1.0.0",
    status: "template_only_not_executed",
    siteCount: 13,
    limitedSiteCount: 4,
    questionCount: 5,
    deploymentAuthorizationGranted: false,
    modelValidationEvidenceGranted: false,
  });
});

test("review policy rejects pre-accepted sites and catalog drift", async () => {
  const fixture = await fixtures();
  const accepted = structuredClone(fixture);
  accepted.policy.sites[0].reviewState = "accepted";
  assert.throws(
    () => validateSantaBarbaraAccessReview(accepted),
    /cannot be pre-accepted/u,
  );

  const drifted = structuredClone(fixture);
  const catalogSites = Array.isArray(drifted.catalog.sites) ? drifted.catalog.sites : drifted.catalog;
  catalogSites.find(({ id }) => id === "goleta-beach").accessStatus = "open";
  assert.throws(
    () => validateSantaBarbaraAccessReview(drifted),
    /access status drifted/u,
  );
});

test("review policy rejects precise-location fields and weakened acceptance gates", async () => {
  const fixture = await fixtures();
  const precise = structuredClone(fixture);
  precise.policy.sites[0].latitude = 34.47;
  assert.throws(
    () => validateSantaBarbaraAccessReview(precise),
    /keys do not match/u,
  );

  const deployable = structuredClone(fixture);
  deployable.policy.acceptance.deploymentAuthorizationGranted = true;
  assert.throws(
    () => validateSantaBarbaraAccessReview(deployable),
    /cannot authorize deployment/u,
  );
});
