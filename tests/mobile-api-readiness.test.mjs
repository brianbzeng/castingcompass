import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  API_COMPATIBILITY_VERSION,
  API_VERSION_HEADER,
  unsupportedApiVersionResponse,
} from "../worker/api-version.ts";
import { hardenResponse } from "../worker/security.ts";

const ORIGIN = "https://castingcompass.com";

test("API compatibility negotiation is additive and rejects ambiguous opt-in clients", async () => {
  assert.equal(unsupportedApiVersionResponse(new Request(`${ORIGIN}/api/health`)), null);
  assert.equal(unsupportedApiVersionResponse(new Request(`${ORIGIN}/api/health`, {
    headers: { [API_VERSION_HEADER]: API_COMPATIBILITY_VERSION },
  })), null);
  assert.equal(unsupportedApiVersionResponse(new Request(`${ORIGIN}/about`, {
    headers: { [API_VERSION_HEADER]: "future" },
  })), null);

  for (const supplied of ["2", "1, 1", "future", "x".repeat(256)]) {
    const response = unsupportedApiVersionResponse(new Request(`${ORIGIN}/api/health`, {
      headers: { [API_VERSION_HEADER]: supplied },
    }));
    assert.equal(response?.status, 400);
    assert.equal(response?.headers.get("Cache-Control"), "no-store");
    assert.equal(response?.headers.get(API_VERSION_HEADER), API_COMPATIBILITY_VERSION);
    assert.deepEqual(await response?.json(), {
      error: {
        code: "unsupported_api_version",
        message: `This client is not compatible with CastingCompass API version ${API_COMPATIBILITY_VERSION}.`,
      },
    });
  }
});

test("central hardening owns the API response version header", () => {
  const response = hardenResponse(new Response("{}", {
    headers: { [API_VERSION_HEADER]: "hostile-route-value" },
  }), new Request(`${ORIGIN}/api/profile`));
  assert.equal(response.headers.get(API_VERSION_HEADER), API_COMPATIBILITY_VERSION);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("mobile/API policy verifier fails closed over runtime, CI, and layout contracts", async () => {
  const result = spawnSync(process.execPath, ["scripts/verify-mobile-readiness.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Mobile\/API readiness policy verified/);

  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.ok(
    worker.indexOf("releaseMaintenanceResponse(request, env)") <
      worker.indexOf("unsupportedApiVersionResponse(request)"),
  );
  assert.ok(
    worker.indexOf("unsupportedApiVersionResponse(request)") <
      worker.indexOf("enforceRequestRateLimit(request, env)"),
  );
  assert.ok(
    worker.indexOf("enforceRequestRateLimit(request, env)") < worker.indexOf("guardRequestBody(request)"),
  );
});
