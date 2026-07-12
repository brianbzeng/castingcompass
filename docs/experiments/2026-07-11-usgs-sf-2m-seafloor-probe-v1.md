# USGS Offshore San Francisco seafloor-character probe v1

**Run date:** 2026-07-11 PDT  
**Experiment:** `exp-ef16fbc6d1df`  
**Probe artifact:** `model-f9283b06c3a7`  
**Code revision:** `5041a90462c6867bfdbcef1e2c3138ba93ccdbff`

## Question

Does the frozen full-survey bathymetry encoder transfer to an independently
held-out geographic region better than:

1. the identical randomly initialized encoder;
2. classical summaries of all ten structure channels; and
3. depth-only summaries?

This is a representation probe, not a fishing-accuracy test.

## Target construction

Labels come from the [USGS Offshore San Francisco 2 m seafloor-character map](https://pubs.usgs.gov/ds/781/OffshoreSanFrancisco/data_catalog_OffshoreSanFrancisco.html).
The source `VALUE` field combines substrate, depth-zone, and slope digits. The
probe removes depth and slope digits and uses only the substrate component:

- smooth fine- to medium-grained sediment;
- mixed sediment/rock plus sparse rugose rock;
- mobile coarse sediment.

Rare human-made substrate codes 5 and 6 were excluded from this three-class
probe. The label GeoTIFF SHA-256 is
`224ea4ed70c02769e08b3b971b9adae6c5853f2af7130587604e8f49ba6d035e`.

The complete label raster contains 50,799 smooth anthropogenic pixels and 3,610
rugged anthropogenic pixels, but the uniform 4,096-location bathymetry corpus
sampled none of them. Consequently this probe does **not** yet test the
pipeline/engineered-structure scenario that motivated the project. That needs
a separately declared, spatially stratified rare-structure evaluation set; it
must not be presented as natural-prevalence accuracy.

The character map itself was created from bathymetry, backscatter, and
interpreter/video evidence. It is therefore useful for testing transferable
seafloor-character signal, but it is not independent of all source variables.

## Strict geographic design

- Same five spatial regions and seed used during pretraining
- Region zero was unseen during bathymetry pretraining and probe fitting
- 3,280 labeled training locations
- 815 held-out test locations
- Held-out support: 221 smooth sediment, 383 mixed/rock, 211 mobile coarse
- Logistic probe and feature scaling fit only on training geography
- 1,000 paired bootstrap resamples on held-out predictions

## Results

| Representation | Macro F1 | Balanced accuracy | Accuracy | Log loss |
| --- | ---: | ---: | ---: | ---: |
| Classical 10-channel summaries | **0.4504** | **0.4529** | **0.5178** | 2.6351 |
| Frozen pretrained encoder | 0.3914 | 0.4181 | 0.5018 | **1.4606** |
| Frozen random encoder | 0.3678 | 0.3952 | 0.4847 | 2.6325 |
| Depth-only summaries | 0.3225 | 0.3752 | 0.4503 | 2.2154 |

Paired macro-F1 differences for the pretrained encoder:

| Comparison | Median delta | 95% interval | Conclusion |
| --- | ---: | ---: | --- |
| minus depth-only | +0.0692 | +0.0311 to +0.1079 | reliable improvement |
| minus random encoder | +0.0240 | -0.0182 to +0.0688 | not statistically reliable |
| minus classical structure | -0.0606 | -0.1034 to -0.0170 | reliably worse |

The full probe was repeated exactly. Metrics and the compressed predictions
artifact were byte-identical.

## Error analysis

The pretrained encoder performs best on mixed/rock substrate, with F1 `0.6504`
and recall `0.8329`. It struggles to separate smooth sediment (F1 `0.1853`) and
mobile coarse sediment (F1 `0.3385`). The classical feature set is better on
both sediment classes, explaining its higher macro F1.

Pretraining materially improves probability quality over the random encoder
despite the modest class-decision gain: log loss falls from `2.6325` to
`1.4606`. However, that alone does not beat the declared promotion baseline.

## Decision

Do not promote this encoder into ContourCast scoring. The honest result is:

- it captures more transferable structure than depth alone;
- it has not demonstrated a reliable advantage over random convolutional
  features on macro F1;
- engineered multiscale geomorphology remains the strongest substrate
  classifier.

The next justified deep-learning experiment is bathymetry plus co-registered
acoustic backscatter with a hybrid masked-reconstruction and spatial-contrastive
objective. A second probe should use habitat polygons or video-derived labels
where possible, followed by an ablation comparing bathymetry-only,
backscatter-only, and fused inputs. A dedicated rare-structure probe should
then measure smooth and rugged anthropogenic classes without mixing that
oversampled class balance into general-area metrics.
