import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the route loading screen is accessible and does not invent progress", async () => {
  const loading = await source("app/loading.tsx");

  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(loading, /route-loading-grid" aria-hidden="true"/);
  assert.match(loading, /This may take a moment\./);
  assert.doesNotMatch(loading, /\b\d{1,3}%\b|percent complete|almost done/i);
});

test("the route error boundary offers a safe retry without exposing diagnostics", async () => {
  const errorPage = await source("app/error.tsx");

  assert.match(errorPage, /^"use client";/);
  assert.match(errorPage, /role="alert"/);
  assert.match(errorPage, /onClick=\{reset\}/);
  assert.match(errorPage, /href="\/"/);
  assert.match(errorPage, /verify its status before submitting it again/i);
  assert.doesNotMatch(errorPage, /error\.(?:message|stack|cause|digest)|console\.|JSON\.stringify\(error/i);
});

test("route loading animation participates in the global reduced-motion policy", async () => {
  const styles = await source("app/globals.css");

  assert.match(styles, /@keyframes route-loading-shimmer/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /animation-duration: 0\.01ms !important/);
  assert.match(styles, /\.route-state-action:focus-visible/);
});
