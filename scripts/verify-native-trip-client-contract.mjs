#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = join(ROOT, "security", "native-trip-client-policy.json");
const SCHEMA_PATH = join(ROOT, "contracts", "native-trip-client.schema.json");

const EXPECTED = {
  schema_version: "castingcompass.native-trip-client/1.0.0",
  status: "server-contract-implemented-client-not-built",
  api: {
    compatibility_version: "1",
    version_header: "X-CastingCompass-API-Version",
    base_url_source: "signed-build-configuration",
  },
  authorization: {
    mode: "native-bearer",
    required_scope: "trips:write",
    cookie_allowed: false,
    origin_allowed: false,
    access_token_storage: "ios-keychain-only",
    reporter_key_storage: "ios-keychain-only",
  },
  identity: {
    trip_id_format: "trip_<uuid-v4-lowercase>",
    request_token_format: "43-character-base64url-random",
    reporter_key_format: "43-character-base64url-random",
    reuse_rule: "same-operation-envelope-only",
  },
  collection: {
    target_taxon_id: "california-halibut",
    curated_site_id_only: true,
    modes: ["shore", "beach", "pier", "jetty"],
    cancellation_reasons: ["weather", "water_safety", "access", "health", "personal", "other"],
    angler_count_minimum: 1,
    angler_count_maximum: 12,
    keeper_count_maximum: 25,
    short_released_count_maximum: 25,
    combined_halibut_count_maximum: 40,
    other_catch_count_maximum: 100,
    live_start_clock_skew_seconds: 90,
    live_duration_maximum_hours: 36,
  },
  operations: [
    {
      id: "start",
      method: "POST",
      path_template: "/api/trips/start",
      content_type: "application/json",
      required_scope: "trips:write",
      required_fields: [
        "clientTripId",
        "requestToken",
        "reporterKey",
        "siteId",
        "startedAt",
        "anglerCount",
        "mode",
        "scoreInfluencedChoice",
        "primaryTargetConfirmed",
        "consent",
      ],
      optional_fields: ["method", "opportunityWindowId", "referralCode"],
      receipt: {
        operation: "start",
        required_fields: ["receipt.operation", "receipt.tripId"],
        success_status: 201,
        exact_top_level_fields: ["receipt"],
      },
      idempotency: "server-keyed-by-trip-id-token-and-principal-client-reuses-exact-envelope",
    },
    {
      id: "complete",
      method: "POST",
      path_template: "/api/trips/{tripId}/complete",
      content_type: "multipart/form-data",
      required_scope: "trips:write",
      required_fields: [
        "token",
        "reporterKey",
        "anglerCount",
        "mode",
        "scoreInfluencedChoice",
        "keeperCount",
        "shortReleasedCount",
        "otherCatchCount",
        "consent",
        "primaryTargetConfirmed",
        "completeAttempt",
      ],
      optional_fields: ["otherSpecies", "method"],
      receipt: {
        operation: "complete",
        required_fields: ["receipt.operation", "receipt.tripId"],
        success_status: 200,
        exact_top_level_fields: ["receipt"],
      },
      idempotency: "server-keyed-by-trip-id-token-and-principal-client-reuses-exact-envelope",
    },
    {
      id: "cancel",
      method: "POST",
      path_template: "/api/trips/{tripId}/cancel",
      content_type: "application/json",
      required_scope: "trips:write",
      required_fields: ["token", "reason"],
      optional_fields: [],
      receipt: {
        operation: "cancel",
        required_fields: ["receipt.operation", "receipt.tripId"],
        success_status: 200,
        exact_top_level_fields: ["receipt"],
      },
      idempotency: "server-keyed-by-trip-id-token-and-principal-client-reuses-exact-envelope",
    },
  ],
  recovery: {
    durable_states: ["draft", "pending_submission", "confirmed", "needs_user_attention"],
    success_requires: "exact-server-receipt",
    transport_failure_action: "preserve-exact-envelope-and-do-not-claim-success",
    retry_rule: "explicit-same-envelope-idempotent-retry",
    conflict_action: "stop-and-require-user-attention",
    automatic_replay_allowed: false,
    refresh_ambiguity_action: "discard-family-and-sign-in-again",
  },
  offline: {
    live_start_requires_online_receipt: true,
    terminal_draft_may_be_preserved: true,
    terminal_write_may_claim_success_offline: false,
    offline_completion_time_semantics: "server-receipt-time-remains-authoritative",
    offline_completion_model_use:
      "exclude-from-duration-sensitive-or-confirmatory-analysis-until-separately-reviewed",
  },
  privacy: {
    exact_gps_collected: false,
    photo_required: false,
    notes_required: false,
    credentials_in_logs_allowed: false,
    free_text_in_logs_allowed: false,
    private_by_default: true,
  },
  authority: {
    testflight_release: false,
    staging_activation: false,
    production_deployment: false,
    pilot_activation: false,
    model_training: false,
    model_selection: false,
    score_change: false,
  },
};

const read = (path) => readFileSync(join(ROOT, path), "utf8");

export function validateNativeTripPolicy(candidate) {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  assert.equal(validate(candidate), true, JSON.stringify(validate.errors));
  assert.deepEqual(candidate, EXPECTED);
  return candidate;
}

function sourceArray(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`, "u"));
  assert.ok(match, `Missing ${name}.`);
  return [...match[1].matchAll(/"([^"]+)"/gu)].map((entry) => entry[1]);
}

function localArray(source, name) {
  const match = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\] as const;`, "u"));
  assert.ok(match, `Missing ${name}.`);
  return [...match[1].matchAll(/"([^"]+)"/gu)].map((entry) => entry[1]);
}

function routeEntry(source, routeId) {
  const marker = `"${routeId}",`;
  const idIndex = source.indexOf(marker);
  assert.notEqual(idIndex, -1, `Missing route policy ${routeId}.`);
  const start = source.lastIndexOf("route(", idIndex);
  const next = source.indexOf("\n  route(", idIndex + marker.length);
  assert.notEqual(start, -1, `Missing route() boundary for ${routeId}.`);
  return source.slice(start, next === -1 ? source.length : next);
}

export function verifyRuntimeBindings(policy = validateNativeTripPolicy(JSON.parse(read("security/native-trip-client-policy.json")))) {
  const shared = read("shared/native-trip-contract.ts");
  const trips = read("worker/trips.ts");
  const routes = read("worker/route-policy.ts");
  const species = read("shared/species-contract.ts");
  const mobilePolicy = JSON.parse(read("security/mobile-api-policy.json"));

  assert.match(shared, /NATIVE_TRIP_CLIENT_CONTRACT_VERSION =\s+"castingcompass\.native-trip-client\/1\.0\.0"/u);
  assert.match(shared, /NATIVE_TRIP_API_VERSION = "1"/u);
  assert.match(shared, /NATIVE_TRIP_API_VERSION_HEADER = "X-CastingCompass-API-Version"/u);
  assert.match(shared, /NATIVE_TRIP_REQUIRED_SCOPE = "trips:write"/u);
  assert.deepEqual(sourceArray(shared, "NATIVE_TRIP_SUPPORTED_MODES"), policy.collection.modes);
  assert.deepEqual(
    sourceArray(shared, "NATIVE_TRIP_CANCELLATION_REASONS"),
    policy.collection.cancellation_reasons,
  );
  assert.deepEqual(sourceArray(shared, "NATIVE_TRIP_START_FIELDS"), policy.operations[0].required_fields);
  assert.deepEqual(
    sourceArray(shared, "NATIVE_TRIP_COMPLETE_FIELDS"),
    [...policy.operations[1].required_fields.slice(0, 8), "otherSpecies", ...policy.operations[1].required_fields.slice(8)],
  );
  assert.deepEqual(sourceArray(shared, "NATIVE_TRIP_CANCEL_FIELDS"), policy.operations[2].required_fields);
  assert.deepEqual(sourceArray(shared, "NATIVE_TRIP_RECOVERY_STATES"), policy.recovery.durable_states);

  const tripDetailFields = localArray(trips, "TRIP_DETAIL_FIELDS");
  const liveStartFields = [...localArray(trips, "LIVE_START_FIELDS"), ...tripDetailFields];
  const liveCompletionFields = [...localArray(trips, "LIVE_COMPLETION_FIELDS"), ...tripDetailFields];
  for (const field of [...policy.operations[0].required_fields, ...policy.operations[0].optional_fields]) {
    assert.equal(liveStartFields.includes(field), true, `Start field ${field} is not accepted by the Worker.`);
  }
  for (const field of [...policy.operations[1].required_fields, ...policy.operations[1].optional_fields]) {
    assert.equal(liveCompletionFields.includes(field), true, `Completion field ${field} is not accepted by the Worker.`);
  }

  assert.match(trips, /options\.requestAuthority !== "native_access_token"\) assertSameOrigin\(request\)/u);
  assert.match(
    trips,
    /if \(options\.requestAuthority === "native_access_token"\) \{\s+return jsonResponse\(\{ receipt \}, status\);\s+\}/u,
  );
  assert.equal(
    trips.includes("const CLIENT_REQUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;"),
    true,
  );
  assert.equal(trips.includes("!/^[A-Za-z0-9_-]{20,200}$/.test(suppliedKey)"), true);
  assert.match(trips, /serverBoundLiveStart[\s\S]*MAX_LIVE_START_CLOCK_SKEW_MS/u);
  assert.match(trips, /assertCompleteAttempt\(form\.get\("completeAttempt"\)\)/u);
  assert.match(trips, /assertPrimaryTargetConfirmed\(form\.get\("primaryTargetConfirmed"\)\)/u);
  assert.match(trips, /existing\.token_hash === null[\s\S]*existing\.idempotency_key_hash === tokenHash/u);
  assert.match(trips, /const completionTimestamp = now\.toISOString\(\);\s+const endedAt = completionTimestamp/u);
  assert.match(species, /CALIFORNIA_HALIBUT_TAXON_ID = "california-halibut"/u);
  assert.equal(
    trips.includes('const VALIDATION_ELIGIBLE_MODES = new Set(["shore", "beach", "pier", "jetty"]);'),
    true,
  );
  assert.equal(
    trips.includes('["weather", "water_safety", "access", "health", "personal", "other"].includes(reason)'),
    true,
  );
  assert.equal(trips.includes("const MAX_LIVE_START_CLOCK_SKEW_MS = 90 * 1_000;"), true);
  assert.match(trips, /parseInteger\(body\.anglerCount, "anglerCount", 1, 12, 1\)/u);
  assert.match(trips, /parseInteger\(form\.get\("keeperCount"\), "keeperCount", 0, 25, 0\)/u);
  assert.match(trips, /"shortReleasedCount",\s+0,\s+25,\s+0/u);
  assert.match(trips, /keeperCount \+ shortReleasedCount > 40/u);
  assert.match(trips, /"otherCatchCount", 0, 100/u);
  assert.match(trips, /validateDuration\(existing\.started_at, endedAt, 36\)/u);
  assert.match(trips, /const site = getSite\(siteMap, body\.siteId\)/u);

  const startBranch = trips.slice(
    trips.indexOf('if (url.pathname === "/api/trips/start")'),
    trips.indexOf("const cancellationMatch"),
  );
  const cancelBranch = trips.slice(
    trips.indexOf("const cancellationMatch"),
    trips.indexOf("const completionMatch"),
  );
  const completeBranch = trips.slice(
    trips.indexOf("const completionMatch"),
    trips.indexOf('if (url.pathname === "/api/trips/report")'),
  );
  for (const [branch, operation] of [
    [startBranch, policy.operations[0]],
    [completeBranch, policy.operations[1]],
    [cancelBranch, policy.operations[2]],
  ]) {
    assert.equal(
      branch.includes(`tripMutationSuccessResponse(`) && branch.includes(`"${operation.id}"`),
      true,
      `The ${operation.id} route is missing its native receipt-only response.`,
    );
  }

  for (const [routeId, operation] of [
    ["trips.start", policy.operations[0]],
    ["trips.complete", policy.operations[1]],
    ["trips.cancel", policy.operations[2]],
  ]) {
    const route = routeEntry(routes, routeId);
    assert.match(route, /nativeScopes: \["trips:write"\]/u);
    const escapedPathTemplate = operation.path_template.replace(
      /[.*+?^${}()|[\]\\]/gu,
      "\\$&",
    );
    assert.match(route, new RegExp(escapedPathTemplate, "u"));
  }

  assert.equal(mobilePolicy.productionReadiness, false);
  assert.equal(mobilePolicy.nativeTripClientPolicy, "security/native-trip-client-policy.json");
  assert.equal(mobilePolicy.sharedContracts.includes("contracts/native-trip-client.schema.json"), true);
  return policy;
}

export function verifyNativeTripClientContract() {
  return verifyRuntimeBindings();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyNativeTripClientContract();
  process.stdout.write("Native trip client contract verified.\n");
}
