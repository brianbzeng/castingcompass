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
    httpTransport,
    dispatchCoordinator,
    browserAuthorization,
    executableCheck,
    tests,
    authTests,
    dispatchTests,
    browserTests,
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
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeHTTPTransport.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeDispatchCoordinator.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeSystemBrowserAuthorization.swift",
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
    read(
      "native/ios/CastingCompassNativeCore/Tests/CastingCompassNativeCoreTests/NativeDispatchCoordinatorTests.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Tests/CastingCompassNativeCoreTests/NativeSystemBrowserAuthorizationTests.swift",
    ),
    read("native/ios/CastingCompassNativeCore/README.md"),
    read(".github/workflows/native-ios-core.yml"),
    read("security/native-trip-client-policy.json"),
  ]);

  assert.match(packageManifest, /swift-tools-version: 5\.10/u);
  assert.match(packageManifest, /\.iOS\(\.v16\)/u);
  assert.match(packageManifest, /\.linkedFramework\("AuthenticationServices"\)/u);
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
  assert.match(
    identity,
    /pattern: #"\\Atrip_\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-4\[0-9a-f\]\{3\}-\[89ab\]\[0-9a-f\]\{3\}-\[0-9a-f\]\{12\}\\z"#/u,
  );
  assert.match(identity, /validateRandomToken/u);
  assert.match(identity, /value\.count == 43/u);

  assert.match(vault, /kSecClassGenericPassword/u);
  assert.match(vault, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/u);
  assert.equal((vault.match(/kSecAttrSynchronizable as String: false/gu) ?? []).length, 1);
  assert.doesNotMatch(
    vault.match(/let updateAttributes:[\s\S]*?let updateStatus/u)?.[0] ?? "",
    /kSecAttrSynchronizable/u,
  );
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

  assert.match(httpTransport, /protocol NativeHTTPTransport: Sendable/u);
  assert.match(httpTransport, /struct NativeEphemeralHTTPTransport/u);
  assert.match(httpTransport, /URLSessionConfiguration\.ephemeral/u);
  assert.match(httpTransport, /configuration\.httpCookieStorage = nil/u);
  assert.match(httpTransport, /configuration\.httpCookieAcceptPolicy = \.never/u);
  assert.match(httpTransport, /configuration\.httpShouldSetCookies = false/u);
  assert.match(httpTransport, /configuration\.urlCredentialStorage = nil/u);
  assert.match(httpTransport, /configuration\.urlCache = nil/u);
  assert.match(httpTransport, /configuration\.waitsForConnectivity = false/u);
  assert.match(httpTransport, /completionHandler\(nil\)\s+finish\(\.failure\(NativeHTTPTransportError\.redirectRejected\)\)/u);
  assert.match(httpTransport, /data\.count > maximumResponseBytes - responseBody\.count/u);
  assert.match(httpTransport, /NativeHTTPTransportError\.responseTooLarge/u);
  assert.match(httpTransport, /components\.scheme == "https"/u);
  assert.match(httpTransport, /self\.allowedScheme = "https"/u);
  assert.match(httpTransport, /components\.scheme == allowedScheme/u);
  assert.match(httpTransport, /components\.host\?\.lowercased\(\) == allowedHost/u);
  assert.match(httpTransport, /"cookie",\s+"origin",\s+"proxy-authorization"/u);
  assert.doesNotMatch(
    httpTransport,
    /URLSession\.shared|Timer\.|BGTaskScheduler|UserDefaults|print\(|Logger\(|retry|while\s*\(|repeat\s*\{/u,
  );

  assert.match(dispatchCoordinator, /actor NativeAuthCoordinator/u);
  assert.match(dispatchCoordinator, /actor NativeTripDispatchCoordinator/u);
  assert.match(
    dispatchCoordinator,
    /invalidateAfterRefreshWasDispatched/u,
  );
  assert.match(
    dispatchCoordinator,
    /finishSignOutWithUnconfirmedRemoteResult/u,
  );
  assert.match(dispatchCoordinator, /func retryPending\(/u);
  assert.match(dispatchCoordinator, /func resumeDraft\(/u);
  assert.match(
    dispatchCoordinator,
    /try await store\.save\(submission\)[\s\S]*transport\.send\(/u,
  );
  assert.match(
    dispatchCoordinator,
    /catch \{\s+try submission\.apply\(\.ambiguousTransport\)\s+try await store\.save\(submission\)/u,
  );
  assert.match(
    dispatchCoordinator,
    /request\.setValue\(\s+"Bearer \\\(accessToken\)"/u,
  );
  assert.match(
    dispatchCoordinator,
    /case 500\.\.\.599:\s+try submission\.apply\(\.ambiguousTransport\)/u,
  );
  assert.match(
    dispatchCoordinator,
    /case 409:\s+try submission\.apply\(\.conflict\)/u,
  );
  assert.doesNotMatch(
    dispatchCoordinator,
    /URLSession|Timer\.|BGTaskScheduler|UserDefaults|print\(|Logger\(|automaticRetry|retryAfter|while\s*\(|repeat\s*\{/u,
  );

  assert.match(browserAuthorization, /import AuthenticationServices/u);
  assert.match(
    browserAuthorization,
    /actor NativeSystemBrowserAuthorizationFlow/u,
  );
  assert.match(
    browserAuthorization,
    /guard activeAttempt == nil else/u,
  );
  assert.match(
    browserAuthorization,
    /callbackURLScheme == "castingcompass"/u,
  );
  assert.match(
    browserAuthorization,
    /NativeSystemBrowserAuthorizationRequest\(redacted\)/u,
  );
  assert.match(
    browserAuthorization,
    /activeAttempt = nil\s+return try await attempt\.consumeCallback\(callbackURL\)/u,
  );
  assert.match(
    browserAuthorization,
    /final class NativeSystemBrowserAuthorizer/u,
  );
  assert.match(
    browserAuthorization,
    /ASWebAuthenticationSession\(\s+url: authorizationURL,\s+callbackURLScheme: callbackURLScheme,/u,
  );
  assert.match(
    browserAuthorization,
    /session\.presentationContextProvider = self\s+session\.prefersEphemeralWebBrowserSession = true/u,
  );
  assert.match(
    browserAuthorization,
    /guard session\.start\(\) else/u,
  );
  assert.match(
    browserAuthorization,
    /withTaskCancellationHandler/u,
  );
  assert.match(
    browserAuthorization,
    /guard \(callbackURL == nil\) != \(error == nil\) else/u,
  );
  assert.match(
    browserAuthorization,
    /active\.session\.presentationContextProvider = nil/u,
  );
  assert.match(
    browserAuthorization,
    /authCoordinator\.exchangeAuthorizationCode\(/u,
  );
  assert.doesNotMatch(
    browserAuthorization,
    /URLSession|Cookie|Origin|UserDefaults|FileManager|UIPasteboard|NSPasteboard|Timer\.|BGTaskScheduler|print\(|Logger\(|automaticRetry|retryAfter|while\s*\(|repeat\s*\{/u,
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
  assert.match(
    dispatchTests,
    /testTransportRejectsInvalidRequestsBeforeDispatch/u,
  );
  assert.match(
    dispatchTests,
    /testLostRefreshInvalidatesFamilyWithoutRetry/u,
  );
  assert.match(
    dispatchTests,
    /testTripCoordinatorPersistsBeforeOneShotConfirmation/u,
  );
  assert.match(
    dispatchTests,
    /testAmbiguousTripRequiresExplicitByteIdenticalRetry/u,
  );
  assert.match(
    dispatchTests,
    /testSignedOutSubmissionRemainsDraftAndCanResumeAfterAuthorization/u,
  );
  assert.match(
    dispatchTests,
    /testMalformedSuccessAndConflictNeedAttention/u,
  );
  assert.match(
    browserTests,
    /testFlowIsSingleFlightAndCancelledAttemptCannotReturn/u,
  );
  assert.match(
    browserTests,
    /testEphemeralBrowserCallbackExchangesInsideCoordinator/u,
  );
  assert.match(
    browserTests,
    /testTaskCancellationCancelsBrowserWithoutDispatch/u,
  );
  assert.match(
    browserTests,
    /testSecondSignInAndInvalidCompletionFailClosed/u,
  );
  assert.match(
    browserTests,
    /testFailedPresentationClearsAttemptForExplicitRetry/u,
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
  assert.deepEqual(policy.api, {
    compatibility_version: "1",
    version_header: "X-CastingCompass-API-Version",
    base_url_source: "signed-build-configuration",
  });
  assert.deepEqual(policy.authorization, {
    mode: "native-bearer",
    required_scope: "trips:write",
    cookie_allowed: false,
    origin_allowed: false,
    access_token_storage: "ios-keychain-only",
    reporter_key_storage: "ios-keychain-only",
  });
  assert.equal(policy.recovery.automatic_replay_allowed, false);
  assert.deepEqual(policy.authority, {
    testflight_release: false,
    staging_activation: false,
    production_deployment: false,
    pilot_activation: false,
    model_training: false,
    model_selection: false,
    score_change: false,
  });
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyNativeIOSCollectionCore();
  process.stdout.write("Native iOS collection core verified; release authority remains closed.\n");
}
