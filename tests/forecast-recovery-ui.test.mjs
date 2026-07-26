import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the forecast starts empty instead of inventing a cached ranking", async () => {
  const app = await source("app/components/OpportunityApp.tsx");

  assert.match(app, /type ForecastDataState = "loading" \| "live" \| "cached" \| "unavailable"/u);
  assert.match(
    app,
    /const EMPTY_FORECAST_SNAPSHOT:[\s\S]*modelVersion: ""[\s\S]*sources: \[\],[\s\S]*windows: \[\]/u,
  );
  assert.match(app, /useState<FishingSite\[\]>\(\[\]\)/u);
  assert.match(
    app,
    /useState<OpportunitySnapshot>\(EMPTY_FORECAST_SNAPSHOT\)/u,
  );
  assert.doesNotMatch(app, /FALLBACK_SITES|fallbackSnapshot|scores are illustrative|fallback-0\.1/u);
});

test("a failed core forecast read is distinct from a verified cached snapshot", async () => {
  const app = await source("app/components/OpportunityApp.tsx");

  assert.match(app, /async function loadForecastData\(signal: AbortSignal\)/u);
  assert.match(app, /fetch\("\/data\/sites\.json", \{ signal \}\)/u);
  assert.match(app, /fetch\("\/data\/opportunities\.json", \{ signal \}\)/u);
  assert.match(
    app,
    /\.catch\(\(\) => \{[\s\S]*controller\.signal\.aborted[\s\S]*setDataState\("unavailable"\)/u,
  );
  assert.doesNotMatch(
    app,
    /\.catch\(\(\) => \{[\s\S]{0,180}setDataState\("cached"\)/u,
  );
  assert.match(app, /controller\.abort\(\)/u);
});

test("loading and failure suppress rankings and expose a safe explicit retry", async () => {
  const [app, styles, browser] = await Promise.all([
    source("app/components/OpportunityApp.tsx"),
    source("app/globals.css"),
    source("tests/mobile-viewport.spec.ts"),
  ]);
  const tripFeature = await source("app/components/TripReportFeature.tsx");

  assert.match(app, /const forecastReady = dataState === "live" \|\| dataState === "cached"/u);
  assert.match(app, /\{forecastReady \? \(\s*<>[\s\S]*className=\{`workspace/u);
  assert.match(app, /className="forecast-state-card unavailable"[\s\S]*role="alert"/u);
  assert.match(app, /No fishing scores are shown because the current catalog or planning snapshot could not be verified/u);
  assert.match(app, /Nothing on this screen is being presented as a cached forecast/u);
  assert.match(app, /setForecastLoadAttempt\(\(attempt\) => attempt \+ 1\)/u);
  assert.match(app, /disabled=\{!forecastReady\}/u);
  assert.match(app, /initialSiteHandledRef\.current \|\| !forecastReady/u);
  assert.match(app, /\[forecastReady, mapEnabled, view\]/u);
  assert.match(app, /forecastReady=\{forecastReady\}/u);
  assert.match(app, /forecastUnavailable=\{forecastUnavailable\}/u);
  assert.match(styles, /\.data-pill\.unavailable i/u);
  assert.match(styles, /\.forecast-state-card\.unavailable/u);
  assert.match(styles, /\.source-recovery/u);
  assert.match(tripFeature, /forecastReady: boolean/u);
  assert.match(tripFeature, /forecastUnavailable: boolean/u);
  assert.match(
    tripFeature,
    /nextPanel !== "complete" && \(!forecastReady \|\| sites\.length === 0\)/u,
  );
  assert.match(
    tripFeature,
    /query\.get\("report"\) === "trip"[\s\S]*forecastReady &&[\s\S]*sites\.length > 0/u,
  );
  assert.match(
    tripFeature,
    /panel && panel !== "complete" && \(!forecastReady \|\| sites\.length === 0\)/u,
  );
  assert.match(
    tripFeature,
    /const startTrip[\s\S]*if \(!forecastReady \|\| sites\.length === 0\)/u,
  );
  assert.match(tripFeature, /Forecast verification failed\. Retry the forecast before logging a trip\./u);
  assert.match(tripFeature, /disabled=\{!forecastReady \|\| sites\.length === 0\}/u);
  assert.match(browser, /forecast failure hides unverified scores until an explicit retry succeeds/u);
  assert.match(browser, /await expect\(page\.locator\("\.score-orbit"\)\)\.toHaveCount\(0\)/u);
  assert.match(browser, /await expect\(page\.locator\("\.workspace"\)\)\.toHaveCount\(0\)/u);
});
