import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";


const [schema, plan] = await Promise.all([
  readJson("contracts/model-selection-plan.schema.json"),
  readJson("model/selection/california-halibut-v1.json"),
]);
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);


test("the model-selection plan is schema-valid and grants no execution authority", () => {
  assert.equal(validate(plan), true, JSON.stringify(validate.errors));
  assert.equal(plan.status, "frozen-local-template-not-preregistered");
  assert.equal(plan.candidate_families.length, 8);
  assert.deepEqual(
    plan.candidate_families.map((candidate) => candidate.complexity_rank),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(plan.selection_rule.deep_learning_is_default, false);
  assert.equal(plan.selection_rule.prefer_simpler_when_statistically_indistinguishable, true);
  assert.equal(plan.common_evaluation.candidate_input_contract_frozen, true);
  assert.deepEqual(
    plan.locally_satisfied_data_gates,
    ["candidate-feature-and-input-contract-frozen-before-label-access"],
  );
  assert.match(plan.candidate_input_contract.sha256, /^[a-f0-9]{64}$/u);
  for (const [field, value] of Object.entries(plan.authority)) {
    if (field !== "reason") {
      assert.equal(value, false, `${field} must remain false`);
    }
  }
});


test("the schema rejects authority expansion, candidate omission, and undeclared fields", () => {
  const cases = [];

  const authority = structuredClone(plan);
  authority.authority.benchmark_execution_authorized = true;
  cases.push(authority);

  const omitted = structuredClone(plan);
  omitted.candidate_families.pop();
  cases.push(omitted);

  const extra = structuredClone(plan);
  extra.locked_test_results = [];
  cases.push(extra);

  const inputContract = structuredClone(plan);
  inputContract.candidate_input_contract.sha256 = "0".repeat(64);
  cases.push(inputContract);

  for (const candidate of cases) {
    assert.equal(validate(candidate), false);
  }
});


async function readJson(path) {
  return JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));
}
