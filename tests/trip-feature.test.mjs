import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const featurePath = new URL("../app/components/TripReportFeature.tsx", import.meta.url);
const accountStoragePath = new URL("../app/lib/account-browser-storage.ts", import.meta.url);
const appPath = new URL("../app/components/OpportunityApp.tsx", import.meta.url);
const gearFieldsPath = new URL("../app/components/GearCatalogFields.tsx", import.meta.url);

test("trip validation UI uses the first-party API contract", async () => {
  const source = await readFile(featurePath, "utf8");

  assert.match(source, /fetch\("\/api\/trips\/start"/);
  assert.match(source, /`\/api\/trips\/\$\{encodeURIComponent\(activeTrip\.id\)\}\/complete`/);
  assert.match(source, /fetch\("\/api\/trips\/report"/);
  assert.match(source, /fetch\("\/api\/trips\/summary"/);
  assert.match(source, /formData\.set\("website", ""\)/);
  assert.match(source, /formData\.set\("referralCode", referralCodeRef\.current\)/);
  assert.match(source, /authoritativeStartedAt = typeof trip\.startedAt === "string" \? trip\.startedAt : startedAt/);
  assert.match(source, /startedAt: authoritativeStartedAt/);
  assert.match(source, /const startedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(source, /Tap Start trip when you begin/);
  assert.match(source, /estimatedEndLocal/);
  assert.match(source, /formData\.set\("endedAt", new Date\(\)\.toISOString\(\)\)/);
  assert.match(source, /server records the finish time and estimates effort/);
  assert.match(source, /<TripCompletionFields fields=\{fields\} setFields=\{setFields\} onCatchResult=\{updateCatchResult\} hideTimes \/>/);
});

test("active reports are recoverable while GPS is reduced to a catalog site", async () => {
  const [source, accountStorage] = await Promise.all([
    readFile(featurePath, "utf8"),
    readFile(accountStoragePath, "utf8"),
  ]);

  assert.match(source, /LEGACY_ACTIVE_TRIP_KEY/);
  assert.match(source, /LEGACY_REPORTER_KEY/);
  assert.match(accountStorage, /contourcast\.active-trip\.v1/);
  assert.match(accountStorage, /contourcast\.reporter-key\.v1/);
  assert.match(source, /navigator\.geolocation/);
  assert.match(source, /only the matched catalog location is saved/i);
  assert.match(source, /raw coordinates are never submitted/);
  assert.doesNotMatch(source, /facebookHandle/);
});

test("trip UX distinguishes no fish, target encounters, and unresolved non-target catch", async () => {
  const source = await readFile(featurePath, "utf8");

  assert.match(source, /Record no-fish trip/);
  assert.match(source, /The camera is the path to future fish identification/);
  assert.match(source, /anyFishEncounters = targetEncounters \+ selectedCounts\.otherCatchCount/);
  assert.match(source, /separate validation protocol decides whether a report can become model evidence/);
  assert.match(source, /scoreInfluencedChoice: "" \| "yes" \| "no"/);
  assert.match(source, /primaryTargetConfirmed/);
  assert.match(source, /completeAttempt/);
  assert.match(source, /What happened\?/);
  assert.match(source, /halibut-released/);
  assert.match(source, /capture="environment"/);
  assert.match(source, /formData\.set\("mode", modeForSite\(site\)\)/);
  assert.doesNotMatch(source, /No — independent trip/);
  assert.match(source, /Trip reports do not change the current score/);
  assert.match(source, /image\/jpeg,image\/png,image\/webp/);
  assert.match(source, /MAX_PHOTO_BYTES = 5 \* 1024 \* 1024/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /role=\{state === "error" \|\| state === "ambiguous" \? "alert" : "status"\}/);
  assert.match(source, /aria-live=\{state === "error" \|\| state === "ambiguous" \? undefined : "polite"\}/);
});

test("trip entry points are present in the top bar, forecast detail, and validation section", async () => {
  const [feature, app] = await Promise.all([
    readFile(featurePath, "utf8"),
    readFile(appPath, "utf8"),
  ]);

  assert.match(app, /disabled=\{!forecastReady\}/);
  assert.match(app, /Wait for the fishing-location catalog and forecast snapshot to load/);
  assert.match(app, /Forecast verification failed\. Retry the forecast before logging a trip\./);
  assert.match(app, /Log trip\s*<\/button>/);
  assert.match(app, /Fish this window/);
  assert.match(app, /<TripReportFeature/);
  assert.match(app, /sites=\{sites\}/);
  assert.match(app, /forecastReady=\{forecastReady\}/);
  assert.match(app, /forecastUnavailable=\{forecastUnavailable\}/);
  assert.match(app, /canSubmit=\{Boolean\(account\.user\?\.legalAccepted\)\}/);
  assert.match(feature, /nextPanel !== "complete" && \(!forecastReady \|\| sites\.length === 0\)/);
  assert.match(feature, /query\.get\("report"\) === "trip"[\s\S]*forecastReady/);
  assert.match(feature, /panel && panel !== "complete" && \(!forecastReady \|\| sites\.length === 0\)/);
  assert.match(feature, /const startTrip[\s\S]*if \(!forecastReady \|\| sites\.length === 0\)/);
  assert.doesNotMatch(app, /training data can be checked/);
  assert.match(feature, /id="validation"/);
  assert.match(feature, /The skunks/);
  assert.match(app, /22 inches total length/);
  assert.match(app, /contourcast\.respect-water\.v1/);
  assert.match(feature, /whether it’s a skunk or not are useful and genuinely appreciated/);
});

test("loopback previews can inspect trip logging without weakening live auth", async () => {
  const [feature, app] = await Promise.all([
    readFile(featurePath, "utf8"),
    readFile(appPath, "utf8"),
  ]);

  assert.match(app, /localTripPreview = typeof window !== "undefined"/);
  assert.match(app, /!account\.user && !localTripPreview/);
  assert.match(app, /previewOnly=\{localTripPreview\}/);
  assert.match(feature, /previewOnly\?: boolean/);
  assert.match(feature, /if \(!canSubmit && !previewOnly\)/);
  assert.match(feature, /Preview only: sign in to submit a trip from the live app/);
});

test("forecast controls offer practical preset and custom location radii", async () => {
  const app = await readFile(appPath, "utf8");

  assert.match(app, /Within 5 mi/);
  assert.match(app, /Within 15 mi/);
  assert.match(app, /Within 30 mi/);
  assert.match(app, /Custom radius in miles/);
  assert.match(app, /site\.distanceMiles <= activeRadiusMiles/);
});

test("trip reports keep gear setup in the profile instead of repeating text boxes", async () => {
  const [feature, gearFields] = await Promise.all([
    readFile(featurePath, "utf8"),
    readFile(gearFieldsPath, "utf8"),
  ]);

  assert.match(feature, /Saved gear preset/);
  assert.match(feature, /href="\/profile#gear"/);
  assert.doesNotMatch(feature, /<GearCatalogFields/);
  assert.match(gearFields, /Other \/ not listed/);
  assert.match(gearFields, /role="combobox"/);
  assert.match(gearFields, /Bait or unlisted lure/);
});
