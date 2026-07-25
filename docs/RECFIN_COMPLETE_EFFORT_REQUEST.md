# RecFIN complete-effort export request

Status: **draft only; not sent**. This is an owner action and does not authorize data acquisition,
normalization, model training, validation, scoring, or production use.

## What the public source now establishes

The official public RecFIN APEX application exposes SD002, “Recreational Fishery Sample Report:
Sample Records,” at:

<https://reports.psmfc.org/recfin/f?p=601:802::::::>

On 2026-07-25 the public `nobody` role returned California CRFS sample rows with trip date,
interview county, trip type, primary target, mode, species, and catch fields. A Santa Barbara
County query contained California-halibut-target rows with catches, non-target catches, and blank
species/catch rows. The public source therefore establishes a promising technical candidate; it
does **not** establish that every blank row is a legitimate complete zero-catch attempt.

RecFIN also publishes the 71-field SD002/SD502 comprehensive-sample dictionary. The exact
62,835-byte workbook observed on 2026-07-25 has SHA-256
`b17ebe6ec617014a0a4c0e0b70f502f50554e41e85f234f6126f8d7c524e2139`. It includes stable
sample/angler/catch/location identifiers, primary and secondary target, mode, location support,
angler count, catch dispositions, survey, and depth fields. It documents
`NUMBER_HOURS_FISHED` as Oregon-only, so California duration cannot be invented.

The raw-data QueryBuilder manual says that QueryBuilder requires an active authorized account.
The large-data-export manual also binds large exports to a user profile. Public visibility does
not establish permission for automated bulk collection, commercial ML, derived product use, or
raw redistribution. The machine-readable discovery receipt is
`pipeline/sources/receipts/recfin-sd002-public-discovery-20260725.receipt.json`.

## Draft request

Send to `recfin@psmfc.org` or use <https://www.recfin.org/contact-us/>:

> Subject: CRFS complete recreational sample export and permitted-use clarification
>
> Hello RecFIN team,
>
> I am building CastingCompass, a California recreational-fishing planning product. I would like
> to evaluate whether California Recreational Fisheries Survey sample data can support a
> source-separated, design-aware research benchmark for California halibut. I will not publish
> raw records or use confidential or personally identifying data.
>
> Could you provide an official export or authorize a QueryBuilder raw query for California CRFS
> comprehensive recreational sample records, initially limited to Santa Barbara and Ventura
> counties? The export needs to retain every complete sampled effort segment, including
> legitimate zero-catch and non-target-only attempts, rather than only catch-positive records or
> expanded estimates.
>
> Please include or identify:
>
> - stable `SAMPLE_ID`, `ANGLER_ID`, `CATCH_ID`, and `LOCATION_ID` fields and the exact grouping
>   rule for one complete effort segment;
> - trip date/time support, primary and secondary target, mode, water/fished area, public spatial
>   support, interview site, survey, and selection fields;
> - number of anglers and the valid California effort unit or duration fields;
> - retained, released-alive, released-dead, observed, unobserved, and total catch semantics;
> - rows and codes for legitimate zero-catch attempts, with confirmation of whether blank
>   species/catch fields mean zero, missing, suppressed, incomplete, or something else;
> - sampling strata, weights/expansion fields, QA/release flags, uncertainty fields, and all
>   missing-value codes needed for design-aware use;
> - the saved QueryBuilder query/SQL or exact filters, source/dictionary version, data-good-through
>   and refresh timestamps, and row count.
>
> Please also confirm in writing whether the supplied data may be retained privately and used for
> commercial ML research, internal model training and validation, and a public derived ranking
> product; what attribution is required; and whether raw or row-level redistribution is prohibited.
> I am happy to narrow the request or use a non-confidential public-support export.
>
> Thank you,
> Brian Zeng

## Acceptance boundary after a response

Do not ingest the response directly. Preserve the original export privately, hash it, and record
the official query, dictionary, timestamps, row count, permission text, and sampling design. A
separately reviewed transformer must:

1. group all species rows by the official complete-effort identity;
2. preserve legitimate zero-catch, non-target-only, and target-encounter outcomes separately;
3. reject expanded estimates, incomplete attempts, ambiguous blank semantics, and fabricated
   effort duration;
4. retain only legitimately released spatial support and never convert sites/areas to points;
5. emit canonical observation-v2 JSONL with one row per complete effort segment; and
6. pass a protected source-policy change before any model training, validation, or scoring.

If the response does not authorize the intended use or cannot supply the required completeness,
the source stays descriptive-only and the prospective first-party cohort remains the benchmark
path.
