import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { handleCommunityRequest } from "../worker/community.ts";

class D1StatementAdapter {
  constructor(statement) {
    this.statement = statement;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    return this.statement.get(...this.values) ?? null;
  }

  async all() {
    return { results: this.statement.all(...this.values) };
  }

  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class D1Adapter {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(query) {
    return new D1StatementAdapter(this.sqlite.prepare(query));
  }

  async batch(statements) {
    const results = [];
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
    return results;
  }
}

async function communityDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
    INSERT INTO users (id) VALUES ('user-one'), ('user-two');
  `);
  const migration = (await readFile(
    new URL("../drizzle/0021_place_community.sql", import.meta.url),
    "utf8",
  )).replaceAll("--> statement-breakpoint", "");
  sqlite.exec(migration);
  return { sqlite, db: new D1Adapter(sqlite) };
}

const sites = [{
  id: "ocean-beach",
  name: "Ocean Beach",
  latitude: 0,
  longitude: 0,
  region: "San Francisco",
  type: "Beach",
  access: "Public",
  regulationUrl: "https://example.test",
  structureTags: [],
}];

function request(path, method = "GET", body) {
  return new Request(`https://castingcompass.test${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("place communities expose three published previews and gate the continuation", async () => {
  const { sqlite, db } = await communityDatabase();
  const profile = await handleCommunityRequest(
    request("/api/community/profile", "PUT", { handle: "surf_reader", bio: "" }),
    { DB: db },
    sites,
    { accountId: "user-one" },
  );
  assert.equal(profile.status, 200);

  const created = await handleCommunityRequest(
    request("/api/community/ocean-beach", "POST", {
      title: "Sandbar shape this week",
      body: "The public beach trough looked broad at a moderate tide.",
    }),
    { DB: db },
    sites,
    { accountId: "user-one" },
  );
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.match(createdBody.post.id, /^cpost_/);
  assert.equal(createdBody.post.moderationStatus, "pending");

  const anonymousBeforeReview = await handleCommunityRequest(
    request("/api/community/ocean-beach/preview"),
    { DB: db },
    sites,
    { accountId: null },
  );
  assert.deepEqual((await anonymousBeforeReview.json()).posts, []);

  const ownerFeed = await handleCommunityRequest(
    request("/api/community/ocean-beach"),
    { DB: db },
    sites,
    { accountId: "user-one" },
  );
  const ownerBody = await ownerFeed.json();
  assert.equal(ownerBody.posts[0].ownedByRequester, true);
  assert.equal(ownerBody.posts[0].moderationStatus, "pending");

  sqlite.prepare("UPDATE community_posts SET moderation_status = 'published' WHERE id = ?")
    .run(createdBody.post.id);
  for (let index = 0; index < 3; index += 1) {
    sqlite.prepare(`INSERT INTO community_posts (
      id, user_id, site_id, title, body, moderation_status, created_at, updated_at
    ) VALUES (?, 'user-one', 'ocean-beach', ?, 'Public broad-place note.', 'published', ?, ?)`)
      .run(
        `cpost_00000000-0000-4000-8000-00000000000${index}`,
        `Discussion ${index}`,
        `2026-07-2${index}T12:00:00.000Z`,
        `2026-07-2${index}T12:00:00.000Z`,
      );
  }
  const preview = await handleCommunityRequest(
    request("/api/community/ocean-beach/preview"),
    { DB: db },
    sites,
    { accountId: null },
  );
  const previewBody = await preview.json();
  assert.equal(previewBody.posts.length, 3);
  assert.equal(previewBody.hasMore, true);
  assert.equal(previewBody.continuationRequiresAccount, true);
  assert.equal(JSON.stringify(previewBody).includes("user-one"), false);
});

test("community participation queues edits, comments, reports, blocks, and rejects exact locations", async () => {
  const { sqlite, db } = await communityDatabase();
  for (const [userId, handle] of [["user-one", "coast_one"], ["user-two", "coast_two"]]) {
    const response = await handleCommunityRequest(
      request("/api/community/profile", "PUT", { handle, bio: "" }),
      { DB: db },
      sites,
      { accountId: userId },
    );
    assert.equal(response.status, 200);
  }
  const unsafe = await handleCommunityRequest(
    request("/api/community/ocean-beach", "POST", {
      title: "Exact location",
      body: "Meet me at 37.12345, -122.12345.",
    }),
    { DB: db },
    sites,
    { accountId: "user-one" },
  );
  assert.equal(unsafe.status, 400);
  assert.equal((await unsafe.json()).error.code, "sensitive_location_or_contact");

  const created = await handleCommunityRequest(
    request("/api/community/ocean-beach", "POST", {
      title: "Broad public conditions",
      body: "The public beach had a readable trough.",
    }),
    { DB: db },
    sites,
    { accountId: "user-one" },
  );
  const post = (await created.json()).post;
  sqlite.prepare("UPDATE community_posts SET moderation_status = 'published' WHERE id = ?").run(post.id);

  const comment = await handleCommunityRequest(
    request(`/api/community/posts/${post.id}/comments`, "POST", { body: "Thanks for the broad update." }),
    { DB: db },
    sites,
    { accountId: "user-two" },
  );
  assert.equal(comment.status, 201);
  const commentBody = await comment.json();
  assert.equal(commentBody.comment.ownedByRequester, true);

  const ownPendingComments = await handleCommunityRequest(
    request(`/api/community/posts/${post.id}/comments`),
    { DB: db },
    sites,
    { accountId: "user-two" },
  );
  assert.equal(ownPendingComments.status, 200);
  assert.equal((await ownPendingComments.json()).comments[0].moderationStatus, "pending");

  sqlite.prepare("UPDATE community_comments SET moderation_status = 'published' WHERE id = ?")
    .run(commentBody.comment.id);
  const publicComments = await handleCommunityRequest(
    request("/api/community/ocean-beach/preview"),
    { DB: db },
    sites,
    { accountId: null },
  );
  const publicPost = (await publicComments.json()).posts.find((candidate) => candidate.id === post.id);
  assert.equal(publicPost.comments.length, 1);
  assert.equal(publicPost.comments[0].handle, "coast_two");

  const report = await handleCommunityRequest(
    request("/api/community/reports", "POST", {
      targetKind: "post",
      targetId: post.id,
      reason: "privacy",
      detail: "",
    }),
    { DB: db },
    sites,
    { accountId: "user-two" },
  );
  assert.equal(report.status, 202);

  const editedComment = await handleCommunityRequest(
    request(`/api/community/comments/${commentBody.comment.id}`, "PATCH", {
      body: "Thanks for the broad public-place update.",
    }),
    { DB: db },
    sites,
    { accountId: "user-two" },
  );
  assert.equal(editedComment.status, 200);
  const deletedComment = await handleCommunityRequest(
    request(`/api/community/comments/${commentBody.comment.id}`, "DELETE"),
    { DB: db },
    sites,
    { accountId: "user-two" },
  );
  assert.equal(deletedComment.status, 204);

  const block = await handleCommunityRequest(
    request("/api/community/blocks/coast_one", "PUT"),
    { DB: db },
    sites,
    { accountId: "user-two" },
  );
  assert.equal(block.status, 200);
  const blockedFeed = await handleCommunityRequest(
    request("/api/community/ocean-beach"),
    { DB: db },
    sites,
    { accountId: "user-two" },
  );
  assert.deepEqual((await blockedFeed.json()).posts, []);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM community_moderation_queue").get().count, 3);

  const edited = await handleCommunityRequest(
    request(`/api/community/posts/${post.id}`, "PATCH", {
      title: "Broad public conditions edited",
      body: "The public beach had a readable trough at a broad level.",
    }),
    { DB: db },
    sites,
    { accountId: "user-one" },
  );
  assert.equal(edited.status, 200);
  assert.equal(sqlite.prepare("SELECT moderation_status FROM community_posts WHERE id = ?").get(post.id).moderation_status, "pending");

  const deleted = await handleCommunityRequest(
    request(`/api/community/posts/${post.id}`, "DELETE"),
    { DB: db },
    sites,
    { accountId: "user-one" },
  );
  assert.equal(deleted.status, 204);
  assert.equal(sqlite.prepare("SELECT deleted_at IS NOT NULL AS deleted FROM community_posts WHERE id = ?").get(post.id).deleted, 1);

  sqlite.prepare("DELETE FROM users WHERE id = 'user-one'").run();
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM community_posts WHERE id = ?").get(post.id).count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM community_comments WHERE post_id = ?").get(post.id).count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM community_reports WHERE target_id = ?").get(post.id).count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM community_blocks").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM community_moderation_queue").get().count, 0);
});
