# Pollution score source boundary

Reviewed: **2026-07-21 UTC**

This is a research-governance artifact, not a data integration or score change. The
machine-readable policy is
[`water-quality/pollution-score-source-policy.json`](../water-quality/pollution-score-source-policy.json).
It keeps collection and every positive or negative numeric contribution disabled.
The existing action-only water-quality overlay remains a separate recommendation
guardrail and is hash-bound here only to prove that this checkpoint did not change it.

## Why these meanings stay separate

“Pollution” can refer to measurements and decisions with incompatible targets:

- The State Water Board says beach postings and closures protect recreational
  **water contact** and are issued by local health agencies when bacteria standards
  are exceeded or a sewage spill may affect the water. This does not measure fish
  abundance or seafood contaminant burden. See the official
  [California Beach Water Quality page](https://water.waterboards.ca.gov/water_issues/programs/beaches/beach_water_quality/index.html)
  and [Beach Surveys page](https://www.waterboards.ca.gov/water_issues/programs/beaches/beach_surveys/).
- BeachWatch monitoring results are station samples of fecal indicator bacteria with
  method and qualifier fields. A sample is not a continuous site condition and cannot
  be inherited by another location. See the official
  [BeachWatch monitoring search](https://beachwatch.waterboards.ca.gov/public/result.php).
- OEHHA fish advisories answer how often defined population groups may eat specified
  species from an advisory geography. Water bodies and species without site-specific
  advice can fall under separate statewide rules. Serving alternatives and population
  groups must not be flattened into a fishing score. See
  [OEHHA Fish Advisories](https://oehha.ca.gov/fish/fish-advisories),
  [How to Follow Advisories](https://oehha.ca.gov/fish/how-follow-advisories), and the
  [statewide coastal advisory](https://oehha.ca.gov/fish/advisories/statewide-advisory-eating-fish-california-coastal-locations-without-site-specific-advice).
- The Water Quality Monitoring Council's Safe to Eat workgroup coordinates fish and
  shellfish tissue monitoring to support bioaccumulation science and consumption
  advisories. Raw tissue observations do not supersede OEHHA advice and are not live
  fish-presence measurements. See the official
  [Safe to Eat workgroup page](https://mywaterquality.ca.gov/safe-to-eat/).
- CEDEN stores ambient results from projects with varying quality. CEDEN explicitly
  leaves intended-use fitness to the data user and identifies project QAPP, qualifiers,
  batches, blanks, and replicates as relevant evidence. See
  [Data Quality and Using CEDEN Data](https://ceden.waterboards.ca.gov/data-quality.html).
- CalEnviroScreen ranks census tracts for cumulative community pollution burden and
  vulnerability in environmental-justice prioritization. Its geography and composite
  meaning are not a marine fishing-site concentration. See the official
  [CalEnviroScreen FAQ](https://oehha.ca.gov/calenviroscreen/calenviroscreen-faqs).

## Candidate decisions

| Source class | Current decision | Permitted boundary |
| --- | --- | --- |
| BeachWatch/local health actions | Existing exclusion-only guardrail | A current, exactly mapped official action may suppress a recommendation; absence remains unknown |
| BeachWatch bacteria samples | Research only, not admitted | Offline measurement-contract and source-feasibility review |
| OEHHA consumption advisories | Authoritative safety display only | Link to the current agency guidance without inventing serving arithmetic |
| SWAMP/Safe to Eat tissue monitoring | Research only, not admitted | Offline species, tissue, analyte, and coverage feasibility under OEHHA authority |
| CEDEN ambient results | Research only, not admitted | Offline analyte and quality-metadata feasibility after project-level QA review |
| CalEnviroScreen | Rejected for fishing-site scoring | Environmental-justice context outside the site score only |

No candidate can currently add or subtract score points. No candidate can establish
catch probability, clean water, water-contact safety, or seafood-consumption safety.

## Activation gates

A future score component remains blocked until all gates in the policy are evidenced.
At minimum, work must freeze a fishing-quality target that is distinct from human
health advice; state an analyte/species mechanism; preserve exact spatial, temporal,
method, unit, qualifier, detection-limit, and QA support; pre-register a baseline and
held-out validation protocol; demonstrate incremental ranking value with uncertainty;
test stale, missing, conflicting, extreme, and outage behavior; obtain both fisheries
methods and public-health risk-communication review; and ship disabled by default with
rollback and drift monitoring.

Agency contact and consumption advice remains visible and authoritative regardless of
whether a future fishing-quality research component ever validates.

The two required disciplines have a fail-closed private handoff in
[`POLLUTION-SCORE-INDEPENDENT-REVIEW.md`](POLLUTION-SCORE-INDEPENDENT-REVIEW.md).
That handoff has not been executed. It can record either acceptance of this inactive boundary or
changes required, but it cannot admit a source, authorize collection or scoring, merge a PR, or
deploy anything.
