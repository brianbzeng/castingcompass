"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AccountModal, useAccount } from "./AccountFeature";
import type { FishingSite, LocationDiscussionPost } from "../types";

interface CommunityPost {
  id: string;
  siteId: string;
  title: string;
  body: string;
  handle: string;
  moderationStatus: string;
  createdAt: string;
  updatedAt: string;
  ownedByRequester: boolean;
  commentCount: number;
  comments?: CommunityComment[];
}

interface CommunityComment {
  id: string;
  postId: string;
  body: string;
  handle: string;
  moderationStatus: string;
  createdAt: string;
  updatedAt: string;
  ownedByRequester: boolean;
}

interface CommunityProfile {
  handle: string;
  bio?: string | null;
}

function communityPostFromLegacy(post: LocationDiscussionPost): CommunityPost {
  return {
    id: post.id,
    siteId: post.siteId,
    title: "Reviewed trip note",
    body: post.summary,
    handle: "reviewed_angler",
    moderationStatus: "published",
    createdAt: post.postedAt,
    updatedAt: post.postedAt,
    ownedByRequester: false,
    commentCount: 0,
  };
}

export function CommunityHub({ sites }: { sites: FishingSite[] }) {
  const [query, setQuery] = useState("");
  const regions = useMemo(
    () => Array.from(new Set(sites.map((site) => site.region))).sort(),
    [sites],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? sites.filter((site) => `${site.name} ${site.region} ${site.type}`.toLowerCase().includes(normalized))
      : sites;
  }, [query, sites]);

  return (
    <CommunityShell>
      <section className="community-hero">
        <p className="community-kicker">Place communities</p>
        <h1>Local knowledge,<br />without exposing the spot.</h1>
        <p>Every supported CastingCompass place has a dedicated discussion. Read the public preview, then sign in to continue, post, comment, report, or block—never share exact private locations or access codes.</p>
        <label className="community-search">
          <span>Find a place</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Beach, pier, or region" />
        </label>
        <div className="community-region-list" aria-label="Supported regions">
          {regions.map((region) => <span key={region}>{region}</span>)}
        </div>
      </section>
      <section className="community-place-grid" aria-label="Place communities">
        {filtered.map((site) => (
          <Link key={site.id} href={`/community/${site.id}`}>
            <span>{site.region} · {site.type}</span>
            <strong>{site.name}</strong>
            <p>Public preview · account-gated continuation</p>
          </Link>
        ))}
      </section>
    </CommunityShell>
  );
}

export function PlaceCommunity({
  site,
  sites,
}: {
  site: FishingSite;
  sites: FishingSite[];
}) {
  const account = useAccount();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [previewHasMore, setPreviewHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [profile, setProfile] = useState<CommunityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [handle, setHandle] = useState("");
  const [bio, setBio] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommunityComment[]>>({});
  const [commentCursorByPost, setCommentCursorByPost] = useState<Record<string, string | null>>({});
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [reportFor, setReportFor] = useState<{ kind: "post" | "comment"; id: string } | null>(null);
  const [reportReason, setReportReason] = useState("privacy");
  const [lastBlockedHandle, setLastBlockedHandle] = useState<string | null>(null);
  const signedIn = Boolean(account.user?.legalAccepted);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const [previewResponse, legacyResponse] = await Promise.all([
        fetch(`/api/community/${encodeURIComponent(site.id)}/preview`, { cache: "no-store" }),
        fetch(`/api/discussions/${encodeURIComponent(site.id)}`, { cache: "no-store" }),
      ]);
      const preview = await previewResponse.json().catch(() => ({})) as { posts?: CommunityPost[]; hasMore?: boolean };
      const legacy = await legacyResponse.json().catch(() => ({})) as { posts?: LocationDiscussionPost[] };
      const nextPosts = previewResponse.ok && preview.posts?.length
        ? preview.posts
        : (legacy.posts ?? []).slice(0, 3).map(communityPostFromLegacy);
      setPosts(nextPosts);
      setCommentsByPost(Object.fromEntries(nextPosts.map((post) => [post.id, post.comments ?? []])));
      setPreviewHasMore(Boolean(preview.hasMore || (legacy.posts?.length ?? 0) > 3));
    } catch {
      setMessage("The public preview could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [site.id]);

  const loadSignedIn = useCallback(async (cursor?: string) => {
    if (!cursor) setLoading(true);
    try {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const [feedResponse, profileResponse] = await Promise.all([
        fetch(`/api/community/${encodeURIComponent(site.id)}${suffix}`, { cache: "no-store" }),
        fetch("/api/community/profile", { cache: "no-store" }),
      ]);
      if (!feedResponse.ok || !profileResponse.ok) {
        setMessage("Sign in and accept the current terms to continue.");
        return;
      }
      const feed = await feedResponse.json() as { posts?: CommunityPost[]; nextCursor?: string | null };
      const profileBody = await profileResponse.json() as { profile?: CommunityProfile | null };
      setPosts((current) => cursor ? [...current, ...(feed.posts ?? [])] : (feed.posts ?? []));
      if (!cursor) {
        setCommentsByPost({});
        setCommentCursorByPost({});
        setExpandedComments(null);
      }
      setNextCursor(feed.nextCursor ?? null);
      setProfile(profileBody.profile ?? null);
      setHandle(profileBody.profile?.handle ?? "");
      setBio(profileBody.profile?.bio ?? "");
      setPreviewHasMore(false);
    } finally {
      if (!cursor) setLoading(false);
    }
  }, [site.id]);

  useEffect(() => {
    if (account.loading) return;
    const frame = window.requestAnimationFrame(() => {
      if (signedIn) {
        void loadSignedIn();
      } else {
        void loadPreview();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [account.loading, loadPreview, loadSignedIn, signedIn]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/community/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, bio }),
    });
    const receipt = await response.json().catch(() => ({})) as { profile?: CommunityProfile; error?: { message?: string } };
    if (!response.ok || !receipt.profile) {
      setMessage(receipt.error?.message ?? "The handle could not be saved.");
      return;
    }
    setProfile(receipt.profile);
    setMessage("Community profile saved.");
  };

  const submitPost = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    const response = await fetch(`/api/community/${encodeURIComponent(site.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    const receipt = await response.json().catch(() => ({})) as { post?: CommunityPost; error?: { message?: string } };
    if (!response.ok || !receipt.post) {
      setMessage(receipt.error?.message ?? "The discussion could not be submitted.");
      return;
    }
    setPosts((current) => [{ ...receipt.post!, handle: profile?.handle ?? handle, commentCount: 0 }, ...current]);
    setTitle("");
    setBody("");
    setMessage("Submitted for human moderation. It remains visible to you while pending.");
  };

  const updatePost = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingId) return;
    const response = await fetch(`/api/community/posts/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, body: editBody }),
    });
    const receipt = await response.json().catch(() => ({})) as { post?: Partial<CommunityPost>; error?: { message?: string } };
    if (!response.ok) {
      setMessage(receipt.error?.message ?? "The post could not be edited.");
      return;
    }
    setPosts((current) => current.map((post) => post.id === editingId
      ? { ...post, title: editTitle, body: editBody, moderationStatus: "pending" }
      : post));
    setEditingId(null);
    setMessage("Edited and returned to the moderation queue.");
  };

  const deletePost = async (postId: string) => {
    const response = await fetch(`/api/community/posts/${postId}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("The post could not be deleted.");
      return;
    }
    setPosts((current) => current.filter((post) => post.id !== postId));
    setMessage("Post deleted.");
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!commentFor) return;
    const response = await fetch(`/api/community/posts/${commentFor}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentBody }),
    });
    const receipt = await response.json().catch(() => ({})) as {
      comment?: CommunityComment;
      error?: { message?: string };
    };
    if (!response.ok || !receipt.comment) {
      setMessage(receipt.error?.message ?? "The comment could not be submitted.");
      return;
    }
    setCommentsByPost((current) => ({
      ...current,
      [commentFor]: [...(current[commentFor] ?? []), receipt.comment!],
    }));
    setPosts((current) => current.map((post) => post.id === commentFor
      ? { ...post, commentCount: post.commentCount + 1 }
      : post));
    setExpandedComments(commentFor);
    setCommentFor(null);
    setCommentBody("");
    setMessage("Comment submitted for human moderation.");
  };

  const loadComments = async (postId: string, cursor?: string) => {
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const response = await fetch(`/api/community/posts/${postId}/comments${suffix}`, { cache: "no-store" });
    const receipt = await response.json().catch(() => ({})) as {
      comments?: CommunityComment[];
      nextCursor?: string | null;
      error?: { message?: string };
    };
    if (!response.ok) {
      setMessage(receipt.error?.message ?? "Comments could not be loaded.");
      return;
    }
    setCommentsByPost((current) => ({
      ...current,
      [postId]: cursor ? [...(current[postId] ?? []), ...(receipt.comments ?? [])] : (receipt.comments ?? []),
    }));
    setCommentCursorByPost((current) => ({ ...current, [postId]: receipt.nextCursor ?? null }));
    setExpandedComments(postId);
  };

  const updateComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingCommentId) return;
    const response = await fetch(`/api/community/comments/${editingCommentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: editingCommentBody }),
    });
    const receipt = await response.json().catch(() => ({})) as { error?: { message?: string } };
    if (!response.ok) {
      setMessage(receipt.error?.message ?? "The comment could not be edited.");
      return;
    }
    setCommentsByPost((current) => Object.fromEntries(Object.entries(current).map(([postId, comments]) => [
      postId,
      comments.map((comment) => comment.id === editingCommentId
        ? { ...comment, body: editingCommentBody, moderationStatus: "pending" }
        : comment),
    ])));
    setEditingCommentId(null);
    setMessage("Comment edited and returned to the moderation queue.");
  };

  const deleteComment = async (comment: CommunityComment) => {
    const response = await fetch(`/api/community/comments/${comment.id}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage("The comment could not be deleted.");
      return;
    }
    setCommentsByPost((current) => ({
      ...current,
      [comment.postId]: (current[comment.postId] ?? []).filter((candidate) => candidate.id !== comment.id),
    }));
    setPosts((current) => current.map((post) => post.id === comment.postId
      ? { ...post, commentCount: Math.max(0, post.commentCount - 1) }
      : post));
    setMessage("Comment deleted.");
  };

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!reportFor) return;
    const response = await fetch("/api/community/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetKind: reportFor.kind,
        targetId: reportFor.id,
        reason: reportReason,
        detail: "",
      }),
    });
    if (!response.ok) {
      setMessage("The report could not be submitted.");
      return;
    }
    setReportFor(null);
    setMessage("Report added to the moderation queue.");
  };

  const blockHandle = async (handleToBlock: string) => {
    const response = await fetch(`/api/community/blocks/${encodeURIComponent(handleToBlock.toLowerCase())}`, { method: "PUT" });
    if (!response.ok) {
      setMessage("That handle could not be blocked.");
      return;
    }
    setPosts((current) => current.filter((candidate) => candidate.handle !== handleToBlock));
    setCommentsByPost((current) => Object.fromEntries(Object.entries(current).map(([postId, comments]) => [
      postId,
      comments.filter((comment) => comment.handle !== handleToBlock),
    ])));
    setLastBlockedHandle(handleToBlock);
    setMessage(`@${handleToBlock} is blocked.`);
  };

  const undoBlock = async () => {
    if (!lastBlockedHandle) return;
    const response = await fetch(`/api/community/blocks/${encodeURIComponent(lastBlockedHandle.toLowerCase())}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setMessage("The block could not be reversed.");
      return;
    }
    const restoredHandle = lastBlockedHandle;
    setLastBlockedHandle(null);
    setMessage(`@${restoredHandle} is no longer blocked.`);
    await loadSignedIn();
  };

  return (
    <>
      <CommunityShell>
        <section className="community-place-header">
          <p><Link href="/community">Community</Link> / {site.region}</p>
          <h1>{site.name}</h1>
          <div><span>{site.type}</span><span>Public place discussion</span><span>Private coordinates prohibited</span></div>
        </section>

        <main className="community-layout">
          <section className="community-feed" aria-live="polite">
            <div className="community-feed-heading">
              <div>
                <span>{signedIn ? "Community feed" : "Public preview"}</span>
                <h2>Recent discussions</h2>
              </div>
              <Link href={`/?site=${site.id}`}>Open forecast</Link>
            </div>
            {loading ? <p role="status">Loading discussions…</p> : null}
            {!loading && posts.length === 0 ? (
              <div className="community-empty">
                <strong>Start the first reviewed discussion.</strong>
                <p>Ask about public access, presentation, structure, or broad conditions without posting private or exact locations.</p>
              </div>
            ) : null}
            {posts.map((post) => (
              <article className="community-post" key={post.id}>
                <header>
                  <div className="community-vote-rail" aria-label="Voting is not active in this review phase">
                    <span>△</span><b>—</b><span>▽</span>
                  </div>
                  <div>
                    <span>@{post.handle} · {new Date(post.createdAt).toLocaleDateString()}</span>
                    <h3>{post.title}</h3>
                  </div>
                  {post.moderationStatus !== "published" ? <em>{post.moderationStatus}</em> : null}
                </header>
                <p>{post.body}</p>
                <footer>
                  {signedIn ? (
                    <button type="button" onClick={() => {
                      if (expandedComments === post.id) {
                        setExpandedComments(null);
                      } else {
                        void loadComments(post.id);
                      }
                    }}>
                      {expandedComments === post.id ? "Hide comments" : `${post.commentCount} comments`}
                    </button>
                  ) : <span>{post.commentCount} comments</span>}
                  {signedIn && post.moderationStatus === "published"
                    ? <button type="button" onClick={() => setCommentFor(post.id)}>Comment</button>
                    : null}
                  {post.ownedByRequester ? (
                    <>
                      <button type="button" onClick={() => {
                        setEditingId(post.id);
                        setEditTitle(post.title);
                        setEditBody(post.body);
                      }}>Edit</button>
                      <button type="button" onClick={() => void deletePost(post.id)}>Delete</button>
                    </>
                  ) : signedIn && post.id.startsWith("cpost_") ? (
                    <>
                      <button type="button" onClick={() => setReportFor({ kind: "post", id: post.id })}>Report</button>
                      <button type="button" onClick={() => void blockHandle(post.handle)}>Block @{post.handle}</button>
                    </>
                  ) : null}
                </footer>
                {editingId === post.id ? (
                  <form className="community-inline-form" onSubmit={updatePost}>
                    <label>Title<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={120} /></label>
                    <label>Post<textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} maxLength={2000} /></label>
                    <div><button type="submit">Save edit</button><button type="button" onClick={() => setEditingId(null)}>Cancel</button></div>
                  </form>
                ) : null}
                {commentFor === post.id ? (
                  <form className="community-inline-form" onSubmit={submitComment}>
                    <label>Comment<textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={1000} required /></label>
                    <div><button type="submit">Submit for review</button><button type="button" onClick={() => setCommentFor(null)}>Cancel</button></div>
                  </form>
                ) : null}
                {(!signedIn || expandedComments === post.id) && (commentsByPost[post.id]?.length ?? 0) > 0 ? (
                  <ol className="community-comments" aria-label={`Comments on ${post.title}`}>
                    {(commentsByPost[post.id] ?? []).map((comment) => (
                      <li key={comment.id}>
                        <div>
                          <span>@{comment.handle} · {new Date(comment.createdAt).toLocaleDateString()}</span>
                          {comment.moderationStatus !== "published" ? <em>{comment.moderationStatus}</em> : null}
                        </div>
                        {editingCommentId === comment.id ? (
                          <form className="community-inline-form" onSubmit={updateComment}>
                            <label>Comment<textarea value={editingCommentBody} onChange={(event) => setEditingCommentBody(event.target.value)} maxLength={1000} required /></label>
                            <div><button type="submit">Save edit</button><button type="button" onClick={() => setEditingCommentId(null)}>Cancel</button></div>
                          </form>
                        ) : <p>{comment.body}</p>}
                        {signedIn ? (
                          <footer>
                            {comment.ownedByRequester ? (
                              <>
                                <button type="button" onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditingCommentBody(comment.body);
                                }}>Edit</button>
                                <button type="button" onClick={() => void deleteComment(comment)}>Delete</button>
                              </>
                            ) : (
                              <>
                                <button type="button" onClick={() => setReportFor({ kind: "comment", id: comment.id })}>Report</button>
                                <button type="button" onClick={() => void blockHandle(comment.handle)}>Block @{comment.handle}</button>
                              </>
                            )}
                          </footer>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                ) : null}
                {!signedIn && post.commentCount > (commentsByPost[post.id]?.length ?? 0) ? (
                  <p className="community-comment-continuation">Sign in to continue this comment thread.</p>
                ) : null}
                {signedIn && expandedComments === post.id && commentCursorByPost[post.id] ? (
                  <button className="community-load-more" type="button" onClick={() => void loadComments(post.id, commentCursorByPost[post.id] ?? undefined)}>
                    Load more comments
                  </button>
                ) : null}
                {(reportFor?.kind === "post" && reportFor.id === post.id)
                  || (reportFor?.kind === "comment" && (commentsByPost[post.id] ?? []).some((comment) => comment.id === reportFor.id)) ? (
                  <form className="community-inline-form" onSubmit={submitReport}>
                    <label>Reason<select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                      <option value="privacy">Privacy or exact location</option>
                      <option value="harassment">Harassment</option>
                      <option value="spam">Spam</option>
                      <option value="unsafe">Unsafe advice</option>
                      <option value="misinformation">Misinformation</option>
                      <option value="other">Other</option>
                    </select></label>
                    <div><button type="submit">Send report</button><button type="button" onClick={() => setReportFor(null)}>Cancel</button></div>
                  </form>
                ) : null}
              </article>
            ))}
            {signedIn && nextCursor ? (
              <button className="community-load-more" type="button" onClick={() => void loadSignedIn(nextCursor)}>Load more discussions</button>
            ) : null}
            {!signedIn ? (
              <section className="community-gate" aria-labelledby="community-gate-title">
                <span aria-hidden="true">CC</span>
                <div>
                  <h2 id="community-gate-title">Continue with an account</h2>
                  <p>{previewHasMore ? "More discussions are available." : "Join this place community."} Signing in unlocks the continuation and participation tools; no hidden post text is placed behind a visual blur.</p>
                </div>
                <button type="button" onClick={() => account.openAccount("Sign in to continue reading and participate with a pseudonymous community handle.")}>Sign in or create account</button>
              </section>
            ) : null}
            {message ? (
              <div className="community-message" role="status">
                <p>{message}</p>
                {lastBlockedHandle ? <button type="button" onClick={() => void undoBlock()}>Undo block</button> : null}
              </div>
            ) : null}
          </section>

          <aside className="community-sidebar">
            {signedIn && !profile ? (
              <form onSubmit={saveProfile}>
                <span>First step</span>
                <h2>Choose a public handle</h2>
                <p>Your email and internal account ID never appear on posts.</p>
                <label>Handle<input value={handle} onChange={(event) => setHandle(event.target.value.toLowerCase())} pattern="[a-z0-9_]{3,24}" required /></label>
                <label>Short bio (optional)<textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} /></label>
                <button type="submit">Save pseudonymous handle</button>
              </form>
            ) : signedIn ? (
              <form onSubmit={submitPost}>
                <span>Post as @{profile?.handle}</span>
                <h2>Start a discussion</h2>
                <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={120} required /></label>
                <label>Post<textarea value={body} onChange={(event) => setBody(event.target.value)} minLength={3} maxLength={2000} required /></label>
                <p>Human moderation is required before public publication. Remove exact coordinates, addresses, contact details, and private access instructions.</p>
                <button type="submit">Submit for review</button>
              </form>
            ) : (
              <section>
                <span>Community standard</span>
                <h2>Useful, public, and respectful.</h2>
                <p>Discuss broad public-place conditions and techniques. Exact sensitive habitat, private access, personal contact details, harassment, and unsafe claims are not allowed.</p>
              </section>
            )}
          </aside>
        </main>
      </CommunityShell>
      <AccountModal key={account.user?.id ?? "anonymous"} account={account} sites={sites} />
    </>
  );
}

function CommunityShell({ children }: { children: ReactNode }) {
  return (
    <div className="community-shell">
      <header className="community-topbar">
        <Link href="/" className="community-brand"><i aria-hidden="true" />CastingCompass</Link>
        <nav aria-label="Primary navigation">
          <Link href="/">Forecast</Link>
          <Link href="/community" aria-current="page">Community</Link>
          <Link href="/ai-disclosure">How it works</Link>
        </nav>
        <Link href="/profile">Account</Link>
      </header>
      {children}
      <footer className="community-footer">
        <strong>CastingCompass Community</strong>
        <p>Public-place discussion with human moderation and privacy guardrails. Not a live bite report, safety service, or substitute for official rules.</p>
        <nav><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/ai-disclosure">AI disclosure</Link></nav>
      </footer>
    </div>
  );
}
