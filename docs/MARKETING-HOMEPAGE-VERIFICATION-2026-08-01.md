# Marketing homepage verification - recovery update 2026-08-02

## Scope

This evidence covers the isolated `codex/daylight-homepage-draft-20260731`
worktree only. The verified baseline is checkpoint
`a895429d14665af66380407a188b5c119966aa17`; the homepage changes described
below remain unstaged and uncommitted. Nothing in this document authorizes or
records a deployment, production configuration change, database mutation,
release action, commit, push, or pull request.

## Implemented behavior

- Preserved the approved approximately three-second intro: a one-second hold
  followed by the two-second fast-slow-fast contour spread and wordmark exit.
- Replaced the hero-only licensed terrain image with an original inline SVG
  composition of the Santa Barbara shoreline, including a diagonal coast,
  selective land contours, bathymetric contours, Channel Islands, public-coast
  markers, and a restrained US 101 reference.
- Kept the approved licensed terrain image in the loader. The finished hero map
  is rendered at full opacity behind the loader, so clearing the overlay does
  not trigger a blank interval or second artwork reveal.
- Preserved the location-first California halibut opportunity card,
  service-wide fallback, score, timing, source freshness, and truthful
  relative-ranking disclosure.
- Rebuilt the first photo transition around normal document scrolling. Four
  asymmetric cream planes recede at staggered rates while the surf photograph
  remains stationary; progress is continuous, reversible, and does not attach
  wheel, touch, or key interception.
- Reduced the transition section from the previous 145svh one-shot wipe to
  128svh desktop and 116svh mobile. Reduced-motion mode removes the planes and
  exposes the copy and photograph immediately.
- Moved all four benefit cards before every Modern Mosaic photograph in DOM and
  visual order.
- Rewrote the hero description around target-species choice, public-location
  comparison, and the strongest current window without promising a catch.
- Rewrote `Every piece adds context` to explain that real trip outcomes improve
  guidance and shared nearby knowledge in plain angler-facing language.
- Changed the approved-catch empty state to exactly
  `Community Images Will Appear When Available` while preserving loading,
  ready, empty/unavailable, and error paths.
- Preserved truthful empty community behavior, the TestFlight coming-soon
  treatment, mailing-list contract, final CTA, account/navigation links, and
  post-first-viewport back-to-top control.
- Corrected footer containment and responsive stacking, exposed the full
  `support@castingcompass.com` address, and restored non-navigating Instagram,
  Facebook, YouTube, and X placeholders without inventing account URLs.

## Modern Mosaic photo selection

The user supplied eight personal coastal-fishing photographs after the recovery
audit. Six were selected for complementary subject matter and composition: a
single-angler catch portrait, a three-angler catch portrait, a rod-and-reel POV,
a rocky intertidal view, a Santa Barbara shoreline sunset, and a pier sunset.
The resting-anglers frame and the wider surf frame were intentionally omitted as
weaker or redundant choices. Web derivatives were resized, stripped of embedded
metadata, and re-encoded without generative edits or content alteration.

## Automated verification

The final commands below ran from a temporary runtime clone of the exact GitHub
checkpoint with the unstaged homepage files copied in for verification. This
avoided the unusually slow Node reads in the Documents worktree while leaving
the source of record untouched.

| Check | Result |
| --- | --- |
| Node runtime | `v22.23.1` |
| npm runtime | `10.9.8` |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run build:cloudflare` | Pass; existing minified chunk-size warning remains |
| `git diff --check` | Pass |
| Focused Node tests | 16/16 pass |
| Marketing Playwright checks | 16/16 pass across four projects |

Focused Node command:

```text
node --test tests/authorship-provenance.test.mjs tests/rendered-html.test.mjs tests/production-build.test.mjs
```

Focused browser command:

```text
playwright test tests/mobile-viewport.spec.ts --grep "marketing homepage"
```

The marketing browser coverage now proves:

- Original Santa Barbara hero geometry is present and the generic stock image
  is absent from the hero.
- Hero panel and artwork are fully visible with no post-loader animation.
- The opportunity card is observed in both loading and ready states, with no
  movement or resizing of the opening, hero panel, or hero copy around it.
- Cards precede images in DOM and visual order.
- The Modern Mosaic renders the exact six selected personal-photo derivatives;
  its meaningful catch and rod images retain descriptive alternatives.
- Approved catches render honest loading, ready, exact empty, non-JSON empty,
  and network-error states; the ready path uses an explicitly test-only fixture.
- Transition progress moves from closed to intermediate to open, then reverses
  through intermediate to closed.
- The transition section stays at or below 1.3 viewport heights and no document,
  body, or section scroll snapping is enabled.
- Native touch gestures and wheel input advance and reverse the transition in
  the three Chromium mobile projects. Page Down, Page Up, Space, Shift+Space,
  Home, and End retain native document behavior there. All four projects,
  including mobile WebKit, retain browser-default touch action and overscroll
  behavior. Reversible progress is checked separately in all four.
- TestFlight remains disabled and honest; back-to-top remains functional.
- Product, community, account, legal, planner, and disclosure routes respond;
  their rendered links retain the intended destinations. The mailing form
  submits its documented payload and renders a test-only success response.
- Footer social placeholders are non-links and the support address is correct.
- Keyboard focus order and visible focus rings reach the primary command,
  TestFlight control, email form, and footer. The touch-WebKit project uses a
  narrow initial-focus fallback because it does not synthesize document-level
  Tab navigation, then verifies source order and each focus target directly.
- Reduced-motion mode removes foreground planes without hiding the transition
  copy or photo.

## Production-shaped visual verification

- Local URL: `http://127.0.0.1:4322/`
- The preview was rebuilt and started with Node `22.23.1` and npm `10.9.8`.
- Required viewports checked: `1440x900`, `1280x800`, `1024x768`, `768x1024`,
  `390x844`, `360x800`, and `320x568`.
- Every required viewport reports zero horizontal document overflow.
- Hero copy and the map panel remain separated at every checked breakpoint.
- All four cards remain above the first gallery image at every checked
  breakpoint.
- Each of the six mosaic windows was scrolled into view and captured separately
  after image decode at `1440`, `1024`, `768`, `390`, and `320` pixel widths.
  The single-angler face, catch, and rod; all three group-photo faces and fish;
  the POV reel; pier; intertidal rocks; and Santa Barbara shoreline remain
  readable. The group photo was moved from the narrow tall tablet window into
  a wide window after the first crop pass exposed a clipped face at 1024px.
- Footer children remain inside the footer at every checked breakpoint, with
  zero footer overflow and all four social placeholders present.
- Direct in-app-browser wheel/scroll checks observed transition progress at
  closed, intermediate, and open positions, then observed the geometry reverse
  when scrolling upward.
- Desktop and mobile screenshots were inspected for the hero, transition,
  context cards, and footer. The 320px hero keeps all copy and controls visible
  and shows the beginning of the map panel below.

## Historical Lighthouse baseline

Lighthouse was not rerun for this recovery update. The 2026-08-01 baseline is
retained for comparison only and is not current completion evidence.

| Profile | Performance | Accessibility | Best Practices | SEO | LCP | Transfer |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Desktop | 81 | 100 | 92 | 100 | 3.1 s | 3.3 MB |
| Mobile | 65 | 100 | 92 | 100 | 16.0 s | 3.1 MB |

## Asset provenance

The Daylight-style approach section now uses a pinned cream grid with three small
photo stages instead of the former wide surf image reveal. The Santa Barbara hero
uses a real Copernicus Sentinel-2 crop with NOAA ETOPO 2022 contours across the full
water field and higher-detail USGS nearshore contours; the source derivatives have
dedicated records in the public provenance register. The loader retains
its existing registered licensed topographic source. The six selected personal-photo
derivatives are grouped under the public record
`marketing-personal-mosaic-photographs` with exact hashes, disclosed processing,
`owner_supplied` rights basis, and `candidate_review_required` release state.
The record does not claim independent photographer-rights or depicted-person
permission clearance. The TestFlight phone concept remains the previously
registered AI-assisted candidate artwork requiring human review.

## Future licensed asset recommendations

No new commercial stock asset was purchased for this revision. The satellite and
bathymetry files are derived from the open Copernicus Sentinel-2, NOAA ETOPO 2022,
and USGS sources recorded above.

1. Prioritize an oblique Santa Barbara coastline photograph from the current
   [Adobe Stock Santa Barbara aerial search](https://stock.adobe.com/search?k=santa+barbara+coastline+aerial).
   Select a frame with a readable diagonal shoreline, visible nearshore water,
   limited buildings, and enough negative space for the map/forecast story.
2. Adobe Stock file
   [482191381](https://stock.adobe.com/images/man-hand-holding-mobile-phone-with-blank-white-screen-at-the-outdoor/482191381)
   is the strongest current phone candidate: it is a 5184x3456 outdoor JPEG
   with a blank white screen suitable for a replaceable TestFlight composite.
   Confirm the final crop, phone generation, release status, and license terms
   in Adobe Stock before replacing the temporary generated mockup.
