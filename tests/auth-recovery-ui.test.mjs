import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [accountFeature, networkStateHook] = await Promise.all([
  readFile(new URL("../app/components/AccountFeature.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/lib/use-client-network-state.ts", import.meta.url), "utf8"),
]);

test("account entry writes pause offline and never replay when the connection returns", () => {
  assert.match(networkStateHook, /addEventListener\("offline"/);
  assert.match(networkStateHook, /addEventListener\("online"/);
  assert.match(accountFeature, /if \(networkState === "offline"\) \{[\s\S]*No account request was submitted/);
  assert.match(accountFeature, /The age check was not submitted/);
  assert.match(accountFeature, /No replacement code was requested/);
  assert.match(accountFeature, /Legal acceptance was not submitted/);
  assert.match(accountFeature, /nothing will be submitted automatically after reconnection/);
  assert.doesNotMatch(networkStateHook, /fetch\(|submit|retry/i);
  assert.match(accountFeature, /authSubmitDisabled = busy \|\| networkState === "offline"/);
});

test("account entry writes expose slow and ambiguous outcomes without claiming success", () => {
  for (const operation of [
    "signup",
    "signupDetails",
    "verify",
    "recover",
    "reset",
    "login",
    "resend",
    "legalAcceptance",
  ]) {
    assert.match(accountFeature, new RegExp(`case "${operation}"`));
  }
  assert.match(accountFeature, /SLOW_MUTATION_NOTICE_MS/);
  assert.match(accountFeature, /authRequestSlowMessage/);
  assert.match(accountFeature, /authRequestAmbiguousMessage/);
  assert.match(accountFeature, /isConnectionFailure\(submissionError\) \|\| submissionError instanceof AmbiguousMutationError/);
  assert.match(accountFeature, /No confirmation arrived\. A session may already exist/);
  assert.match(accountFeature, /The password may already have changed/);
  assert.match(accountFeature, /A new code may have been sent and may supersede the prior code/);
  assert.match(accountFeature, /primaryAuthMutationBlocked/);
  assert.match(accountFeature, /Replacement-code status unresolved/);
});

test("successful account transitions require typed receipts and uncertain sessions use a read-only check", () => {
  assert.match(accountFeature, /function isExactRecord/);
  assert.match(accountFeature, /expectedKeys\.every\(\(key\) => Object\.hasOwn\(candidate, key\)\)/);
  assert.match(accountFeature, /function isExactAccountSession/);
  assert.match(accountFeature, /function eligibilityProofFromResponse/);
  assert.match(accountFeature, /value\.expiresInMinutes !== 10/);
  assert.match(accountFeature, /value\.expiresInSeconds !== 600/);
  assert.match(accountFeature, /function challengeIdFromResponse/);
  assert.match(accountFeature, /operation === "recover" && value\.requested !== true/);
  assert.match(accountFeature, /value\.expiresInMinutes !== 15/);
  assert.match(accountFeature, /function resendCooldownFromResponse/);
  assert.match(accountFeature, /value\.retryAfterSeconds !== 60/);
  assert.match(accountFeature, /function accountUserFromMutationResponse/);
  assert.match(accountFeature, /function legalAcceptanceUserFromResponse/);
  assert.match(accountFeature, /value\.legalVersion !== LEGAL_DOCUMENT_VERSION/);
  assert.match(accountFeature, /response\.status !== expectedStatus \|\| !confirmedUser/);
  assert.match(accountFeature, /challengeIdFromResponse\(body, submittedMode\)/);
  assert.match(accountFeature, /resendCooldownFromResponse\(body, challengeId\)/);
  assert.match(accountFeature, /legalAcceptanceUserFromResponse\(body\)/);
  const sessionCheckStart = accountFeature.indexOf("const checkAuthSessionStatus");
  const sessionCheckEnd = accountFeature.indexOf("const deleteAccount", sessionCheckStart);
  const sessionCheck = accountFeature.slice(sessionCheckStart, sessionCheckEnd);
  assert.match(sessionCheck, /fetch\("\/api\/auth\/session", \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(sessionCheck, /method:\s*"POST"|method:\s*"PUT"|method:\s*"PATCH"|method:\s*"DELETE"/);
  assert.match(sessionCheck, /Do not reuse the code/);
  assert.match(accountFeature, /Check account status/);
});
