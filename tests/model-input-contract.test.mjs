import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";


const [schema, contract] = await Promise.all([
  readJson("contracts/model-input-contract.schema.json"),
  readJson("model/selection/california-halibut-input-v1.json"),
]);
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);


test("the model input contract is schema-valid, pre-label, and non-authorizing", () => {
  assert.equal(validate(contract), true, JSON.stringify(validate.errors));
  assert.equal(contract.status, "frozen-local-template-no-label-authority");
  assert.equal(contract.candidate_parity.required_candidate_ids.length, 7);
  assert.equal(contract.candidate_parity.candidate_exclusive_upstream_source_allowed, false);
  assert.equal(contract.prediction_time_boundary.post_start_values_allowed, false);
  assert.equal(contract.safety_gate_boundary.candidate_inputs.length, 0);
  assert.equal(
    contract.safety_gate_boundary.pollution_or_advisory_status_may_increase_opportunity,
    false,
  );
  assert.equal(contract.prohibited_inputs.includes("target-outcome"), true);
  assert.match(contract.source_binding.feature_order_sha256, /^[a-f0-9]{64}$/u);
  for (const value of Object.values(contract.authority)) {
    assert.equal(value, false);
  }
});


test("the model input schema rejects leakage, safety inversion, and authority expansion", () => {
  const cases = [];

  const lookahead = structuredClone(contract);
  lookahead.prediction_time_boundary.post_start_values_allowed = true;
  cases.push(lookahead);

  const pollution = structuredClone(contract);
  pollution.safety_gate_boundary.pollution_or_advisory_status_may_increase_opportunity = true;
  cases.push(pollution);

  const authority = structuredClone(contract);
  authority.authority.target_specific_training_authorized = true;
  cases.push(authority);

  const extra = structuredClone(contract);
  extra.context_features.outcome = ["target-encounter"];
  cases.push(extra);

  const renamedFeature = structuredClone(contract);
  renamedFeature.context_features.numeric[0] = "replacement_feature";
  cases.push(renamedFeature);

  const reorderedCandidates = structuredClone(contract);
  [
    reorderedCandidates.candidate_parity.required_candidate_ids[0],
    reorderedCandidates.candidate_parity.required_candidate_ids[1],
  ] = [
    reorderedCandidates.candidate_parity.required_candidate_ids[1],
    reorderedCandidates.candidate_parity.required_candidate_ids[0],
  ];
  cases.push(reorderedCandidates);

  const reorderedTerrain = structuredClone(contract);
  [
    reorderedTerrain.terrain_view.source_channels[0],
    reorderedTerrain.terrain_view.source_channels[1],
  ] = [
    reorderedTerrain.terrain_view.source_channels[1],
    reorderedTerrain.terrain_view.source_channels[0],
  ];
  cases.push(reorderedTerrain);

  for (const candidate of cases) {
    assert.equal(validate(candidate), false);
  }
});


async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}
