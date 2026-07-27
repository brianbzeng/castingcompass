import assert from "node:assert/strict";
import test from "node:test";

import {
  isSafeNativeCallbackBase,
  parseNativeAuthorizationRequest,
  verifiedNativeAuthorizationCallback,
} from "../shared/native-authorize-browser.ts";

const challenge = "c".repeat(43);
const state = "s".repeat(32);
const redirectUri = "castingcompass://oauth/callback";
const validSearch = new URLSearchParams({
  client_id: "com.castingcompass.app",
  redirect_uri: redirectUri,
  code_challenge: challenge,
  code_challenge_method: "S256",
  state,
  scope: "profile:read trips:write",
}).toString();

test("the system-browser request parser accepts only one exact bounded PKCE envelope", () => {
  assert.deepEqual(parseNativeAuthorizationRequest(`?${validSearch}`), {
    clientId: "com.castingcompass.app",
    redirectUri,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    state,
    scope: "profile:read trips:write",
  });
  for (const suffix of [
    "&scope=profile%3Aread",
    "&unknown=value",
    "&state=attacker",
  ]) {
    assert.equal(parseNativeAuthorizationRequest(`?${validSearch}${suffix}`), null);
  }
  for (const changed of [
    validSearch.replace("S256", "plain"),
    validSearch.replace(challenge, "short"),
    validSearch.replace(state, "short"),
    validSearch.replace("profile%3Aread+trips%3Awrite", "profile%3Aread"),
  ]) {
    assert.equal(parseNativeAuthorizationRequest(`?${changed}`), null);
  }
});

test("callback bases reject browser, credential-bearing, query, fragment, and dangerous schemes", () => {
  assert.equal(isSafeNativeCallbackBase(redirectUri), true);
  assert.equal(isSafeNativeCallbackBase("https://castingcompass.com/native/callback"), true);
  for (const value of [
    "http://castingcompass.com/native/callback",
    "https://user:password@castingcompass.com/native/callback",
    "https://castingcompass.com/native/callback?code=attacker",
    "https://castingcompass.com/native/callback#fragment",
    "javascript://oauth/callback",
    "vbscript://oauth/callback",
    "file:///oauth/callback",
    "attacker://oauth/callback",
    "com.castingcompass.ios:/oauth/callback",
  ]) {
    assert.equal(isSafeNativeCallbackBase(value), false);
  }
});

test("the page redirects only after an exact same-base code and state receipt", () => {
  const request = parseNativeAuthorizationRequest(`?${validSearch}`);
  assert.ok(request);
  const code = "a".repeat(43);
  const callback = `${redirectUri}?code=${code}&state=${state}`;
  assert.equal(verifiedNativeAuthorizationCallback({
    redirectTo: callback,
    expiresInSeconds: 300,
  }, request), callback);
  for (const body of [
    { redirectTo: `${redirectUri}?code=${code}&state=wrong`, expiresInSeconds: 300 },
    { redirectTo: `${redirectUri}?code=${code}&state=${state}&extra=1`, expiresInSeconds: 300 },
    { redirectTo: `attacker://oauth/callback?code=${code}&state=${state}`, expiresInSeconds: 300 },
    { redirectTo: `${redirectUri}?code=short&state=${state}`, expiresInSeconds: 300 },
    { redirectTo: callback, expiresInSeconds: 301 },
    { redirectTo: callback, expiresInSeconds: 300, extra: true },
  ]) {
    assert.equal(verifiedNativeAuthorizationCallback(body, request), null);
  }
});
