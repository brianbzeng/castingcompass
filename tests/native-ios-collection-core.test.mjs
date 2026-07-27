import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyNativeIOSCollectionCore } from "../scripts/verify-native-ios-collection-core.mjs";

test("native iOS collection core is contract-bound and release-closed", async () => {
  assert.equal(await verifyNativeIOSCollectionCore(), true);
});

test("native durable state stores credential references rather than raw secrets", async () => {
  const source = await readFile(
    new URL(
      "../native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeTripRecovery.swift",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /requestTokenSlot: NativeTripCredentialSlot/u);
  assert.match(source, /reporterKeySlot: NativeTripCredentialSlot\?/u);
  assert.doesNotMatch(source, /let (?:accessToken|refreshToken|reporterKey|requestToken): (?:String|Data)/u);
  assert.match(source, /exactBodySHA256/u);
});

test("native core has no network scheduler or optimistic recovery path", async () => {
  const sources = await Promise.all([
    "NativeTripIdentity.swift",
    "NativeTripCredentialVault.swift",
    "NativeTripRecovery.swift",
  ].map((name) => readFile(
    new URL(
      `../native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/${name}`,
      import.meta.url,
    ),
    "utf8",
  )));
  const combined = sources.join("\n");
  assert.doesNotMatch(combined, /URLSession|Timer\.|BGTaskScheduler|automaticRetry|optimistic/u);
  assert.match(combined, /case \.ambiguousTransport:\s+state = \.pendingSubmission/u);
  assert.match(combined, /prepareExplicitRetry/u);
});
