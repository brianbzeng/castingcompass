# CastingCompass model-selection plan

**Plan:** `california-halibut-model-selection-v1`

**Machine contract:** `castingcompass.model-selection-plan/1.1.0`

**Status:** frozen local template; not preregistered and not authorized to run

The machine-readable plan is
`model/selection/california-halibut-v1.json`. Its strict evaluator is
`pipeline/contourcast/model_selection_plan.py`.

## Why this exists

CastingCompass began with a bathymetric deep-learning research path, but the
official-data probes have not shown that the deep representation beats the
strongest classical structure summaries. That negative result is useful: it
means model choice must be decided by shared evidence rather than by the
original architecture preference.

The local plan now freezes the families that must receive a fair future
comparison:

| Complexity | Candidate family | Current implementation truth |
| --- | --- | --- |
| 0 | Naive prevalence and positive-catch mean | Synthetic-only shared adapter implemented |
| 1 | Regularized linear occurrence and CPUE heads | Synthetic-only shared adapter implemented |
| 2 | Spline/GAM occurrence and CPUE heads | Synthetic-only shared adapter implemented |
| 3 | Random-forest occurrence and CPUE heads | Synthetic-only shared adapter implemented |
| 4 | Histogram-gradient-boosted occurrence and CPUE heads | Synthetic-only shared adapter implemented |
| 5 | Spatial/hierarchical partial-pooling heads | Synthetic-only shared adapter implemented |
| 6 | Bathymetric deep encoder and two heads | Synthetic-only masked site-window adapter implemented; real input contract and eligible target run are open |
| 7 | Predeclared hybrid or ensemble | Conditional only; it needs an outcome-blind complementary-error rationale |

“Every model” means a representative, preregistered family set—not an
unbounded search across every algorithm or hyperparameter. A later protocol
may revise the family inventory before labels or locked-test outcomes are
available, but doing so changes the plan version and evidence identity.

## Current authority

Every execution and release flag in the plan is false:

- no eligible source-separated confirmatory labels exist;
- no separate confirmatory model-selection protocol has been externally
  timestamped;
- target-specific training and benchmark execution are not authorized;
- locked-test access and winner selection are not authorized; and
- the live score, serving path, provider state, and deployment are unchanged.

The current public score remains a heuristic relative ranking. The local plan
does not turn the completed target-agnostic terrain experiments into halibut
accuracy evidence.

The six classical families share a deterministic two-head capability adapter
in `pipeline/contourcast/candidate_models.py`. The deep candidate has a
separate capability adapter in `pipeline/contourcast/deep_candidate.py` that
uses the existing terrain encoder and masked attention over fictional
single- or multiscale patch bags, then fuses that terrain representation with
the exact 39-field shared pre-trip context view. The adapter fits context
normalization on the synthetic training fold only. Both boundaries accept only
a fictional synthetic target and refuse target-specific authority, real
labels, benchmark authority, locked-test access, winner selection, score
changes, serving changes, and deployment. Their existence proves interface
compatibility only; they supply no comparative metric or evidence that any
family is better.

The versioned `california-halibut-model-input-v1` contract now freezes the
pre-label information boundary without opening any labels or running a
benchmark. It binds all seven required candidates to the same eligible rows,
folds, context features, source snapshots, and raw terrain evidence. Classical
candidates receive fold-local summaries of the exact 64 m, 256 m, and 1,024 m
six-channel terrain bags received by the deep candidate; that representation
difference is the only architecture-specific view and grants no candidate a
private upstream source.

The frozen input boundary also forbids outcome, catch, post-trip, identity,
personal-history, score, moderation, future-source, and restricted-platform
features. Missing values retain explicit masks, every transform is fold-local,
and missing or out-of-support terrain causes abstention rather than an invented
neutral value.

Current access closures, regulations, and water-quality actions stay outside
the catch model and run before ranking. Pollution or an advisory can never
increase opportunity merely because fish might still be present. A separately
reviewed safety policy may withhold or clearly downgrade a destination.

## Shared future evidence

All compatible candidates must receive the same eligible rows, frozen input
contract, source-separated development and locked-test data, geographic/time
outer holdouts, participant grouping, fold-local preprocessing, and
development-only inner selection. Pilot rows and `legacy_unverified` rows are
excluded.

The required report includes occurrence discrimination and calibration,
positive-catch CPUE error, opportunity-ranking metrics when identifiable,
abstention, coverage by required slice, and participant/geography-aware
uncertainty. The final primary metrics and materiality thresholds deliberately
remain open until a separate confirmatory protocol can freeze them without
seeing locked-test outcomes.

Each candidate must also report training cost, inference latency, peak memory,
artifact size, platform compatibility, dependency/license risk, operational
complexity, explanation limits, and missing-coverage behavior. A statistically
indistinguishable complex model loses to the simpler model.

## Gates before execution

The input-contract gate is locally complete. The benchmark remains closed until
the other eleven machine-checked gates have evidence, including:

- permitted complete-effort data with confirmed skunk semantics;
- valid target-specific observation contracts and a passed feasibility pilot
  whose rows remain excluded from confirmation;
- an externally timestamped separate confirmatory protocol and activation
  before its first eligible row;
- frozen candidate, geographic/time, participant, minimum-support, and
  source-separation contracts;
- legal, privacy, consent, license, and data-steward approval; and
- encrypted custody, restore, deletion, and retention evidence.

When those prerequisites exist, the next version must implement the frozen
feature adapters and freeze hyperparameter search spaces, final primary metrics, materiality
thresholds, slice floors, calibration ceiling, and independent-reproduction
procedure before any locked-test access.

## Local verification

Run:

```bash
python -m pipeline.contourcast.model_selection_plan audit
python -m unittest pipeline.tests.test_model_input_contract -v
python -m pipeline.contourcast.candidate_models
python -m pipeline.contourcast.deep_candidate
python -m unittest pipeline.tests.test_model_selection_plan \
  pipeline.tests.test_candidate_models \
  pipeline.tests.test_deep_candidate -v
```

The audit emits only plan identity, implementation counts, open-gate count,
closed authority flags, and a claim boundary. It reads no observation or model
artifact and produces no performance result. The candidate capability command
emits only deterministic shape, finiteness, and bounds checks over fictional
rows; the deep command does the same over fictional masked patch bags and
requires the optional pinned PyTorch stack. Neither emits model metrics,
comparison, or a winner.
