#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");

export async function verifyNativeIOSCollectionCore() {
  const [
    packageManifest,
    identity,
    vault,
    requestBuilder,
    recovery,
    durableStore,
    authSession,
    executableCheck,
    tests,
    authTests,
    readme,
    workflow,
    tripPolicy,
  ] = await Promise.all([
    read("native/ios/CastingCompassNativeCore/Package.swift"),
    read(
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeTripIdentity.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeTripCredentialVault.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeTripRequestBuilder.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeTripRecovery.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeTripDurableStore.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeAuthSession.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCoreCheck/main.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Tests/CastingCompassNativeCoreTests/NativeTripCoreTests.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Tests/CastingCompassNativeCoreTests/NativeAuthSessionTests.swift",
    ),
    read("native/ios/CastingCompassNativeCore/README.md"),
    read(".github/workflows/native-ios-core.yml"),
    read("security/native-trip-client-policy.json"),
  ]);

  assert.match(packageManifest, /swift-tools-version: 5\.10/u);
  assert.match(packageManifest, /\.iOS\(\.v16\)/u);
  assert.match(packageManifest, /\.linkedFramework\("Security"\)/u);
  assert.match(packageManifest, /name: "CastingCompassNativeCoreCheck"/u);
  assert.match(packageManifest, /\.testTarget\(/u);
  assert.doesNotMatch(packageManifest, /\.package\(/u);

  assert.match(
    identity,
    /clientContractVersion = "castingcompass\.native-trip-client\/1\.0\.0"/u,
  );
  assert.match(identity, /apiCompatibilityVersion = "1"/u);
  assert.match(identity, /apiVersionHeader = "X-CastingCompass-API-Version"/u);
  assert.match(identity, /requiredScope = "trips:write"/u);
  assert.match(identity, /SecRandomCopyBytes\(kSecRandomDefault, byteCount, &bytes\)/u);
  assert.match(identity, /let byteCount = 32/u);
  assert.match(identity, /replacingOccurrences\(of: "=", with: ""\)/u);
  assert.match(identity, /\^trip_\[0-9a-f\]/u);
  assert.match(identity, /validateRandomToken/u);
  assert.match(identity, /value\.count == 43/u);

  assert.match(vault, /kSecClassGenericPassword/u);
  assert.match(vault, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/u);
  assert.equal((vault.match(/kSecAttrSynchronizable as String: false/gu) ?? []).length, 2);
  assert.match(vault, /case reporterKey = "reporter-key"/u);
  assert.match(vault, /case requestToken = "request-token"/u);
  assert.match(vault, /case oauthSession = "oauth-session"/u);
  assert.doesNotMatch(vault, /UserDefaults|NSUbiquitous|kSecAttrSynchronizable.*true/u);

  assert.match(requestBuilder, /struct NativeTripStartPlan/u);
  assert.match(requestBuilder, /struct NativeTripCompletionPlan/u);
  assert.match(requestBuilder, /struct NativeTripCancellationPlan/u);
  assert.match(requestBuilder, /enum NativeTripRequestPlan/u);
  assert.match(requestBuilder, /vault\.read\(from: plan\.requestTokenSlot\)/u);
  assert.match(requestBuilder, /vault\.read\(from: start\.reporterKeySlot\)/u);
  assert.match(requestBuilder, /options: \[\.sortedKeys, \.withoutEscapingSlashes\]/u);
  assert.match(requestBuilder, /castingcompass\.native-trip-multipart\/1\.0\.0/u);
  assert.match(requestBuilder, /multipart\/form-data; boundary=/u);
  assert.match(requestBuilder, /completeAttempt", "true"/u);
  assert.match(requestBuilder, /nonAuthorizationHeaders/u);
  assert.doesNotMatch(requestBuilder, /URLRequest|URLSession|Cookie|Origin|UserDefaults/u);

  assert.match(recovery, /case pendingSubmission = "pending_submission"/u);
  assert.match(recovery, /case needsUserAttention = "needs_user_attention"/u);
  assert.match(recovery, /exactBodySHA256/u);
  assert.match(recovery, /case \.ambiguousTransport:\s+state = \.pendingSubmission/u);
  assert.match(
    recovery,
    /case \.conflict, \.rejected, \.undecodableResponse:\s+state = \.needsUserAttention/u,
  );
  assert.match(recovery, /prepareExplicitRetry\(exactRequestBody:/u);
  assert.match(recovery, /Set\(root\.keys\) == \["receipt"\]/u);
  assert.match(recovery, /Set\(receipt\.keys\) == \["operation", "tripId"\]/u);
  assert.match(recovery, /hasExactlyOneJSONKey\("operation", in: data\)/u);
  assert.match(recovery, /confirmationReceiptSHA256 = receipt\.responseSHA256/u);
  assert.match(recovery, /struct NativeTripPersistedSubmission/u);
  assert.match(recovery, /record\.descriptor\.matches\(builtRequest\)/u);
  assert.match(
    recovery,
    /guard \(state == \.confirmed\) == hasValidReceiptHash else/u,
  );

  assert.match(durableStore, /actor NativeTripDurableStore/u);
  assert.match(durableStore, /maximumRecordBytes = 65_536/u);
  assert.match(durableStore, /\.completeFileProtection/u);
  assert.match(durableStore, /\.protectionKey: FileProtectionType\.complete/u);
  assert.match(durableStore, /\.posixPermissions: 0o600/u);
  assert.match(durableStore, /values\.isExcludedFromBackup = true/u);
  assert.match(durableStore, /options: \.atomic/u);
  assert.match(durableStore, /isSymbolicLink != true/u);
  assert.doesNotMatch(durableStore, /UserDefaults|URLSession|print\(|Logger\(/u);

  assert.doesNotMatch(
    [identity, vault, requestBuilder, recovery, durableStore].join("\n"),
    /URLSession|Timer\.|BGTaskScheduler|UserDefaults|print\(|Logger\(/u,
  );

  assert.match(authSession, /enum NativeAuthContract/u);
  assert.match(authSession, /clientID = "com\.castingcompass\.app"/u);
  assert.match(authSession, /redirectURI = "castingcompass:\/\/oauth\/callback"/u);
  assert.match(authSession, /scope = "profile:read trips:write"/u);
  assert.match(authSession, /codeChallengeMethod = "S256"/u);
  assert.match(authSession, /actor NativeAuthorizationAttempt/u);
  assert.match(authSession, /SHA256\.hash\(data: Data\(verifier\.utf8\)\)/u);
  assert.match(authSession, /nativeAuthConstantTimeEqual\(stateValues\[0\], stateValue\)/u);
  assert.match(authSession, /attemptState = \.invalidated/u);
  assert.match(authSession, /actor NativeAuthSession/u);
  assert.match(authSession, /case refreshing/u);
  assert.match(authSession, /case revoking/u);
  assert.match(authSession, /case requiresSignIn = "requires_sign_in"/u);
  assert.match(authSession, /kind: \.oauthSession/u);
  assert.match(authSession, /invalidateAfterRefreshWasDispatched/u);
  assert.match(authSession, /try invalidateFamily\(\)/u);
  assert.match(authSession, /try writeMarker\(\.refreshing\)/u);
  assert.match(authSession, /try writeMarker\(\.revoking\)/u);
  assert.match(authSession, /case \.interruptedSensitiveOperation:/u);
  assert.match(authSession, /URLSessionConfiguration\.ephemeral/u);
  assert.match(authSession, /configuration\.httpCookieStorage = nil/u);
  assert.match(authSession, /configuration\.httpShouldSetCookies = false/u);
  assert.match(authSession, /configuration\.urlCredentialStorage = nil/u);
  assert.match(authSession, /configuration\.urlCache = nil/u);
  assert.match(authSession, /\["authorization", "cookie", "origin"\]/u);
  assert.match(authSession, /options: \[\.sortedKeys, \.withoutEscapingSlashes\]/u);
  assert.match(authSession, /NativeAuthBackchannelRequest\(redacted\)/u);
  assert.doesNotMatch(
    authSession,
    /FileManager|UserDefaults|SQLite|CoreData|UIPasteboard|NSPasteboard|print\(|Logger\(|URLSession\.shared|dataTask\(|\.resume\(\)|BGTaskScheduler|Timer\./u,
  );

  assert.match(executableCheck, /ambiguous transport must never claim success/u);
  assert.match(executableCheck, /duplicate receipt keys must fail closed/u);
  assert.match(
    executableCheck,
    /the same plan and Keychain material must reproduce identical bytes/u,
  );
  assert.match(executableCheck, /durable files must contain no raw request or reporter credential/u);
  assert.match(executableCheck, /native callbacks must be single-use/u);
  assert.match(
    executableCheck,
    /a lost refresh response must destroy the local token family/u,
  );
  assert.match(tests, /testAmbiguousWriteStaysPendingUntilExactReceipt/u);
  assert.match(tests, /testChangedRetryAndMismatchedReceiptFailClosed/u);
  assert.match(tests, /testDurableRecordContainsReferencesAndHashesButNoCredentialBytes/u);
  assert.match(tests, /testPersistedConfirmedStateRequiresReceiptEvidence/u);
  assert.match(tests, /testTypedPlansMaterializeStableExactRequestsWithoutAmbientHeaders/u);
  assert.match(tests, /testCompletionMultipartIsStableBoundedAndWholeAttemptOnly/u);
  assert.match(tests, /testPersistedPlanRebuildsIdenticalBytesFromCredentialSlots/u);
  assert.match(tests, /testChangedCredentialMaterialCannotReplayPendingPlan/u);
  assert.match(tests, /testProtectedStoreRoundTripsAndRejectsUnknownPersistedFields/u);
  assert.match(
    authTests,
    /testPKCEAuthorizationAndCallbackProduceExactBackchannelRequest/u,
  );
  assert.match(
    authTests,
    /testRefreshIsSingleFlightAndLostOutcomeDestroysFamily/u,
  );
  assert.match(
    authTests,
    /testExactRotationReplacesPairWithoutExtendingFamily/u,
  );
  assert.match(
    authTests,
    /testPersistedInFlightMarkerPreventsCrossInstanceReuse/u,
  );
  assert.match(
    authTests,
    /testRestoreRejectsTamperingAndDoesNotResurrectTokens/u,
  );
  assert.match(
    authTests,
    /testTokenParserRejectsUnknownDuplicateAndInvalidSemantics/u,
  );
  assert.match(readme, /does not prove application integration or physical-device behavior/u);

  assert.match(workflow, /runs-on: macos-15/u);
  assert.match(
    workflow,
    /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1/u,
  );
  assert.match(
    workflow,
    /swift build --package-path native\/ios\/CastingCompassNativeCore -c release/u,
  );
  assert.match(
    workflow,
    /swift test --package-path native\/ios\/CastingCompassNativeCore/u,
  );
  assert.match(
    workflow,
    /swift run --package-path native\/ios\/CastingCompassNativeCore CastingCompassNativeCoreCheck/u,
  );

  const policy = JSON.parse(tripPolicy);
  assert.equal(policy.status, "server-contract-implemented-client-not-built");
  assert.equal(policy.recovery.automatic_replay_allowed, false);
  assert.equal(policy.authorization.reporter_key_storage, "ios-keychain-only");
  assert.equal(policy.authority.testflight_release, false);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyNativeIOSCollectionCore();
  process.stdout.write("Native iOS collection core verified; release authority remains closed.\n");
}
