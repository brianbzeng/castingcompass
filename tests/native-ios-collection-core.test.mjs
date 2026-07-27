import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { verifyNativeIOSCollectionCore } from "../scripts/verify-native-ios-collection-core.mjs";

test("native iOS collection core is contract-bound and release-closed", async () => {
  assert.equal(await verifyNativeIOSCollectionCore(), true);
});

test("native durable state stores credential references rather than raw secrets", async () => {
  const [recovery, plans, store] = await Promise.all([
    "NativeTripRecovery.swift",
    "NativeTripRequestBuilder.swift",
    "NativeTripDurableStore.swift",
  ].map((name) => readFile(
    new URL(
      `../native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/${name}`,
      import.meta.url,
    ),
    "utf8",
  )));
  assert.match(recovery, /requestTokenSlot: NativeTripCredentialSlot/u);
  assert.match(recovery, /reporterKeySlot: NativeTripCredentialSlot\?/u);
  assert.match(recovery, /exactBodySHA256/u);
  assert.match(recovery, /NativeTripPersistedSubmission/u);
  assert.match(plans, /vault\.read\(from: plan\.requestTokenSlot\)/u);
  assert.match(plans, /vault\.read\(from: start\.reporterKeySlot\)/u);
  assert.doesNotMatch(store, /requestToken|reporterKey|accessToken|refreshToken/u);
  assert.match(store, /\.completeFileProtection/u);
  assert.match(store, /isExcludedFromBackup = true/u);
});

test("native core has no network scheduler or optimistic recovery path", async () => {
  const sources = await Promise.all([
    "NativeTripIdentity.swift",
    "NativeTripCredentialVault.swift",
    "NativeTripRequestBuilder.swift",
    "NativeTripRecovery.swift",
    "NativeTripDurableStore.swift",
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

test("native requests are deterministic, typed, and cannot add ambient browser authority", async () => {
  const source = await readFile(
    new URL(
      "../native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeTripRequestBuilder.swift",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /struct NativeTripStartPlan/u);
  assert.match(source, /struct NativeTripCompletionPlan/u);
  assert.match(source, /struct NativeTripCancellationPlan/u);
  assert.match(source, /options: \[\.sortedKeys, \.withoutEscapingSlashes\]/u);
  assert.match(source, /castingcompass\.native-trip-multipart\/1\.0\.0/u);
  assert.match(source, /nonAuthorizationHeaders/u);
  assert.doesNotMatch(source, /URLRequest|URLSession|Cookie|Origin|UserDefaults/u);
});
