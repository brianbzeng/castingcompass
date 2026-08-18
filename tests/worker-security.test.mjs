import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  API_MUTATION_BODY_LIMIT,
  CSP_REPORT_ONLY_HEADER,
  TRIP_MULTIPART_BODY_LIMIT,
  applyContentSecurityPolicy,
  bodyLimitForRequest,
  canonicalRedirect,
  guardRequestBody,
  hardenResponse,
  healthResponse,
  hostBoundaryResponse,
  normalizeNotFoundDocument,
  releaseMaintenanceEnabled,
  releaseMaintenanceResponse,
} from "../worker/security.ts";
import { API_COMPATIBILITY_VERSION, API_VERSION_HEADER } from "../worker/api-version.ts";

const ORIGIN = "https://castingcompass.com";

function okDatabase() {
  return {
    prepare(query) {
      assert.equal(query, "SELECT 1 AS ok");
      return { first: async () => ({ ok: 1 }) };
    },
  };
}

test("canonical redirects preserve path and query without redirecting preview hosts", () => {
  const aliasRequest = new Request("http://www.castingcompass.com:8080/locations/ocean-beach?day=2");
  const aliasResponse = canonicalRedirect(aliasRequest);
  assert.equal(aliasResponse?.status, 308);
  assert.equal(aliasResponse?.headers.get("Location"), "https://castingcompass.com/locations/ocean-beach?day=2");

  const cleartextCanonical = canonicalRedirect(new Request("http://castingcompass.com/privacy"));
  assert.equal(cleartextCanonical?.headers.get("Location"), "https://castingcompass.com/privacy");

  assert.equal(canonicalRedirect(new Request(`${ORIGIN}/privacy`)), null);
  assert.equal(canonicalRedirect(new Request("https://contourcast-halibut.workers.dev/privacy")), null);
  assert.equal(canonicalRedirect(new Request("https://example.com/privacy")), null);
});

test("deployment host boundary admits only exact environment hosts before routing", async () => {
  const production = { DEPLOYMENT_ENVIRONMENT: "production" };
  for (const hostname of [
    "castingcompass.com",
    "www.castingcompass.com",
    "castcompass.brianbzeng.com",
    "contourcast.brianbzeng.com",
  ]) {
    assert.equal(hostBoundaryResponse(new Request(`https://${hostname}/api/health`), production), null);
  }

  for (const url of [
    "https://contourcast-halibut.workers.dev/api/health",
    "https://contourcast-halibut.preview.workers.dev/api/health",
    "https://example.com/api/health",
    "https://isolated.example.test/api/health",
  ]) {
    const response = hostBoundaryResponse(new Request(url), production);
    assert.equal(response?.status, 421);
    assert.equal(response?.headers.get("Cache-Control"), "no-store");
    assert.equal(await response?.text(), "Misdirected Request");
  }

  const staging = { DEPLOYMENT_ENVIRONMENT: "staging", STAGING_HOSTNAME: "isolated.example.test" };
  assert.equal(hostBoundaryResponse(new Request("https://isolated.example.test/"), staging), null);
  assert.equal(hostBoundaryResponse(new Request(`${ORIGIN}/`), staging)?.status, 421);
  assert.equal(hostBoundaryResponse(new Request("http://isolated.example.test/"), staging)?.status, 421);
  assert.equal(hostBoundaryResponse(new Request("https://preview.workers.dev/"), {
    ...staging,
    STAGING_HOSTNAME: "preview.workers.dev",
  })?.status, 421);

  assert.equal(hostBoundaryResponse(new Request("http://localhost/"), {}), null);
  assert.equal(hostBoundaryResponse(new Request(`${ORIGIN}/`), {})?.status, 421);
  assert.equal(hostBoundaryResponse(new Request(`${ORIGIN}/`), {
    DEPLOYMENT_ENVIRONMENT: "unexpected",
  })?.status, 421);
});

test("the host boundary executes before redirects, maintenance, abuse controls, and handlers", async () => {
  const source = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const entry = source.indexOf("async function handleFetchRequest(");
  const hostBoundary = source.indexOf("hostBoundaryResponse(request, env)", entry);
  const redirect = source.indexOf("canonicalRedirect(request)", entry);
  const maintenance = source.indexOf("releaseMaintenanceResponse(request, env)", entry);
  const rateLimit = source.indexOf("enforceRequestRateLimit(request, env)", entry);
  const routeRejection = source.indexOf("apiRouteRejectionForRequest(request)", entry);
  const bodyGuard = source.indexOf("guardRequestBody(request)", entry);
  const dispatch = source.indexOf("routeRequest(routedRequest", entry);

  assert.ok(entry >= 0);
  assert.ok(hostBoundary > entry);
  assert.ok(hostBoundary < redirect);
  assert.ok(redirect < maintenance);
  assert.ok(maintenance < rateLimit);
  assert.ok(rateLimit < routeRejection);
  assert.ok(routeRejection < bodyGuard);
  assert.ok(bodyGuard < dispatch);
});

test("production exposure is disabled and the generated binding contract stays checked", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.vars.DEPLOYMENT_ENVIRONMENT, "production");
  assert.equal(config.vars.STAGING_HOSTNAME, "");
  assert.deepEqual(config.routes.map(({ pattern }) => pattern), [
    "castingcompass.com",
    "www.castingcompass.com",
    "castcompass.brianbzeng.com",
    "contourcast.brianbzeng.com",
  ]);

  const generated = await readFile(new URL("../worker-configuration.d.ts", import.meta.url), "utf8");
  assert.match(generated, /interface CloudflareEnv extends __BaseEnv_CloudflareEnv/);
  for (const binding of [
    "DB",
    "ASSETS",
    "CF_VERSION_METADATA",
    "AUTH_RATE_LIMITER",
    "EMAIL_RATE_LIMITER",
    "WRITE_RATE_LIMITER",
    "SENSITIVE_RATE_LIMITER",
    "READ_RATE_LIMITER",
    "AI_PROVIDER_RATE_LIMITER",
    "DEPLOYMENT_ENVIRONMENT",
    "STAGING_HOSTNAME",
  ]) {
    assert.match(generated, new RegExp(`\\b${binding}:`));
  }
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(manifest.scripts.typecheck, /types:cloudflare:check/);
  assert.match(manifest.scripts.typecheck, /tsconfig\.worker\.json/);
});

test("HTML receives one dynamic nonce and a complete non-breaking report-only CSP", async () => {
  const original = new Response(
    '<!doctype html><html><head><style>body{color:green}</style></head><body><script>globalThis.ready=true</script><script type="application/ld+json">{}</script></body></html>',
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": "10",
      },
    },
  );
  const secured = await applyContentSecurityPolicy(original, new Request(`${ORIGIN}/`));
  const policy = secured.headers.get(CSP_REPORT_ONLY_HEADER) ?? "";
  const match = policy.match(/'nonce-([a-f0-9]{32})'/);
  assert.ok(match);
  const nonce = match[1];
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self' 'nonce-[a-f0-9]{32}' 'strict-dynamic'/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.match(policy, /style-src-attr 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /upgrade-insecure-requests/);
  assert.doesNotMatch(policy, /'unsafe-inline'|'unsafe-eval'/);
  assert.equal(secured.headers.has("Content-Length"), false);

  const html = await secured.text();
  assert.equal([...html.matchAll(/<script\b[^>]*\bnonce="([^"]+)"/gi)].length, 2);
  assert.equal([...html.matchAll(/<style\b[^>]*\bnonce="([^"]+)"/gi)].length, 1);
  for (const occurrence of html.matchAll(/<(?:script|style)\b[^>]*\bnonce="([^"]+)"/gi)) {
    assert.equal(occurrence[1], nonce);
  }

  const second = await applyContentSecurityPolicy(
    new Response("<!doctype html><script></script>", { headers: { "Content-Type": "text/html" } }),
    new Request(`${ORIGIN}/`),
  );
  assert.notEqual(second.headers.get(CSP_REPORT_ONLY_HEADER)?.match(/'nonce-([a-f0-9]{32})'/)?.[1], nonce);

  const json = new Response("{}", { headers: { "Content-Type": "application/json" } });
  assert.equal(await applyContentSecurityPolicy(json, new Request(`${ORIGIN}/api/health`)), json);
});

test("health endpoint reports D1 readiness, Worker and staging exercise identity, and supports HEAD", async () => {
  const env = {
    DB: okDatabase(),
    CF_VERSION_METADATA: { id: "version-123" },
    SECURITY_EXERCISE_ID: "sec_0123456789abcdef0123456789abcdef",
  };
  const get = await healthResponse(new Request(`${ORIGIN}/api/health`), env);
  assert.equal(get?.status, 200);
  assert.deepEqual(await get?.json(), {
    status: "ok",
    service: "castingcompass-web",
    apiCompatibilityVersion: API_COMPATIBILITY_VERSION,
    workerVersionId: "version-123",
    releaseMaintenance: false,
    securityExerciseId: "sec_0123456789abcdef0123456789abcdef",
  });
  assert.equal(get?.headers.get("Cache-Control"), "no-store");

  const head = await healthResponse(new Request(`${ORIGIN}/api/health`, { method: "HEAD" }), env);
  assert.equal(head?.status, 200);
  assert.equal(await head?.text(), "");

  const degraded = await healthResponse(new Request(`${ORIGIN}/api/health`), {});
  assert.equal(degraded?.status, 503);
  assert.deepEqual(await degraded?.json(), {
    status: "degraded",
    service: "castingcompass-web",
    apiCompatibilityVersion: API_COMPATIBILITY_VERSION,
    workerVersionId: null,
    releaseMaintenance: false,
    securityExerciseId: null,
  });

  const post = await healthResponse(new Request(`${ORIGIN}/api/health`, { method: "POST" }), { DB: okDatabase() });
  assert.equal(post?.status, 405);
  assert.equal(post?.headers.get("Allow"), "GET, HEAD");

  assert.equal(await healthResponse(new Request(`${ORIGIN}/api/other`), { DB: okDatabase() }), null);
});

test("release maintenance stops writes and serves a self-contained browser 503", async () => {
  const enabled = { RELEASE_MAINTENANCE_MODE: "true" };
  assert.equal(releaseMaintenanceEnabled(enabled), true);
  assert.equal(releaseMaintenanceEnabled({ RELEASE_MAINTENANCE_MODE: "invalid" }), true);
  assert.equal(releaseMaintenanceEnabled({ RELEASE_MAINTENANCE_MODE: "false" }), false);
  assert.equal(releaseMaintenanceEnabled({}), false);
  assert.equal(releaseMaintenanceEnabled(undefined), false);
  assert.equal(releaseMaintenanceResponse(new Request(`${ORIGIN}/privacy`), undefined), null);

  const response = releaseMaintenanceResponse(
    new Request(`${ORIGIN}/api/trips/trip_123/complete`, { method: "POST", body: "large-body-not-read" }),
    enabled,
  );
  assert.equal(response?.status, 503);
  assert.equal(response?.headers.get("Retry-After"), "300");
  assert.equal(response?.headers.get("X-CastingCompass-Maintenance"), "true");
  assert.equal(response?.headers.get("Cache-Control"), "no-store");
  assert.equal((await response?.json()).error.code, "release_maintenance");
  assert.equal(releaseMaintenanceResponse(new Request(`${ORIGIN}/api/health`), enabled), null);

  const page = releaseMaintenanceResponse(new Request(`${ORIGIN}/privacy`, {
    headers: { Accept: "text/html,application/xhtml+xml" },
  }), enabled);
  assert.equal(page?.status, 503);
  assert.match(page?.headers.get("Content-Type") ?? "", /^text\/html\b/);
  assert.equal(page?.headers.get("Retry-After"), "300");
  assert.equal(page?.headers.get("Cache-Control"), "no-store, no-transform");
  assert.equal(page?.headers.get("CDN-Cache-Control"), "no-store");
  assert.equal(page?.headers.get("X-CastingCompass-Maintenance"), "true");
  const pageHtml = await page?.text() ?? "";
  assert.match(pageHtml, /Brief maintenance · CastingCompass/);
  assert.match(pageHtml, /No account or trip changes are being accepted/);
  assert.doesNotMatch(pageHtml, /<script\b|noindex|https?:\/\//i);

  const head = releaseMaintenanceResponse(new Request(`${ORIGIN}/`, {
    method: "HEAD",
    headers: { Accept: "text/html" },
  }), enabled);
  assert.equal(head?.status, 503);
  assert.equal(await head?.text(), "");

  const futureWrite = releaseMaintenanceResponse(new Request(`${ORIGIN}/future-action`, {
    method: "POST",
    body: "not-read",
  }), enabled);
  assert.equal(futureWrite?.status, 503);
  assert.equal((await futureWrite?.json()).error.code, "release_maintenance");

  assert.equal(releaseMaintenanceResponse(new Request(`${ORIGIN}/robots.txt`, {
    headers: { Accept: "text/html" },
  }), enabled), null);
  assert.equal(releaseMaintenanceResponse(new Request(`${ORIGIN}/sitemap.xml`, {
    headers: { Accept: "text/html" },
  }), enabled), null);
  assert.equal(releaseMaintenanceResponse(new Request(`${ORIGIN}/icons/icon-192.png`, {
    headers: { Accept: "image/png" },
  }), enabled), null);

  const health = await healthResponse(new Request(`${ORIGIN}/api/health`), {
    ...enabled,
    DB: okDatabase(),
    SECURITY_EXERCISE_ID: "unsafe-value",
  });
  const healthBody = await health?.json();
  assert.equal(healthBody.releaseMaintenance, true);
  assert.equal(healthBody.securityExerciseId, null);
});

test("mutation limits are narrow for JSON routes and allow photo multipart routes", () => {
  const json = new Request(`${ORIGIN}/api/auth/login`, { method: "POST", body: "{}" });
  assert.equal(bodyLimitForRequest(json), API_MUTATION_BODY_LIMIT);

  const report = new Request(`${ORIGIN}/api/trips/report`, { method: "POST", body: "form" });
  assert.equal(bodyLimitForRequest(report), TRIP_MULTIPART_BODY_LIMIT);

  const complete = new Request(`${ORIGIN}/api/trips/trip_123/complete`, { method: "POST", body: "form" });
  assert.equal(bodyLimitForRequest(complete), TRIP_MULTIPART_BODY_LIMIT);

  assert.equal(bodyLimitForRequest(new Request(`${ORIGIN}/api/profile`)), null);
  assert.equal(bodyLimitForRequest(new Request(`${ORIGIN}/contact`, { method: "POST", body: "hello" })), null);
});

test("body guard rejects declared and actual oversized payloads", async () => {
  const declared = new Request(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Length": String(API_MUTATION_BODY_LIMIT + 1) },
    body: "{}",
  });
  const declaredResult = await guardRequestBody(declared);
  assert.equal(declaredResult.request, null);
  assert.equal(declaredResult.response?.status, 413);
  assert.equal((await declaredResult.response?.json()).error.code, "payload_too_large");

  const bytes = new Uint8Array(API_MUTATION_BODY_LIMIT + 1).fill(97);
  const streamed = new Request(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Length": "1" },
    body: bytes,
  });
  const streamedResult = await guardRequestBody(streamed);
  assert.equal(streamedResult.request, null);
  assert.equal(streamedResult.response?.status, 413);
});

test("body guard rebuilds allowed request bytes for downstream parsers", async () => {
  const payload = JSON.stringify({ email: "angler@example.com", password: "test-value" });
  const original = new Request(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": "1",
      "X-Test-Header": "preserved",
    },
    body: payload,
  });
  const result = await guardRequestBody(original);
  assert.equal(result.response, null);
  assert.equal(result.request?.method, "POST");
  assert.equal(result.request?.headers.get("Content-Type"), "application/json");
  assert.equal(result.request?.headers.get("X-Test-Header"), "preserved");
  assert.equal(result.request?.headers.has("Content-Length"), false);
  assert.equal(await result.request?.text(), payload);
});

test("body guard preserves multipart boundaries for trip handlers", async () => {
  const form = new FormData();
  form.set("token", "safe-token");
  form.set("notes", "Observed moderate shorebreak.");
  const original = new Request(`${ORIGIN}/api/trips/trip_123/complete`, {
    method: "POST",
    body: form,
  });

  const result = await guardRequestBody(original);
  assert.equal(result.response, null);
  const rebuilt = await result.request?.formData();
  assert.equal(rebuilt?.get("token"), "safe-token");
  assert.equal(rebuilt?.get("notes"), "Observed moderate shorebreak.");
});

test("central hardening prevents API caching and preserves explicit asset caching", () => {
  const apiRequest = new Request(`${ORIGIN}/api/discussions/ocean-beach`);
  const apiResponse = hardenResponse(new Response("{}", {
    headers: { "Cache-Control": "public, max-age=600" },
  }), apiRequest);
  assert.equal(apiResponse.headers.get("Cache-Control"), "no-store");
  assert.equal(apiResponse.headers.get("CDN-Cache-Control"), "no-store");
  assert.equal(apiResponse.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(apiResponse.headers.get(API_VERSION_HEADER), API_COMPATIBILITY_VERSION);
  assert.equal(apiResponse.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(apiResponse.headers.get("X-Frame-Options"), "DENY");
  assert.equal(apiResponse.headers.get("Strict-Transport-Security"), "max-age=31536000");
  assert.match(apiResponse.headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);

  const maintenanceResponse = hardenResponse(new Response("maintenance", {
    status: 503,
    headers: { "Cache-Control": "no-store, no-transform" },
  }), new Request(`${ORIGIN}/`));
  assert.equal(maintenanceResponse.headers.get("Cache-Control"), "no-store, no-transform");

  const assetResponse = hardenResponse(new Response("asset", {
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  }), new Request(`${ORIGIN}/_next/static/app.js`));
  assert.equal(assetResponse.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  assert.equal(assetResponse.headers.has("CDN-Cache-Control"), false);
  assert.equal(assetResponse.headers.has(API_VERSION_HEADER), false);

  const previewResponse = hardenResponse(
    new Response("page"),
    new Request("https://contourcast-halibut.preview.workers.dev/"),
  );
  assert.equal(previewResponse.headers.get("X-Robots-Tag"), "noindex, nofollow");

  const cookieResponse = hardenResponse(new Response("page", {
    headers: { "Set-Cookie": "cc_session=secret; Secure; HttpOnly" },
  }), new Request(`${ORIGIN}/account`));
  assert.equal(cookieResponse.headers.get("Cache-Control"), "no-store");
});

test("canonical page redirects have bounded caching while API redirects never cache", () => {
  const pageRequest = new Request("https://www.castingcompass.com/about");
  const page = hardenResponse(canonicalRedirect(pageRequest), pageRequest);
  assert.equal(page.headers.get("Cache-Control"), "public, max-age=3600");

  const apiRequest = new Request("https://www.castingcompass.com/api/health");
  const api = hardenResponse(canonicalRedirect(apiRequest), apiRequest);
  assert.equal(api.headers.get("Cache-Control"), "no-store");

  const appRedirect = hardenResponse(
    Response.redirect(`${ORIGIN}/profile`, 302),
    new Request(`${ORIGIN}/account`),
  );
  assert.equal(appRedirect.headers.get("Cache-Control"), "no-store");
  assert.equal(appRedirect.headers.get("CDN-Cache-Control"), "no-store");
});

test("Vinext not-found documents receive one accurate title and safe metadata", async () => {
  const source = new Response(
    '<!doctype html><html><head><title>CastingCompass</title><meta name="description" content="homepage"><meta content="noindex" name="robots"></head><body>404</body></html>',
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Content-Length": "12" } },
  );
  const response = await normalizeNotFoundDocument(source);
  assert.equal(response.status, 404);
  assert.equal(response.headers.has("Content-Length"), false);
  const html = await response.text();
  assert.deepEqual([...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((match) => match[1]), [
    "Page not found · CastingCompass",
  ]);
  assert.match(html, /name="description" content="The requested CastingCompass page could not be found\."/);
  assert.match(html, /<meta content="noindex" name="robots">/);

  const asset = new Response("missing", { status: 404, headers: { "Content-Type": "image/png" } });
  assert.equal(await normalizeNotFoundDocument(asset), asset);
});
