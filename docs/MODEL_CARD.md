# ContourCast model card

**Status:** architecture and evaluation scaffold implemented; deep model
untrained; no official-data performance has been measured.

**Version:** 0.1.0

## Model purpose

ContourCast explores whether bathymetric structure contains useful signal for:

1. recreational catch occurrence for a declared target species; and
2. positive-catch CPUE conditional on an observed catch.

Outputs are experimental research signals. They are not navigation advice,
fishing regulation, a stock assessment, a conservation decision, a safety
warning, or a guarantee of catch. The product must expose uncertainty and data
coverage instead of presenting predictions as live biological truth.

## Implemented comparison models

Three classical baselines use fold-local patch summaries (center, mean,
standard deviation, minimum, and maximum for each selected channel):

- **Naive:** training-fold prevalence and mean positive-catch CPUE;
- **Linear:** standardized class-weighted logistic regression plus Ridge
  regression on `log1p(CPUE)` for positive training catches;
- **Boosted:** histogram gradient-boosted classifier and regressor.

These baselines must be reported alongside any neural model. A deep model is
not considered useful merely because it has more capacity; it must improve the
predeclared metrics under the same geographic folds.

## Deep-learning architecture

`pipeline/contourcast/deep_model.py` defines, but does not train:

- a compact ResNet-style encoder with a six-channel input stem;
- three residual stages with spatial downsampling and global average pooling;
- a SimCLR-style projection head for self-supervised terrain pretraining;
- a two-head fine-tuning model:
  - occurrence logit;
  - conditional `log1p(CPUE)` prediction.

Self-supervised views use flips, small intensity scaling, Gaussian noise, and
channel dropout. Their appropriateness must be reviewed against bathymetric
semantics before a real experiment. The contrastive objective is NT-Xent. The
fine-tuning objective combines binary cross-entropy and positive-only SmoothL1
log-CPUE loss, with optional batch-normalized sample-count weights for released
CRFS reliability fields. Loss weights, random seeds, architecture width/depth, optimizer,
learning-rate schedule, normalization statistics, and checkpoint selection must
be frozen in run configuration before evaluation.

The epoch functions are intentionally explicit and leave data loaders,
checkpoint storage, early stopping, and model promotion to the experiment
runner. No pretrained weights are downloaded, and no model registry entry is
created merely by importing the code.

## Evaluation protocol

- Build spatially contiguous folds from projected coordinates.
- Hold out every complete region exactly once.
- Exclude training points within the configured metre buffer of each held-out
  set.
- Fit normalization, feature transforms, baselines, and neural fine-tuning only
  on each fold's training data.
- Use self-supervised raster patches from training geography only when comparing
  strict geographic transfer. A separate transductive experiment may use
  unlabeled held-out geography, but it must be labeled as such and never mixed
  with the strict result.
- Do not tune on test folds. Use nested/inner spatial validation or a fixed
  validation region for hyperparameters and checkpoint selection.
- Report each fold, the aggregate mean and spread, sample counts, class balance,
  and rows removed by the buffer.

Primary occurrence metrics are Brier score and log loss because the product
consumes probabilities. Secondary metrics are ROC AUC, average precision, and
10-bin expected calibration error. Positive-catch CPUE is reported with MAE and
RMSE. Opportunity ranking is evaluated with Spearman rank correlation and
NDCG@10, including deterministic percentile-bootstrap 95% intervals within
each geographic fold. Folds containing one occurrence class or no rank
variation return null for the affected metrics rather than inventing values.

## Required ablations

The evaluation hook currently defines:

| Ablation | Channels |
| --- | --- |
| `full_six` | All six terrain channels |
| `depth_only` | Depth only |
| `geomorphology_without_depth` | Slope, roughness, curvature, local TPI, broad TPI |
| `without_tpi` | Depth, slope, roughness, curvature |

For a neural report, also compare random initialization against self-supervised
pretraining under identical folds and fine-tuning budgets. Additional temporal,
weather, tide, or user-history features belong in separately named experiments;
they must not be slipped into the terrain-only benchmark.

## Version and promotion contract

Each run writes:

- immutable input file paths, byte sizes, and SHA-256 hashes;
- full configuration and dataset kind;
- Git revision and Python/platform runtime;
- a content-derived `experiment_version`;
- a content-derived `model_version`;
- status (`unrun`, `running`, `completed`, or `failed`);
- metrics artifact location and an explicit note describing result scope.

A model is eligible for a future `candidate` stage only after:

1. dataset-card fields and legal/privacy review are complete;
2. all folds and required ablations finish without leakage warnings;
3. calibration is assessed and the model beats the naive baseline on primary
   metrics across meaningful geographic regions;
4. a separate architecture/checkpoint reproduction matches the recorded run;
5. product behavior for low confidence, missing coverage, and source outages is
   tested.

No automatic production promotion is implemented.

## Limitations and risks

- Terrain alone cannot represent fish behavior, seasonality, temperature,
  currents, tides, regulation, angler behavior, or sampling design.
- Labels are fishery-dependent; predictions can learn where people fish rather
  than where fish live.
- Spatial autocorrelation can make random validation look unrealistically good.
- Self-supervised pretraining may encode survey seams or DEM artifacts.
- Conditional CPUE ignores zero catches by design and must always be interpreted
  alongside occurrence probability.
- Calibration can drift across seasons, species, regulations, survey modes, and
  newly contributed locations.
- Fine-grained fishing predictions may expose sensitive habitats or private
  spots. Public displays should aggregate coordinates and apply conservation and
  privacy review.

## Monitoring requirements before deployment

Future serving must record model/data version, coverage checks, confidence,
prediction distribution, latency, and user correction without logging precise
coordinates unnecessarily. Monitor spatial coverage, missing-channel rates,
class/prevalence drift, calibration on delayed labels, error by region/season,
and disagreement with baselines. Roll back or suppress predictions when the CRS,
channel order, source version, or coverage contract fails.

## Current results

| Evaluation | Status | Result |
| --- | --- | --- |
| Synthetic smoke workflow | Implemented | Plumbing test only; numeric output intentionally not reported here |
| Official-data classical baselines | Unrun | No result |
| Self-supervised pretraining | Unrun | No checkpoint |
| Two-head fine-tuning | Unrun | No checkpoint |
| Geographic generalization | Unrun | No result |
| Calibration / ablations | Unrun on official data | No result |

Run `python3 -m pipeline.contourcast.cli deep-smoke` after installing PyTorch to
check tensor shapes and finite losses. That command is not training or model
evaluation.
