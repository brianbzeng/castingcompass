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

test("native auth core keeps browser authority out of token operations", async () => {
  const source = await readFile(
    new URL(
      "../native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeAuthSession.swift",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /URLSessionConfiguration\.ephemeral/u);
  assert.match(source, /configuration\.httpCookieStorage = nil/u);
  assert.match(source, /configuration\.httpShouldSetCookies = false/u);
  assert.match(source, /configuration\.urlCredentialStorage = nil/u);
  assert.match(source, /configuration\.urlCache = nil/u);
  assert.match(source, /\["authorization", "cookie", "origin"\]/u);
  assert.match(source, /NativeAuthBackchannelRequest\(redacted\)/u);
  assert.doesNotMatch(
    source,
    /URLSession\.shared|dataTask\(|\.resume\(\)|UserDefaults|FileManager|print\(|Logger\(/u,
  );
});

test("native auth rotation is single-flight and response loss fails closed", async () => {
  const [source, vault] = await Promise.all([
    readFile(
      new URL(
        "../native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeAuthSession.swift",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeTripCredentialVault.swift",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(source, /actor NativeAuthSession/u);
  assert.match(source, /guard status == \.authorized, let pair = tokenPair/u);
  assert.match(source, /status = \.refreshing/u);
  assert.match(source, /try writeMarker\(\.refreshing\)/u);
  assert.match(source, /try writeMarker\(\.revoking\)/u);
  assert.match(source, /case \.interruptedSensitiveOperation:/u);
  assert.match(source, /invalidateAfterRefreshWasDispatched/u);
  assert.match(source, /try clearLocalCredentials\(marker: \.requiresSignIn\)/u);
  assert.match(source, /kind: \.oauthSession/u);
  assert.match(vault, /case oauthSession = "oauth-session"/u);
  assert.doesNotMatch(source, /automaticRetry|retryRefresh|Codable/u);
});

test("native dispatch is one-shot, bounded, origin-pinned, and durable before send", async () => {
  const [transport, coordinator] = await Promise.all([
    readFile(
      new URL(
        "../native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeHTTPTransport.swift",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeDispatchCoordinator.swift",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(transport, /URLSessionConfiguration\.ephemeral/u);
  assert.match(transport, /httpCookieAcceptPolicy = \.never/u);
  assert.match(transport, /completionHandler\(nil\)/u);
  assert.match(transport, /redirectRejected/u);
  assert.match(transport, /maximumResponseBytes - responseBody\.count/u);
  assert.match(transport, /components\.scheme == "https"/u);
  assert.match(transport, /self\.allowedScheme = "https"/u);
  assert.match(transport, /components\.scheme == allowedScheme/u);
  assert.doesNotMatch(
    transport,
    /URLSession\.shared|Timer\.|BGTaskScheduler|automaticRetry|while\s*\(|repeat\s*\{/u,
  );
  assert.match(
    coordinator,
    /try await store\.save\(submission\)[\s\S]*transport\.send\(/u,
  );
  assert.match(coordinator, /func retryPending\(/u);
  assert.match(coordinator, /func resumeDraft\(/u);
  assert.match(coordinator, /invalidateAfterRefreshWasDispatched/u);
  assert.doesNotMatch(
    coordinator,
    /URLSession|Timer\.|BGTaskScheduler|automaticRetry|retryAfter|while\s*\(|repeat\s*\{/u,
  );
});
