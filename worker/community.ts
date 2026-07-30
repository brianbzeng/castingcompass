import type { CuratedSite, D1DatabaseLike } from "./trips.ts";
import { API_ROUTE_PATTERNS } from "./route-policy.ts";
import { logEvent, safeErrorFields } from "./observability.ts";

interface CommunityEnv {
  DB?: D1DatabaseLike;
}

interface CommunityOptions {
  accountId: string | null;
}

interface CommunityPostRow {
  id: string;
  site_id: string;
  title: string;
  body: string;
  handle: string;
  moderation_status: string;
  created_at: string;
  updated_at: string;
  owned_by_requester: number;
  comment_count: number;
}

interface CommunityCommentRow {
  id: string;
  post_id: string;
  body: string;
  handle: string;
  moderation_status: string;
  created_at: string;
  updated_at: string;
  owned_by_requester: number;
}

const initializedDatabases = new WeakMap<object, Promise<void>>();
const HANDLE_PATTERN = /^[a-z0-9_]{3,24}$/;
const REPORT_REASONS = new Set(["privacy", "harassment", "spam", "unsafe", "misinformation", "other"]);

class CommunityError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommunityError";
    this.status = status;
    this.code = code;
  }
}

async function initialize(db: D1DatabaseLike) {
  let pending = initializedDatabases.get(db as object);
  if (!pending) {
    pending = db.prepare(`SELECT
      (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
        'community_profiles', 'community_posts', 'community_comments',
        'community_blocks', 'community_reports', 'community_moderation_queue'
      )) AS required_tables,
      (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name IN (
        'community_profiles_handle_unique', 'community_posts_site_feed_idx',
        'community_comments_post_feed_idx', 'community_reports_queue_idx',
        'community_moderation_queue_work_idx'
      )) AS required_indexes`)
      .first<{ required_tables: number; required_indexes: number }>()
      .then((readiness) => {
        if (Number(readiness?.required_tables ?? 0) !== 6
          || Number(readiness?.required_indexes ?? 0) !== 5) {
          throw new CommunityError(
            503,
            "community_schema_unavailable",
            "Community is paused until the reviewed database migration is complete.",
          );
        }
      })
      .catch((error) => {
        initializedDatabases.delete(db as object);
        throw error;
      });
    initializedDatabases.set(db as object, pending);
  }
  await pending;
}

export async function handleCommunityRequest(
  request: Request,
  env: CommunityEnv,
  curatedSites: readonly CuratedSite[],
  options: CommunityOptions,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/community/")) return null;
  const previewMatch = url.pathname.match(API_ROUTE_PATTERNS.communityPreview);
  const siteMatch = url.pathname.match(API_ROUTE_PATTERNS.communitySite);
  const postMatch = url.pathname.match(API_ROUTE_PATTERNS.communityPost);
  const postCommentsMatch = url.pathname.match(API_ROUTE_PATTERNS.communityPostComments);
  const commentMatch = url.pathname.match(API_ROUTE_PATTERNS.communityComment);
  const blockMatch = url.pathname.match(API_ROUTE_PATTERNS.communityBlock);
  const siteId = previewMatch?.[1] ?? siteMatch?.[1] ?? null;

  if (siteId && !curatedSites.some((site) => site.id === siteId)) {
    return jsonError(404, "invalid_site", "Choose a current CastingCompass place.");
  }
  if (!env.DB) {
    return previewMatch
      ? jsonResponse({ posts: [], hasMore: false, continuationRequiresAccount: true })
      : jsonError(503, "storage_unavailable", "Community storage is temporarily unavailable.");
  }

  try {
    await initialize(env.DB);
    if (previewMatch && request.method === "GET") {
      return await publicPreview(env.DB, previewMatch[1]);
    }
    const accountId = options.accountId;
    if (!accountId) return jsonError(401, "authentication_required", "Sign in to continue in the community.");

    if (url.pathname === "/api/community/profile") {
      if (request.method === "GET") return await readProfile(env.DB, accountId);
      if (request.method === "PUT") return await updateProfile(request, env.DB, accountId);
    }
    if (siteMatch) {
      if (request.method === "GET") return await fullFeed(env.DB, siteMatch[1], accountId, url);
      if (request.method === "POST") return await createPost(request, env.DB, siteMatch[1], accountId);
    }
    if (postMatch) {
      if (request.method === "PATCH") return await updatePost(request, env.DB, postMatch[1], accountId);
      if (request.method === "DELETE") return await deletePost(env.DB, postMatch[1], accountId);
    }
    if (postCommentsMatch) {
      if (request.method === "GET") return await fullComments(env.DB, postCommentsMatch[1], accountId, url);
      if (request.method === "POST") return await createComment(request, env.DB, postCommentsMatch[1], accountId);
    }
    if (commentMatch) {
      if (request.method === "PATCH") return await updateComment(request, env.DB, commentMatch[1], accountId);
      if (request.method === "DELETE") return await deleteComment(env.DB, commentMatch[1], accountId);
    }
    if (url.pathname === "/api/community/reports" && request.method === "POST") {
      return await createReport(request, env.DB, accountId);
    }
    if (blockMatch) {
      if (request.method === "PUT") return await createBlock(env.DB, accountId, blockMatch[1]);
      if (request.method === "DELETE") return await deleteBlock(env.DB, accountId, blockMatch[1]);
    }
    return null;
  } catch (error) {
    if (error instanceof CommunityError) return jsonError(error.status, error.code, error.message);
    logEvent("error", "community.request.failed", safeErrorFields(error, "community_request_failed"));
    return jsonError(500, "internal_error", "Community could not be updated right now.");
  }
}

async function publicPreview(db: D1DatabaseLike, siteId: string) {
  const rows = await db.prepare(`${feedSelectSql(false)}
    WHERE post.site_id = ? AND post.deleted_at IS NULL
      AND post.moderation_status = 'published'
    ORDER BY post.created_at DESC, post.id DESC
    LIMIT 4`)
    .bind(siteId)
    .all<CommunityPostRow>();
  const postRows = (rows.results ?? []).slice(0, 3);
  const commentRows = postRows.length > 0
    ? await publicCommentPreview(db, siteId)
    : [];
  const posts = postRows.map((row) => ({
    ...publicPost(row),
    comments: commentRows.filter((comment) => comment.post_id === row.id).map(publicComment),
  }));
  return jsonResponse({
    posts,
    hasMore: (rows.results ?? []).length > 3,
    continuationRequiresAccount: true,
  }, 200, { "Cache-Control": "public, max-age=30, s-maxage=60" });
}

async function fullFeed(db: D1DatabaseLike, siteId: string, accountId: string, url: URL) {
  const cursor = parseCursor(url.searchParams.get("cursor"));
  const rows = await db.prepare(`${feedSelectSql(true)}
    WHERE post.site_id = ? AND post.deleted_at IS NULL
      AND (post.moderation_status = 'published' OR post.user_id = ?)
      AND NOT EXISTS (
        SELECT 1 FROM community_blocks AS block
        WHERE block.blocker_user_id = ? AND block.blocked_user_id = post.user_id
      )
    ORDER BY post.created_at DESC, post.id DESC
    LIMIT 11 OFFSET ?`)
    .bind(accountId, siteId, accountId, accountId, cursor)
    .all<CommunityPostRow>();
  const posts = (rows.results ?? []).slice(0, 10).map(publicPost);
  return jsonResponse({
    posts,
    nextCursor: (rows.results ?? []).length > 10 ? String(cursor + 10) : null,
    pageSize: 10,
  });
}

function feedSelectSql(includeOwner: boolean) {
  return `SELECT post.id, post.site_id, post.title, post.body,
      profile.handle, post.moderation_status, post.created_at, post.updated_at,
      ${includeOwner ? "CASE WHEN post.user_id = ? THEN 1 ELSE 0 END" : "0"} AS owned_by_requester,
      (SELECT COUNT(*) FROM community_comments AS comment
        WHERE comment.post_id = post.id AND comment.deleted_at IS NULL
          AND comment.moderation_status = 'published') AS comment_count
    FROM community_posts AS post
    INNER JOIN community_profiles AS profile ON profile.user_id = post.user_id`;
}

function publicPost(row: CommunityPostRow) {
  return {
    id: row.id,
    siteId: row.site_id,
    title: row.title,
    body: row.body,
    handle: row.handle,
    moderationStatus: row.moderation_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownedByRequester: Number(row.owned_by_requester) === 1,
    commentCount: Number(row.comment_count),
  };
}

function publicComment(row: CommunityCommentRow) {
  return {
    id: row.id,
    postId: row.post_id,
    body: row.body,
    handle: row.handle,
    moderationStatus: row.moderation_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ownedByRequester: Number(row.owned_by_requester) === 1,
  };
}

async function publicCommentPreview(db: D1DatabaseLike, siteId: string) {
  const rows = await db.prepare(`SELECT id, post_id, body, handle, moderation_status,
      created_at, updated_at, owned_by_requester
    FROM (
      SELECT comment.id, comment.post_id, comment.body, profile.handle,
        comment.moderation_status, comment.created_at, comment.updated_at,
        0 AS owned_by_requester,
        ROW_NUMBER() OVER (
          PARTITION BY comment.post_id
          ORDER BY comment.created_at ASC, comment.id ASC
        ) AS comment_rank
      FROM community_comments AS comment
      INNER JOIN community_profiles AS profile ON profile.user_id = comment.user_id
      WHERE comment.deleted_at IS NULL AND comment.moderation_status = 'published'
        AND comment.post_id IN (
          SELECT post.id FROM community_posts AS post
          WHERE post.site_id = ? AND post.deleted_at IS NULL
            AND post.moderation_status = 'published'
          ORDER BY post.created_at DESC, post.id DESC
          LIMIT 3
        )
    )
    WHERE comment_rank <= 2
    ORDER BY post_id, created_at ASC, id ASC
    LIMIT 6`)
    .bind(siteId)
    .all<CommunityCommentRow>();
  return rows.results ?? [];
}

async function fullComments(db: D1DatabaseLike, postId: string, accountId: string, url: URL) {
  const cursor = parseCursor(url.searchParams.get("cursor"));
  const post = await db.prepare(`SELECT id FROM community_posts
      WHERE id = ? AND deleted_at IS NULL
        AND (moderation_status = 'published' OR user_id = ?)`)
    .bind(postId, accountId)
    .first();
  if (!post) throw new CommunityError(404, "post_not_found", "That discussion is unavailable.");
  const rows = await db.prepare(`SELECT comment.id, comment.post_id, comment.body,
      profile.handle, comment.moderation_status, comment.created_at, comment.updated_at,
      CASE WHEN comment.user_id = ? THEN 1 ELSE 0 END AS owned_by_requester
    FROM community_comments AS comment
    INNER JOIN community_profiles AS profile ON profile.user_id = comment.user_id
    WHERE comment.post_id = ? AND comment.deleted_at IS NULL
      AND (comment.moderation_status = 'published' OR comment.user_id = ?)
      AND NOT EXISTS (
        SELECT 1 FROM community_blocks AS block
        WHERE block.blocker_user_id = ? AND block.blocked_user_id = comment.user_id
      )
    ORDER BY comment.created_at ASC, comment.id ASC
    LIMIT 21 OFFSET ?`)
    .bind(accountId, postId, accountId, accountId, cursor)
    .all<CommunityCommentRow>();
  const comments = (rows.results ?? []).slice(0, 20).map(publicComment);
  return jsonResponse({
    comments,
    nextCursor: (rows.results ?? []).length > 20 ? String(cursor + 20) : null,
    pageSize: 20,
  });
}

async function readProfile(db: D1DatabaseLike, accountId: string) {
  const profile = await db.prepare(`SELECT handle, bio, created_at, updated_at
      FROM community_profiles WHERE user_id = ?`)
    .bind(accountId)
    .first<Record<string, unknown>>();
  return jsonResponse({ profile: profile ?? null });
}

async function updateProfile(request: Request, db: D1DatabaseLike, accountId: string) {
  const body = await readBody(request, ["handle", "bio"]);
  const handle = stringField(body.handle, 3, 24, "handle").toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) {
    throw new CommunityError(400, "invalid_handle", "Use 3–24 lowercase letters, numbers, or underscores.");
  }
  const bio = optionalStringField(body.bio, 160, "bio");
  rejectSensitiveText([handle, bio].filter(Boolean).join(" "));
  const timestamp = new Date().toISOString();
  try {
    await db.prepare(`INSERT INTO community_profiles (
        user_id, handle, handle_key, bio, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        handle = excluded.handle, handle_key = excluded.handle_key,
        bio = excluded.bio, updated_at = excluded.updated_at`)
      .bind(accountId, handle, handle, bio, timestamp, timestamp)
      .run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw new CommunityError(409, "handle_unavailable", "That community handle is already in use.");
    }
    throw error;
  }
  return jsonResponse({ profile: { handle, bio, updatedAt: timestamp } });
}

async function createPost(
  request: Request,
  db: D1DatabaseLike,
  siteId: string,
  accountId: string,
) {
  const handle = await requireProfile(db, accountId);
  const body = await readBody(request, ["title", "body"]);
  const title = stringField(body.title, 3, 120, "title");
  const content = stringField(body.body, 3, 2000, "body");
  rejectSensitiveText(`${title} ${content}`);
  const id = `cpost_${crypto.randomUUID()}`;
  const queueId = `cmod_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO community_posts (
      id, user_id, site_id, title, body, moderation_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`)
      .bind(id, accountId, siteId, title, content, timestamp, timestamp),
    db.prepare(`INSERT INTO community_moderation_queue (
      id, entity_kind, entity_id, reason, priority, status, created_at, updated_at
    ) VALUES (?, 'post', ?, 'new_submission', 0, 'pending', ?, ?)`)
      .bind(queueId, id, timestamp, timestamp),
  ]);
  return jsonResponse({
    post: {
      id,
      siteId,
      title,
      body: content,
      handle,
      moderationStatus: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
      ownedByRequester: true,
      commentCount: 0,
    },
    message: "Submitted for human moderation.",
  }, 201);
}

async function updatePost(request: Request, db: D1DatabaseLike, postId: string, accountId: string) {
  const body = await readBody(request, ["title", "body"]);
  const title = stringField(body.title, 3, 120, "title");
  const content = stringField(body.body, 3, 2000, "body");
  rejectSensitiveText(`${title} ${content}`);
  const timestamp = new Date().toISOString();
  const result = await db.prepare(`UPDATE community_posts
      SET title = ?, body = ?, moderation_status = 'pending', updated_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .bind(title, content, timestamp, postId, accountId)
    .run();
  assertChanged(result, "post_not_found", "That post could not be edited.");
  await queueForReview(db, "post", postId, "owner_edit", timestamp);
  return jsonResponse({ post: { id: postId, title, body: content, moderationStatus: "pending", updatedAt: timestamp } });
}

async function deletePost(db: D1DatabaseLike, postId: string, accountId: string) {
  const timestamp = new Date().toISOString();
  const result = await db.prepare(`UPDATE community_posts
      SET title = '[deleted]', body = '[deleted]', moderation_status = 'removed',
        deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .bind(timestamp, timestamp, postId, accountId)
    .run();
  assertChanged(result, "post_not_found", "That post could not be deleted.");
  return new Response(null, { status: 204 });
}

async function createComment(request: Request, db: D1DatabaseLike, postId: string, accountId: string) {
  const handle = await requireProfile(db, accountId);
  const exists = await db.prepare(`SELECT id FROM community_posts
      WHERE id = ? AND deleted_at IS NULL AND moderation_status = 'published'`)
    .bind(postId)
    .first();
  if (!exists) throw new CommunityError(404, "post_not_found", "That discussion is unavailable.");
  const body = await readBody(request, ["body"]);
  const content = stringField(body.body, 1, 1000, "body");
  rejectSensitiveText(content);
  const id = `ccomment_${crypto.randomUUID()}`;
  const timestamp = new Date().toISOString();
  await db.batch([
    db.prepare(`INSERT INTO community_comments (
      id, post_id, user_id, body, moderation_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?)`)
      .bind(id, postId, accountId, content, timestamp, timestamp),
    db.prepare(`INSERT INTO community_moderation_queue (
      id, entity_kind, entity_id, reason, priority, status, created_at, updated_at
    ) VALUES (?, 'comment', ?, 'new_submission', 0, 'pending', ?, ?)`)
      .bind(`cmod_${crypto.randomUUID()}`, id, timestamp, timestamp),
  ]);
  return jsonResponse({
    comment: {
      id,
      postId,
      body: content,
      handle,
      moderationStatus: "pending",
      createdAt: timestamp,
      updatedAt: timestamp,
      ownedByRequester: true,
    },
  }, 201);
}

async function updateComment(request: Request, db: D1DatabaseLike, commentId: string, accountId: string) {
  const body = await readBody(request, ["body"]);
  const content = stringField(body.body, 1, 1000, "body");
  rejectSensitiveText(content);
  const timestamp = new Date().toISOString();
  const result = await db.prepare(`UPDATE community_comments
      SET body = ?, moderation_status = 'pending', updated_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .bind(content, timestamp, commentId, accountId)
    .run();
  assertChanged(result, "comment_not_found", "That comment could not be edited.");
  await queueForReview(db, "comment", commentId, "owner_edit", timestamp);
  return jsonResponse({ comment: { id: commentId, body: content, moderationStatus: "pending", updatedAt: timestamp } });
}

async function deleteComment(db: D1DatabaseLike, commentId: string, accountId: string) {
  const timestamp = new Date().toISOString();
  const result = await db.prepare(`UPDATE community_comments
      SET body = '[deleted]', moderation_status = 'removed', deleted_at = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
    .bind(timestamp, timestamp, commentId, accountId)
    .run();
  assertChanged(result, "comment_not_found", "That comment could not be deleted.");
  return new Response(null, { status: 204 });
}

async function createReport(request: Request, db: D1DatabaseLike, accountId: string) {
  const body = await readBody(request, ["targetKind", "targetId", "reason", "detail"]);
  const targetKind = body.targetKind === "post" || body.targetKind === "comment" ? body.targetKind : null;
  if (!targetKind) throw new CommunityError(400, "invalid_target", "Choose a post or comment to report.");
  const expectedPrefix = targetKind === "post" ? "cpost_" : "ccomment_";
  const targetId = stringField(body.targetId, 42, 45, "targetId");
  if (!targetId.startsWith(expectedPrefix)
    || !/^(?:cpost_|ccomment_)[a-f0-9-]{36}$/.test(targetId)) {
    throw new CommunityError(400, "invalid_target", "Choose a valid community item.");
  }
  const target = targetKind === "post"
    ? await db.prepare(`SELECT user_id FROM community_posts
        WHERE id = ? AND deleted_at IS NULL AND moderation_status = 'published'`)
      .bind(targetId)
      .first<{ user_id: string }>()
    : await db.prepare(`SELECT user_id FROM community_comments
        WHERE id = ? AND deleted_at IS NULL AND moderation_status = 'published'`)
      .bind(targetId)
      .first<{ user_id: string }>();
  if (!target) throw new CommunityError(404, "target_not_found", "That community item is unavailable.");
  if (target.user_id === accountId) {
    throw new CommunityError(400, "cannot_report_self", "You cannot report your own community item.");
  }
  const reason = typeof body.reason === "string" && REPORT_REASONS.has(body.reason) ? body.reason : null;
  if (!reason) throw new CommunityError(400, "invalid_reason", "Choose a report reason.");
  const detail = optionalStringField(body.detail, 500, "detail");
  rejectSensitiveText(detail ?? "");
  const timestamp = new Date().toISOString();
  const id = `creport_${crypto.randomUUID()}`;
  await db.batch([
    db.prepare(`INSERT INTO community_reports (
      id, reporter_user_id, target_kind, target_id, reason, detail, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)
    ON CONFLICT(reporter_user_id, target_kind, target_id) DO UPDATE SET
      reason = excluded.reason, detail = excluded.detail, status = 'open', updated_at = excluded.updated_at`)
      .bind(id, accountId, targetKind, targetId, reason, detail, timestamp, timestamp),
    db.prepare(`INSERT INTO community_moderation_queue (
      id, entity_kind, entity_id, reason, priority, status, created_at, updated_at
    ) VALUES (?, 'report', ?, ?, 2, 'pending', ?, ?)
    ON CONFLICT(entity_kind, entity_id) DO UPDATE SET
      reason = excluded.reason, priority = 2, status = 'pending', updated_at = excluded.updated_at`)
      .bind(`cmod_${crypto.randomUUID()}`, targetId, `user_report:${reason}`, timestamp, timestamp),
  ]);
  return jsonResponse({ accepted: true }, 202);
}

async function createBlock(db: D1DatabaseLike, accountId: string, handle: string) {
  const blocked = await accountIdForHandle(db, handle);
  if (!blocked) throw new CommunityError(404, "handle_not_found", "That community handle was not found.");
  if (blocked === accountId) throw new CommunityError(400, "cannot_block_self", "You cannot block your own handle.");
  await db.prepare(`INSERT OR IGNORE INTO community_blocks (
      blocker_user_id, blocked_user_id, created_at
    ) VALUES (?, ?, ?)`)
    .bind(accountId, blocked, new Date().toISOString())
    .run();
  return jsonResponse({ blocked: true, handle });
}

async function deleteBlock(db: D1DatabaseLike, accountId: string, handle: string) {
  const blocked = await accountIdForHandle(db, handle);
  if (blocked) {
    await db.prepare(`DELETE FROM community_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?`)
      .bind(accountId, blocked)
      .run();
  }
  return new Response(null, { status: 204 });
}

async function accountIdForHandle(db: D1DatabaseLike, handle: string) {
  const row = await db.prepare(`SELECT user_id FROM community_profiles WHERE handle_key = ?`)
    .bind(handle.toLowerCase())
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

async function requireProfile(db: D1DatabaseLike, accountId: string) {
  const row = await db.prepare(`SELECT handle FROM community_profiles WHERE user_id = ?`)
    .bind(accountId)
    .first<{ handle: string }>();
  if (!row) throw new CommunityError(409, "community_profile_required", "Choose a pseudonymous handle before posting.");
  return row.handle;
}

async function queueForReview(
  db: D1DatabaseLike,
  kind: "post" | "comment",
  entityId: string,
  reason: string,
  timestamp: string,
) {
  await db.prepare(`INSERT INTO community_moderation_queue (
      id, entity_kind, entity_id, reason, priority, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 0, 'pending', ?, ?)
    ON CONFLICT(entity_kind, entity_id) DO UPDATE SET
      reason = excluded.reason, status = 'pending', updated_at = excluded.updated_at`)
    .bind(`cmod_${crypto.randomUUID()}`, kind, entityId, reason, timestamp, timestamp)
    .run();
}

function assertChanged(
  result: { success?: boolean; meta?: { changes?: number } },
  code: string,
  message: string,
) {
  if (result.success === false) throw new CommunityError(503, "write_unconfirmed", "The update could not be confirmed.");
  if (Number(result.meta?.changes ?? 0) !== 1) throw new CommunityError(404, code, message);
}

async function readBody(request: Request, allowedKeys: readonly string[]) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new CommunityError(415, "json_required", "Send community updates as JSON.");
  }
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new CommunityError(400, "invalid_json", "The community update is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CommunityError(400, "invalid_body", "Send one JSON object.");
  }
  const body = parsed as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    throw new CommunityError(400, "unexpected_field", "The community update contains an unexpected field.");
  }
  return body;
}

function stringField(value: unknown, minimum: number, maximum: number, field: string) {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new CommunityError(400, `invalid_${field}`, `${field} must contain ${minimum}–${maximum} characters.`);
  }
  return normalized;
}

function optionalStringField(value: unknown, maximum: number, field: string) {
  if (value === undefined || value === null || value === "") return null;
  return stringField(value, 1, maximum, field);
}

function rejectSensitiveText(value: string) {
  const sensitive = [
    /https?:\/\/\S+/i,
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
    /(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)|\d{2,4})[-.\s]?\d{3,4}[-.\s]?\d{3,4}/,
    /\b-?\d{1,3}\.\d{4,}\s*[,/]\s*-?\d{1,3}\.\d{4,}\b/,
    /\b\d{1,3}°\s*\d{1,2}['′]\s*\d{1,2}(?:\.\d+)?["″]?\s*[NSEW]\b/i,
    /\b[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i,
    /\b\d{1,6}\s+[A-Za-z0-9.' -]{1,40}\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way)\b/i,
    /\b(?:gate|door|access|lock)\s*(?:code|pin)\s*[:#-]?\s*[A-Za-z0-9-]{3,}\b/i,
  ].some((pattern) => pattern.test(value));
  if (sensitive) {
    throw new CommunityError(
      400,
      "sensitive_location_or_contact",
      "Remove links, contact details, exact coordinates, addresses, and private access instructions.",
    );
  }
}

function parseCursor(value: string | null) {
  if (!value) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 1000) {
    throw new CommunityError(400, "invalid_cursor", "Use the pagination cursor returned by CastingCompass.");
  }
  return parsed;
}

function jsonError(status: number, code: string, message: string) {
  return jsonResponse({ error: { code, message } }, status);
}

function jsonResponse(body: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}
