import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [policySource, apiVersionSource, workerSource, securitySource, css, layout, playwright, workflow, mobileSpec] =
  await Promise.all([
    read("security/mobile-api-policy.json"),
    read("worker/api-version.ts"),
    read("worker/index.ts"),
    read("worker/security.ts"),
    read("app/globals.css"),
    read("app/layout.tsx"),
    read("playwright.config.ts"),
    read(".github/workflows/ci.yml"),
    read("tests/mobile-viewport.spec.ts"),
  ]);

const policy = JSON.parse(policySource);
assert.deepEqual(Object.keys(policy).sort(), [
  "api", "authentication", "coverage", "productionReadiness", "schemaVersion", "sharedContracts",
]);
assert.equal(policy.schemaVersion, 1);
assert.equal(policy.api.compatibilityVersion, "1");
assert.equal(policy.api.header, "X-CastingCompass-API-Version");
assert.equal(policy.api.requestHeaderRequired, false);
assert.equal(policy.api.unsupportedStatus, 400);
assert.equal(policy.api.unversionedFirstPartyWebAccepted, true);
assert.equal(policy.authentication.currentWebMode, "secure_host_cookie");
assert.equal(policy.authentication.credentialsInLocalStorageAllowed, false);
assert.equal(policy.authentication.nativeReleaseMode, "authorization_code_pkce_required_before_native_release");
assert.equal(policy.productionReadiness, false);

assert.match(apiVersionSource, /API_COMPATIBILITY_VERSION = "1"/);
assert.match(apiVersionSource, /API_VERSION_HEADER = "X-CastingCompass-API-Version"/);
assert.match(apiVersionSource, /status: 400/);
assert.match(securitySource, /headers\.set\(API_VERSION_HEADER, API_COMPATIBILITY_VERSION\)/);

const maintenance = workerSource.indexOf("releaseMaintenanceResponse(request, env)");
const compatibility = workerSource.indexOf("unsupportedApiVersionResponse(request)");
const rateLimit = workerSource.indexOf("enforceRequestRateLimit(request, env)");
const bodyGuard = workerSource.indexOf("guardRequestBody(request)");
assert.ok(maintenance >= 0 && maintenance < compatibility);
assert.ok(compatibility < rateLimit && rateLimit < bodyGuard);

assert.match(layout, /viewportFit:\s*"cover"/);
for (const variable of ["top", "right", "bottom", "left"]) {
  assert.match(css, new RegExp(`--safe-area-${variable}: env\\(safe-area-inset-${variable}, 0px\\)`));
}
for (const selector of policy.coverage.safeAreaSelectors) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(css, new RegExp(`${escapedSelector}\\s*\\{[^}]*var\\(--safe-area-`));
}

for (const project of [...policy.coverage.chromiumProjects, ...policy.coverage.webkitProjects]) {
  assert.match(playwright, new RegExp(`name:\\s*"${project}"`));
}
assert.match(playwright, /browserName:\s*"webkit"/);
assert.match(workflow, /playwright install --with-deps chromium webkit/);
assert.match(mobileSpec, /context\.setOffline\(true\)/);
assert.match(mobileSpec, /safe-area contract keeps fixed controls inside simulated insets/);

for (const path of policy.sharedContracts) await read(path);

process.stdout.write("Mobile/API readiness policy verified.\n");
