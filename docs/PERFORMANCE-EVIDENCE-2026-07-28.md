# Production-build performance evidence

Evidence date: **2026-07-28 UTC**

Scope: local production-shaped Vinext build at `http://127.0.0.1:4173/`; no provider,
deployment, domain, or production request was made.

## Reproduction

The baseline was captured from reviewed `origin/main`
`ac7e67b90450f28322efedec9f64bf14a3026396`. The after run used the final local candidate source.
Both used Lighthouse `13.4.1`, Chrome `150.0.0.0`, the standard Lighthouse mobile profile, and
the Lighthouse desktop preset.

```sh
npx --yes -p node@22.23.1 -p npm@10.9.8 npm run build:cloudflare
npx --yes -p node@22.23.1 -p npm@10.9.8 npm run start -- --host 127.0.0.1 --port 4173

npx --yes lighthouse@13.4.1 http://127.0.0.1:4173 \
  --quiet \
  --chrome-path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --output=json \
  --output-path=mobile.json

npx --yes lighthouse@13.4.1 http://127.0.0.1:4173 \
  --quiet \
  --preset=desktop \
  --chrome-path="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --output=json \
  --output-path=desktop.json
```

Raw Lighthouse reports are intentionally retained as local work evidence rather than committed
large generated files. The table below is sufficient to compare the exact audited fields.

## Results

| Profile | State | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS | Transferred bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile | baseline | 61 | 88 | 96 | 100 | 4,740 ms | 26,738 ms | 69 ms | 0.0182 | 5,196,418 |
| Mobile | candidate | 62 | 100 | 96 | 100 | 4,847 ms | 17,746 ms | 105 ms | 0 | 3,200,883 |
| Desktop | baseline | 52 | 96 | 96 | 100 | 904 ms | 4,632 ms | 0 ms | 0.4577 | 5,196,418 |
| Desktop | candidate | 82 | 100 | 96 | 100 | 910 ms | 3,113 ms | 0 ms | 0.0067 | 3,200,883 |

Material changes:

- mobile transferred bytes decreased by 38.4%;
- desktop transferred bytes decreased by 38.4%;
- mobile LCP improved by 33.6%;
- desktop LCP improved by 32.8%;
- desktop performance improved by 30 points;
- mobile and desktop accessibility both reached 100;
- desktop CLS improved from 0.4577 to 0.0067; and
- mobile CLS improved to zero.

FCP is essentially unchanged/slightly slower (+107 ms mobile, +6 ms desktop). Mobile TBT also
varied from 69 ms to 105 ms in this synthetic run, so this evidence does not claim an
across-the-board timing win.

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

## Residual risk and next work

- The 1.79 MB forecast projection remains the dominant mobile transfer. Mobile LCP at 17.75
  seconds under Lighthouse throttling is still too slow for a mature public release.
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
