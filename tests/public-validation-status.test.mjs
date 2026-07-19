import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

function keys(value) {
  return Object.keys(value).sort();
}

test("public validation status is exact, all-zero, and fail closed", async () => {
  const status = JSON.parse(await read("validation/public-status.json"));
  assert.deepEqual(keys(status), [
    "asOfDate",
    "claimBoundary",
    "completedPerformanceAnalyses",
    "eligibleValidationEvidence",
    "evidenceRules",
    "knownNegativeResults",
    "prospectiveStudyActivated",
    "schemaVersion",
    "scoringSystemKind",
  ]);
  assert.equal(status.schemaVersion, 1);
  assert.equal(status.asOfDate, "2026-07-19");
  assert.equal(status.scoringSystemKind, "heuristic-configuration");
  assert.equal(status.claimBoundary, "ordinal_relative_ranking_only");
  assert.equal(status.prospectiveStudyActivated, false);

  assert.deepEqual(keys(status.eligibleValidationEvidence), [
    "prospectiveOrConfirmatoryAttempts",
    "targetEncounters",
    "targetNonEncounters",
  ]);
  assert.ok(Object.values(status.eligibleValidationEvidence).every((value) => value === 0));
  assert.deepEqual(keys(status.completedPerformanceAnalyses), [
    "preregisteredBaselineComparisons",
    "probabilityCalibrationRuns",
  ]);
  assert.ok(Object.values(status.completedPerformanceAnalyses).every((value) => value === 0));

  assert.equal(status.knownNegativeResults.length, 1);
  assert.deepEqual(status.knownNegativeResults[0], {
    id: "usgs-sf-2m-seafloor-probe-v1",
    scope: "terrain-representation-probe",
    metric: "macro_f1",
    candidateValue: 0.3914,
    result: "The pretrained probe was reliably worse than classical structure summaries.",
    promoted: false,
    appliesToLiveOpportunityScore: false,
  });
  assert.deepEqual(status.evidenceRules, [
    "Existing product trip reports are descriptive context, not eligible validation evidence.",
    "The collection-feasibility pilot cannot evaluate ranking performance or calibrate probability.",
    "Only a separately preregistered and prospectively activated confirmatory study can produce ranking-performance evidence.",
    "A terrain-representation result is not evidence of catch-ranking skill or live-score accuracy.",
  ]);
});

test("public copy and owner dashboard consume the frozen status without overclaiming", async () => {
  const [page, modelCard, goals] = await Promise.all([
    read("app/ai-disclosure/page.tsx"),
    read("docs/MODEL_CARD.md"),
    read("docs/GOAL_STATUS.md"),
  ]);
  assert.match(page, /validationStatus\.eligibleValidationEvidence\.prospectiveOrConfirmatoryAttempts/u);
  assert.match(page, /validationStatus\.completedPerformanceAnalyses\.preregisteredBaselineComparisons/u);
  assert.match(page, /validationStatus\.completedPerformanceAnalyses\.probabilityCalibrationRuns/u);
  assert.match(page, /not evidence about the live Opportunity Score/u);
  assert.doesNotMatch(page, /being evaluated against real trip reports/u);
  assert.match(modelCard, /0 eligible prospective\/confirmatory attempts/u);
  assert.match(modelCard, /0 preregistered baseline comparisons/u);
  assert.match(modelCard, /0 probability-calibration runs/u);
  assert.match(goals, /Public all-zero status locally complete/u);
});
