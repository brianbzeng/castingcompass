# Native trip logger boundary

Status: server contract plus reusable Swift collection, auth-session, one-shot transport, and
dispatch coordinator cores implemented locally; SwiftUI client, staging, device acceptance, and
activation remain open.
Last reviewed: **2026-07-26 UTC**

This document defines the smallest safe trip-collection surface for the first CastingCompass iOS
client. It does not authorize TestFlight, staging, production, a validation pilot, model training,
or a score change. The machine-readable source of truth is
[`security/native-trip-client-policy.json`](../security/native-trip-client-policy.json), validated
against [`contracts/native-trip-client.schema.json`](../contracts/native-trip-client.schema.json).

## Collection scope

The initial client supports one live California-halibut-targeted attempt at one curated site. It
uses only shore, beach, pier, or jetty mode. A complete terminal report records the angler count,
mode, keeper halibut, short/released halibut, unresolved other-fish count, the pre-trip
score-influence answer, consent, and confirmation that the record covers the whole attempt.
Zero-catch and non-target-only attempts are first-class outcomes. Photos, notes, and exact private
GPS are neither required nor part of the first client contract.

The client must not expose server-controlled observation, taxon, model, score, or evidence fields.
The Worker derives the observation contract and outcome class after validating the narrow input.
Before a separately reviewed pilot is activated, reports remain ordinary private product
observations and cannot be promoted retroactively into pilot or confirmatory evidence.

The Worker also enforces the native field set from the authenticated request authority, not only
from the official Swift builder. A handcrafted native bearer request cannot add browser-only free
text, photo, gear, legacy forecast, or study-enrollment fields. Browser study enrollment remains a
separate contract: malformed consent is rejected, consent metadata without explicit study consent
is rejected, and an explicit enrollment request receives `validation_pilot_unavailable` rather
than silently becoming an ordinary product observation while the pilot is off. An already
committed pilot start may still return its exact idempotent receipt after deactivation, but the
same request identity cannot cross between ordinary-product and pilot enrollment.

## Request identity and authority

Every request opts into `X-CastingCompass-API-Version: 1`, sends one native bearer access token,
and sends no `Cookie` or `Origin` header. The server derives the account from that token and
requires `trips:write`.

Before starting, the app generates and durably preserves:

- `clientTripId`: `trip_` plus a lowercase UUID v4;
- `requestToken`: 32 cryptographically random bytes encoded as 43-character base64url; and
- `reporterKey`: a separate 32-byte, 43-character base64url device secret stored in Keychain.

The reporter key is not a substitute for account authorization. It binds start and completion to
the same device principal in addition to the authenticated account. It must never be placed in
`UserDefaults`, application databases, analytics, crash reports, or logs.

## Operations

`POST /api/trips/start` uses JSON and requires the exact client trip ID, request token, reporter
key, curated site ID, current UTC start time, angler count, mode, score-influence answer, primary
target confirmation, and consent. A live start is online-only: the server binds its receipt time
and rejects a submitted start more than 90 seconds away. The app may show an unsent draft while
offline, but it must not show an active server trip until it receives:

```json
{
  "receipt": {
    "operation": "start",
    "tripId": "trip_..."
  }
}
```

`POST /api/trips/{tripId}/complete` uses multipart form data, even when no photo is present. It
requires the same request token and reporter key, angler count and mode, the immutable
score-influence answer, halibut retained/released counts, other-fish count, consent, target
confirmation, and whole-attempt confirmation. `otherSpecies` and method are optional. The server
derives all observation fields and returns an exact `complete` receipt.

`POST /api/trips/{tripId}/cancel` uses JSON with the request token and one safe reason: `weather`,
`water_safety`, `access`, `health`, `personal`, or `other`. Cancellation is not a no-catch record.
The same request may be retried after a lost response and returns an exact `cancel` receipt without
mutating the already-terminal row again.

For native bearer requests, all three successful operations and their idempotent retries return
exactly one top-level `receipt` field: start uses HTTP 201; complete and cancel use HTTP 200.
Browser-cookie callers retain their existing richer trip/token/cancellation response and
Set-Cookie behavior. This split prevents a real committed native write from being misclassified
as unreadable merely because browser-only fields accompanied its receipt.

Native start, completion, and cancellation are independently checked against the exact required
plus optional fields in the machine policy. Unknown or browser-only fields fail before any trip
mutation. This server check is required even though the typed Swift plans cannot construct those
fields, because a modified client must not be able to widen collection or opt into a study.

## Durable recovery

Each operation is one immutable local envelope with four possible states: `draft`,
`pending_submission`, `confirmed`, or `needs_user_attention`.

- Only an exact server receipt with the expected operation and trip ID permits `confirmed`.
- A timeout, connection loss, app suspension, or undecodable response preserves the exact
  envelope as `pending_submission`; it never produces optimistic success.
- Retry is explicit and reuses the identical trip ID, request token, reporter key, body, and
  terminal outcome. The app never creates a replacement identity for an ambiguous write.
- A conflict, mismatched receipt, changed local envelope, or rejected identity stops automatic
  work and becomes `needs_user_attention`.
- Network restoration may notify the user but must not silently replay writes.

The server currently treats receipt time as the authoritative completion time. An offline terminal
draft may be preserved and submitted later, but that recovered record must be excluded from
duration-sensitive or confirmatory analysis until a separately reviewed temporal-support contract
exists. The UI must disclose the pending state and may not imply that the original finish time was
server-attested.

The reusable package at `native/ios/CastingCompassNativeCore` now implements this recovery
boundary without a UI or network scheduler. It generates the frozen trip/token formats, keeps
reporter and request material in `WhenUnlockedThisDeviceOnly` Keychain slots with synchronization
disabled, and persists only a typed non-secret plan, credential references, and exact request
hashes. JSON encoding is sorted and byte-stable; no-photo multipart completion uses a deterministic
boundary and fixed field order. Protected durable files are atomic, backup-excluded, bounded,
owner-only on macOS, and `completeFileProtection` on iOS. Restoration
rematerializes the exact request from Keychain and refuses a retry if its body, route, or content
type differs. A confirmed restored state is bound to the exact receipt hash. Unknown or duplicate
receipt keys, changed request bytes, mismatched receipts, conflicts, rejection, and unreadable
responses fail closed. Ambiguous transport remains pending, and only an explicit identical-body
retry is available.

The package also implements the one-shot trip dispatcher. It materializes the exact request and
Bearer header only in memory, saves the draft and `pending_submission` record before dispatch,
uses an origin-pinned ephemeral session with no cookie/credential/cache stores, rejects redirects,
bounds the response while streaming, and sends once. Exact operation-specific status and receipt
confirm; transport/5xx ambiguity remains pending; conflict, definite 4xx rejection, malformed
success, or mismatched receipt needs attention. A signed-out draft remains durable and can resume
after authorization. There is no automatic replay, retry loop, timer, reachability callback, or
background scheduler.

The package builds locally with Apple command-line tools and its dependency-free executable
recovery/dispatch check passes. The XCTest source parses locally, but execution is unavailable
because full Xcode is not installed; the path-scoped hosted macOS workflow runs the release build,
XCTest suite, and executable check after a pull request exposes the workflow on the default
branch. Neither check is application, staging, signing, or physical-device evidence.

## Remaining release gates

Before TestFlight, integrate the reviewed recovery/Keychain/request/persistence, PKCE/token,
one-shot transport, and coordinator cores into a SwiftUI application; connect the browser handoff
through `ASWebAuthenticationSession`; configure a production-disjoint staging Worker and D1
database; and test start/completion/cancellation response loss on a physical device. Also prove logout,
refresh-family loss, password reset, account deletion, app reinstall, accessibility, privacy
metadata, monitoring, rate limits, rollback, and independent security review. Keep native OAuth
disabled and all TestFlight/production authority false until those gates pass.
