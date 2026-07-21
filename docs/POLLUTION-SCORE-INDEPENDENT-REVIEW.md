# Independent review of the pollution-score source boundary

**Status:** handoff prepared; no independent review has been conducted or accepted

This runbook lets two qualified people review the inactive, source-specific boundary in
[`water-quality/pollution-score-source-policy.json`](../water-quality/pollution-score-source-policy.json).
It does not ask reviewers to approve a pollution score. It never authorizes numeric scoring,
runtime collection, a model claim, merge, deployment, provider mutation, or production use.

The first reviewer must be a fisheries or marine ecology methods reviewer. The second must be a
public-health risk-communication reviewer. They must be different people, independent of the
implementation, and able to preserve private evidence of their relevant competence and review.
The machine verifier can enforce distinct pseudonymous review IDs, roles, files, and evidence
digests; it cannot prove identity, qualifications, or independence. The owner must verify those
facts outside Git before treating an accepted receipt as independent-policy-review evidence.

## Private storage boundary

Each reviewer record and its supporting notes must remain outside every repository checkout on
an encrypted, access-restricted volume. Reviewer records must be separate regular files, owned by
the current user, no larger than 64 KiB, with no group or other access (`0600`), and with no
symbolic or hard links. Store competence evidence and substantive review notes separately; only
their SHA-256 digests enter the JSON record.

Never put reviewer names, employers, contact details, credentials, signatures, notes, file paths,
or private records in Git, a pull request, an issue, Codex, analytics, or a public receipt. The
review record uses a random UUID only to enforce separation; it is not a public identity.

## Fixed object under review

Both reviews bind to the exact final receipt head of draft PR `#145`:

- source commit: `9fd337d561056fef5227eb013fa8f7b909f69343`
- policy version: `castingcompass.pollution-score-candidates/0.1.0`
- policy SHA-256: `1061fcffec8283bf48e333a20a58ac8ea77545f5537f1d68685dda267d89d250`

Obtain the full source commit through a channel independent of the review template and confirm it
against the protected repository history. A later policy edit, new source, new meaning, collector,
weight, direction, or activation proposal requires a new protected review; this receipt cannot be
carried forward automatically.

## Review procedure

1. Read the machine policy, its schema, the source-boundary runbook, and the linked primary agency
   material. Review the actual spatial, temporal, quality, claim, and missing-data boundaries; do
   not merely check that the files parse.
2. Preserve private evidence that the reviewer is qualified for the assigned role and compute its
   SHA-256. Preserve the substantive signed/dated review note separately and compute its distinct
   SHA-256. The two reviewers must not reuse an ID, competence digest, or review-note digest.
3. Generate the role-specific template, replace both digest placeholders, and evaluate every
   checklist item. An honest rejection is valid: use `changes_required`, record a positive
   `blocking_finding_count` or at least one `false` check, and preserve the findings privately.
4. Use `accepted_boundary` only when every checklist item is `true` and the blocking finding count
   is zero. Acceptance means only that the inactive source/meaning boundary is adequate at the
   fixed commit; it does not admit a data source or satisfy any activation gate.
5. Run the verifier with both private files and the independently confirmed commit. Review its
   minimized stdout receipt before preserving it in the private owner record.

Generate one template per reviewer:

```sh
npm run template:pollution-score-fisheries-review > /PRIVATE/PATH/fisheries-review.json
npm run template:pollution-score-public-health-review > /PRIVATE/PATH/public-health-review.json
chmod 600 /PRIVATE/PATH/fisheries-review.json /PRIVATE/PATH/public-health-review.json
```

The template deliberately starts with `changes_required`, one blocking finding, and every check
false. Passing review is a human evidence decision, never a template default.

## Verification

```sh
export POLLUTION_FISHERIES_REVIEW_FILE=/PRIVATE/PATH/fisheries-review.json
export POLLUTION_PUBLIC_HEALTH_REVIEW_FILE=/PRIVATE/PATH/public-health-review.json
export POLLUTION_REVIEW_EXPECTED_SOURCE_COMMIT=9fd337d561056fef5227eb013fa8f7b909f69343
npm run verify:pollution-score-independent-review
```

The verifier makes no network, provider, model, database, or write request. It validates canonical
JSON, the strict schema, private file safety, the exact source commit and policy digest, role and
reviewer separation, evidence-digest separation, review time, disposition semantics, and every
checklist item. A valid changes-required record produces a truthful incomplete receipt instead of
being discarded.

The public-safe receipt contains only fixed policy identity, role-level dispositions, aggregate
completion, and false authority boundaries. It excludes review IDs, competence/review digests,
reviewer identity, findings, private paths, and notes. Even when both reviewers accept the boundary,
all of these remain `false`:

- runtime collection authorization
- numeric score authorization
- catch-probability, water-contact-safety, and seafood-safety claim authorization
- merge authorization
- deployment authorization
- production authorization

## Work that remains after an accepted review

An accepted boundary review only closes the two-discipline review of the inactive source policy.
Any future pollution-related fishing-quality component still requires a distinct target and
mechanism, licensed/current source access, frozen measurement semantics, preregistered baselines and
held-out validation, representative evidence with uncertainty, outage/conflict tests, a separate
disabled-by-default implementation, CodeQL against protected `main`, staged rollback/drift evidence,
and guarded deployment. Official water-contact and fish-consumption advice remains authoritative.
