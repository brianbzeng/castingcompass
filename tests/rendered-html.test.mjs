import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the ContourCast product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>ContourCast — California halibut opportunity planner(?: · ContourCast)?<\/title>/i);
  assert.match(html, /Find the water/);
  assert.match(html, /California halibut/);
  assert.match(html, /Ranked two-hour windows/);
  assert.match(html, /It is <strong>not<\/strong> an 80% chance/i);
  assert.match(html, /CDFW Bay regulations/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|SkeletonPreview/i);
});

test("ships install and offline assets", async () => {
  const [manifest, serviceWorker] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    access(new URL("../public/icons/icon-192.png", import.meta.url)),
    access(new URL("../public/icons/icon-512.png", import.meta.url)),
  ]);

  const parsed = JSON.parse(manifest);
  assert.equal(parsed.name, "ContourCast — Halibut Opportunity Planner");
  assert.equal(parsed.display, "standalone");
  assert.equal(parsed.icons.length, 2);
  assert.match(serviceWorker, /\/data\/opportunities\.json/);
  assert.match(serviceWorker, /caches\.match/);
});

test("keeps the score framed as a relative ranking", async () => {
  const app = await readFile(
    new URL("../app/components/OpportunityApp.tsx", import.meta.url),
    "utf8",
  );
  assert.match(app, /percentile within that current comparison set/);
  assert.match(app, /It is <strong>not<\/strong> an 80% chance/);
  assert.match(app, /Expired live inputs are excluded/);
  assert.match(app, /deep model is promoted only if geographically blocked evaluation beats simpler baselines/i);
});
