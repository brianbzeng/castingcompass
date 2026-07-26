import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [
  policySource,
  apiVersionSource,
  workerSource,
  securitySource,
  css,
  layout,
  playwright,
  workflow,
  mobileSpec,
  nativeContractSource,
  nativeAuthSource,
  routePolicySource,
  nativeMigrationSource,
  nativeBrowserContractSource,
  nativeAuthorizationPageSource,
  nativeAuthorizationRouteSource,
] =
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
    read("shared/native-auth-contract.ts"),
    read("worker/native-auth.ts"),
    read("worker/route-policy.ts"),
    read("drizzle/0021_native_oauth.sql"),
    read("shared/native-authorize-browser.ts"),
    read("app/components/NativeAuthorizationPage.tsx"),
    read("app/native/authorize/page.tsx"),
  ]);

const policy = JSON.parse(policySource);
assert.deepEqual(Object.keys(policy).sort(), [
  "api", "authentication", "coverage", "productionReadiness", "schemaVersion", "sharedContracts",
]);
assert.equal(policy.schemaVersion, 2);
assert.equal(policy.api.compatibilityVersion, "1");
assert.equal(policy.api.header, "X-CastingCompass-API-Version");
assert.equal(policy.api.requestHeaderRequired, false);
assert.equal(policy.api.unsupportedStatus, 400);
assert.equal(policy.api.unversionedFirstPartyWebAccepted, true);
assert.equal(policy.authentication.currentWebMode, "secure_host_cookie");
assert.equal(policy.authentication.credentialsInLocalStorageAllowed, false);
assert.deepEqual(policy.authentication.native, {
  serverBoundary: "implemented_disabled_by_default",
  releaseMode: "authorization_code_pkce",
  publicClient: true,
  clientSecretAllowed: false,
  exactClientAndRedirectRequired: true,
  allowedRedirectProtocols: ["https:", "castingcompass:"],
  authorizationBrowser: "system_browser_required",
  codeChallengeMethod: "S256",
  authorizationCodeSeconds: 300,
  accessTokenSeconds: 600,
  refreshTokenSeconds: 2592000,
  refreshTokenRotationRequired: true,
  refreshTokenReuseAction: "revoke_family",
  serverRevocationRequired: true,
  tokenStorage: "ios_keychain_only",
  scopes: ["profile:read", "trips:write"],
  environment: {
    enabled: "NATIVE_OAUTH_ENABLED",
    clientId: "NATIVE_OAUTH_CLIENT_ID",
    redirectUri: "NATIVE_OAUTH_REDIRECT_URI",
  },
});
assert.equal(policy.productionReadiness, false);

assert.match(nativeContractSource, /NATIVE_OAUTH_AUTHORIZATION_CODE_SECONDS = 5 \* 60/);
assert.match(nativeContractSource, /NATIVE_OAUTH_ACCESS_TOKEN_SECONDS = 10 \* 60/);
assert.match(nativeContractSource, /NATIVE_OAUTH_REFRESH_TOKEN_SECONDS = 30 \* 24 \* 60 \* 60/);
assert.match(nativeContractSource, /"profile:read",\s+"trips:write"/);
assert.match(nativeContractSource, /NATIVE_OAUTH_CODE_CHALLENGE_METHOD = "S256"/);
assert.match(nativeContractSource, /NATIVE_OAUTH_ALLOWED_REDIRECT_PROTOCOLS = \["https:", "castingcompass:"\]/);
assert.match(nativeAuthSource, /env\.NATIVE_OAUTH_ENABLED !== "true"/);
assert.match(nativeAuthSource, /value !== configuration\.clientId/);
assert.match(nativeAuthSource, /body\.redirectUri !== configuration\.redirectUri/);
assert.match(nativeAuthSource, /Refresh-token reuse was detected; sign in again/);
assert.match(nativeAuthSource, /UPDATE native_oauth_refresh_families\s+SET revoked_at = COALESCE\(revoked_at, \?\)/);
assert.match(nativeAuthSource, /request\.headers\.has\("Cookie"\)/);
assert.match(nativeAuthSource, /request\.headers\.get\("Origin"\) !== new URL\(request\.url\)\.origin/);
assert.match(nativeAuthSource, /Native token operations must not include browser or bearer authority/);
assert.match(routePolicySource, /"native_oauth\.authorize"[\s\S]*sameOriginRequired: true/);
assert.match(routePolicySource, /"native_oauth\.token"[\s\S]*"public",\s+"native_auth"/);
assert.match(routePolicySource, /nativeScopes: \["profile:read"\]/);
assert.match(routePolicySource, /nativeScopes: \["trips:write"\]/);
assert.equal((nativeMigrationSource.match(/CREATE TABLE `native_oauth_/g) ?? []).length, 4);
assert.equal((nativeMigrationSource.match(/CREATE INDEX `native_oauth_/g) ?? []).length, 8);
assert.doesNotMatch(nativeMigrationSource, /client_secret|access_token` text|refresh_token` text/i);
assert.match(nativeBrowserContractSource, /params\.getAll\(field\)\.length !== 1/);
assert.match(nativeBrowserContractSource, /NATIVE_OAUTH_ALLOWED_REDIRECT_PROTOCOLS\.includes/);
assert.match(nativeBrowserContractSource, /actual\.searchParams\.get\("state"\) !== request\.state/);
assert.match(nativeAuthorizationPageSource, /fetch\("\/api\/native\/oauth\/authorize"/);
assert.match(nativeAuthorizationPageSource, /window\.location\.assign\(callback\)/);
assert.match(nativeAuthorizationPageSource, /window\.history\.replaceState\(null, "", window\.location\.pathname\)/);
assert.match(nativeAuthorizationPageSource, /AccountModal/);
assert.match(nativeAuthorizationRouteSource, /referrer:\s*"no-referrer"/);
assert.match(nativeAuthorizationRouteSource, /index:\s*false/);
assert.match(nativeAuthorizationRouteSource, /follow:\s*false/);
assert.match(mobileSpec, /native system-browser handoff strips its request query and reflows at 320px/);

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
