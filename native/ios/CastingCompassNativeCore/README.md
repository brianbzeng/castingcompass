# CastingCompass native collection core

Status: reusable collection, authentication/session, system-browser handoff, one-shot HTTPS
transport, and dispatch coordinator cores implemented; SwiftUI application integration, staging,
signing, device acceptance, and TestFlight release remain open.

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

The package also implements the non-UI native authentication core:

- cryptographically random memory-only PKCE verifier and state generation;
- exact `S256` challenge, system-browser authorization URL, callback URI, state, and one-use
  callback consumption;
- exact authorization-code, refresh, and revocation request envelopes;
- an ephemeral `URLSessionConfiguration` with no cookie, credential, or cache stores;
- strict bounded token and revocation response parsing with unknown and duplicate keys rejected;
- access and refresh credentials rotated together in one
  `WhenUnlockedThisDeviceOnly`, non-synchronizing Keychain item;
- single-flight refresh/revoke with persisted non-secret in-flight markers that prevent a crash
  or second actor from reusing the predecessor; and
- immediate Keychain token replacement with a non-secret `requires_sign_in` marker after a
  dispatched refresh has an ambiguous, rejected, or malformed outcome.

The package now also contains a production one-shot HTTPS transport and non-UI auth/trip
coordinators. Each explicit call creates an ephemeral session with no cookie, credential, or
cache stores, rejects redirects and noncanonical origins, bounds response bytes while streaming,
and performs no retry. The trip coordinator saves `draft` and then `pending_submission` before
dispatch, accepts only the operation-specific status plus exact receipt-only body, preserves
transport/5xx ambiguity as pending, and requires a separate explicit byte-identical retry.
Refresh ambiguity invalidates the family; ambiguous sign-out clears local authority without
claiming remote revocation.

The package includes a MainActor-bound `ASWebAuthenticationSession` bridge that requests an
ephemeral browser session, obtains its presentation anchor from the host application, and permits
only one authorization attempt at a time. It rejects a callback/error ambiguity, invalidates the
PKCE attempt on browser or task cancellation, removes its presentation delegate at every terminal
edge, and passes a verified callback directly to the one-shot token coordinator. The SwiftUI layer
never needs to receive or persist an authorization code, verifier, state value, token response, or
browser cookie. Ephemeral mode is requested before `start()`; only the operating system/browser
can enforce that request.

The package contains no timer, background task, connectivity watcher, or network scheduler and
cannot silently replay a write. After restoration, it rematerializes the body from the non-secret
plan and Keychain values; any byte, route, or content-type drift moves the submission to
`needs_user_attention`. A future SwiftUI application must invoke the provided system-browser
authorizer and one-shot coordinators only in response to explicit user actions.

## Local verification

The library and dependency-free executable check build with the Apple command-line tools:

```sh
swift build --package-path native/ios/CastingCompassNativeCore
swift run --package-path native/ios/CastingCompassNativeCore CastingCompassNativeCoreCheck
```

`swift test` requires the XCTest platform bundled with full Xcode. The path-scoped hosted macOS
workflow runs the release build, XCTest suite, and executable check. A green workflow proves only
the reusable core; it does not prove application integration or physical-device behavior.
