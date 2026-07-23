import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createSanFranciscoStructureDepthReviewTemplate,
  evaluateSanFranciscoStructureDepthReview,
  validateSanFranciscoStructureDepthReview,
  validateSantaBarbaraStructureDepthReview,
  writeSanFranciscoStructureDepthReviewTemplate,
} from "../scripts/verify-santa-barbara-structure-depth-review.mjs";

const root = new URL("../", import.meta.url);
const REVIEWED_COMMIT = "b".repeat(40);
const EVALUATED_AT = new Date("2026-07-22T20:00:00.000Z");
const LOCAL_REVIEWER_A = "41111111-1111-4111-8111-111111111111";
const LOCAL_REVIEWER_B = "42222222-2222-4222-8222-222222222222";
const CHART_REVIEWER = "43333333-3333-4333-8333-333333333333";

async function loadSources() {
  const [
    policySource,
    catalogSource,
    artifactSource,
    sourcePolicySource,
    sourceSnapshotSource,
    collectorSource,
    guide,
  ] = await Promise.all([
    readFile(new URL("field-review/san-francisco-structure-depth-review-policy.json", root)),
    readFile(new URL("data/sites.json", root)),
    readFile(new URL("public/data/structure-depth.json", root)),
    readFile(new URL("structure-depth/policy.json", root)),
    readFile(new URL("structure-depth/noaa-enc-approach-snapshot.json", root)),
    readFile(new URL("scripts/refresh_structure_depth.py", root)),
    readFile(new URL("docs/SAN-FRANCISCO-STRUCTURE-DEPTH-REVIEW.md", root), "utf8"),
  ]);
  return {
    policy: JSON.parse(policySource.toString("utf8")),
    catalog: JSON.parse(catalogSource.toString("utf8")),
    artifact: JSON.parse(artifactSource.toString("utf8")),
    sourcePolicy: JSON.parse(sourcePolicySource.toString("utf8")),
    guide,
    policySource,
    catalogSource,
    artifactSource,
    sourcePolicySource,
    sourceSnapshotSource,
    collectorSource,
  };
}

function responseId(role, index) {
  const head = role === "local" ? "40000000" : "50000000";
  return `${head}-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function localResponse(siteId, index) {
  return {
    site_id: siteId,
    response_id: responseId("local", index),
    reviewer_key: index % 2 === 0 ? LOCAL_REVIEWER_A : LOCAL_REVIEWER_B,
    observed_month: "2026-07",
    question_answers: {
      sector_direction: "matches_context",
      depth_band_usefulness: "matches_context",
      charted_feature_usefulness: "matches_context",
      catalog_clue_fit: "matches_context",
      display_limitations: "matches_context",
    },
    correction_category: null,
    generalized_correction: null,
  };
}

function chartResponse(siteId, index) {
  return {
    site_id: siteId,
    response_id: responseId("chart", index),
    reviewer_key: CHART_REVIEWER,
    reviewed_at: "2026-07-22T19:00:00.000Z",
    role_attestation: "independent_nautical_chart_or_marine_gis_reviewer",
    conflict_free_attestation: true,
    question_answers: {
      source_product_fit: "accepted",
      sector_reproducibility: "accepted",
      units_and_datum: "accepted",
      source_dates: "accepted",
      uncertainty_disclosure: "accepted",
      feature_class_claim: "accepted",
    },
    correction_category: null,
    generalized_correction: null,
  };
}

function completeEvidence(sources) {
  const evidence = createSanFranciscoStructureDepthReviewTemplate({
    ...sources,
    reviewedCommit: REVIEWED_COMMIT,
  });
  evidence.local_responses = sources.policy.sites.map(({ siteId }, index) => localResponse(siteId, index));
  evidence.chart_responses = sources.policy.sites.map(({ siteId }, index) => chartResponse(siteId, index));
  evidence.source_identity_recheck = {
    reviewer_key: CHART_REVIEWER,
    checked_at: "2026-07-22T19:30:00.000Z",
    program_url_reachable: true,
    service_identity_matches: true,
    artifact_hashes_match: true,
    limitations_acknowledged: true,
  };
  return evidence;
}

function evaluate(sources, evidence, evaluatedAt = EVALUATED_AT) {
  return evaluateSanFranciscoStructureDepthReview({
    ...sources,
    evidence,
    evidenceSource: Buffer.from(`${JSON.stringify(evidence)}\n`),
    expectedCommit: REVIEWED_COMMIT,
    evaluatedAt,
  });
}

test("the blank San Francisco policy is exact, source-bound, and isolated from Santa Barbara", async () => {
  const sources = await loadSources();
  const result = validateSanFranciscoStructureDepthReview(sources);
  assert.deepEqual(result, {
    schemaVersion: "castingcompass.san-francisco-structure-depth-review/1.0.0",
    status: "template_only_not_executed",
    siteCount: 10,
    localQuestionCount: 5,
    chartQuestionCount: 6,
    scoreUseAuthorized: false,
    navigationUseAuthorized: false,
    deploymentAuthorizationGranted: false,
  });
  assert.throws(
    () => validateSantaBarbaraStructureDepthReview(sources),
    /Expected the santa-barbara structure\/depth review profile/u,
  );
  assert.deepEqual(
    sources.policy.sites.map(({ siteId }) => siteId).sort(),
    [
      "baker-beach",
      "china-beach",
      "crane-cove-park",
      "crissy-field-east-beach",
      "herons-head-park-pier",
      "ocean-beach-north",
      "ocean-beach-south",
      "pier-14",
      "pier-7",
      "torpedo-wharf",
    ],
  );
});

test("complete disjoint San Francisco review emits only an aggregate non-authorizing receipt", async () => {
  const sources = await loadSources();
  const receipt = evaluate(sources, completeEvidence(sources));
  assert.equal(receipt.schema_version, "castingcompass.san-francisco-structure-depth-review-receipt/1.0.0");
  assert.equal(receipt.structure_depth_review_accepted, true);
  assert.equal(receipt.passing_site_count, 10);
  assert.equal(receipt.qualifying_local_response_count, 10);
  assert.equal(receipt.qualifying_chart_response_count, 10);
  assert.equal(receipt.distinct_local_reviewer_count, 2);
  assert.equal(receipt.distinct_chart_reviewer_count, 1);
  assert.deepEqual(receipt.blockers, []);
  assert.equal(receipt.provider_query_performed, false);
  assert.equal(receipt.production_change_authorized, false);
  assert.equal(receipt.score_use_authorized, false);
  assert.equal(receipt.navigation_use_authorized, false);
  assert.equal(JSON.stringify(receipt).includes(LOCAL_REVIEWER_A), false);
  assert.equal(JSON.stringify(receipt).includes(CHART_REVIEWER), false);
});

test("missing, overlapping, stale, and correction-bearing San Francisco evidence fails closed", async () => {
  const sources = await loadSources();
  const blankReceipt = evaluate(
    sources,
    createSanFranciscoStructureDepthReviewTemplate({ ...sources, reviewedCommit: REVIEWED_COMMIT }),
  );
  assert.deepEqual(blankReceipt.blockers, [
    "distinct-local-reviewers-insufficient",
    "distinct-chart-reviewers-insufficient",
    "local-responses-incomplete",
    "chart-responses-incomplete",
    "source-recheck-incomplete",
  ]);

  const overlap = completeEvidence(sources);
  overlap.chart_responses.forEach((response) => { response.reviewer_key = LOCAL_REVIEWER_A; });
  overlap.source_identity_recheck.reviewer_key = LOCAL_REVIEWER_A;
  assert.equal(evaluate(sources, overlap).blockers.includes("reviewer-role-overlap"), true);

  const stale = completeEvidence(sources);
  stale.local_responses[0].observed_month = "2025-12";
  stale.chart_responses[0].reviewed_at = "2026-05-01T00:00:00.000Z";
  stale.source_identity_recheck.checked_at = "2026-07-01T00:00:00.000Z";
  const staleReceipt = evaluate(sources, stale);
  assert.equal(staleReceipt.blockers.includes("local-response-stale"), true);
  assert.equal(staleReceipt.blockers.includes("chart-review-stale"), true);
  assert.equal(staleReceipt.blockers.includes("source-recheck-stale"), true);

  const correction = completeEvidence(sources);
  correction.local_responses[0].question_answers.sector_direction = "correction_needed";
  correction.local_responses[0].correction_category = "sector";
  correction.local_responses[0].generalized_correction = "The generalized sector should be reviewed against the public shoreline orientation.";
  assert.equal(evaluate(sources, correction).blockers.includes("unresolved-corrections"), true);
});

test("digest drift, extra identity, unsafe text, and duplicate response IDs are rejected", async () => {
  const sources = await loadSources();

  const drifted = completeEvidence(sources);
  drifted.review_policy_sha256 = "0".repeat(64);
  assert.throws(() => evaluate(sources, drifted), /review-policy digest drifted/u);

  const expanded = completeEvidence(sources);
  expanded.local_responses[0].reviewer_name = "Private Person";
  assert.throws(() => evaluate(sources, expanded), /keys do not match/u);

  const unsafe = completeEvidence(sources);
  unsafe.chart_responses[0].question_answers.source_product_fit = "changes_required";
  unsafe.chart_responses[0].correction_category = "source";
  unsafe.chart_responses[0].generalized_correction = "Email angler@example.com or inspect 37.80000, -122.47000";
  assert.throws(() => evaluate(sources, unsafe), /unsafe or exceeds/u);

  const duplicate = completeEvidence(sources);
  duplicate.chart_responses[0].response_id = duplicate.local_responses[0].response_id;
  assert.throws(() => evaluate(sources, duplicate), /unique across roles/u);
});

test("San Francisco artifact authority and catalog clues cannot drift", async () => {
  const sources = await loadSources();

  const artifactDrift = structuredClone(sources.artifact);
  artifactDrift.sites["baker-beach"].scoreDelta = 1;
  assert.throws(
    () => validateSanFranciscoStructureDepthReview({ ...sources, artifact: artifactDrift }),
    /authority boundary/u,
  );

  const clueDrift = structuredClone(sources.artifact);
  clueDrift.sites["baker-beach"].structure.catalogClues[0].reviewStatus = "validated";
  assert.throws(
    () => validateSanFranciscoStructureDepthReview({ ...sources, artifact: clueDrift }),
    /pre-validated/u,
  );
});

test("the San Francisco guarded writer creates one owner-only file and refuses overwrite", async () => {
  const sources = await loadSources();
  const directory = await mkdtemp(join(tmpdir(), "castingcompass-sf-structure-review-"));
  await chmod(directory, 0o700);
  const outputFile = join(directory, "review.json");
  try {
    const receipt = await writeSanFranciscoStructureDepthReviewTemplate({
      root: new URL("../", import.meta.url).pathname.replace(/\/$/u, ""),
      sources,
      reviewedCommit: REVIEWED_COMMIT,
      outputFile,
    });
    assert.equal(receipt.schema_version, "castingcompass.san-francisco-structure-depth-review-template-write-receipt/1.0.0");
    assert.equal(receipt.site_count, 10);
    assert.equal(receipt.owner_only_file_written, true);
    assert.equal(receipt.structure_depth_review_accepted, false);
    const metadata = await stat(outputFile);
    assert.equal(metadata.mode & 0o777, 0o600);
    await assert.rejects(
      writeSanFranciscoStructureDepthReviewTemplate({
        root: new URL("../", import.meta.url).pathname.replace(/\/$/u, ""),
        sources,
        reviewedCommit: REVIEWED_COMMIT,
        outputFile,
      }),
      /must not already exist/u,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the San Francisco CLI has no provider client or process execution path", async () => {
  const source = await readFile(new URL("scripts/verify-san-francisco-structure-depth-review.mjs", root), "utf8");
  assert.doesNotMatch(source, /node:child_process|\bexecFile\b|\bspawn\b|\bfetch\s*\(/u);
});
