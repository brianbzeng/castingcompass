# RecFIN non-confidential complete-effort data request

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

Those dictionary fields describe the comprehensive internal schema; they are not all requested
below. CastingCompass does not need respondent identifiers, confidential fields, protected
precise locations, or access to restricted raw-query tools. It needs only a public-release
grouping key or official grouping rule that can join rows belonging to the same sampled effort
without identifying a person.

The raw-data QueryBuilder manual says that QueryBuilder requires an active authorized account.
The large-data-export manual also binds large exports to a user profile. Public visibility does
not establish permission for automated bulk collection, commercial ML, derived product use, or
raw redistribution. The machine-readable discovery receipt is
`pipeline/sources/receipts/recfin-sd002-public-discovery-20260725.receipt.json`.

## Draft request

Send to `recfin@psmfc.org` or use <https://www.recfin.org/contact-us/>:

> Subject: Non-confidential public CRFS complete-effort data and use clarification
>
> Hello RecFIN team,
>
> I am building CastingCompass, a California recreational-fishing planning product. I would like
> to evaluate whether California Recreational Fisheries Survey sample data can support a
> source-separated, design-aware research benchmark for California halibut.
>
> I am **not** requesting confidential records, respondent or angler identifiers, protected
> precise locations, or special access to restricted QueryBuilder data. I am only asking whether
> an existing public download/report or a non-confidential public-support export is available,
> initially for Santa Barbara and Ventura counties. If no suitable public-release dataset exists,
> a confirmation of that limitation is sufficient; please do not prepare or send a confidential
> extract.
>
> The useful public-release data would represent every complete sampled effort segment, including
> legitimate zero-catch and non-target-only attempts, rather than only catch-positive records or
> expanded estimates.
>
> Please include or identify:
>
> - an opaque, non-identifying public-release effort key—or the official grouping rule—for rows
>   belonging to one complete sampled effort, without disclosing respondent identity;
> - trip date/time support, primary and secondary target, mode, water/fished area, public spatial
>   support, survey, and selection fields at the granularity approved for public release;
> - number of anglers and the valid California effort unit or duration fields;
> - retained, released-alive, released-dead, observed, unobserved, and total catch semantics;
> - rows and codes for legitimate zero-catch attempts, with confirmation of whether blank
>   species/catch fields mean zero, missing, suppressed, incomplete, or something else;
> - sampling strata, weights/expansion fields, QA/release flags, uncertainty fields, and all
>   missing-value codes needed for design-aware use;
> - the exact public report/download filters, source/dictionary version, data-good-through and
>   refresh timestamps, and row count.
>
> Please also confirm whether the publicly released data may be downloaded and retained locally
> for commercial ML research, internal model training and validation, and a public derived
> ranking product; what attribution is required; and what redistribution restrictions apply. I
> will follow any public-release terms and will not publish row-level records.
>
> Thank you,
> Brian Zeng

## Acceptance boundary after a response

Do not ingest the response directly. Reject any delivery containing confidential or restricted
fields, respondent identity, or non-public precise locations. Accept only an existing public
download/report or a clearly identified non-confidential public-support export. Preserve the
accepted public-release file in access-controlled storage, hash it, and record the official
filters, dictionary, timestamps, row count, permission text, and sampling design. A separately
reviewed transformer must:

1. group all species rows only by an opaque, non-identifying public-release effort key or the
   official public grouping rule;
2. preserve legitimate zero-catch, non-target-only, and target-encounter outcomes separately;
3. reject expanded estimates, incomplete attempts, ambiguous blank semantics, and fabricated
   effort duration;
4. retain only legitimately released spatial support and never convert sites/areas to points;
5. emit canonical observation-v2 JSONL with one row per complete effort segment; and
6. pass a protected source-policy change before any model training, validation, or scoring.

If no suitable non-confidential public-release source exists, or the response does not authorize
the intended use or cannot supply the required completeness, the source stays descriptive-only
and the prospective first-party cohort remains the benchmark path.
