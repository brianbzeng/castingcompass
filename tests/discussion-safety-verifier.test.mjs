import assert from "node:assert/strict";
import test from "node:test";
import { verifyLiveSafety, verifySourceSafety } from "../scripts/verify-discussion-safety.mjs";

test("discussion safety source preflight covers the release invariants", async () => {
  const checks = await verifySourceSafety();
  assert.ok(checks.length >= 12);
  assert.ok(checks.includes("public discussions default off"));
  assert.ok(checks.includes("AI review must not reference the public table or writer"));
  assert.ok(checks.includes("safe rollback floor is documented"));
});

test("live verifier checks every site plus mutation and invalid-site behavior", async () => {
  const requests = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    requests.push({ url: url.toString(), method });
    if (method !== "GET") {
      return new Response(JSON.stringify({ error: { code: "method_not_allowed" } }), {
        status: 405,
        headers: { "Content-Type": "application/json", Allow: "GET", "Cache-Control": "no-store" },
      });
    }
    if (url.pathname.endsWith("/not-a-curated-site")) {
      return new Response(JSON.stringify({ error: { code: "invalid_site" } }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }
    return new Response(JSON.stringify({ posts: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  };

  const result = await verifyLiveSafety({
    baseUrls: ["https://castingcompass.test"],
    siteIds: ["site-a", "site-b"],
    fetchImpl,
  });
  assert.equal(result.requests, 4);
  assert.equal(requests.length, 4);
  assert.equal(requests.filter(({ method }) => method === "POST").length, 1);
});

test("live verifier fails closed on a visible post or cacheable response", async () => {
  await assert.rejects(
    verifyLiveSafety({
      baseUrls: ["https://castingcompass.test"],
      siteIds: ["site-a"],
      fetchImpl: async () => new Response(JSON.stringify({ posts: [{ id: "unexpected" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      }),
    }),
    /expected zero public posts/,
  );

  await assert.rejects(
    verifyLiveSafety({
      baseUrls: ["https://castingcompass.test"],
      siteIds: ["site-a"],
      fetchImpl: async () => new Response(JSON.stringify({ posts: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
      }),
    }),
    /expected Cache-Control no-store/,
  );
});
