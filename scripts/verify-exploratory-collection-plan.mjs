#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const root = new URL("../", import.meta.url);
const schemaUrl = new URL("contracts/exploratory-collection-plan.schema.json", root);
const planUrl = new URL("model/collection/santa-barbara-goleta-exploratory-v1.json", root);
const siteCatalogUrl = new URL("data/sites.json", root);
const observationSchemaUrl = new URL("contracts/observation.schema.json", root);
const sourceManifestUrl = new URL("pipeline/sources/castingcompass_trip_log.json", root);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertNoPlaceholders(value, location = "$") {
  if (typeof value === "string") {
    assert.doesNotMatch(
      value,
      /\b(?:tbd|todo|fixme|placeholder|replace[_ -]?me|replace with)\b/iu,
      `${location} contains a placeholder`,
    );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPlaceholders(entry, `${location}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertNoPlaceholders(entry, `${location}.${key}`);
    }
  }
}

export function verifyExploratoryCollectionSemantics({
  plan,
  siteCatalogBytes,
  observationSchema,
  sourceManifest,
}) {
  assertNoPlaceholders(plan);
  assert.equal(plan.status, "frozen-local-not-activated");
  assert.equal(
    plan.population.site_catalog_sha256,
    sha256(siteCatalogBytes),
    "the collection plan must bind the exact site catalog bytes",
  );

  const sites = JSON.parse(siteCatalogBytes.toString("utf8"));
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  assert.equal(
    new Set(plan.population.site_ids).size,
    plan.population.site_ids.length,
    "site IDs must be unique",
  );
  for (const siteId of plan.population.site_ids) {
    const site = sitesById.get(siteId);
    assert.ok(site, `unknown curated site ${siteId}`);
    assert.ok(plan.population.regions.includes(site.region), `${siteId} is outside the frozen regions`);
    assert.ok(
      ["open", "limited"].includes(site.accessStatus),
      `${siteId} is not eligible for an invited collection workflow`,
    );
  }

  assert.equal(
    observationSchema.$id,
    plan.attempt_contract.observation_contract_version,
    "the plan must name the committed observation contract",
  );
  assert.deepEqual(
    observationSchema.properties.outcome_class.enum,
    plan.attempt_contract.outcome_classes,
    "the plan outcome classes must exactly match observation v2",
  );
  assert.equal(sourceManifest.source_id, plan.attempt_contract.source_id);
  assert.equal(sourceManifest.privacy.precise_coordinates_permitted, false);
  assert.equal(sourceManifest.privacy.free_text_permitted, false);
  assert.equal(sourceManifest.privacy.photos_permitted, false);
  assert.equal(sourceManifest.privacy.direct_identifiers_permitted, false);
  assert.equal(sourceManifest.privacy.deletion_lineage_required, true);
  assert.equal(sourceManifest.permissions.training, "protocol_and_consent_gated");
  assert.equal(sourceManifest.permissions.validation, "protocol_and_consent_gated");

  assert.equal(plan.activation.activation_record_present, false);
  assert.equal(plan.purpose_and_claim_boundary.retroactive_promotion_allowed, false);
  assert.equal(plan.purpose_and_claim_boundary.model_training_allowed, false);
  assert.equal(plan.purpose_and_claim_boundary.model_selection_allowed, false);
  assert.equal(plan.attempt_contract.all_started_attempts_reconciled, true);
  assert.equal(plan.attempt_contract.explicit_non_encounter_required, true);
  assert.equal(plan.attempt_contract.cancellation_encoded_as_non_encounter, false);
  assert.equal(plan.privacy.exact_private_gps_collected, false);
  assert.equal(plan.confirmatory_handoff.exploratory_rows_in_locked_test_allowed, false);
  for (const [name, value] of Object.entries(plan.authority)) {
    assert.equal(value, false, `${name} must remain false in the local plan`);
  }

  const serialized = JSON.stringify(plan);
  for (const prohibitedKey of ["latitude", "longitude", "email", "account_id", "reporter_key"]) {
    assert.equal(
      serialized.includes(`"${prohibitedKey}"`),
      false,
      `the collection plan must not embed ${prohibitedKey}`,
    );
  }
}

export async function verifyExploratoryCollectionPlan() {
  const [schema, plan, siteCatalogBytes, observationSchema, sourceManifest] = await Promise.all([
    readFile(schemaUrl, "utf8").then(JSON.parse),
    readFile(planUrl, "utf8").then(JSON.parse),
    readFile(siteCatalogUrl),
    readFile(observationSchemaUrl, "utf8").then(JSON.parse),
    readFile(sourceManifestUrl, "utf8").then(JSON.parse),
  ]);
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(plan), true, JSON.stringify(validate.errors, null, 2));
  verifyExploratoryCollectionSemantics({
    plan,
    siteCatalogBytes,
    observationSchema,
    sourceManifest,
  });
  return sha256(Buffer.from(JSON.stringify(plan), "utf8"));
}

async function main() {
  const digest = await verifyExploratoryCollectionPlan();
  process.stdout.write(
    `Exploratory collection plan verified: ${digest} (not activated; no collection or model authority)\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Exploratory collection plan verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
