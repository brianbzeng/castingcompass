# Marketing homepage verification — 2026-08-01

## Scope

This evidence covers the isolated `codex/daylight-homepage-draft-20260731`
worktree only. It does not authorize or record a deployment, production
configuration change, database mutation, release action, commit, push, or pull
request.

## Implemented behavior

- Two-second topographic intro with an approximately one-second staggered
  `CastingCompass` wordmark and ridge-aligned masked dissipation.
- Hero topography assembles only after the intro has dissipated.
- One hero planner CTA, location-first California halibut opportunity card,
  service-wide fallback, score, timing, source freshness, and truthful
  relative-ranking disclosure.
- Stationary surf photograph behind a white foreground layer that opens after
  the section enters view.
- Explicit loading, empty, error, and ready states for opportunity, community,
  approved catch reports, and mailing-list contracts.
- Empty approved-catch state (no fabricated people, catches, or photos).
- Location-first community preview with timestamped service-wide fallback.
- TestFlight concept section, disabled/coming-soon interaction, mailing-list
  strip, complete footer, and post-first-viewport back-to-top control.
- Responsive layouts and reduced-motion fallbacks.

## Automated verification

| Check | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run build` | Pass; existing minified chunk-size warning remains |
| `git diff --check` | Pass |
| Focused Node tests | 16/16 pass |
| Marketing mobile Playwright projects | 4/4 pass (iPhone SE, iPhone 13, Pixel 7, WebKit iPhone 13) |
| Authorship/provenance writer | Pass; 54 discovered assets, 7 third-party records, 8 legacy-pending records |

Focused Node command:

```text
node --test tests/authorship-provenance.test.mjs tests/rendered-html.test.mjs tests/production-build.test.mjs
```

Focused browser command:

```text
npx playwright test tests/mobile-viewport.spec.ts --grep 'marketing homepage'
```

The repository-wide `node --test tests/*.test.mjs` was also attempted. It is
not green in this isolated path because unrelated release/private-authorization
fixtures are intentionally absent and several existing tests URL-encode spaces
in the worktree path. The focused homepage, production-build, rendered-HTML,
and provenance checks above are green.

## Production-shaped visual verification

- Local URL: `http://127.0.0.1:4322/`
- Desktop document width equals viewport width (`1280px`); no horizontal
  overflow.
- Footer computed background is `rgb(4, 20, 38)` and text is
  `rgb(237, 244, 239)` after scoping around a legacy global transparent-footer
  override.
- Exactly one planner CTA is present and no `Skip intro` control is rendered.
- The back-to-top control appears after one viewport.
- The mobile Playwright matrix checks overflow, intro resolution, TestFlight
  hover/focus behavior, empty content states, and reduced motion.

## Lighthouse

Lighthouse 13.4.1 was run against the production server on desktop and mobile.
Deferring the 1.8 MB offline opportunity projection until the intro settles and
prioritizing the shared topographic raster improved the critical path without
changing the approved transition.

| Profile | Performance before | Performance after | Accessibility | Best Practices | SEO | LCP before | LCP after | Transfer before | Transfer after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 75 | 81 | 100 | 92 | 100 | 4.1 s | 3.1 s | 4.9 MB | 3.3 MB |
| Mobile | 61 | 65 | 100 | 92 | 100 | 24.1 s | 16.0 s | 4.9 MB | 3.1 MB |

The remaining Best Practices deductions are understood draft constraints:
geolocation is intentionally requested on load per product direction, the
public domain is not attached in local verification, and the approved-catch
API contract does not yet have a live backend. Mobile LCP is still limited by
the intentional two-stage intro/hero topographic mask and should be revisited
when final art and loading policy are approved.

## Asset provenance

The TestFlight phone concept was generated with ImageGen from a text-only
prompt, then stored at
`public/marketing/daylight-draft/testflight-phone-mockup-v1.png`. It is marked
as AI-assisted candidate artwork requiring human review in the repository's
authorship/provenance registry. The stock photos and licensed topographic source
retain their existing registered ownership and license records.
