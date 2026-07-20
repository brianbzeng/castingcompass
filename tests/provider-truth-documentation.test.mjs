import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const providerState = readFileSync("docs/CLOUDFLARE-PROVIDER-STATE.md", "utf8");
const threatModel = readFileSync("docs/THREAT_MODEL.md", "utf8");
const securityTesting = readFileSync("docs/SECURITY-TESTING.md", "utf8");
const mobileReadiness = readFileSync("docs/MOBILE-READINESS.md", "utf8");
const aiReviewQueue = readFileSync("docs/AI-REVIEW-QUEUE.md", "utf8");
const dashboard = readFileSync("docs/GOAL_STATUS.md", "utf8");

const staleCurrentClaims =
  /Cloudflare remains paused|current Cloudflare service is paused|Production and Cloudflare remain paused|Production\/public traffic remains paused|while Cloudflare stays paused/iu;

test("current operational documents preserve the accepted active-Worker truth", () => {
  assert.match(
    providerState,
    /one active version receiving all traffic[\s\S]+maintenance mode off[\s\S]+predates two[\s\S]+six checked-in rate-limit bindings/iu,
  );

  for (const [name, document] of [
    ["threat model", threatModel],
    ["security testing", securityTesting],
    ["mobile readiness", mobileReadiness],
    ["AI review queue", aiReviewQueue],
  ]) {
    assert.doesNotMatch(document, staleCurrentClaims, `${name} reintroduced stale paused-provider truth`);
  }

  assert.match(threatModel, /Worker and routes active[\s\S]+maintenance off/iu);
  assert.match(securityTesting, /2026-07-19 reconciliation found the Cloudflare production service active/iu);
  assert.match(mobileReadiness, /provider reconciliation found the Worker active with[\s\S]+source\/configuration drift/iu);
  assert.match(aiReviewQueue, /provider reconciliation found production[\s\S]+traffic active[\s\S]+queue feature remains default-off/iu);
});

test("active provider truth never becomes deployment or security-control evidence", () => {
  assert.match(providerState, /release blocker, not authorization to repair production/iu);
  assert.match(threatModel, /does not bind the deployed[\s\S]+prove any WAF, DDoS, alerting, or release gate/iu);
  assert.match(threatModel, /no reviewed outer edge-rule evidence exists/iu);
  assert.match(threatModel, /no accepted live alert or detection evidence exists/iu);
  assert.match(securityTesting, /Production\s+and every alias remain permanently outside this runner's scope/iu);
  assert.match(mobileReadiness, /production\s+changes remain on hold/iu);
  assert.match(aiReviewQueue, /default-off and provider-unbound/iu);
  assert.match(dashboard, /Current provider truth overrides historical “paused” language/iu);
  assert.match(dashboard, /safe while production changes remain on hold/iu);
});
