import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [accountFeature, authWorker] = await Promise.all([
  readFile(new URL("../app/components/AccountFeature.tsx", import.meta.url), "utf8"),
  readFile(new URL("../worker/auth.ts", import.meta.url), "utf8"),
]);

test("sign-out never submits while offline or replays after reconnection", () => {
  assert.match(accountFeature, /networkState === "offline" \|\| signOutRequest\?\.state === "submitting"/);
  assert.match(accountFeature, /Reconnect to sign out/);
  assert.doesNotMatch(accountFeature, /addEventListener\("online"[^]*signOut/);
});

test("sign-out requires the exact server receipt before clearing local account state", () => {
  assert.match(authWorker, /jsonResponse\(\{ signedOut: true, user: null \}, 200, clearSessionCookies\(request\)\)/);
  assert.match(accountFeature, /response\.status !== 200 \|\| !isExactSignOutReceipt\(body\)/);
  assert.match(accountFeature, /candidate\.signedOut === true && candidate\.user === null/);
  const receiptCheck = accountFeature.indexOf("!isExactSignOutReceipt(body)");
  assert.ok(
    receiptCheck >= 0 && receiptCheck < accountFeature.indexOf("completeLocalSignOut();", receiptCheck),
    "local account state must clear only after the server receipt is verified",
  );
});

test("slow and ambiguous sign-out remains visibly unconfirmed", () => {
  assert.match(accountFeature, /sign-out is not confirmed yet/);
  assert.match(accountFeature, /Your session may still be active/);
  assert.match(accountFeature, /Do not assume this device is signed out or retry yet/);
  assert.match(accountFeature, /Sign-out status unresolved/);
});

test("an ambiguous sign-out permits only a read-only session check", () => {
  assert.match(accountFeature, /fetch\("\/api\/auth\/session", \{ cache: "no-store" \}\)/);
  assert.match(accountFeature, /Checking the server session without repeating sign-out/);
  assert.match(accountFeature, /The server confirms that this session is still active/);
  assert.match(accountFeature, /Check sign-out status/);
  assert.match(accountFeature, /Reconnect to check sign-out status/);
});

test("authoritative sign-out rejection remains retryable", () => {
  assert.match(accountFeature, /Sign-out was rejected\. Your session remains active/);
  assert.match(accountFeature, /Retry sign out/);
});
