import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("safety floor disables public Worker subdomains and version previews", async () => {
  const config = JSON.parse(await readFile(new URL("wrangler.jsonc", root), "utf8"));
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.vars.PUBLIC_DISCUSSIONS_ENABLED, "false");
});

test("safety floor deployment scripts cannot run migrations or deploy directly", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  for (const name of ["deploy:cloudflare", "release:cloudflare"]) {
    assert.match(manifest.scripts[name], /current reviewed release wrapper/u);
    assert.doesNotMatch(manifest.scripts[name], /\bwrangler\b|migrations?\s+apply|\bnpm\s+run/u);
  }
  assert.match(manifest.scripts["build:cloudflare"], /NEXT_PUBLIC_API_URL=/u);
});

test("safety floor retains containment and a fail-closed hostname boundary", async () => {
  const [entrypoint, review] = await Promise.all([
    readFile(new URL("worker/index.ts", root), "utf8"),
    readFile(new URL("worker/trip-review.ts", root), "utf8"),
  ]);
  assert.match(entrypoint, /url\.hostname !== "castingcompass\.com"/u);
  assert.match(entrypoint, /status: 404/u);
  assert.match(entrypoint, /"Cache-Control": "no-store"/u);
  assert.doesNotMatch(review, /INSERT\s+INTO\s+site_discussion_posts/iu);
});

test("built Worker rejects unknown hosts before bindings and preserves exact alias redirects", async () => {
  const { default: worker } = await import(new URL("dist/server/index.js", root));
  for (const hostname of [
    "unknown.example",
    "contourcast-halibut.bzeng9099.workers.dev",
    "preview-contourcast-halibut.bzeng9099.workers.dev",
  ]) {
    const response = await worker.fetch(new Request(`https://${hostname}/api/health`), {}, {});
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  }

  for (const hostname of [
    "www.castingcompass.com",
    "castcompass.brianbzeng.com",
    "contourcast.brianbzeng.com",
  ]) {
    const response = await worker.fetch(new Request(`https://${hostname}/path?keep=1`), {}, {});
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("Location"), "https://castingcompass.com/path?keep=1");
  }
});
