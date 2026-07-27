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
    recovery,
    executableCheck,
    tests,
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
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCore/NativeTripRecovery.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Sources/CastingCompassNativeCoreCheck/main.swift",
    ),
    read(
      "native/ios/CastingCompassNativeCore/Tests/CastingCompassNativeCoreTests/NativeTripCoreTests.swift",
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

  assert.match(vault, /kSecClassGenericPassword/u);
  assert.match(vault, /kSecAttrAccessibleWhenUnlockedThisDeviceOnly/u);
  assert.equal((vault.match(/kSecAttrSynchronizable as String: false/gu) ?? []).length, 2);
  assert.match(vault, /case reporterKey = "reporter-key"/u);
  assert.match(vault, /case requestToken = "request-token"/u);
  assert.doesNotMatch(vault, /UserDefaults|NSUbiquitous|kSecAttrSynchronizable.*true/u);

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
  assert.match(
    recovery,
    /guard \(state == \.confirmed\) == hasValidReceiptHash else/u,
  );
  assert.doesNotMatch(
    [identity, vault, recovery].join("\n"),
    /URLSession|Timer\.|BGTaskScheduler|UserDefaults|print\(|Logger\(/u,
  );

  assert.match(executableCheck, /ambiguous transport must never claim success/u);
  assert.match(executableCheck, /duplicate receipt keys must fail closed/u);
  assert.match(tests, /testAmbiguousWriteStaysPendingUntilExactReceipt/u);
  assert.match(tests, /testChangedRetryAndMismatchedReceiptFailClosed/u);
  assert.match(tests, /testDurableRecordContainsReferencesAndHashesButNoCredentialBytes/u);
  assert.match(tests, /testPersistedConfirmedStateRequiresReceiptEvidence/u);
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
