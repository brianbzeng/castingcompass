# USGS Offshore San Francisco full-survey SSL v1

**Run date:** 2026-07-11 PDT  
**Experiment:** `exp-b9b8daa03637`  
**Model artifact:** `model-30f37740c044`  
**Code revision:** `8b65c4a670d93a8b5c3f63e8c565121aa92fe6df`

## Purpose

Pretrain a multiscale seafloor-structure encoder on geographically diverse
official bathymetry. This is a representation-learning result, not evidence of
fish presence, California-halibut habitat selection, catch probability, or an
improved Opportunity Score.

## Source and corpus

- Product: [USGS California State Waters Map Series — Offshore of San Francisco](https://pubs.usgs.gov/ds/781/OffshoreSanFrancisco/data_catalog_OffshoreSanFrancisco.html)
- Survey period: 2004–2008
- Source grid: 2 m, EPSG:26910, NAVD88
- Source GeoTIFF SHA-256: `75629f6a8bc7e3ea78fb6b3b22c737ec75a8cba1621f2c0066a2343ab61a242a`
- Corpus SHA-256: `9a887e99dda9e54bcd9fbe766db3980151fa278df40692d8081221c79c5e8142`
- Sampled locations: 4,096
- Sampled bounds: `534051, 4179863, 551049, 4189699` in EPSG:26910
- Corpus split: 3,280 training / 816 geographic validation patches
- Conservative minimum resolvable feature width: approximately 6 m

The corpus builder streamed 32 overlapping source tiles with a 282-cell halo;
it did not materialize a multi-gigabyte full-survey feature stack. Each retained
location passed the declared broad-view coverage threshold.

## Representation contract

Ten channels were used: depth, slope, roughness, curvature, local TPI, broad
TPI, local relief, rugosity ratio, and two aspect components. Every location
contains 64 m, 256 m, and 1,024 m diameter views.

The encoder uses shared ResNet weights at every physical scale and learned
scale attention. Nearby samples within 512 m are excluded from the NT-Xent
negative-pair set to avoid rewarding the model for separating overlapping
views of the same geomorphic structure.

## Training configuration

- Five spatial regions; region zero held out for validation
- 20 epochs, batch size 64
- Base width 32, two residual blocks per stage
- Projection dimension 128
- AdamW, learning rate `3e-4`, weight decay `1e-4`
- MPS accelerator, seed 42
- Robust median/IQR normalization fit on training geography only

## Optimization result

| Epoch | Train NT-Xent | Validation NT-Xent |
| ---: | ---: | ---: |
| 1 | 2.5424 | 2.3458 |
| 2 | 1.5976 | 2.2122 |
| 3 | 1.3951 | 1.9852 |
| 4 | 1.2652 | 1.8163 |
| 5 | 1.2097 | 2.0821 |
| 6 | 1.1749 | 1.8532 |
| 7 | 1.0965 | 1.9741 |
| 8 | 1.0649 | 1.8735 |
| 9 | 1.0398 | 1.7312 |
| 10 | 1.0041 | 1.7115 |
| 11 | 0.9952 | 1.6305 |
| 12 | 0.9702 | 1.7472 |
| 13 | 0.9575 | 1.5647 |
| 14 | 0.9411 | 1.6412 |
| 15 | 0.9293 | 1.6351 |
| 16 | 0.9115 | 1.5368 |
| 17 | 0.9207 | 1.5406 |
| 18 | 0.8988 | 1.7577 |
| 19 | 0.9072 | 1.6230 |
| 20 | 0.8880 | **1.4683** |

The best checkpoint is epoch 20. Its SHA-256 is
`1021c0d83293807b43195d011c9e9a2304cc01c1a775d7256d02d4fb10be886c`.
An exact repeat with the same code, corpus, fold, configuration, seed, and
accelerator produced the identical epoch history and checkpoint hash.

Validation is noisy but improves materially over the run. That supports using
the checkpoint for downstream representation tests; it does not establish that
the representation contains fish-relevant information.

## Promotion boundary and next test

This checkpoint is not connected to the live product. The next required test is
a frozen-embedding probe against independent USGS seafloor-character or habitat
labels. It should be compared with depth-only summaries, the ten-channel
classical baseline, and a randomly initialized encoder under geographic
holdouts. Only after that should backscatter be added and catch-label
fine-tuning begin.
