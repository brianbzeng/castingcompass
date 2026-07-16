import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function requirePattern(source, pattern, label) {
  if (!pattern.test(source)) throw new Error(`Source preflight failed: ${label}`);
  return label;
}

function forbidPattern(source, pattern, label) {
  if (pattern.test(source)) throw new Error(`Source preflight failed: ${label}`);
  return label;
}

export async function verifySourceSafety(root = DEFAULT_ROOT) {
  const read = (path) => readFile(resolve(root, path), "utf8");
  const [wrangler, review, discussions, migration, runbook] = await Promise.all([
    read("wrangler.jsonc"),
    read("worker/trip-review.ts"),
    read("worker/discussions.ts"),
    read("drizzle/0009_human_discussion_approval.sql"),
    read("docs/DISCUSSION-MODERATION.md"),
  ]);
  return [
    requirePattern(wrangler, /"PUBLIC_DISCUSSIONS_ENABLED"\s*:\s*"false"/, "public discussions default off"),
    forbidPattern(review, /publishTripDiscussion|site_discussion_posts/, "AI review must not reference the public table or writer"),
    requirePattern(review, /You cannot publish or approve it/, "AI prompt denies publication authority"),
    requirePattern(discussions, /!publicDiscussionsEnabled\(env\).*posts:\s*\[\]/s, "disabled endpoint returns no posts"),
    requirePattern(discussions, /post\.site_id = trip\.site_id/, "post site must match the reviewed trip"),
    requirePattern(discussions, /post\.source_ai_reviewed_at = trip\.ai_reviewed_at/, "approval binds to the reviewed version"),
    requirePattern(discussions, /trip\.ai_review_status = 'reviewed'/, "only currently reviewed trips are readable"),
    requirePattern(discussions, /trip\.moderation_status = 'approved'/, "trip requires human approval"),
    requirePattern(discussions, /Cache-Control"\)\) headers\.set\("Cache-Control", "no-store"\)/, "discussion responses are not cached"),
    requirePattern(migration, /ADD COLUMN `approved_at` text/, "approval timestamp migration exists"),
    requirePattern(migration, /ADD COLUMN `approved_by` text/, "approver migration exists"),
    requirePattern(migration, /ADD COLUMN `source_ai_reviewed_at` text/, "review-version migration exists"),
    requirePattern(runbook, /oldest permitted rollback target/, "safe rollback floor is documented"),
    requirePattern(runbook, /moderation_status = 'pending'/, "approval occurs while the trip remains hidden"),
  ];
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error(`Unsupported base URL protocol: ${url.protocol}`);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function responseJson(response, label) {
  try {
    return await response.json();
  } catch {
    throw new Error(`${label}: expected a JSON response`);
  }
}

export async function verifyLiveSafety({ baseUrls, siteIds, fetchImpl = globalThis.fetch }) {
  if (!Array.isArray(baseUrls) || baseUrls.length === 0) throw new Error("At least one --base-url is required for live verification.");
  if (!Array.isArray(siteIds) || siteIds.length === 0) throw new Error("At least one curated site is required for live verification.");
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  let requests = 0;
  for (const rawBaseUrl of baseUrls) {
    const baseUrl = normalizeBaseUrl(rawBaseUrl);
    await Promise.all(siteIds.map(async (siteId) => {
      const label = `${baseUrl}/api/discussions/${siteId}`;
      const response = await fetchImpl(label, {
        redirect: "follow",
        headers: { "Cache-Control": "no-cache" },
      });
      requests += 1;
      if (response.status !== 200) throw new Error(`${label}: expected 200, received ${response.status}`);
      const cacheControl = response.headers.get("Cache-Control") ?? "";
      if (!/\bno-store\b/i.test(cacheControl)) throw new Error(`${label}: expected Cache-Control no-store, received ${cacheControl || "none"}`);
      const payload = await responseJson(response, label);
      if (!Array.isArray(payload.posts)) throw new Error(`${label}: response is missing a posts array`);
      if (payload.posts.length !== 0) throw new Error(`${label}: expected zero public posts, received ${payload.posts.length}`);
    }));

    const sampleSite = siteIds[0];
    const mutationLabel = `${baseUrl}/api/discussions/${sampleSite}`;
    const mutation = await fetchImpl(mutationLabel, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: "{}",
    });
    requests += 1;
    if (mutation.status !== 405 || mutation.headers.get("Allow") !== "GET") {
      throw new Error(`${mutationLabel}: POST must return 405 with Allow: GET`);
    }

    const invalidLabel = `${baseUrl}/api/discussions/not-a-curated-site`;
    const invalid = await fetchImpl(invalidLabel, { redirect: "follow", headers: { "Cache-Control": "no-cache" } });
    requests += 1;
    if (invalid.status !== 404) throw new Error(`${invalidLabel}: expected 404, received ${invalid.status}`);
  }

  return { baseUrls: baseUrls.map(normalizeBaseUrl), siteCount: siteIds.length, requests };
}

function parseArguments(args) {
  const baseUrls = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--base-url") {
      const next = args[index + 1];
      if (!next) throw new Error("--base-url requires a URL");
      baseUrls.push(next);
      index += 1;
    } else if (value === "--help") {
      return { help: true, baseUrls: [] };
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return { help: false, baseUrls };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: npm run verify:discussion-safety -- [--base-url https://host]...\n");
    return;
  }
  const sourceChecks = await verifySourceSafety();
  const result = { sourceChecks };
  if (options.baseUrls.length > 0) {
    const sites = JSON.parse(await readFile(resolve(DEFAULT_ROOT, "public/data/sites.json"), "utf8"));
    result.live = await verifyLiveSafety({
      baseUrls: options.baseUrls,
      siteIds: sites.map((site) => site.id),
    });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
