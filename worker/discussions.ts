import type { CuratedSite, D1DatabaseLike } from "./trips";
import { API_ROUTE_PATTERNS } from "./route-policy.ts";
import { logEvent, safeErrorFields } from "./observability.ts";

interface DiscussionEnv {
  DB?: D1DatabaseLike;
  PUBLIC_DISCUSSIONS_ENABLED?: string;
}

const initializedDatabases = new WeakMap<object, Promise<void>>();

const DISCUSSION_SCHEMA_READY_SQL = `SELECT
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
    'trips', 'site_discussion_posts'
  )) AS required_tables,
  (SELECT COUNT(*) FROM pragma_table_info('site_discussion_posts') WHERE name IN (
    'id', 'trip_id', 'site_id', 'summary', 'gear_summary', 'technique_tags_json',
    'observed_at', 'created_at', 'updated_at', 'review_model', 'approved_at',
    'approved_by', 'source_ai_reviewed_at'
  )) AS required_discussion_columns,
  (SELECT COUNT(*) FROM pragma_table_info('trips') WHERE name IN (
    'id', 'site_id', 'status', 'consent', 'moderation_status', 'ai_review_status',
    'ai_reviewed_at'
  )) AS required_trip_columns,
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN (
    'site_discussion_posts_trip_unique', 'site_discussion_posts_site_time_idx'
  )) AS required_indexes,
  (SELECT COUNT(*) FROM pragma_foreign_key_list('site_discussion_posts')
    WHERE "table" = 'trips' AND "from" = 'trip_id' AND "to" = 'id'
      AND upper(on_delete) = 'CASCADE') AS required_foreign_keys`;

class DiscussionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "DiscussionError";
    this.status = status;
    this.code = code;
  }
}

async function initialize(db: D1DatabaseLike) {
  let pending = initializedDatabases.get(db as object);
  if (!pending) {
    pending = (async () => {
      const readiness = await db.prepare(DISCUSSION_SCHEMA_READY_SQL)
        .first<{
          required_tables: number;
          required_discussion_columns: number;
          required_trip_columns: number;
          required_indexes: number;
          required_foreign_keys: number;
        }>();
      if (Number(readiness?.required_tables ?? 0) !== 2
        || Number(readiness?.required_discussion_columns ?? 0) !== 13
        || Number(readiness?.required_trip_columns ?? 0) !== 7
        || Number(readiness?.required_indexes ?? 0) !== 2
        || Number(readiness?.required_foreign_keys ?? 0) !== 1) {
        throw new DiscussionError(
          503,
          "discussion_schema_unavailable",
          "Public discussions are paused until the reviewed database migration is complete.",
        );
      }
    })().catch((error) => {
      initializedDatabases.delete(db as object);
      throw error;
    });
    initializedDatabases.set(db as object, pending);
  }
  await pending;
}

export async function handleDiscussionRequest(
  request: Request,
  env: DiscussionEnv,
  curatedSites: readonly CuratedSite[],
): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(API_ROUTE_PATTERNS.discussion);
  if (!match) return null;
  if (request.method !== "GET") {
    return jsonResponse({ error: { code: "method_not_allowed", message: "Use GET for this endpoint." } }, 405, { Allow: "GET" });
  }
  const siteId = match[1];
  if (!curatedSites.some((site) => site.id === siteId)) {
    return jsonResponse({ error: { code: "invalid_site", message: "Choose a current CastingCompass location." } }, 404);
  }
  if (!env.DB || !publicDiscussionsEnabled(env)) return jsonResponse({ posts: [] });
  try {
    await initialize(env.DB);
    const rows = await env.DB.prepare(`SELECT post.id AS id, post.site_id AS site_id,
        post.summary AS summary, post.gear_summary AS gear_summary,
        post.technique_tags_json AS technique_tags_json,
        substr(post.observed_at, 1, 10) AS observed_date,
        post.approved_at AS approved_at
      FROM site_discussion_posts AS post
      INNER JOIN trips AS trip ON trip.id = post.trip_id
      WHERE post.site_id = ?
        AND post.site_id = trip.site_id
        AND length(trim(post.approved_at)) > 0
        AND length(trim(post.approved_by)) > 0
        AND length(trim(post.source_ai_reviewed_at)) > 0
        AND post.source_ai_reviewed_at = trip.ai_reviewed_at
        AND trip.status = 'completed'
        AND trip.consent = 1
        AND trip.moderation_status = 'approved'
        AND trip.ai_review_status = 'reviewed'
      ORDER BY post.observed_at DESC
      LIMIT 12`)
      .bind(siteId)
      .all<DiscussionRow>();
    return jsonResponse({
      posts: (rows.results ?? [])
        .map(publicDiscussionForRow)
        .filter((post): post is NonNullable<typeof post> => post !== null),
    });
  } catch (error) {
    if (error instanceof DiscussionError) {
      return jsonResponse({ error: { code: error.code, message: error.message } }, error.status);
    }
    logEvent("error", "discussion.request.failed", safeErrorFields(error, "discussion_request_failed"));
    return jsonResponse({
      error: { code: "internal_error", message: "Public discussions could not be loaded right now." },
    }, 500);
  }
}

interface DiscussionRow {
  id: string;
  site_id: string;
  summary: string;
  gear_summary: string | null;
  technique_tags_json: string | null;
  observed_date: string;
  approved_at: string;
}

function publicDiscussionForRow(row: DiscussionRow) {
  const rawTechniqueTags = safeTags(row.technique_tags_json);
  const rawCandidate = [row.summary, row.gear_summary, ...rawTechniqueTags].filter(Boolean).join(" ");
  if (containsSensitivePublicText(rawCandidate)) return null;
  const summary = sanitizePublicText(row.summary, 420);
  const gearSummary = sanitizePublicText(row.gear_summary ?? "", 220) || null;
  const techniqueTags = rawTechniqueTags
    .map((tag) => sanitizePublicText(tag, 42))
    .filter(Boolean)
    .slice(0, 6);
  if (!summary) return null;
  return {
    id: row.id,
    siteId: row.site_id,
    summary,
    gearSummary,
    techniqueTags,
    observedAt: `${row.observed_date}T12:00:00.000Z`,
    postedAt: row.approved_at,
  };
}

function safeTags(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function publicDiscussionsEnabled(env: DiscussionEnv) {
  return env.PUBLIC_DISCUSSIONS_ENABLED?.trim().toLowerCase() === "true";
}

function containsSensitivePublicText(value: string) {
  return [
    /https?:\/\/\S+/i,
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
    /\b[\w.+-]+\s*(?:\[at\]|\(at\)|\sat\s)\s*[\w.-]+\s*(?:\[dot\]|\(dot\)|\sdot\s)\s*[A-Za-z]{2,}\b/i,
    /\+\d{1,3}(?:[\s().-]*\d){7,14}\b/,
    /(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)|\d{2,4})[-.\s]?\d{3,4}[-.\s]?\d{3,4}/,
    /(?:^|\s)@[^\s@]{2,}/u,
    /\b-?\d{1,3}\.\d{4,}\s*[,/]\s*-?\d{1,3}\.\d{4,}\b/,
    /\b\d{1,3}°\s*\d{1,2}['′]\s*\d{1,2}(?:\.\d+)?["″]?\s*[NSEW]\b/i,
    /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i,
    /\b\d{1,6}\s+[A-Za-z0-9.' -]{1,40}\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way)\b/i,
    /\b(?:gate|door|access|lock)\s*(?:code|pin)\s*[:#-]?\s*[A-Za-z0-9-]{3,}\b/i,
    /\b(?:ignore|disregard|override)\b.{0,40}\b(?:instructions|prompt|system|moderation)\b/i,
  ].some((pattern) => pattern.test(value));
}

function sanitizePublicText(value: string, maximum: number) {
  return value
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "")
    .replace(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximum);
}

function jsonResponse(body: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}
