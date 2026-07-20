# Santa Barbara local access review packet

**Status:** blank review packet; no review has been conducted or accepted

Use this packet to check whether CastingCompass describes practical public
access accurately before the Santa Barbara South Coast catalog is considered
release-ready. This is an access-description review only. It is not a request
for fishing results, a safety certification, legal advice, or model validation.

The machine-readable boundary is
[`field-review/santa-barbara-access-review-policy.json`](../field-review/santa-barbara-access-review-policy.json).
The committed policy contains no responses and every site remains `pending`.

## What to send a local reviewer

Send only the relevant site entries below plus this response block. A reviewer
does not need an account and should not provide a name, contact information, an
exact visit date or time, a precise fishing spot, private-access directions,
photos, catches, or trip notes.

```text
Site ID:
Observed month (YYYY-MM, or not_observed):
public_entry_route: matches_catalog | correction_needed | not_observed | uncertain
access_status: matches_catalog | correction_needed | not_observed | uncertain
parking_walk: matches_catalog | correction_needed | not_observed | uncertain
posted_restrictions: matches_catalog | correction_needed | not_observed | uncertain
boundary_clarity: matches_catalog | correction_needed | not_observed | uncertain
Correction category (only if needed): access | status | parking_walk | restriction | boundary
General correction (one sentence; no personal, trip, catch, or precise-location detail):
```

One reviewer may cover multiple locations, but use one block per site. The
owner should assign a random response ID, keep the raw response outside Git and
outside Codex, and delete it within 30 days after accepting or rejecting the
correction. Only a later aggregate, non-identifying receipt may enter the
repository.

## Locations to review

- `gaviota-state-park-beach` — **Gaviota State Park Beach** (`open`): confirm
  beach/day-use access while keeping the separately closed pier out of scope.
- `refugio-state-beach` — **Refugio State Beach** (`open`): confirm the public
  park access description and whether current notices change it.
- `el-capitan-state-beach` — **El Capitán State Beach** (`limited`): confirm
  reopened day use and any construction or facility restrictions. Two local
  reviews are required.
- `haskells-beach` — **Haskell's Beach** (`open`): confirm the documented public
  coastal route, parking, and walk.
- `goleta-beach` — **Goleta Beach** (`limited`): confirm ocean-beach access and
  whether the slough/pier boundary warning is clear. Two local reviews are
  required.
- `arroyo-burro-beach` — **Arroyo Burro Beach** (`open`): confirm public park
  access and whether the water-quality/surf caveat is appropriately worded.
- `mesa-lane-beach` — **Mesa Lane Steps Beach** (`limited`): confirm the public
  stairs and whether the high-tide impassability warning is clear. Two local
  reviews are required.
- `leadbetter-beach` — **Leadbetter Beach** (`open`): confirm public access and
  whether swim/lifeguard-zone constraints are appropriately described.
- `santa-barbara-harbor-breakwater` — **Santa Barbara Harbor Breakwater**
  (`limited`): confirm public fishing access and whether the standing-area and
  harbor-operations caveats are clear. Two local reviews are required.
- `stearns-wharf` — **Stearns Wharf** (`open`): confirm public access and whether
  posted wharf rules or temporary closures require a correction.
- `east-beach-santa-barbara` — **East Beach (Santa Barbara)** (`open`): confirm
  public access and whether seasonal recreation-zone constraints are clear.
- `carpinteria-state-beach` — **Carpinteria State Beach** (`open`): confirm park
  access and whether wildlife/tide-pool restrictions need clearer wording.
- `rincon-beach-park` — **Rincon Beach Park** (`open`): confirm public access and
  whether tide and surf-crowding constraints are appropriately described.

The linked official access and CDFW regulation sources in the product catalog
remain authoritative. A local observation can identify a discrepancy; it cannot
override a posted closure, official regulation, or marine protected-area map.

## Acceptance boundary

An `open` site needs at least one local review. A `limited` site needs at least
two. The region also needs at least two distinct reviewers overall. After the
threshold is met, the owner must recheck each official source within seven days,
resolve every correction, and preserve only an aggregate receipt plus a digest
of the private evidence.

Passing this review does not authorize a deployment, make access complete or
guaranteed, establish safety or legality, or turn any Santa Barbara observation
into model-training, calibration, or validation evidence. Those gates remain
separate and open.
