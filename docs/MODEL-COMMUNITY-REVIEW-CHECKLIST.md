# Model, community, and interface candidate review checklist

Status: **local candidate preparation**

This checklist is repository-visible review guidance. It does not authorize deployment,
production migration, provider-control changes, domain attachment, or public traffic.

## Model and data

- [x] Four supported planning targets use one versioned shared feature/scoring contract.
- [x] California halibut, striped bass, surfperch, and jacksmelt have explicit profiles and source
  notes; rockfish is explicitly deferred.
- [x] Available labels, aggregate context, legacy rows, synthetic fixtures, and leakage risks are
  audited.
- [x] Temporal and geographic holdouts and ranking metrics are predeclared.
- [x] Predictive/ranking metrics remain null because no eligible complete-effort label corpus
  exists.
- [x] Product and documentation describe an expert-configured hybrid planning rank, not catch
  probability or a trained deep-learning catch model.
- [x] Structured trip logging remains limited to the only currently valid observation target,
  California halibut.

## Product

- [x] A single selected target controls rankings and is fast to swap in the primary forecast UI.
- [x] Target selection is URL-addressable and locally remembered without changing the canonical
  source snapshot.
- [x] User-facing internal cache terminology is removed; useful freshness is expressed as
  “Updated … ago” or an unavailable state.
- [x] Browser forecast fallback uses the reviewed compact projection; malformed/failed data does
  not masquerade as a usable snapshot.
- [x] Regulations remain target-aware through official links and change warnings rather than a
  stale hard-coded universal rule.

## Community and UGC

- [x] Community is in primary navigation and `/community` links every supported place.
- [x] Each supported place has a dedicated route; informational place displays show only a compact
  discussion preview/link.
- [x] Anonymous responses contain at most three published posts and two published comments per
  previewed post; hidden continuation text is not sent and CSS blur is not used.
- [x] Signed-in feeds and comment threads paginate with bounded server limits.
- [x] Public handles are pseudonymous; email and internal user IDs are not emitted.
- [x] Owners can edit/delete their posts and comments; edits return to human moderation.
- [x] Users can report posts/comments, block handles, and immediately undo a block.
- [x] New posts/comments and reports enter a dedicated moderation queue.
- [x] Central route policy supplies same-origin mutation checks, current-legal-acceptance gates,
  and request-rate classes.
- [x] Exact coordinates, addresses, contact details, links, and private access instructions are
  rejected at intake; copy reinforces broad public-place discussion.
- [x] Account export/deletion coverage includes community profiles, posts, comments, blocks,
  reports, and moderation data where the additive schema exists. Explicit triggers remove
  polymorphic reports and queue entries when hard account/content deletion cannot rely on a
  conventional target foreign key.
- [ ] Appropriate human review of the Terms, Privacy Policy, community standard, reporting/
  blocking behavior, moderation process, DMCA/UGC process, retention, and jurisdictional
  obligations remains required. This checklist is not legal advice.
- [ ] Moderator operations, escalation owners, response targets, appeal process, and real abuse
  drills require production-shaped staging evidence before activation.

## Interface and accessibility

- [x] The code implementation uses a restrained dark coastal design system with visible focus,
  reduced-motion handling, semantic gates, and a non-map path.
- [x] `/` is a dedicated marketing homepage with code-native coastal artwork that expands through
  the opening scroll, a white rising reveal into the product explanation, and compact lower
  talking-point cards. The full planner and PWA entry point are now `/forecast`.
- [x] The web-planner actions route to `/forecast`. TestFlight is a disabled, clearly labelled
  “Coming soon” control with no fake or premature redirect; only its visible product wordmark is
  blurred, while its accessible name states that the download is unavailable.
- [x] Public continuation is a real semantic account gate, not deceptive or inaccessible blur.
- [x] Community feed actions use buttons/forms with labels and live status messages.
- [x] Figma Phase 0 discovery and initial Phase 1 variables are recorded in the dedicated review
  file, including primitive and semantic coastal surface, accent, text, and status tokens.
- [ ] Figma component and homepage-screen construction is paused because the connected team
  reached its Starter-plan MCP tool-call ceiling. The code draft was visually reviewed against
  the approved Mobbin references, but this is not a substitute for the required Figma/code
  reconciliation.
- [ ] Figma/code visual reconciliation, keyboard/screen-reader review, contrast review, 200% text
  zoom, and physical-device acceptance must be recorded before design sign-off.

## Performance and verification

- [x] A production-shaped browser projection removes browser-unused contract fields while
  preserving all scored windows and source/model identity. Projection generation lives outside
  the content-addressed scoring-source generator and has deterministic byte-for-byte coverage.
- [x] The browser ranker's percentile tie handling is linear after sorting rather than repeatedly
  scanning the full score array.
- [x] Obsolete cache-specific UI state branches and the browser's direct full-canonical-snapshot
  fallback are removed. The smaller reviewed projection has deterministic coverage, while failed
  or malformed verification remains an unavailable state rather than masquerading as usable data.
- [x] Production-shaped build, TypeScript, focused community/model tests, D1 query inventory, and
  deterministic release inventory pass.
- [x] The complete local implementation candidate passes 769 Node tests, 280 mobile/browser
  scenarios, 158 pipeline tests with 11 documented optional-raster skips, 29 API tests, lint,
  TypeScript, the complete security chain, and release-SBOM verification. The full browser matrix
  recorded 278 first-pass cases plus isolated passes for its two timed-out cases.
- [x] Production-shaped Lighthouse evidence records the exact baseline/candidate profiles:
  the homepage scores 68/97 mobile/desktop performance at 0.81 MB, while `/forecast` scores 61/91.
  Candidate-planner mobile/desktop LCP are 36.2%/60.2% lower than baseline, desktop CLS is 0.0067,
  mobile CLS is zero, and all four accessibility scores are 100. Residual 17.05-second planner
  mobile LCP and timing variance remain explicitly open rather than being characterized as a
  complete performance win.
- [ ] Re-run or reconcile source-sensitive checks after the final Figma evidence link is recorded,
  then bind the final evidence to the immutable draft-PR head.
- [ ] Candidate GitHub checks must pass for the exact draft-PR head.

## Release gate

- [x] All eleven pre-existing open PRs have an explicit integrate/leave-aside disposition.
- [x] No existing PR was closed or mutated.
- [ ] Create one draft candidate PR and record its exact head after the repository is clean and
  all local evidence is final.
- [ ] Obtain experienced independent engineering review and appropriate legal/UGC review.
- [ ] Keep deployment, schema application, production provider controls, domains, and public
  traffic blocked pending separate action-specific authorization.
