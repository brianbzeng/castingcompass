# CastingCompass native collection core

Status: reusable Swift core implemented; SwiftUI application, native authentication integration,
staging, signing, device acceptance, and TestFlight release remain open.

This Swift package implements the security- and evidence-sensitive pieces of the first iOS trip
logger before any interface is built:

- lowercase UUID v4 trip identities and 32-byte base64url request/reporter material;
- Keychain storage using `WhenUnlockedThisDeviceOnly` with iCloud synchronization disabled;
- typed start, complete, and cancellation plans that accept only the reviewed fields;
- byte-stable sorted JSON and deterministic no-photo multipart request construction;
- request materialization from Keychain slots without browser cookies, origins, or a network
  scheduler;
- protected, atomic, backup-excluded durable files that contain the non-secret plan, credential
  references, and request hashes—never credential bytes or a plaintext request body;
- exact response receipts with unknown and duplicate JSON keys rejected;
- persisted confirmation bound to the SHA-256 of that exact receipt;
- durable `draft`, `pending_submission`, `confirmed`, and `needs_user_attention` states;
- ambiguous transport that remains pending and never claims success;
- explicit retry only when the exact request body still matches; and
- fail-closed conflict, rejection, unreadable response, changed-request, or receipt mismatch.

The package contains no network scheduler and cannot silently replay a write. After restoration,
the app rematerializes the body from the non-secret plan and Keychain values; any byte, route, or
content-type drift moves the submission to `needs_user_attention`. A future SwiftUI application
must call the state machine only in response to an explicit user action.

## Local verification

The library and dependency-free executable check build with the Apple command-line tools:

```sh
swift build --package-path native/ios/CastingCompassNativeCore
swift run --package-path native/ios/CastingCompassNativeCore CastingCompassNativeCoreCheck
```

`swift test` requires the XCTest platform bundled with full Xcode. The path-scoped hosted macOS
workflow runs the release build, XCTest suite, and executable check. A green workflow proves only
the reusable core; it does not prove application integration or physical-device behavior.
