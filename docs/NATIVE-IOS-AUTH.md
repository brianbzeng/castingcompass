# Native iOS authentication boundary

Status: server and reusable Swift auth/session cores implemented locally; SwiftUI browser
integration, staging, signing, physical-device acceptance, and activation remain open
Last reviewed: **2026-07-26 UTC**

This document defines the narrow authentication boundary for a future CastingCompass iOS trip
logger. It does not authorize TestFlight, production configuration, or a deployment. The Worker
is fail-closed unless `NATIVE_OAUTH_ENABLED` is exactly `true` and one reviewed client ID and
redirect URI are configured. Migration `0021_native_oauth.sql` creates empty hash-only credential
tables but does not enable the feature.

## Client and browser boundary

The app is a public OAuth-style client. It has no client secret and must never ship one. Sign-in
uses `ASWebAuthenticationSession` and the existing CastingCompass browser account flow; an
embedded web view is forbidden. Before opening the browser, the app creates:

- a cryptographically random 43–128 character PKCE verifier;
- its base64url SHA-256 `S256` challenge; and
- a separate high-entropy 32–160 character state value.

The verifier and state remain ephemeral and bound to that one attempt. The callback must have the
exact configured scheme/URI and exact state before the app exchanges a code. Cancellation,
duplicate callbacks, missing state, mismatched state, or a restarted attempt disclose no token.

The planned client identifier is `com.castingcompass.app`, subject to final Apple bundle-ID
approval. The final redirect URI must be fixed once and configured identically in the app and
Worker. The Worker positively allows only `https:` or the dedicated `castingcompass:` scheme and
rejects every other protocol, including browser-executable and arbitrary custom schemes. It also
rejects wildcard, per-request, HTTP, credential-bearing, query-bearing, and fragment-bearing
redirects.

## Endpoint contract

`POST /api/native/oauth/authorize` is the browser-session authorization step. It requires a live
host-only browser cookie, current age/legal acceptance, no deletion fence, same origin, the exact
configured client/redirect, scope `profile:read trips:write`, `S256`, a valid challenge, and valid
state. It returns no-store JSON:

```json
{
  "redirectTo": "castingcompass://oauth/callback?code=ONE_TIME_CODE&state=ORIGINAL_STATE",
  "expiresInSeconds": 300
}
```

The browser must navigate only to the returned exact redirect after the user affirmatively
continues. At most five unconsumed codes per account/client may be active.

`POST /api/native/oauth/token` accepts one of two exact JSON requests:

```json
{
  "grantType": "authorization_code",
  "clientId": "com.castingcompass.app",
  "redirectUri": "castingcompass://oauth/callback",
  "code": "ONE_TIME_CODE",
  "codeVerifier": "ORIGINAL_PKCE_VERIFIER"
}
```

```json
{
  "grantType": "refresh_token",
  "clientId": "com.castingcompass.app",
  "refreshToken": "CURRENT_REFRESH_TOKEN"
}
```

A successful exchange returns a ten-minute bearer access token, a rotating refresh token whose
family expires no later than 30 days after initial sign-in, `tokenType: "Bearer"`, and the exact
scope. Authorization codes are five-minute, one-use credentials. Every refresh consumes its
predecessor, revokes earlier access tokens, and returns a new pair. Reuse or an ambiguous
concurrent refresh revokes the whole family. If the app loses a successful refresh response, it
must discard the family and ask the user to sign in again; retrying the old token is intentionally
treated as possible theft.

Token and revoke are native backchannel operations: they reject `Origin`, `Cookie`, and
`Authorization` headers. The iOS client must use an ephemeral `URLSession` configuration with no
shared browser cookie store and place the relevant code or refresh/revocation token only in the
exact JSON field. This prevents browser ambient authority and bearer/grant ambiguity.

`POST /api/native/oauth/revoke` accepts the exact client ID, token, and `access_token` or
`refresh_token` hint. It is idempotent and returns the same no-store result for unknown tokens.
Revoking any known family credential revokes that family and its access tokens.

## API authority

Native bearer authority is available only on the route-policy allowlist:

- `profile:read` permits the narrow current-profile read.
- `trips:write` permits trip start, cancel, complete/report, and owner pending-trip
  update/delete.

Every bearer request must use one exact `Authorization: Bearer …` header, no Cookie header, and
no browser Origin header. The Worker hashes the token before D1 lookup, checks client, expiry,
family revocation, account existence, current legal version, deletion fence, and required scope,
then derives the account ID on the server. Submitted account IDs, client roles, hidden UI, and
the possession of an expired or wrong-scope token grant nothing.

## Storage, lifecycle, and logging

The app stores access and refresh credentials only in iOS Keychain. `UserDefaults`, files,
SQLite/Core Data, pasteboard, logs, crash reports, analytics, URLs, and web `localStorage` are
forbidden credential stores. The server stores only SHA-256 hashes of codes and tokens. Password
reset, account deletion, explicit revocation, refresh reuse, expiry, and bounded scheduled
retention revoke or remove native authority. Logs may contain only redacted outcome codes and
request IDs—never raw codes, verifiers, state, tokens, redirects containing codes, or account
identity.

## Implemented Swift core

`native/ios/CastingCompassNativeCore` now implements the reusable non-UI client boundary. It
creates a random 43-character verifier and independent state in memory, derives the SHA-256
base64url `S256` challenge, constructs the exact first-party browser URL, and consumes at most one
callback after exact scheme/host/path/query/state validation. A mismatch invalidates the attempt;
the verifier, state, and code are not `Codable` and are never written by the package.

Token, refresh, and revoke builders emit only the reviewed sorted JSON fields plus
`X-CastingCompass-API-Version: 1` and `Content-Type: application/json`. Their public request
description is redacted. The provided ephemeral session configuration has no cookie store,
credential store, URL cache, or ambient headers. The package contains no network scheduler, so a
SwiftUI integration must explicitly create and dispatch each request.

An actor serializes refresh and sign-out state. A successful exact token response is checked for
the fixed bearer type, ten-minute access lifetime, bounded remaining refresh lifetime, exact
scope, distinct 43-character credentials, and no unknown or duplicate keys. The pair and its
expiries are stored in one non-synchronizing `WhenUnlockedThisDeviceOnly` Keychain item, so a
rotation cannot expose a mixed old/new pair. Before a refresh or revoke request is returned for
dispatch, that item becomes a non-secret in-flight marker; a crash or second actor therefore
cannot restore and reuse the predecessor. Cancellation is allowed only before dispatch and
explicitly restores the unchanged pair. Once dispatched, any lost, rejected, malformed, or
family-extending result overwrites the Keychain item with a non-secret `requires_sign_in` marker
and makes both prior credentials unusable locally.
Sign-out accepts only exact `{"revoked":true}` evidence; an ambiguous result still destroys local
authority but remains explicitly unconfirmed remotely.

This core is not an app and does not call `ASWebAuthenticationSession`, dispatch network traffic,
configure a provider, sign a build, or establish physical-device behavior.

## Activation gates

All of the following remain required:

1. Apply migration `0021` through the guarded release sequence and prove four empty tables, eight
   indexes, zero rows, and no foreign-key violations.
2. Preserve and independently review the dedicated first-party `/native/authorize` page. It
   validates one exact query envelope, reuses the web sign-in/legal flow, displays the requested
   scopes, calls the same-origin authorization endpoint, verifies the exact callback/state/code
   receipt, strips the sensitive query envelope from browser history after capture, sends no
   referrer, and remains `noindex`. Never ask the app to synthesize a browser cookie or call this
   step invisibly.
3. Install full Xcode, approve the final bundle/client/redirect identity, join the Apple
   Developer Program, and configure App Store Connect signing.
4. Integrate the reviewed Swift core into a signed SwiftUI client with
   `ASWebAuthenticationSession`, explicit ephemeral backchannel dispatch, trip screens, and the
   exact no-success-only operation state machine in [Native trip logger
   boundary](NATIVE-TRIP-LOGGER.md). Do not reimplement token storage or refresh in UI state.
5. Configure an isolated staging Worker/D1/database/client—not production—and run physical-device
   tests for state mismatch, callback replay, code expiry/replay, wrong verifier, lost refresh
   response, refresh reuse, password reset, account deletion, logout, offline recovery, and app
   reinstall.
6. Complete privacy/export-compliance metadata, tester consent/instructions, monitoring,
   cost/rate-limit evidence, rollback, and independent security review.

Until every gate passes, keep `NATIVE_OAUTH_ENABLED` unset or `false`, leave client/redirect
bindings absent, and do not describe CastingCompass as TestFlight-ready.
