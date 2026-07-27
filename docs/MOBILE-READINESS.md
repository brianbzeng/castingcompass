# Mobile and API compatibility boundary

Last reviewed: **2026-07-26 UTC**

This document defines the repository controls for mobile web clients and future native clients.
It does not authorize a production deployment, claim native-app readiness, or replace an isolated
staging exercise. The last accepted provider reconciliation found the Worker active with
unresolved source/configuration drift; production changes remain on hold until the separate
release gates pass.

## API compatibility contract

- Every `/api/` response is hardened centrally with
  `X-CastingCompass-API-Version: 1`, including errors, redirects, and maintenance responses.
- Existing first-party browser clients may omit the request header and remain compatible.
- A client that sends `X-CastingCompass-API-Version` opts into exact negotiation. Any value other
  than `1`—including duplicated or comma-joined values—receives a no-store `400` error before rate
  limiting, body reads, authentication, route handling, database access, or provider work.
- `/api/health` also exposes `apiCompatibilityVersion` for non-sensitive discovery.
- A breaking request/response change requires a new compatibility value, documented migration and
  overlap plan, updated policy/tests, and a separately reviewed release. Adding a compatibility
  header is not permission to make an undocumented breaking change.

The machine-readable source of truth is
[`security/mobile-api-policy.json`](../security/mobile-api-policy.json). The shared data contracts
currently include the model-run, observation, opportunity, and taxon schemas in `contracts/`.
Those schemas do not imply that every Worker response is already suitable for a native SDK.
The first narrow native write surface is separately frozen in
[`security/native-trip-client-policy.json`](../security/native-trip-client-policy.json) and
[Native trip logger boundary](NATIVE-TRIP-LOGGER.md).

## Authentication boundary

The current web application continues to use same-origin, secure, host-only, HttpOnly session
cookies with server-side authorization. Credentials and session tokens must not be placed in
`localStorage`.

The server now implements a separate, default-off native public-client boundary:
authorization code with exact client and redirect matching, PKCE `S256`, five-minute one-use
codes, ten-minute access tokens, 30-day rotating refresh families, hash-only database storage,
family-wide revocation on refresh reuse, explicit idempotent revocation, narrowly declared
`profile:read` and `trips:write` scopes, and the same owner/legal/deletion-fence predicates used
by the web app. Redirect protocols are positively limited to `https:` and the dedicated
`castingcompass:` app scheme. A cookie and bearer credential may never be mixed. The code contains
no client secret because an installed app cannot keep one.

The first-party `/native/authorize` page now validates one exact query envelope, reuses the
existing browser sign-in/legal flow, describes the narrow scopes, calls only the same-origin
authorization endpoint, verifies the exact callback base/code/state receipt, and is `noindex`.
This implementation is still not native-release authorization. The native client must use
`ASWebAuthenticationSession` (not an embedded web view), bind high-entropy state to its PKCE
verifier, store refresh/access credentials only in the iOS Keychain, recover from a lost refresh
response by signing in again, and prove revocation on physical devices. The exact endpoint and
activation contract is in [Native iOS authentication](NATIVE-IOS-AUTH.md).

## Mobile web coverage

- `viewportFit: "cover"` is declared in the root layout.
- Four inset variables cover top, right, bottom, and left safe areas. Sticky navigation, fixed
  banners, detail sheets, and account/trip/respect/editor modal layers consume those variables.
- `100vh` fallbacks remain where appropriate and dynamic `dvh` sizing bounds modern mobile
  browser surfaces.
- Playwright runs the mobile/offline/recovery suite on three Chromium viewports and one WebKit
  iPhone viewport in hosted CI. The suite includes deterministic simulated-inset geometry checks;
  browser emulation is evidence, not a substitute for later physical-device acceptance.
- Offline mutations remain paused and explicit. They never replay automatically, and ambiguous
  mutation results use status/receipt checks or an idempotent retry path.

## Verification

```sh
npm run security:native-trip-client
npm run security:native-ios-core
npm run security:mobile-readiness
npm run typecheck
npm run lint
npm test
npx playwright install --with-deps chromium webkit
npm run test:mobile
swift build --package-path native/ios/CastingCompassNativeCore -c release
swift run --package-path native/ios/CastingCompassNativeCore CastingCompassNativeCoreCheck
```

The policy verifier fails closed if the runtime order, version/header constants, native
lifetimes/scopes/configuration/migration, shared contracts, safe-area variables, WebKit project,
CI browser installation, or offline/safe-area browser tests drift from the reviewed contract.

## Still open

- Isolated staging, production bindings, release rehearsal, and physical iOS/Android acceptance.
- A signed SwiftUI client integrating the reusable Keychain/request/recovery/persistence core,
  the reusable PKCE/token/session core, `ASWebAuthenticationSession` with the reviewed browser
  handoff, explicit dispatch through the provided ephemeral credential-free API configuration,
  isolated-staging configuration, and physical-device PKCE/rotation/revocation and response-loss
  acceptance.
- Production performance, cache, queue, cost, rate-limit, and failure-mode evidence at approved
  scale; repository safeguards alone cannot establish provider capacity.
- Provider configuration and deployment evidence. This repository change intentionally performs
  no Cloudflare, DNS, queue, database, or production mutation.
