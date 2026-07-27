# Santa Barbara and Goleta exploratory collection

**Status:** frozen local plan; not activated; no TestFlight, collection, model, score, staging,
production, or deployment authority

The machine-checked plan at
[`model/collection/santa-barbara-goleta-exploratory-v1.json`](../model/collection/santa-barbara-goleta-exploratory-v1.json)
defines the first narrow use of a future native trip logger. Its only question is whether invited
anglers can reliably complete a private, prospective trip workflow—including skunks and
non-target-only attempts—without unnecessary location or identity collection.

This is deliberately not a model experiment. It cannot measure whether the current score or any
candidate predicts a catch, train or select a model, calibrate a probability, rank locations from
friend reports, change the score, or support a public catch claim. A later confirmatory protocol
must use a separately frozen population and untouched locked test set.

## Frozen collection area

The plan binds the exact current `data/sites.json` bytes and eight public-site IDs:

- Haskell's Beach and Goleta Beach;
- Arroyo Burro and Mesa Lane Steps;
- Leadbetter Beach and Santa Barbara Harbor Breakwater; and
- Stearns Wharf and East Beach.

The app records the curated site ID, not a friend's exact fishing coordinates. A site being in
the plan does not establish current access, safety, legal fishing, water quality, or fishing
quality. Current official restrictions and posted signs still control, and a safety cancellation
is never recorded as a no-fish result.

## What every invited tester must do

Use this instruction without success-oriented wording:

> Start the logger before every California-halibut-targeted attempt at one of the listed sites,
> even when you expect the trip to be unproductive. End or safely cancel every started attempt.
> Report a halibut encounter, non-target fish only, or no fish truthfully. Do not submit only
> catches, and do not add another person's private location or identity.

The minimal start records one random client trip identity, one idempotency key, site, server-bound
start time, angler count, mode, target confirmation, score-influence answer, and consent version.
Completion records the server-issued trip token, end time, complete-attempt confirmation, target
confirmation, halibut encounter/retained/released counts, other-fish count, and identification
confidence. Notes and photos are optional product fields and are excluded from analysis/model
exports.

## What may be inspected

After a separately reviewed activation precedes the first designated row, the trial may inspect
only workflow evidence:

- started-attempt reconciliation and complete-attempt rates;
- missing, duplicate, and ambiguous-write rates;
- participant concentration and coverage by site, mode, and time;
- the three outcome-class counts without score stratification; and
- withdrawal/deletion reconciliation.

No preactivation report may be promoted retroactively. Until activation, every report remains an
ordinary private product observation.

## Activation checklist

Keep the plan closed until all of these are evidenced:

1. The default-off native authorization-code/PKCE server boundary is reviewed and merged.
2. Full Xcode, Apple Developer/App Store Connect access, the final bundle/redirect identity,
   signing, privacy metadata, export-compliance answers, and physical-device acceptance exist.
3. The client stores tokens only in Keychain, uses the system browser, performs single-flight
   refresh, revokes on logout, and reconciles ambiguous/offline writes from authoritative server
   state.
4. An isolated staging Worker, D1 database, credentials, monitoring, rate limits, and rollback
   path are verified without production data or bindings.
5. Privacy, legal, and data-steward reviewers accept the exact consent, minimization, retention,
   export, withdrawal, and deletion behavior.
6. Staging restore and deletion replay pass with synthetic identities and attempts.
7. A separate immutable activation record is sealed before the first designated trip starts.

If any gate is missing, do not activate. The friend can still use the ordinary private product
workflow, but the record cannot become designated exploratory or confirmatory evidence later.
