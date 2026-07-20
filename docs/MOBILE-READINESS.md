# Mobile and API compatibility boundary

Last reviewed: **2026-07-20 UTC**

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

## Authentication boundary

The current web application continues to use same-origin, secure, host-only, HttpOnly session
cookies with server-side authorization. Credentials and session tokens must not be placed in
`localStorage`. A native client is not authorized for release yet. Before any native release, use
an authorization-code flow with PKCE, short-lived access tokens in OS-protected storage, rotated
refresh tokens, server-side revocation, and the existing owner/role checks. Do not embed a shared
secret in an app binary and do not reinterpret the browser cookie flow as a native-token design.

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
npm run security:mobile-readiness
npm run typecheck
npm run lint
npm test
npx playwright install --with-deps chromium webkit
npm run test:mobile
```

The policy verifier fails closed if the runtime order, version/header constants, shared contracts,
safe-area variables, WebKit project, CI browser installation, or offline/safe-area browser tests
drift from the reviewed contract.

## Still open

- Isolated staging, production bindings, release rehearsal, and physical iOS/Android acceptance.
- A reviewed native-client API surface and the PKCE/token lifecycle described above.
- Production performance, cache, queue, cost, rate-limit, and failure-mode evidence at approved
  scale; repository safeguards alone cannot establish provider capacity.
- Provider configuration and deployment evidence. This repository change intentionally performs
  no Cloudflare, DNS, queue, database, or production mutation.
