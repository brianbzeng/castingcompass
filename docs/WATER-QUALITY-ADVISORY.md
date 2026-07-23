# Water-quality advisory overlay

## Frozen meaning

The `castingcompass.water-quality-advisory/2.0.0` artifact is a human-health
water-contact advisory overlay. It is not a California-halibut predictor, a
pollution severity model, a catch-probability input, or evidence that fish,
water contact, or seafood consumption is safe.

The policy remains deliberately narrow:

- only a reviewed site-to-station mapping or an explicit countywide action may
  receive an agency status;
- a current official closure, posting, advisory, or rain action suppresses that
  site from CastingCompass recommendations without rewriting its attested
  fishing score;
- a current no-active-posting result is neutral only when its source publishes
  complete, fresh sample evidence;
- an action-only source can never turn an absent record into a no-posting claim;
- stale, incomplete, unmonitored, unavailable, and unmapped status stays
  explicitly unknown; and
- the official agency page and posted signs remain authoritative.

This preserves the frozen opportunity-score and validation contracts while
adding an independent recommendation guardrail. Water quality remains excluded
from the numeric score until a separately reviewed policy defines a defensible
contribution and frozen-baseline validation accepts it.

## San Francisco sample-status source

Source `sfpuc` uses the San Francisco Public Utilities Commission (SFPUC) Ocean
and Beach Monitoring Program:

- program: <https://www.sfpuc.gov/programs/ocean-and-beach-monitoring>
- public current-status map:
  <https://webapps.sfpuc.org/sapps/beachesandbay.html>
- fixed machine endpoint:
  <https://infrastructure.sfwater.org/lims.asmx/getBeaches>

SFPUC's public map distinguishes current open/no-posting locations, posted
locations, unavailable data, locations that are not routinely sampled, and
recent combined-sewer discharges. CastingCompass uses only the fail-closed
subset described above and does not independently reinterpret numeric bacteria
measurements as safe.

The policy maps six catalog sites to exact SFPUC station identifiers:

| CastingCompass site | SFPUC station IDs |
| --- | --- |
| Baker Beach | 4608, 4609, 4610 |
| China Beach | 4607 |
| Crane Cove Park | 4620 |
| Crissy Field East Beach | 4612 |
| Ocean Beach North | 4604, 4605 |
| Ocean Beach South | 4602 |

### Unmapped San Francisco waterfront audit

The four remaining San Francisco catalog sites are deliberately still
unmapped. A bounded read-only audit captured the 20 records returned by the
fixed SFPUC endpoint at `2026-07-21T13:03:50Z` and recorded the response digest,
catalog digest, exact site coordinates, and four nearest official station
candidates in
`water-quality/audits/sf-unmapped-station-candidates.json`.

| Unmapped catalog site | Nearest official station candidate | Distance |
| --- | --- | ---: |
| Torpedo Wharf | Crissy Field Beach West (`4611`) | 792 m |
| Pier 7 | Hyde Street Pier (`4614`) | 2,439 m |
| Pier 14 | Mission Creek (`4618`) | 2,520 m |
| Heron's Head Park Pier | Islais Creek (`4619`) | 1,508 m |

Those results are triage candidates, not spatial authority. None has an exact
catalog/station identity, and straight-line proximity does not establish that a
sample represents another waterfront, pier, current regime, outfall context,
or exposure point. The audit tool is intentionally unable to edit the policy or
recommend a mapping. All four sites therefore retain `not-covered`, `unknown`,
and null `scoreDelta` until separate documented spatial support and independent
review exist.

SFPUC describes routine weekly sampling. For a neutral no-posting result, every
mapped station must be present, sampled, and no more than ten Pacific-calendar
days old. The small allowance beyond seven days accommodates publication timing
without turning an old sample into indefinite current evidence. Any active
official status takes precedence. If a multi-station mapping has any active
status, the strictest status wins. If a station is missing, stale, or
unmonitored and none is active, the site is unknown.

## Santa Barbara County action source

Source `california-beachwatch-santa-barbara` uses the California State Water
Resources Control Board's public BeachWatch action table. The State Board
explains that local health agencies issue advisories and closures and submit
beach action information; CastingCompass does not substitute its own bacteria
thresholds.

- State program and survey context:
  <https://www.waterboards.ca.gov/water_issues/programs/beaches/beach_surveys/index.html>
- fixed public action table:
  <https://beachwatch.waterboards.ca.gov/public/advisory.php>

The collector submits only the fixed Santa Barbara County identifier `14` to
that public table. It recognizes only the published `Closure`, `Posting`, and
`Rain` action types. A start date must not be in the future, and a reported end
date must not precede the refresh date. `Closure` takes precedence over
`Posting`, which takes precedence over `Rain`.

All 14 South Coast locations inherit the table's explicit
`All_Santa_Barbara_County_Beaches` action. Eleven also have direct station
mappings:

| CastingCompass site | BeachWatch station support |
| --- | --- |
| Gaviota State Park Beach | WP0000079 |
| Refugio State Beach | WP0000183 |
| El Capitán State Beach | WP0000013 |
| Haskell's Beach | WP0000186 |
| Goleta Beach | WP0000037 |
| Arroyo Burro Beach | WP0000147 |
| Mesa Lane Steps Beach | Countywide actions only |
| Leadbetter Beach | WP0000007 |
| Santa Barbara Harbor Breakwater | Countywide actions only |
| Stearns Wharf | Countywide actions only |
| East Beach | WP0000083, WP0000085 |
| Summerland Beach from Lookout Park | WP0000188 |
| Carpinteria State Beach | WP0000180 |
| Rincon Beach Park | WP0000123 |

An active exact-station or countywide action suppresses the mapped catalog site.
An ended or future action does not. Crucially, the action table does not publish
complete fresh sample evidence for every mapped site, so no matching active row
means **unknown**, never neutral, open, clean, or safe. The collector tolerates
only a date-order anomaly that has already been wholly historical for more than
90 days; recent or future malformed dates fail this source closed. This bounded
exception covers a documented old row without letting an old data defect disable
current actions or become a no-posting inference.

The checked-in five-source snapshot was refreshed at
`2026-07-21T15:16:01Z`. At that instant the State Board table returned
open-ended postings for Gaviota (`2026-06-15`) and Refugio (`2026-06-08`), so
those two recommendations are suppressed in this repository artifact. That is a
time-stamped review snapshot, not a live guarantee; users must check the linked
agency source and posted signs.

## San Mateo County current-posting source

Source `san-mateo-county-health` uses San Mateo County Health's current beach,
creek, and bay posting page:

- current official posting list: <https://www.smchealth.org/node/1201>
- public station registry:
  <https://data.smcgov.org/Environment/Beach-and-Creek-Monitoring-Results/kpd9-xf4h/about>

The County page is an action-only source. CastingCompass parses only its single
dated `IMPORTANT NOTICE` block, the exact warning/closure statement, and the
ordered Ocean Beaches, Creeks, and Bay Beaches lists. Missing, duplicated,
reordered, future-dated, or otherwise drifted structure fails this source
closed. An exact active listing suppresses a mapped recommendation. The County
also explains that access conditions can prevent sampling, so absence from the
current list stays **unknown**; it never becomes neutral, open, clean, or safe.

Eleven catalog sites have local preliminary station support:

| CastingCompass site | County station IDs | Reviewed distances |
| --- | --- | ---: |
| Pacifica Municipal Pier | AB4111, AB4112 | 140 m, 176 m |
| Sharp Park Beach | AB4111, AB4112 | 743 m, 449 m |
| Rockaway Beach | AB4113, AB4114 | 327 m, 394 m |
| Pacifica State Beach (Linda Mar) | AB4116, AB41141, AB4117 | 372 m, 347 m, 446 m |
| Montara State Beach | AB41110, AB41111 | 767 m, 795 m |
| Pillar Point Harbor West Jetty | AB41117, AB41116, AB41115 | 278 m, 716 m, 995 m |
| Pillar Point Harbor East Jetty | AB41140 | 736 m |
| Surfer's Beach | AB41120 | 866 m |
| Francis State Beach | AB41128 | 143 m |
| Coyote Point Jetty | AB18762 | 541 m |
| Oyster Point Fishing Pier | AB18761 | 597 m |

The reproducible receipt in
`water-quality/audits/san-mateo-station-mappings.json` binds the 17 registry
records, policy, audit tool, and exact site catalog by SHA-256. The registry's
latest selected record date is `2023-06-29`; it is used only for historical
station identity and coordinate support, never for current water-quality
status. The receipt marks every mapping local-preliminary and still requiring
independent review. Its tool cannot edit policy or infer coverage automatically.

Poplar Beach and Seal Point Park Shoreline remain deliberately unmapped. Poplar's
nearest station among the reviewed set is Francis Beach, 1,944 m away. Seal
Point's nearest reviewed station is Coyote Point, 2,102 m away. Neither has an
exact station identity or separately documented local spatial authority, and a
nearby place cannot lend its official status to a different public location.
Both therefore remain `not-covered`, `unknown`, and null-score.

The checked-in current-status snapshot was refreshed at
`2026-07-21T15:16:01Z`. The County notice itself was last updated July 15 based
on July 13 samples. Exact active listings suppressed Pacifica State Beach,
Rockaway Beach through Calera Creek, and both Pillar Point jetty mappings at
that instant. This is time-bound repository evidence, not a live guarantee;
the official page and posted signs remain authoritative.

## Marin County action source

Source `california-beachwatch-marin` uses the same fixed State Water Board
BeachWatch action table with only the Marin County identifier `6`. It inherits
the Santa Barbara adapter's strict `Closure` / `Posting` / `Rain` parsing,
date-order validation, action precedence, and action-only absence behavior.
The county requests fail independently: one malformed or unavailable response
cannot erase a valid action from another county or district request, SFPUC, or
San Mateo County Health.

The fixed public station selector currently exposes 31 Marin station identities.
A bounded audit maps only six exact public identities:

| CastingCompass site | BeachWatch station support |
| --- | --- |
| Drakes Beach | DRAKES BEACH |
| Bolinas Beach | BOLINAS |
| Stinson Beach | STINSON BEACH - CENTRAL, NORTH, SOUTH |
| Muir Beach | MUIR BEACH - CENTRAL, NORTH, SOUTH |
| Rodeo Beach | RODEO BEACH - CENTRAL, NORTH, SOUTH |
| McNears Beach Pier | McNEARS BEACH |

All six also inherit only an explicit `All_Marin_County_Beaches` action. The
audit deliberately leaves Limantour Beach, Point Reyes South Beach, Paradise
Beach Pier, and Fort Baker Fishing Pier unmapped. In particular, `PARADISE
COVE` is not treated as Paradise Beach Pier: similar words are not exact public
location identity or spatial authority.

`water-quality/audits/marin-beachwatch-station-mappings.json` binds the exact
registry response, policy, audit tool, and site catalog by SHA-256. The registry
supports station identity only; it supplies no current action, spatial coverage,
clean-water conclusion, seafood-safety conclusion, or fishing-score input.
Every mapping remains local preliminary evidence requiring independent review,
and the audit tool cannot edit policy or create a mapping.

At the checked-in `2026-07-21T15:16:01Z` capture, the State Board table reported
an open-ended Bolinas posting that began July 15. Bolinas is therefore suppressed
in the repository artifact. The other five mapped sites remain unknown rather
than neutral because absence from an action table cannot establish a current
no-posting state. This receipt is time-bound; the official table and posted signs
remain authoritative.

## East Bay Parks District action source

Source `california-beachwatch-east-bay-parks` submits only the fixed East Bay
Parks District identifier `19` to the State Water Board BeachWatch action table.
It uses the same strict action-only parser and fails independently from the
Santa Barbara, Marin, SFPUC, and San Mateo requests.

The fixed public selector exposes eight current station identities. A bounded
audit maps only the two catalog sites with reviewed public beach identity and
exact official station names:

| CastingCompass site | BeachWatch station support |
| --- | --- |
| Keller Beach | Keller North Beach, Keller South Beach |
| Crown Memorial State Beach | Crown 2001 Shoreline Dr., Crown Bath House, Crown Bird Sanctuary, Crown Crab Cove, Crown Sunset Rd., Crown Windsurfer Corner |

The selector exposes no explicit districtwide action identity, so this source
inherits none. The audit deliberately leaves Ferry Point Pier, Point Isabel,
Albany Bulb, Berkeley Marina North Basin, Cesar Chavez Park, Emeryville Marina,
Port View Park, Middle Harbor, Alameda South Shore Rock Wall, Oyster Bay, and
San Leandro Marina unmapped. Keller stations do not establish Ferry Point
coverage, and Crown Windsurfer Corner does not establish coverage for the
Alameda South Shore Rock Wall.

`water-quality/audits/east-bay-parks-beachwatch-station-mappings.json` binds the
eight-station response, policy, audit tool, and site catalog by SHA-256. It uses
the registry for public station identity only and cannot create mappings,
establish current status or spatial coverage, or change the fishing score.
Every mapping remains local preliminary evidence requiring independent review.

At the checked-in `2026-07-21T15:16:01Z` capture, the State Board table reported
an open-ended Keller North posting beginning May 5 and an open-ended Crown Crab
Cove posting beginning June 23. Both mapped catalog recommendations are
therefore suppressed in the repository artifact. This is time-bound evidence;
absence from the action table remains unknown, and the official table and posted
signs remain authoritative.

## Launch-catalog negative-evidence inventory

`water-quality/audits/launch-catalog-coverage.json` reconciles the current
61-site catalog, five-source advisory artifact, policy, and four source-specific
mapping audits. Thirty-nine sites have provisional official-source mappings.
All 22 remaining sites are deliberately `not-covered`, unknown, and null-score,
and each now binds to exactly one negative-evidence receipt.

Dumbarton Fishing Pier was the only prior receipt gap. The fixed State Board
directory captured at `2026-07-21T16:22:00Z` exposes no Alameda County program;
its East Bay Parks District option set contains eight stations and its Water
Boards option set contains none. Neither contains a Dumbarton identity. The
audit therefore preserves Dumbarton as unmapped and fails closed if a candidate
later appears. Directory absence is not a clean-water conclusion and does not
show that another official source cannot exist; exact coverage and independent
review remain open.

## Future pollution-score research boundary

[`POLLUTION-SCORE-SOURCE-BOUNDARY.md`](POLLUTION-SCORE-SOURCE-BOUNDARY.md)
and `water-quality/pollution-score-source-policy.json` separate water-contact
actions, bacteria samples, fish-consumption advice, fish-tissue monitoring,
ambient multi-project results, and community pollution-burden screening. The
policy is research governance only: it adds no collector or runtime value,
allows neither positive nor negative score contribution, and hash-binds the
unchanged advisory runtime and site catalog. Existing current official actions
remain exclusion-only, while agency contact and consumption advice remains
authoritative outside the fishing score.

## Integrity and failure behavior

`scripts/refresh_water_quality.py`:

- permits only the five fixed source configurations across three HTTPS current-
  status endpoints and rejects redirects;
- caps every response at 2 MiB and rejects malformed source structure;
- binds the artifact to SHA-256 digests of the policy, collector, and exact site
  catalog;
- isolates source failures so one unavailable program cannot erase a valid
  active action from the other independent sources;
- rejects duplicate SFPUC station records, unreviewed SFPUC status codes,
  unreviewed BeachWatch action types, unexpected counties, invalid station IDs,
  recent malformed action dates, and drifted San Mateo notice structure;
- keeps missing BeachWatch actions unknown instead of inferring a neutral state;
- sanitizes source failures into fixed categories without publishing exception
  text or local paths; and
- supports separate local XML and four HTML fixtures plus `--as-of` for
  deterministic adversarial tests.

`scripts/audit_sfpuc_station_coverage.py` separately creates a reproducible,
tool-hash-bound nearest-station review receipt. It uses the same fixed endpoint
and parser, validates coordinates, computes bounded haversine distances, and
emits only candidate evidence. It never changes `water-quality/policy.json`,
never treats distance as coverage, and never emits a score or safety conclusion.

`scripts/audit_san_mateo_station_mappings.py` separately queries a fixed County
open-data endpoint for one latest coordinate-bearing record per reviewed station.
It caps responses, rejects redirects and malformed coordinates, calculates
haversine distances, records Poplar's unsupported nearest candidate, and binds
the receipt to policy, tool, source response, and catalog hashes. The registry
is explicitly barred from supplying current status, and independent local
mapping review remains open.

`scripts/audit_marin_beachwatch_station_mappings.py` separately submits only the
fixed Marin county identifier to the official station-selector endpoint. It
requires a bounded unique numeric registry key for every exact mapped station
name, records four unsupported catalog sites, binds all inputs by hash, and
cannot infer a mapping from a similar name or edit policy.

`scripts/audit_east_bay_parks_beachwatch_station_mappings.py` separately submits
only the fixed district identifier to the official station selector. It binds
two exact mappings and 11 negative mapping results to the bounded eight-station
response, rejects malformed or missing registry identities, and cannot infer a
mapping or modify policy.

`scripts/audit_water_quality_coverage_inventory.py` closes the audit inventory,
not the source-coverage gap. It requires all prior negative receipts to match
the exact site catalog, validates that every published not-covered site remains
unknown and null-score, and submits only the fixed East Bay Parks and Water
Boards identifiers while reviewing Dumbarton. Missing, duplicate, drifted, or
new candidate evidence fails closed without changing policy.

The browser independently expires neutral SFPUC sample evidence on the same
Pacific-calendar freshness rule. The scheduled snapshot workflow refreshes and
validates `public/data/water-quality.json` before opening its ordinary review PR.

## Local implementation receipt

The exact follow-up tree passed the Cloudflare build and 506 Node tests, the
complete 188-case Chromium/WebKit phone matrix, ESLint, TypeScript, the full
security/SBOM/source-integrity chain, both zero-vulnerability npm audits, 29 API
tests, Ruff, 83 pipeline tests with one documented optional-`rasterio` skip, the
deterministic synthetic smoke, and all 19 critical D1 query-plan checks. This is
repository evidence only. Exact-head hosted checks, independent mapping review,
guarded deployment, and post-deployment source verification remain open.

## Unfinished acceptance work

The broader roadmap item stays open. Before water quality can become a numeric
score component, CastingCompass still needs:

1. reviewed official-source adapters and exact mappings for the remaining
   launch catalog;
2. independent local review of the Santa Barbara, San Mateo, Marin, and East Bay Parks station mappings,
   source latency, rainfall semantics, geographic support, and outage behavior. The exhaustive
   two-role private handoff is prepared in
   [WATER-QUALITY-MAPPING-INDEPENDENT-REVIEW.md](WATER-QUALITY-MAPPING-INDEPENDENT-REVIEW.md),
   but no real independent review has been conducted or accepted;
3. frozen retrospective and prospective baselines that test whether any fishing-
   quality contribution improves ranking without creating misleading health
   claims;
4. independent review of suppression, accessibility, mobile behavior, and
   operational refresh evidence; and
5. guarded deployment and post-deployment source-freshness receipts.

Until those gates pass, agency status is an exclusion-only safety guardrail and
every numeric scoreDelta remains null.
