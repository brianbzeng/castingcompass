import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compile(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

function sourceById(policy, id) {
  const source = policy.candidateSources.find((candidate) => candidate.id === id);
  assert.ok(source, `missing source ${id}`);
  return source;
}

const expectedActivationGates = [
  "freeze a fishing-quality prediction target distinct from every human-health advisory meaning",
  "state a plausible analyte-to-species fishing mechanism before selecting any direction or weight",
  "review source terms licensing machine interfaces and long-term access before collection",
  "freeze exact spatial support temporal support freshness units methods qualifiers and missingness",
  "preserve source-specific quality metadata and reject incomparable or unreviewed project results",
  "pre-register a baseline and held-out validation protocol before inspecting candidate performance",
  "demonstrate incremental ranking value with uncertainty and no leakage on representative held-out trips",
  "test stale missing conflicting extreme and source-outage behavior with no automatic neutral assumption",
  "obtain fisheries or marine ecology methods review and public-health risk-communication review",
  "ship behind a separately versioned disabled-by-default component with rollback and drift monitoring",
  "keep official contact and consumption advice visible authoritative and outside score interpretation",
];

function verifySemantics(policy) {
  assert.equal(policy.status, "research-boundary-not-activated");
  assert.deepEqual(policy.claimBoundary, {
    runtimeCollectionActivated: false,
    scoreContributionActivated: false,
    positiveContributionAllowed: false,
    negativeContributionAllowed: false,
    numericScoreDelta: null,
    catchProbabilityClaimAllowed: false,
    waterContactSafetyClaimAllowed: false,
    seafoodSafetyClaimAllowed: false,
    agencyAdviceRemainsAuthoritative: true,
  });
  assert.deepEqual(
    policy.candidateSources.map((source) => source.id),
    [
      "california-beachwatch-actions",
      "california-beachwatch-monitoring-results",
      "oehha-fish-consumption-advisories",
      "swamp-safe-to-eat-bioaccumulation",
      "ceden-ambient-water-quality",
      "calenviroscreen-community-burden",
    ],
  );
  assert.deepEqual(
    Object.fromEntries(policy.candidateSources.map((source) => [source.id, source.decision])),
    {
      "california-beachwatch-actions": "existing-exclusion-only-runtime-guardrail",
      "california-beachwatch-monitoring-results": "research-only-not-admitted",
      "oehha-fish-consumption-advisories": "authoritative-safety-display-only",
      "swamp-safe-to-eat-bioaccumulation": "research-only-not-admitted",
      "ceden-ambient-water-quality": "research-only-not-admitted",
      "calenviroscreen-community-burden": "rejected-for-site-score",
    },
  );
  for (const source of policy.candidateSources) {
    assert.ok(source.authoritativeUrl.startsWith("https://"));
    assert.ok(source.prohibitedUses.includes("numeric fishing-score contribution"));
    assert.ok(source.prohibitedUses.some((use) => /catch-probability/i.test(use)));
  }
  assert.match(
    sourceById(policy, "california-beachwatch-monitoring-results").meaning,
    /recreational water-contact standards/i,
  );
  assert.match(
    sourceById(policy, "oehha-fish-consumption-advisories").meaning,
    /how often.*eat/i,
  );
  assert.match(
    sourceById(policy, "ceden-ambient-water-quality").qualityBoundary,
    /varying quality/i,
  );
  assert.match(
    sourceById(policy, "calenviroscreen-community-burden").spatialSupport,
    /not a coastal fishing-site measurement/i,
  );
  assert.deepEqual(policy.activationGates, expectedActivationGates);
  assert.deepEqual(policy.requiredIndependentReview, [
    "fisheries-or-marine-ecology-methods-review",
    "public-health-and-risk-communication-review",
  ]);
}

test("pollution source policy is strict, source-specific, and inactive", async () => {
  const [schema, policy] = await Promise.all([
    readJson("contracts/pollution-score-source-policy.schema.json"),
    readJson("water-quality/pollution-score-source-policy.json"),
  ]);
  const validate = compile(schema);
  assert.equal(validate(policy), true, JSON.stringify(validate.errors, null, 2));
  verifySemantics(policy);
});

test("pollution source policy binds the unchanged advisory runtime and catalog", async () => {
  const [policy, advisoryPolicy, overlay, collector, catalog] = await Promise.all([
    readJson("water-quality/pollution-score-source-policy.json"),
    readFile(new URL("water-quality/policy.json", root)),
    readFile(new URL("public/data/water-quality.json", root)),
    readFile(new URL("scripts/refresh_water_quality.py", root)),
    readFile(new URL("data/sites.json", root)),
  ]);
  assert.equal(policy.currentRuntimeBoundary.waterQualityPolicySha256, sha256(advisoryPolicy));
  assert.equal(policy.currentRuntimeBoundary.waterQualityOverlaySha256, sha256(overlay));
  assert.equal(policy.currentRuntimeBoundary.waterQualityCollectorSha256, sha256(collector));
  assert.equal(policy.currentRuntimeBoundary.siteCatalogSha256, sha256(catalog));
  assert.equal(
    policy.currentRuntimeBoundary.meaning,
    "existing action-only advisory guardrail remains separate and unchanged",
  );
});

test("schema and semantic checks reject premature scoring or source promotion", async () => {
  const [schema, policy] = await Promise.all([
    readJson("contracts/pollution-score-source-policy.schema.json"),
    readJson("water-quality/pollution-score-source-policy.json"),
  ]);
  const validate = compile(schema);

  const activated = structuredClone(policy);
  activated.claimBoundary.scoreContributionActivated = true;
  assert.equal(validate(activated), false);

  const weighted = structuredClone(policy);
  weighted.claimBoundary.numericScoreDelta = -1;
  assert.equal(validate(weighted), false);

  const promoted = structuredClone(policy);
  sourceById(promoted, "ceden-ambient-water-quality").decision =
    "existing-exclusion-only-runtime-guardrail";
  assert.throws(() => verifySemantics(promoted));

  const relabeled = structuredClone(policy);
  sourceById(relabeled, "calenviroscreen-community-burden").spatialSupport =
    "Exact marine fishing-site concentration measurement with current support.";
  assert.throws(() => verifySemantics(relabeled));
});
