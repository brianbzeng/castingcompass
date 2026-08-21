import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contextPath = new URL("../worker/fish-identification-context.ts", import.meta.url);
const reviewPath = new URL("../worker/trip-review.ts", import.meta.url);

test("fish identification context is versioned, scoped, and source-backed", async () => {
  const source = await readFile(contextPath, "utf8");

  assert.match(source, /castingcompass\.fish-id-context\/2026-08-21\.1/);
  for (const species of [
    "california-halibut",
    "surfperch",
    "striped-bass",
    "leopard-shark",
    "other",
    "no-fish",
  ]) {
    assert.match(source, new RegExp(species));
  }
  for (const cue of [
    "arched lateral line",
    "continuous un-notched dorsal fin",
    "seven or eight uninterrupted dark horizontal stripes",
    "saddle-like bands",
  ]) {
    assert.match(source, new RegExp(cue));
  }
  assert.match(source, /wildlife\.ca\.gov/);
  assert.match(source, /fishbase\.se/);
});

test("the MiMo vision request injects the shared context", async () => {
  const source = await readFile(reviewPath, "utf8");

  assert.match(source, /FISH_IDENTIFICATION_CONTEXT/);
  assert.match(source, /You are a cautious fish-photo assistant/);
});

test("the live vision request contains the diagnostic cues without an extra lookup", async () => {
  const { analyzeFishPhotoWithMimo } = await import("../worker/trip-review.ts");
  let requestBody;
  const response = new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          confidence: "low",
          catches: [{ species: "other", count: 1, confidence: "low" }],
          note: "The image is only a partial view.",
        }),
      },
    }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  const result = await analyzeFishPhotoWithMimo(
    { MIMO_API_KEY: "test-key" },
    { type: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff]) },
    {
      fetcher: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body));
        return response;
      },
    },
  );

  assert.equal(result?.catches[0]?.species, "other");
  assert.match(requestBody.messages[0].content, /arched lateral line/);
  assert.match(requestBody.messages[0].content, /saddle-like bands/);
});
