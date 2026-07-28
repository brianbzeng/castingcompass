# Shared hybrid planning baseline: model and data audit

Evidence date: **2026-07-28 UTC**

Status: **implementation evaluated; predictive and ranking skill not estimable**

## Decision

CastingCompass now uses one shared, explainable planning/ranking contract with a versioned
configuration for each supported target:

- California halibut (`Paralichthys californicus`);
- striped bass (`Morone saxatilis`);
- surfperch (a deliberately disclosed family-level `Embiotocidae` profile); and
- jacksmelt (`Atherinopsis californiensis`).

Rockfish is not included. A generic rockfish target would combine behaviorally different species
and complexes without defensible labels or a primary Bay Area surf-product need.

The baseline is expert-configured and untrained. Its 0–100 output is a relative percentile within
the current candidate windows, subject to a fishability cap. It is not catch probability,
calibrated likelihood, stock abundance, or evidence that fish are present.

## Repository contracts

| Purpose | Source of truth |
| --- | --- |
| Shared features, component weights, target-specific adjustments, source notes, and rockfish deferral | `model/hybrid/species-profiles-v1.json` |
| Browser implementation and target swapping | `app/lib/species-ranking.ts` |
| Independent Python implementation and audit generator | `pipeline/contourcast/hybrid_ranking.py` |
| Machine-readable audit result | `model/evaluation/shared-hybrid-baseline-v1.json` |
| Cross-language deterministic tests | `tests/hybrid-species-ranking.test.mjs` and `pipeline/tests/test_hybrid_ranking.py` |
| Future supervised candidate-input boundary | `model/selection/california-halibut-input-v1.json` and `contracts/model-input-contract.schema.json` |

The browser and Python implementations use the same four weighted components:

1. curated public-place habitat and exposure;
2. a broad configured calendar-month prior;
3. current public tide/condition features; and
4. practical fishability from forecast conditions and access pressure.

No target has a separately trained head. The target-specific material is a versioned configuration
profile over the shared schema and scoring contract.

## Available evidence

The committed evaluation audit reports:

| Evidence | Current value |
| --- | ---: |
| Supported public places | 61 |
| Current two-hour candidate windows | 2,160 |
| Geographic region labels in the catalog | 22 |
| Eligible supervised complete-effort observations | 0 |
| First-party validation gate | closed |
| Public aggregate context usable as a training label | no |

The existing structured observation contract still permits only California halibut as a
production observation target. Product planning for the other three targets does not silently
relabel historical trips or broaden training eligibility. Structured trip logging therefore stays
available only when California halibut is selected.

Public CRFS/RecFIN aggregates are descriptive context, not complete targeted effort segments.
Legacy first-party rows are `legacy_unverified`; moderated summaries, catch-only anecdotes,
community posts, and the legacy public discussion feed are not labels. Synthetic fixtures test
interfaces only and cannot be reported as model performance.

## Leakage and feature-source audit

The shared baseline uses planning-time public data only. It excludes:

- outcomes or post-trip observations;
- account identity, participant history, prior catches, saved places, or gear history;
- the prior public score as an input;
- moderation decisions, reports, community text, or automated-review output;
- future observations or source values that were not available at planning time;
- private/exact locations; and
- restricted-platform content.

Access closures, official advisories, and water-quality actions remain separate safety/suppression
controls rather than positive catch-optimization signals.

When eligible labels exist, preprocessing and feature selection must be fit inside each training
fold. Participant groups may not cross folds, and source snapshots must be retained so a later
value cannot leak into an earlier planning event.

## Evaluation design

The current audit evaluates implementation properties only:

- deterministic output for a fixed snapshot and profile;
- cross-language score agreement;
- bounded scores and fishability caps;
- complete supported-target/profile coverage;
- different target profiles producing meaningfully different orderings; and
- explicit null predictive metrics.

The audit predeclares two complementary holdout families for a future eligible corpus:

- **geographic:** leave one coastal-region group out; and
- **temporal:** forward-chaining calendar-quarter folds (`Q1→Q2`, `Q1–Q2→Q3`,
  `Q1–Q3→Q4`), using only information available at the planning-time cutoff.

When identifiable, ranking evaluation will report NDCG@10, Spearman rank correlation, pairwise
concordance, and top-decile target-encounter rate. Every metric is currently `null`, because zero
eligible complete-effort labels exist. No fabricated, synthetic, or aggregate-data performance
number may replace those nulls.

## Promotion boundary

This evaluated baseline is suitable for experienced engineering and product review as a
reproducible planning configuration. It is not evidence for a trained catch model.

Any future performance or probability claim requires, at minimum:

1. an approved species-specific observation contract and prospective collection protocol;
2. sufficient complete attempts, including non-encounters, with privacy and deletion controls;
3. frozen temporal and geographic partitions before locked outcomes are inspected;
4. baseline and candidate comparison on identical eligible rows and features;
5. calibration analysis for any output described as probability;
6. independent review of data, leakage controls, metrics, and claim language; and
7. a separately approved serving and release decision.
