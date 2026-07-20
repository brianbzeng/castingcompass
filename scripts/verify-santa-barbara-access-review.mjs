import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGION_NAMES = new Set(["Gaviota Coast", "Goleta", "Santa Barbara", "Carpinteria"]);
const TOP_LEVEL_KEYS = [
  "acceptance",
  "allowedPrivateResponseFields",
  "geography",
  "prohibitedFields",
  "purpose",
  "questions",
  "responseStates",
  "reviewedOn",
  "schemaVersion",
  "sites",
  "status",
  "storage",
];
const SITE_KEYS = [
  "accessSourceUrl",
  "catalogAccessStatus",
  "catalogAccessStatusUpdatedAt",
  "minimumLocalReviews",
  "name",
  "region",
  "regulationUrl",
  "reviewState",
  "siteId",
];
const RESPONSE_STATES = ["matches_catalog", "correction_needed", "not_observed", "uncertain"];
const QUESTION_IDS = [
  "public_entry_route",
  "access_status",
  "parking_walk",
  "posted_restrictions",
  "boundary_clarity",
];
const OFFICIAL_ACCESS_HOSTS = new Set([
  "www.parks.ca.gov",
  "www.cityofgoleta.org",
  "www.countyofsb.org",
  "sbparksandrec.santabarbaraca.gov",
  "santabarbaraca.gov",
  "wildlife.ca.gov",
]);

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function requireExactKeys(value, expected, label) {
  requireCondition(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  requireCondition(
    JSON.stringify(sortedKeys(value)) === JSON.stringify([...expected].sort()),
    `${label} keys do not match the locked contract.`,
  );
}

function requireUniqueStrings(values, label) {
  requireCondition(Array.isArray(values) && values.every((value) => typeof value === "string" && value.length > 0), `${label} must contain nonempty strings.`);
  requireCondition(new Set(values).size === values.length, `${label} must not contain duplicates.`);
}

function officialUrl(value, allowedHosts, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  requireCondition(parsed.protocol === "https:", `${label} must use HTTPS.`);
  requireCondition(allowedHosts.has(parsed.hostname), `${label} must use a declared official host.`);
}

export function validateSantaBarbaraAccessReview({ policy, catalog, guide }) {
  requireExactKeys(policy, TOP_LEVEL_KEYS, "Review policy");
  requireCondition(policy.schemaVersion === "castingcompass.santa-barbara-access-review/1.0.0", "Review policy schema version is not locked.");
  requireCondition(policy.status === "template_only_not_executed", "Committed review policy must remain unexecuted.");
  requireCondition(/^\d{4}-\d{2}-\d{2}$/u.test(policy.reviewedOn), "Policy review date must be YYYY-MM-DD.");
  requireCondition(policy.geography.label === "Santa Barbara South Coast", "Review geography label changed.");
  requireCondition(policy.geography.scope === "Gaviota through Rincon", "Review geography scope changed.");
  requireCondition(policy.geography.expectedSiteCount === 13, "Review geography must contain 13 sites.");

  requireExactKeys(policy.storage, [
    "privateEvidenceDigestRequiredForAggregateReceipt",
    "rawResponseRetentionDaysAfterDecision",
    "repositoryState",
    "responseLocation",
  ], "Review storage policy");
  requireCondition(policy.storage.responseLocation === "private_outside_repository", "Responses must remain private and outside the repository.");
  requireCondition(policy.storage.repositoryState === "blank_policy_and_aggregate_receipt_only", "Repository response boundary changed.");
  requireCondition(policy.storage.rawResponseRetentionDaysAfterDecision === 30, "Raw response retention must remain 30 days after a decision.");
  requireCondition(policy.storage.privateEvidenceDigestRequiredForAggregateReceipt === true, "Aggregate receipts must bind private evidence by digest.");

  const expectedAllowedFields = [
    "site_id",
    "response_id",
    "observed_month",
    "question_answers",
    "correction_category",
    "generalized_correction",
  ];
  const expectedProhibitedFields = [
    "reviewer_name",
    "contact_information",
    "account_or_user_id",
    "exact_visit_timestamp",
    "precise_coordinates",
    "catch_or_trip_outcomes",
    "trip_notes",
    "photos_or_video",
    "credentials_or_tokens",
    "private_access_directions",
  ];
  requireUniqueStrings(policy.allowedPrivateResponseFields, "Allowed response fields");
  requireUniqueStrings(policy.prohibitedFields, "Prohibited response fields");
  requireCondition(JSON.stringify(policy.allowedPrivateResponseFields) === JSON.stringify(expectedAllowedFields), "Allowed private response fields changed.");
  requireCondition(JSON.stringify(policy.prohibitedFields) === JSON.stringify(expectedProhibitedFields), "Prohibited response fields changed.");
  requireCondition(JSON.stringify(policy.responseStates) === JSON.stringify(RESPONSE_STATES), "Review response states changed.");

  requireCondition(Array.isArray(policy.questions) && policy.questions.length === QUESTION_IDS.length, "Review policy must contain five questions.");
  requireCondition(JSON.stringify(policy.questions.map(({ id }) => id)) === JSON.stringify(QUESTION_IDS), "Review question IDs changed.");
  for (const question of policy.questions) {
    requireExactKeys(question, ["id", "prompt"], `Question ${question.id}`);
    requireCondition(typeof question.prompt === "string" && question.prompt.endsWith("?"), `Question ${question.id} must be a question.`);
    requireCondition(!/(?:name|email|phone|account (?:id|identifier)|exact time|coordinate|photo|catch|trip note)/iu.test(question.prompt), `Question ${question.id} requests prohibited data.`);
  }

  requireExactKeys(policy.acceptance, [
    "deploymentAuthorizationGranted",
    "maximumUnresolvedCorrections",
    "minimumDistinctReviewersAcrossRegion",
    "minimumReviewsForLimitedSite",
    "minimumReviewsForOpenSite",
    "modelValidationEvidenceGranted",
    "officialSourceRecheckWithinDays",
    "safetyOrLegalityGuaranteeGranted",
  ], "Review acceptance policy");
  requireCondition(policy.acceptance.minimumDistinctReviewersAcrossRegion === 2, "Regional review requires two distinct reviewers.");
  requireCondition(policy.acceptance.minimumReviewsForOpenSite === 1, "Open sites require one local review.");
  requireCondition(policy.acceptance.minimumReviewsForLimitedSite === 2, "Limited sites require two local reviews.");
  requireCondition(policy.acceptance.officialSourceRecheckWithinDays === 7, "Official sources must be rechecked within seven days.");
  requireCondition(policy.acceptance.maximumUnresolvedCorrections === 0, "Unresolved corrections must fail closed.");
  requireCondition(policy.acceptance.deploymentAuthorizationGranted === false, "The review policy cannot authorize deployment.");
  requireCondition(policy.acceptance.modelValidationEvidenceGranted === false, "The review policy cannot create validation evidence.");
  requireCondition(policy.acceptance.safetyOrLegalityGuaranteeGranted === false, "The review policy cannot guarantee safety or legality.");

  const allSites = Array.isArray(catalog.sites) ? catalog.sites : catalog;
  requireCondition(Array.isArray(allSites), "Site catalog must contain a sites array.");
  const regionalSites = allSites.filter((site) => REGION_NAMES.has(site.region));
  requireCondition(regionalSites.length === policy.geography.expectedSiteCount, "Regional catalog count does not match the review policy.");
  requireCondition(Array.isArray(policy.sites) && policy.sites.length === regionalSites.length, "Review site count does not match the catalog.");
  requireUniqueStrings(policy.sites.map(({ siteId }) => siteId), "Review site IDs");
  requireCondition(
    JSON.stringify(policy.sites.map(({ siteId }) => siteId).sort()) === JSON.stringify(regionalSites.map(({ id }) => id).sort()),
    "Review policy site population does not exactly match the Santa Barbara catalog.",
  );

  const catalogById = new Map(regionalSites.map((site) => [site.id, site]));
  let limitedSiteCount = 0;
  for (const reviewSite of policy.sites) {
    requireExactKeys(reviewSite, SITE_KEYS, `Review site ${reviewSite.siteId}`);
    const catalogSite = catalogById.get(reviewSite.siteId);
    requireCondition(Boolean(catalogSite), `Unknown review site ${reviewSite.siteId}.`);
    requireCondition(reviewSite.name === catalogSite.name, `${reviewSite.siteId} name drifted from the catalog.`);
    requireCondition(reviewSite.region === catalogSite.region, `${reviewSite.siteId} region drifted from the catalog.`);
    requireCondition(reviewSite.catalogAccessStatus === catalogSite.accessStatus, `${reviewSite.siteId} access status drifted from the catalog.`);
    requireCondition(reviewSite.catalogAccessStatusUpdatedAt === catalogSite.accessStatusUpdatedAt, `${reviewSite.siteId} access review date drifted from the catalog.`);
    requireCondition(reviewSite.accessSourceUrl === catalogSite.accessSourceUrl, `${reviewSite.siteId} access source drifted from the catalog.`);
    requireCondition(reviewSite.regulationUrl === catalogSite.regulationUrl, `${reviewSite.siteId} regulation source drifted from the catalog.`);
    officialUrl(reviewSite.accessSourceUrl, OFFICIAL_ACCESS_HOSTS, `${reviewSite.siteId} access source`);
    officialUrl(reviewSite.regulationUrl, new Set(["wildlife.ca.gov"]), `${reviewSite.siteId} regulation source`);
    requireCondition(["open", "limited"].includes(reviewSite.catalogAccessStatus), `${reviewSite.siteId} has an unsupported catalog status.`);
    const expectedReviews = reviewSite.catalogAccessStatus === "limited" ? 2 : 1;
    requireCondition(reviewSite.minimumLocalReviews === expectedReviews, `${reviewSite.siteId} has the wrong local-review threshold.`);
    requireCondition(reviewSite.reviewState === "pending", `${reviewSite.siteId} cannot be pre-accepted in the committed policy.`);
    if (reviewSite.catalogAccessStatus === "limited") limitedSiteCount += 1;
    requireCondition(guide.includes(`\`${reviewSite.siteId}\``), `${reviewSite.siteId} is missing from the reviewer guide.`);
    requireCondition(guide.includes(`**${reviewSite.name}**`), `${reviewSite.name} is missing from the reviewer guide.`);
  }
  requireCondition(limitedSiteCount === 4, "Expected exactly four limited-access sites requiring two reviews.");

  for (const questionId of QUESTION_IDS) {
    requireCondition(guide.includes(`${questionId}: matches_catalog | correction_needed | not_observed | uncertain`), `Reviewer guide response block is missing ${questionId}.`);
  }
  requireCondition(/no review has been conducted or accepted/iu.test(guide), "Reviewer guide must state that execution is still open.");
  requireCondition(/does not authorize a deployment/iu.test(guide), "Reviewer guide must preserve the deployment gate.");
  requireCondition(/outside Git and\s+outside Codex/iu.test(guide), "Reviewer guide must keep raw responses outside Git and Codex.");

  return {
    schemaVersion: policy.schemaVersion,
    status: policy.status,
    siteCount: policy.sites.length,
    limitedSiteCount,
    questionCount: policy.questions.length,
    deploymentAuthorizationGranted: policy.acceptance.deploymentAuthorizationGranted,
    modelValidationEvidenceGranted: policy.acceptance.modelValidationEvidenceGranted,
  };
}

export async function verifySantaBarbaraAccessReview(root = DEFAULT_ROOT) {
  const [policySource, catalogSource, guide] = await Promise.all([
    readFile(resolve(root, "field-review/santa-barbara-access-review-policy.json"), "utf8"),
    readFile(resolve(root, "public/data/sites.json"), "utf8"),
    readFile(resolve(root, "docs/SANTA-BARBARA-LOCAL-ACCESS-REVIEW.md"), "utf8"),
  ]);
  return validateSantaBarbaraAccessReview({
    policy: JSON.parse(policySource),
    catalog: JSON.parse(catalogSource),
    guide,
  });
}

async function main() {
  const result = await verifySantaBarbaraAccessReview();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
