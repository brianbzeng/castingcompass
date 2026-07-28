# Open pull-request integration audit

Evidence refreshed: **2026-07-28 UTC**

Reviewed remote: `brianbzeng/castingcompass`

Reviewed base: `origin/main` at `ac7e67b90450f28322efedec9f64bf14a3026396`

## Current remote evidence

- Eleven pull requests were open.
- Required main checks are `api`, `pipeline`, `web`, `dependency-review`, and `CodeQL`; strict
  protected-branch checking and administrator enforcement are enabled.
- The latest main CI, CodeQL, release-provenance, advisory-watch, optional-Python, and API-image
  runs on the reviewed head succeeded.
- Open Dependabot security, code-scanning, and secret-scanning alert counts were all zero.

This audit does not close, merge, rebase, or otherwise mutate any existing pull request.

## Disposition

| PR | Scope/state at audit | Candidate disposition | Reason |
| ---: | --- | --- | --- |
| #189 | Draft web release reviewer gate; clean checks | **Integrated intentionally** | Both source commits were cherry-picked. The guarded release/legal foundation remains useful, while this candidate updates the legal version, migration sequence, model disclosure, and community/UGC review gates. |
| #188 | Draft public-only RecFIN request; clean checks | **Integrated intentionally** | Its single source commit was cherry-picked to preserve the non-confidential/public-data-only acquisition boundary. No request was sent. |
| #187 | Native system-browser sign-in, stacked on #186; clean checks | **Leave aside** | It is native/iOS work based on another open branch, outside this model/community web phase. |
| #186 | Native trip collection core; remote merge state blocked although checks shown were successful/skipped | **Leave aside** | Large native/OAuth/migration scope conflicts with this phase's web/community `0021` migration identity and would materially widen the candidate. |
| #185 | Frozen shared model-input contract; clean checks | **Integrated intentionally** | Both source commits were cherry-picked. They establish the future candidate-neutral data/leakage boundary used by this phase's model audit. |
| #184 | Default-off native PKCE foundation; clean checks | **Leave aside** | Native OAuth and its own `0021` migration are outside this phase and conflict with the place-community migration number. It requires a separate integration decision. |
| #175 | Dependabot `globals` major update; behind; one or more checks failing | **Leave aside** | Independent toolchain major update with failing/stale evidence; unrelated to the product candidate. |
| #169 | Dependabot MapLibre major update; behind; one or more checks failing | **Leave aside** | Major runtime/map dependency change with failing/stale evidence would add unrelated visual and performance risk. |
| #162 | Dependabot `actions/setup-python` major update; behind; no failing conclusion shown | **Leave aside** | Workflow-only major upgrade is unrelated and should be reviewed on its own refreshed branch. |
| #161 | Dependabot `setup-uv` major update; behind; one or more checks failing | **Leave aside** | Workflow-tool major update with failing/stale evidence is unrelated. |
| #159 | Dependabot Python 3.14 container update; behind; one or more checks failing | **Leave aside** | Runtime-major container change with failing/stale evidence is unrelated to the web/model/community candidate. |

## Integration record

The candidate branch preserves these exact source-to-candidate integrations above the reviewed
main base:

| PR | Source commit | Candidate commit | Subject |
| ---: | --- | --- | --- |
| #185 | `d5541f6` | `5c4a8de` | Freeze shared model input contract |
| #185 | `54e818b` | `ced77d2` | Harden model contract review boundaries |
| #188 | `f01d8f8` | `9d71b56` | Limit RecFIN request to public data |
| #189 | `982c704` | `d5817b6` | Prepare web release reviewer gate |
| #189 | `d5a19da` | `0777adf` | Revise public legal and support copy |

The candidate hashes differ because the source commits were replayed onto one clean integration
branch with privacy-safe no-reply metadata. Subjects and content preserve review provenance; this
mapping makes the relationship independently inspectable without relying on historical local
cherry-pick hashes.

## Conflict and supersession notes

- PRs #184 and #186 both introduce a different migration named `0021`. They are not silently
  superseded or rejected; they need an explicit future migration renumbering/integration review
  if their native work proceeds.
- PR #189's release-readiness intent is preserved, but this candidate supersedes its exact public
  legal/model/product copy and extends the guarded migration sequence through the
  place-community migration.
- PR #185's future supervised California-halibut input contract remains separate from the new
  four-target expert-configured planning profiles. Integration does not claim that PR #185
  supplied training labels or model performance.
- None of the Dependabot PRs is needed to reproduce this candidate; dependency and workflow
  modernization remains deliberately separable.

## Single-candidate rule

Only the `codex/model-community-20260728` integration branch is intended to become the draft
engineering-review candidate for this phase. Existing PRs remain open and unmodified so no work
is discarded without a separate evidence-backed decision.
