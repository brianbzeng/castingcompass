# CastingCompass independent web-release reviewer packet

Status: **repository packet local-ready; staging evidence, legal review, and independent decisions
remain open**

This index is the reproducible reviewer handoff for one exact web candidate. It contains no secret,
provider identifier, private hostname, user information, raw log, authorization packet, or
production evidence. The release owner supplies those items through a separately access-controlled
private evidence directory.

## 1. Immutable identity manifest

The private manifest must record and the reviewer must independently verify:

| Identity | Required value |
| --- | --- |
| Repository | `brianbzeng/castingcompass` |
| Candidate source | one exact 40-character draft-PR head reachable from the official remote |
| Release source | after approval and integration, one exact commit reachable from protected `origin/main` |
| Base | reviewed remote commit from which the candidate was prepared |
| Runtime | Node 22.23.1 and npm 10.9.8 |
| Lock | SHA-256 of `package-lock.json` |
| Inventory | SHA-256 and serial identity of `security/release-sbom.cdx.json` |
| Build | SHA-256 of the release build manifest |
| Artifact | SHA-256 of the deterministic release archive |
| CI | exact candidate check-run URLs/IDs and conclusions |

Do not accept a branch name, PR merge ref, tag without dereferencing it, dashboard label, Worker
name, or local dirty tree as the source identity.

## 2. Clean-checkout reproduction

From a new checkout of the exact pre-review candidate:

```sh
export CANDIDATE_COMMIT=FULL_40_CHARACTER_CANDIDATE_COMMIT
git status --short
test "$(git rev-parse HEAD)" = "$CANDIDATE_COMMIT"
npm ci --ignore-scripts
npm test
npm run lint
npm run typecheck
npm run security
npm run verify:discussion-safety
npm run verify:validation-successor
```

The production release verifier intentionally rejects a branch commit that is not yet reachable
from protected `origin/main`. Do not weaken it for review convenience. After independent approval
and protected-main integration, set `RELEASE_COMMIT` to the exact resulting protected-main commit,
run `npm run verify:release-checkout`, and repeat the complete chain. If integration changes the
commit identity, the reviewer must assess the delta and every artifact/evidence identity must be
rebuilt and rebound.

Build the pre-review artifact to an owner-only directory outside the checkout, using the exact
candidate commit, repository, Node, and npm arguments required by
`scripts/build-release-artifacts.mjs`. Run the same tool in verify mode and compare the manifest,
archive, lockfile, and SBOM identities with the private manifest. Do not reuse it as the production
artifact if protected-main integration changes the commit.

## 3. Threat and control map

Review these source-controlled boundaries together:

- [Threat model and 13-layer control map](THREAT_MODEL.md): trust boundaries, actors, accepted-local
  controls, provider-evidenced controls, open dynamic testing, edge controls, and residual risk.
- [Access-control matrix](ACCESS_CONTROL_MATRIX.md): anonymous, owner, moderator, support,
  operator, scheduled/Queue, AI, and email/security-provider authority.
- `worker/route-policy.ts` and its runtime tests: deny-by-default route classification,
  pre-body authority, object-level predicates, legal/deletion fences, and abuse tags.
- [Security testing](SECURITY-TESTING.md): staging-only authorization, exclusions, safety
  ceilings, evidence minimization, remediation, and independent acceptance.
- [Key custody and encryption](KEY-CUSTODY-AND-ENCRYPTION.md): IAM, secret, encryption, and
  recovery boundaries.

Reviewer decision: Are the threat actors, protected assets, trust boundaries, controls, owners,
residual risks, and monitoring/recovery actions complete and consistent with the exact candidate?

## 4. Production-shaped staging evidence

Reject the packet as incomplete unless the private evidence proves:

- distinct non-production application and stub Workers, hostname, D1, Queue/DLQ, R2 resources as
  applicable, six rate-limit namespaces, synthetic identities, secrets, and access controls;
- no production hostname, binding, data, route, credential, provider request, or public traffic;
- exact direct and durable-Queue configuration receipts bound to exact staging Worker versions;
- signup, login, verification, recovery, trip and legitimate no-catch flows, saved locations,
  place-community preview/continuation, pseudonymous posting/commenting,
  reporting/blocking/moderation, privacy export/deletion, cache/offline/mobile behavior, and
  cross-account refusal;
- authorized load, spike, soak/recovery, failure injection, and security-test results;
- log/trace redaction for sensitive values, including request metadata and provider payloads;
- encrypted backup plus deletion-aware isolated restore; and
- maintenance, rollback, recovery, remediation, and independent retest results.

The repository's local tests and templates do not satisfy this section. See
[Web release readiness](WEB-RELEASE-READINESS.md),
[Isolated staging configuration](ISOLATED-STAGING-CONFIGURATION.md), and
[Authenticated isolated-staging drill](AUTHENTICATED-STAGING-DRILL.md).

Reviewer decision: Is staging isolated, production-shaped for the enabled release surface,
representative enough for the claimed evidence, and free of unresolved material findings?

## 5. D1 migration and drift decision

Current sanitized read-only evidence says the production ledger ends at `0006`, the nullable
`0007` fields exist, and five zero-row tables use incomplete pre-ledger `0010`/`0012` shapes.
The private packet must include the canonical preflight receipt and normalized object fingerprints,
not raw user data.

Review:

1. the immutable checkout and action-specific authorization policy;
2. exact read-only drift-profile, zero-row, and no-inbound-foreign-key verification;
3. `0007` ledger reconciliation;
4. maintenance deployment and all-host verification before `0009`;
5. `0009`, exact allowlisted empty-table reconciliation before `0010`, then `0010`;
6. `0011`, exact allowlisted empty-table reconciliation before `0012`, then `0012`–`0021`;
7. final ledger/schema/index/trigger/idempotency/deletion/privacy/photo/foreign-key postflight; and
8. the continuing-write-freeze, fix-forward, and Time Travel restore boundaries.

The exact commands and stop conditions are in
[Integrated production release](INTEGRATED-RELEASE.md). Raw Wrangler migration application against
the normal migration directory is forbidden because `IF NOT EXISTS` would preserve incompatible
pre-ledger tables.

Reviewer decision: Approve, reject, or require changes to each reconciliation, migration order,
maintenance proof, postflight predicate, and recovery boundary.

## 6. Model and product truthfulness

The live 0–100 score is a relative percentile from one shared, expert-configured hybrid planning/ranking
system with a selected California-halibut, striped-bass, surfperch, or jacksmelt profile. It is not a
catch probability, does not promise fish are present, has no measured
predictive skill, and does not use the repository's undeployed deep-learning research model.
Rockfish is deferred. Trip reports and community content do not train or validate the current
score. Review the public [AI and Forecast Disclosure](../app/ai-disclosure/page.tsx),
[model/data audit](MODEL-AND-DATA-AUDIT-2026-07-28.md), [model card](MODEL_CARD.md), and visible
product labels for consistency.

Reviewer decision: Does every relevant surface preserve those limitations without implying
validated catch performance?

## 7. Legal and UGC-review caveat

Engineering review may check whether the Terms, Privacy Policy, AI disclosure, data-flow
documentation, retention language, community standards, moderation/report/block behavior, and
product behavior are internally consistent. It cannot
determine legal sufficiency or replace an appropriately qualified reviewer. The release owner
must record who performed the final proofreading/review, the version reviewed, required changes,
and acceptance. This engineering packet is not legal advice. Do not put privileged advice or
personal contact information in the repository.

Reviewer decision: Is appropriate legal review recorded for the exact public copy, with any
required changes included in the candidate? Are moderation ownership, escalation/appeal,
retention, DMCA/UGC process, abuse drills, and activation criteria adequately defined?

## 8. Rollback, maintenance, and production authorization

Before approval, verify:

- a source-bound safety-floor Worker and exact normal/maintenance candidate artifacts;
- a current private D1 Time Travel bookmark procedure and deletion-aware restore procedure;
- a verified maintenance page/API hold on every host;
- action-specific two-role authorization for every mutation and deployment;
- alerting, uptime, request-ID tracing, and redacted operator views;
- outer WAF, six Worker rate-limit bindings, Turnstile server verification, and abuse drills; and
- the rule that after `0011`, ordinary traffic cannot roll back to the older schema-writing Worker.

Review approval does not itself execute or authorize production. A separate explicit production
authorization must name the exact approved commit, artifact, actions, evidence, identities,
window, roles, stop conditions, and rollback/fix-forward decision.

## 9. Required reviewer record

Keep the signed/dated decision outside the public repository and record at least:

- reviewer identity, relevant experience, independence/conflicts, scope, and review time;
- exact source, lock, SBOM, build, and artifact identities;
- evidence sections accessed and any access limitations;
- threat/control-map decision;
- access-control decision;
- staging isolation and functional/load/failure/security decision;
- log/trace privacy decision;
- backup/restore/deletion-replay decision;
- D1 drift/migration/maintenance/postflight decision;
- model-truthfulness decision;
- legal-review evidence decision;
- unresolved findings with severity, owner, due date, and retest;
- one final outcome: **reject**, **changes required**, or **ready for separately authorized
  production release**; and
- an explicit statement that no review decision authorizes an automatic deployment.
