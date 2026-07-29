# Production-build performance evidence

Evidence date: **2026-07-28 UTC**

Scope: local production-shaped Vinext build at `http://127.0.0.1:4173/` for the marketing
homepage and `http://127.0.0.1:4173/forecast` for the planner; no provider, deployment,
domain, or production request was made.

## Reproduction

The baseline was captured from reviewed `origin/main`
`ac7e67b90450f28322efedec9f64bf14a3026396`. The after run used the local candidate source. The
homepage rows were re-captured after the full-bleed horizon and wave-art direction pass, then
again after the scroll-bound orbital sun, frosted cards, casting explainer, and closing sunset
banner were added, and finally after the screenshot-directed compact-card, nightfall, current,
progressive-rod, and treasure-map revision. A final homepage run records the continuous
ocean-descent direction with underwater discoveries and a volcanic seafloor. The planner rows are
unchanged because those passes do not affect `/forecast`. The final refinement removes the
duplicate surface band, keeps both spearfishers legible in the mobile crop, adds denser wildlife,
makes the helmet and anglerfish smaller sinking discoveries, isolates a one-time casting-rod
animation after the six signal categories, and removes the boxed closing-banner treatment.
Both used Lighthouse `13.4.1`, Chrome `150.0.0.0`, the standard Lighthouse mobile profile, and
the Lighthouse desktop preset.

```sh
npx --yes -p node@22.23.1 -p npm@10.9.8 npm run build:cloudflare
npx --yes -p node@22.23.1 -p npm@10.9.8 npm run start -- --host 127.0.0.1 --port 4173

npx --yes lighthouse@13.4.1 http://127.0.0.1:4173/ \
  --quiet \
  --chrome-path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --output=json \
  --output-path=homepage-mobile.json

npx --yes lighthouse@13.4.1 http://127.0.0.1:4173/ \
  --quiet \
  --preset=desktop \
  --chrome-path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --output=json \
  --output-path=homepage-desktop.json

npx --yes lighthouse@13.4.1 http://127.0.0.1:4173/forecast \
  --quiet \
  --chrome-path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --output=json \
  --output-path=forecast-mobile.json

npx --yes lighthouse@13.4.1 http://127.0.0.1:4173/forecast \
  --quiet \
  --preset=desktop \
  --chrome-path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --output=json \
  --output-path=forecast-desktop.json
```

Raw Lighthouse reports are intentionally retained as local work evidence rather than committed
large generated files. The table below is sufficient to compare the exact audited fields.

## Results

| Profile | State | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Transferred bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile | baseline planner on `/` | 61 | 88 | 96 | 100 | 4,740 ms | 26,738 ms | 69 ms | 0.0182 | 5,196,418 |
| Mobile | lighter homepage direction pass on `/` | 73 | 100 | 96 | 100 | 3,577 ms | 4,251 ms | 81 ms | 0 | 808,807 |
| Mobile | orbital/casting-card direction pass on `/` | 70 | 100 | 96 | 100 | 3,671 ms | 5,569 ms | 125 ms | 0 | 835,476 |
| Mobile | screenshot-directed revision on `/` | 70 | 100 | 96 | 100 | 3,702 ms | 5,728 ms | 84 ms | 0 | 842,030 |
| Mobile | ocean-descent revision on `/` | 70 | 100 | 96 | 100 | 3,724 ms | 5,727 ms | 124 ms | 0 | 830,740 |
| Mobile | refined ocean-descent revision on `/` | 70 | 100 | 96 | 100 | 3,666 ms | 5,720 ms | 81 ms | 0 | 851,543 |
| Mobile | candidate planner on `/forecast` | 61 | 100 | 96 | 100 | 5,031 ms | 17,048 ms | 113 ms | 0 | 3,222,697 |
| Desktop | baseline planner on `/` | 52 | 96 | 96 | 100 | 904 ms | 4,632 ms | 0 ms | 0.4577 | 5,196,418 |
| Desktop | lighter homepage direction pass on `/` | 97 | 100 | 96 | 100 | 770 ms | 1,075 ms | 0 ms | 0 | 808,807 |
| Desktop | orbital/casting-card direction pass on `/` | 98 | 100 | 96 | 100 | 737 ms | 1,046 ms | 0 ms | 0 | 929,490 |
| Desktop | screenshot-directed revision on `/` | 97 | 100 | 96 | 100 | 781 ms | 1,114 ms | 0 ms | 0 | 936,044 |
| Desktop | ocean-descent revision on `/` | 98 | 100 | 96 | 100 | 766 ms | 1,095 ms | 0 ms | 0 | 945,968 |
| Desktop | refined ocean-descent revision on `/` | 98 | 100 | 96 | 100 | 765 ms | 1,100 ms | 0 ms | 0 | 945,557 |
| Desktop | candidate planner on `/forecast` | 91 | 100 | 96 | 100 | 955 ms | 1,842 ms | 0 ms | 0.0067 | 3,298,959 |

Material changes:

- the refined candidate homepage transfers 0.85 MB on mobile, about 74% less than the candidate
  planner;
- candidate-planner mobile transferred bytes decreased by 38.0% from baseline;
- candidate-planner desktop transferred bytes decreased by 36.5% from baseline;
- candidate-planner mobile LCP improved by 36.2% from baseline;
- candidate-planner desktop LCP improved by 60.2% from baseline;
- candidate-planner desktop performance improved by 39 points;
- the refined ocean-descent homepage retained 70 mobile and 98 desktop performance;
- mobile and desktop accessibility both reached 100;
- planner desktop CLS improved from 0.4577 to 0.0067; and
- homepage and planner mobile CLS measured zero.

The refined ocean-descent revision records a mobile synthetic score of 70 and LCP of 5.72 seconds
against 73 and 4.25 seconds in the lighter direction pass; desktop records 98 and 1.10 seconds.
Mobile FCP/TBT and transferred bytes varied across local runs. This evidence therefore does not claim an
across-the-board timing win or treat one favorable sample as representative. The separate
homepage still avoids the forecast projection and is materially faster and lighter than the
baseline planner, while `/forecast` retains the full data needed for offline comparison.

## Changes responsible

1. `scripts/generate_browser_projection.py` emits
   `public/data/opportunities-browser.json`, a deterministic browser projection of the canonical
   model-run document without changing the content-addressed scoring-source identity.
2. The first-party browser and service worker request the 1,790,613-byte projection instead of
   the 3,807,293-byte canonical document. All 2,160 scored windows and required public-condition
   values remain available; the canonical document remains the API/review fixture.
3. The target ranker's percentile tie calculation no longer performs a full-array `lastIndexOf`
   scan for each distinct item after sorting.
4. The loading layout reserves the desktop forecast workspace until verified data mounts, which
   prevents the validation section from shifting through the initial viewport.
5. The mobile footer brand and forecast-area select now have explicit accessible names.
6. `/` is now a code-native marketing page and the full planner is routed to `/forecast`.
   The homepage does not request the 1.79 MB forecast projection before a visitor chooses to
   open the product.
7. The homepage art remains code-native SVG/CSS: the full-bleed horizon, scroll-bound sun and
   nightfall, continuous surface-to-abyss descent, mobile-aware horizontal spearfishers, dense
   fish schools and wildlife, smaller sinking vintage diving equipment and anglerfish, one
   standalone non-looping cast, and volcanic seafloor add no raster hero download.
8. Below-fold proof/footer sections use `content-visibility` containment, and the scroll controller
   avoids an unnecessary initial layout read when the page begins at the top.

## Residual risk and next work

- The 1.79 MB forecast projection remains the dominant planner transfer. Mobile LCP at 17.05
  seconds under Lighthouse throttling is still too slow for a mature public release.
- The latest homepage mobile LCP is 5.72 seconds in the recorded synthetic run, 1.47 seconds slower
  than the lighter direction pass. Preserve the current design for review, then profile hydration
  and SVG/layout cost before treating the homepage as launch-ready.
- A future phase should evaluate a versioned columnar/dictionary encoding, range/page loading, or
  server-ranked short horizon without weakening offline reproducibility or silently changing
  score semantics.
- The client map chunk remains over 1 MB uncompressed but is lazy-loaded outside the critical
  route; any MapLibre major upgrade remains isolated in open PR #169 and is not folded into this
  candidate.
- Best Practices remains 96 because the local production server lacks production bindings and the
  canonical manifest URL cannot resolve from the isolated local run. These local console errors
  are recorded, not treated as deployed-state evidence.
- Real-user Core Web Vitals, CDN compression/cache behavior, low-end physical devices, and the
  final deployed origin remain independent release evidence.
