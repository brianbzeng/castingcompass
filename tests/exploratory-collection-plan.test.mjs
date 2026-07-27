import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";

import {
  verifyExploratoryCollectionPlan,
  verifyExploratoryCollectionSemantics,
} from "../scripts/verify-exploratory-collection-plan.mjs";

const [schema, plan, siteCatalogBytes, observationSchema, sourceManifest] = await Promise.all([
  readJson("contracts/exploratory-collection-plan.schema.json"),
  readJson("model/collection/santa-barbara-goleta-exploratory-v1.json"),
  readFile(new URL("../data/sites.json", import.meta.url)),
  readJson("contracts/observation.schema.json"),
  readJson("pipeline/sources/castingcompass_trip_log.json"),
]);
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

test("the Santa Barbara and Goleta collection plan is frozen, source-bound, and non-authorizing", async () => {
  assert.equal(validate(plan), true, JSON.stringify(validate.errors));
  verifyExploratoryCollectionSemantics({
    plan,
    siteCatalogBytes,
    observationSchema,
    sourceManifest,
  });
  await assert.doesNotReject(verifyExploratoryCollectionPlan());
});

test("the schema rejects activation, selective outcomes, location expansion, and model authority", () => {
  const cases = [];

  const activated = structuredClone(plan);
  activated.activation.activation_record_present = true;
  cases.push(activated);

  const training = structuredClone(plan);
  training.authority.model_training_authorized = true;
  cases.push(training);

  const positiveOnly = structuredClone(plan);
  positiveOnly.attempt_contract.outcome_classes = ["target_encountered"];
  cases.push(positiveOnly);

  const exactGps = structuredClone(plan);
  exactGps.privacy.exact_private_gps_collected = true;
  cases.push(exactGps);

  const retroactive = structuredClone(plan);
  retroactive.purpose_and_claim_boundary.retroactive_promotion_allowed = true;
  cases.push(retroactive);

  const reorderedSites = structuredClone(plan);
  [reorderedSites.population.site_ids[0], reorderedSites.population.site_ids[1]] = [
    reorderedSites.population.site_ids[1],
    reorderedSites.population.site_ids[0],
  ];
  cases.push(reorderedSites);

  for (const candidate of cases) {
    assert.equal(validate(candidate), false);
  }
});

test("semantic verification rejects a catalog digest or source privacy drift", () => {
  const changedCatalog = Buffer.from(`${siteCatalogBytes.toString("utf8")}\n`, "utf8");
  assert.throws(
    () => verifyExploratoryCollectionSemantics({
      plan,
      siteCatalogBytes: changedCatalog,
      observationSchema,
      sourceManifest,
    }),
    /exact site catalog bytes/u,
  );

  const permissiveSource = structuredClone(sourceManifest);
  permissiveSource.privacy.precise_coordinates_permitted = true;
  assert.throws(
    () => verifyExploratoryCollectionSemantics({
      plan,
      siteCatalogBytes,
      observationSchema,
      sourceManifest: permissiveSource,
    }),
  );
});

async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}
