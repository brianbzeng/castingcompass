# CastingCompass web release readiness

Status: **blocked before independent review by absent isolated staging Workers, private access
boundary, and exercise evidence**

Evidence reconciled: **2026-07-28 UTC**

This is the prioritized, evidence-backed checklist for the next web release. A repository
control is complete only when an executed check proves it. Prose, a template, an unchecked
provider dashboard, or an owner expectation is not completion evidence. Private receipts,
resource identities, authorization records, and test output stay outside the repository.

The intended stopping point is one immutable candidate commit and a complete private evidence
packet ready for an experienced independent reviewer. Nothing in this document authorizes a
schema-changing production migration, Worker deployment, route or domain change, public traffic,
or production-control activation.

## Status vocabulary

- **complete** — current executed evidence proves the stated boundary.
- **local-ready** — repository implementation or a non-executing template passes, but external
  evidence is still required.
- **blocked** — a required external resource, access boundary, or qualified person is absent.
- **review-gated** — documented now, but execution is forbidden before independent review and
  explicit release authorization.

## Current evidence summary

| Boundary | State | Current evidence |
| --- | --- | --- |
| Reviewed source baseline | complete | Remote `main` at the start of this preparation was `ac7e67b90450f28322efedec9f64bf14a3026396`; its required GitHub checks succeeded and open Dependabot, code-scanning, and secret-scanning alert counts were zero |
| Candidate source | complete | The exact 40-character draft-PR head is bound by the private reviewer manifest; a branch name, mutable PR ref, or working tree is not a release identity. It is not production-eligible until independent review and protected-main integration preserve or replace that identity |
| Locked dependencies | complete | Exact Node 22.23.1, npm 10.9.8, `npm ci --ignore-scripts`, checked-in npm/Python locks, deterministic SBOMs, and zero npm audit findings passed on the baseline |
| Local release path | complete | The production-shaped Vinext build and the complete Node test suite passed; lint, typecheck, and the repository security chain passed |
| Development runtime | partial | The earlier duplicate-React `useContext` failure was not reproduced in a fresh dev run; a browser extension caused a separate hydration warning. The earlier failure is not declared fixed, and the production build remains the release path |
| Live Worker configuration | blocked | Read-only provider evidence found one active version at full traffic with maintenance off, missing release variables, missing all six rate-limit bindings, and no source-commit binding |
| Isolated staging | partial | One empty isolated-staging D1 database and the expected Queue/DLQ were later provisioned and privately evidenced. No application Worker, internal AI stub Worker, private hostname, access policy, secret, R2 bucket, deployment, route, synthetic account, or staging exercise exists |
| Production D1 | partial | Read-only primary preflight found ledger entries `0000`–`0006`, the expected `0007` columns, and five empty tables from incomplete pre-ledger `0010`/`0012` shapes. Guarded fingerprint-and-empty-table reconciliation is local-ready but unexecuted |
| Legal pages | blocked | The public copy was professionally revised as version `2026-07-27.1`, uses a role-based support address and category-based external-service disclosures, and passed engineering consistency/model-truthfulness checks. Proofreading and review by an appropriately qualified person remain open; this repository does not provide legal advice |
| Independent reviewer | blocked | An experienced independent reviewer has not yet been selected |

## A. Freeze and verify the candidate

- [x] **complete:** Freeze the final repository state as one exact 40-character draft-PR head,
  record it in the private manifest, and prove the checkout is clean and matches it.
- [x] **complete:** Run `npm ci --ignore-scripts`, `npm test`, `npm run lint`,
  `npm run typecheck`, and `npm run security` from a clean checkout of that exact candidate.
- [ ] **review-gated:** After independent review and protected-main integration, identify the exact
  resulting release commit and run `npm run verify:release-checkout`. The verifier intentionally
  rejects a pre-review branch commit that is not yet reachable from protected `origin/main`. If
  integration changes the commit identity, rebuild and rebind every check and artifact before
  production authorization.
- [x] **complete:** Build and verify the deterministic release archive outside the repository.
  Record source commit, `package-lock.json` SHA-256, release-SBOM identity, build manifest
  SHA-256, and archive SHA-256.
- [ ] **external evidence required:** Confirm all required GitHub checks for the exact candidate
  succeed and recheck Dependabot, code-scanning, and secret-scanning alerts. Baseline-main green
  evidence does not automatically prove a later candidate.
- [x] **complete:** Dependency versions remain lockfile-controlled; fresh install scripts are
  disabled by policy and the accepted install executed zero lifecycle scripts.

## B. Production-shaped isolated staging

- [ ] **partial:** The empty isolated D1 and Queue/DLQ exist and have private identity evidence.
  Provision the separate application/stub Workers, R2 only where needed, six rate-limit
  namespaces, secrets, access controls, synthetic accounts, and a private non-production
  hostname only after the review gate. Do not reuse a production identity or any real user data,
  and do not route public traffic.
- [ ] **blocked:** Verify both resolved staging manifests and bind their hashes to exact deployed
  staging Worker versions using
  [Isolated staging configuration](ISOLATED-STAGING-CONFIGURATION.md).
- [ ] **blocked:** Exercise signup, login, verification, recovery, trip creation/completion,
  legitimate no-catch reporting, saved locations, direct and queued privacy export, account
  deletion, cache behavior, offline recovery, and mobile behavior with synthetic data.
- [ ] **blocked:** Run authorized load, spike, soak/recovery, dependency-failure, storage-failure,
  lost-response, and duplicate-delivery tests against staging only.
- [ ] **blocked:** Run the authorized staging security plan and independently triage, remediate,
  and retest evidence-backed findings. Never aim these tests at production.
- [ ] **blocked:** Inspect structured logs and traces and prove they contain no email addresses,
  tokens, notes, private locations, request bodies, authorization headers, cookies, provider
  payloads, object keys, or other sensitive values.
- [ ] **blocked:** Exercise encrypted backup creation plus deletion-aware isolated restore,
  including tombstone replay before restored data can receive traffic.
- [ ] **blocked:** Exercise the maintenance page, direct-host hold verification, rollback to the
  recorded staging version, and recovery after injected failure.

Repository policies and templates for these exercises are **local-ready**, not staging evidence.

## C. Private review and release evidence

- [x] **complete:** Private evidence rules prohibit secrets and sensitive raw evidence from source
  control; authorization templates are exclusive owner files outside the repository.
- [x] **local-ready:** The
  [independent reviewer packet](WEB-RELEASE-REVIEWER-PACKET.md) maps the threat model, access
  controls, migrations, tests, known limitations, model disclosure, legal caveat, rollback, and
  required reviewer decisions.
- [x] **local-ready:** Clean-checkout reproduction and deterministic artifact commands are
  documented without embedding mutable refs or provider credentials.
- [ ] **blocked:** Add the completed staging evidence manifest, sanitized receipts, remediation
  record, and independent staging acceptance to the private packet.
- [ ] **blocked:** Obtain appropriate review and proofreading of the public legal pages.
- [ ] **blocked:** Obtain an experienced independent reviewer and their explicit recorded
  decisions. Repository authorship is not independent acceptance.

## D. Read-only production readiness

- [x] **complete:** The current Worker version/configuration audit ran read-only and produced a
  sanitized private receipt; it found the blockers summarized above.
- [x] **complete:** Primary-D1 ledger, schema names, normalized schema fingerprints, zero-row drift
  predicates, and foreign-key violations were queried read-only. No user rows or sensitive
  values were retained.
- [x] **local-ready:** The guarded preflight now recognizes only the exact known empty drift
  profiles and refuses every DDL, row-count, ledger, foreign-key violation, or inbound
  foreign-key-reference mismatch.
- [x] **local-ready:** The exact command to obtain and privately store a D1 Time Travel bookmark
  immediately before schema work is documented in
  [Integrated production release](INTEGRATED-RELEASE.md). It has not been run as release
  authorization and no bookmark is committed.

## E. Review-gated production release procedure

Every item below is **review-gated** and unexecuted:

- [ ] Record the fresh private D1 Time Travel bookmark immediately before schema change.
- [ ] Reconcile `0007`, deploy and verify the maintenance Worker at full traffic, apply `0009`,
  then reconcile the exact empty pre-ledger `0010` drift before applying `0010`.
- [ ] Apply `0011`, reconcile the exact empty pre-ledger `0012` drift, and apply `0012` through
  `0020` individually with action-specific authorization while verified maintenance remains on.
- [ ] Prove the exact ledger, indexes, foreign keys, deletion tables, triggers, idempotency
  fields, photo-reservation fields, empty default-off tables, and zero foreign-key violations.
- [ ] Deploy the exact independently reviewed artifact with maintenance off.
- [ ] Enable and test all six Worker rate-limit bindings; separately configure outer Cloudflare
  WAF rules for account entry, email, trip writes, privacy operations, and general API abuse.
- [ ] Enable Turnstile only after server-side action/hostname verification is evidenced on
  protected account forms.
- [ ] Configure redacted log views, error and D1 alerts, uptime monitoring, and request-ID tracing.
- [ ] Attach the public domain only after the exact Worker version and full-traffic state are
  verified.
- [ ] Run live smoke tests on the apex, `www`, and direct Worker hosts; recheck DNS, TLS,
  redirects, headers, cache behavior, maintenance state, and health endpoints.

The detailed sequence, stop conditions, and fix-forward boundary are in
[Integrated production release](INTEGRATED-RELEASE.md). The safety-floor Worker is not a valid
normal-traffic rollback after migration `0011`.

## Model and legal truthfulness

The live score is a hybrid planning/ranking model that produces a relative rank. It is not a catch probability,
does not prove fish are present, and does not use the repository's undeployed deep-learning
research model. No staging or release artifact may weaken that disclosure.

The public Terms, Privacy Policy, and AI disclosure have an engineering consistency baseline only.
Their substantive legal sufficiency, jurisdictional applicability, and final wording require
appropriate human review. Nothing in the release packet is legal advice.

## Exact external unblock request

Before this candidate can be called ready for independent review, the owner or authorized
infrastructure operator must provide the remaining isolated staging Workers, private hostname and
access boundary, secrets, synthetic accounts, and resolved configuration evidence required by
[Isolated staging configuration](ISOLATED-STAGING-CONFIGURATION.md), without sending secrets or
resource identifiers through source control. The owner must also identify an experienced
independent reviewer and arrange appropriate legal-page review. Previously completed setup does
not need to be repeated.
