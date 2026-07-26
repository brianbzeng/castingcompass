import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  cleanupNativeOAuthData,
  getNativeAccessIdentity,
  handleNativeOAuthRequest,
  hasStrictNativeBearerCandidate,
} from "../worker/native-auth.ts";
import { LEGAL_VERSION } from "../worker/auth.ts";

const ORIGIN = "https://castingcompass.com";
const CLIENT_ID = "com.castingcompass.ios";
const REDIRECT_URI = "com.castingcompass.ios:/oauth/callback";
const SCOPE = "profile:read trips:write";
const migrations = new URL("../drizzle/", import.meta.url);

class Statement {
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

class D1 {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(query) {
    return new Statement(this.sqlite.prepare(query));
  }

  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

async function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const files = (await readdir(migrations))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const file of files) {
    const sql = await readFile(new URL(file, migrations), "utf8");
    sqlite.exec(sql.replaceAll("--> statement-breakpoint", ""));
  }
  const now = new Date().toISOString();
  sqlite.prepare(`INSERT INTO users (
      id, email, password_salt, password_hash, age_eligibility_confirmed_at,
      terms_accepted_at, terms_version, privacy_accepted_at, privacy_version,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      "user_native",
      "native@example.com",
      "salt",
      "hash",
      now,
      now,
      LEGAL_VERSION,
      now,
      LEGAL_VERSION,
      now,
      now,
    );
  return { sqlite, d1: new D1(sqlite) };
}

function environment(d1, overrides = {}) {
  return {
    DB: d1,
    NATIVE_OAUTH_ENABLED: "true",
    NATIVE_OAUTH_CLIENT_ID: CLIENT_ID,
    NATIVE_OAUTH_REDIRECT_URI: REDIRECT_URI,
    ...overrides,
  };
}

function browserSession() {
  const now = new Date().toISOString();
  return {
    credentialKind: "browser_cookie",
    cookieName: "__Host-cc_session",
    sessionTokenHash: "a".repeat(64),
    sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    deletionFenced: false,
    accountVersion: {
      id: "user_native",
      email: "native@example.com",
      ageEligibilityConfirmedAt: now,
      termsAcceptedAt: now,
      termsVersion: LEGAL_VERSION,
      privacyAcceptedAt: now,
      privacyVersion: LEGAL_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    user: {
      id: "user_native",
      email: "native@example.com",
      ageEligible: true,
      legalAccepted: true,
    },
  };
}

function jsonRequest(path, body, headers = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function browserJsonRequest(path, body) {
  return jsonRequest(path, body, {
    Origin: ORIGIN,
    Cookie: "__Host-cc_session=browser-session",
  });
}

async function challenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}

async function authorize(d1, verifier = "v".repeat(64), state = "s".repeat(43)) {
  const response = await handleNativeOAuthRequest(
    browserJsonRequest("/api/native/oauth/authorize", {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      codeChallenge: await challenge(verifier),
      codeChallengeMethod: "S256",
      state,
      scope: SCOPE,
    }),
    environment(d1),
    browserSession(),
  );
  assert.equal(response?.status, 200);
  const payload = await response.json();
  assert.equal(payload.expiresInSeconds, 300);
  const redirect = new URL(payload.redirectTo);
  assert.equal(redirect.protocol, "com.castingcompass.ios:");
  assert.equal(redirect.searchParams.get("state"), state);
  return { code: redirect.searchParams.get("code"), verifier };
}

async function exchange(d1, code, verifier) {
  return handleNativeOAuthRequest(
    jsonRequest("/api/native/oauth/token", {
      grantType: "authorization_code",
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      code,
      codeVerifier: verifier,
    }),
    environment(d1),
    null,
  );
}

test("native OAuth stays disabled until one exact public client and redirect are configured", async () => {
  const { d1 } = await database();
  const verifier = "v".repeat(64);
  const body = {
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    codeChallenge: await challenge(verifier),
    codeChallengeMethod: "S256",
    state: "s".repeat(43),
    scope: SCOPE,
  };
  const disabled = await handleNativeOAuthRequest(
    browserJsonRequest("/api/native/oauth/authorize", body),
    environment(d1, { NATIVE_OAUTH_ENABLED: "false" }),
    browserSession(),
  );
  assert.equal(disabled?.status, 503);
  assert.equal((await disabled.json()).error.code, "native_auth_disabled");

  const wrongRedirect = await handleNativeOAuthRequest(
    browserJsonRequest("/api/native/oauth/authorize", { ...body, redirectUri: `${REDIRECT_URI}/extra` }),
    environment(d1),
    browserSession(),
  );
  assert.equal(wrongRedirect?.status, 400);
  assert.equal((await wrongRedirect.json()).error.code, "invalid_request");

  const noBrowserSession = await handleNativeOAuthRequest(
    browserJsonRequest("/api/native/oauth/authorize", body),
    environment(d1),
    null,
  );
  assert.equal(noBrowserSession?.status, 401);
});

test("browser authorization and native backchannel authority cannot be mixed", async () => {
  const { d1 } = await database();
  const verifier = "v".repeat(64);
  const authorizationBody = {
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    codeChallenge: await challenge(verifier),
    codeChallengeMethod: "S256",
    state: "s".repeat(43),
    scope: SCOPE,
  };
  for (const request of [
    jsonRequest("/api/native/oauth/authorize", authorizationBody),
    jsonRequest("/api/native/oauth/authorize", authorizationBody, { Origin: ORIGIN }),
    jsonRequest("/api/native/oauth/authorize", authorizationBody, { Cookie: "cc_session=value" }),
    jsonRequest("/api/native/oauth/authorize", authorizationBody, {
      Origin: "https://attacker.example",
      Cookie: "cc_session=value",
    }),
  ]) {
    const response = await handleNativeOAuthRequest(request, environment(d1), browserSession());
    assert.equal(response?.status, 403);
    assert.equal((await response.json()).error.code, "invalid_origin");
  }

  for (const headers of [
    { Origin: ORIGIN },
    { Cookie: "cc_session=value" },
    { Authorization: `Bearer ${"a".repeat(43)}` },
  ]) {
    const response = await handleNativeOAuthRequest(
      jsonRequest("/api/native/oauth/token", {
        grantType: "refresh_token",
        clientId: CLIENT_ID,
        refreshToken: "r".repeat(43),
      }, headers),
      environment(d1),
      null,
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).error.code, "invalid_request");
  }
});

test("native authorization codes are bounded per account and client", async () => {
  const { d1 } = await database();
  for (let index = 0; index < 5; index += 1) {
    const response = await handleNativeOAuthRequest(
      browserJsonRequest("/api/native/oauth/authorize", {
        clientId: CLIENT_ID,
        redirectUri: REDIRECT_URI,
        codeChallenge: await challenge(String(index).repeat(64)),
        codeChallengeMethod: "S256",
        state: String(index).repeat(43),
        scope: SCOPE,
      }),
      environment(d1),
      browserSession(),
    );
    assert.equal(response?.status, 200);
  }
  const bounded = await handleNativeOAuthRequest(
    browserJsonRequest("/api/native/oauth/authorize", {
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      codeChallenge: await challenge("z".repeat(64)),
      codeChallengeMethod: "S256",
      state: "z".repeat(43),
      scope: SCOPE,
    }),
    environment(d1),
    browserSession(),
  );
  assert.equal(bounded?.status, 429);
  assert.equal((await bounded.json()).error.code, "too_many_authorizations");
});

test("authorization code plus PKCE issues only scoped hashed native credentials", async () => {
  const { sqlite, d1 } = await database();
  const { code, verifier } = await authorize(d1);
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);

  const wrongVerifier = await exchange(d1, code, "x".repeat(64));
  assert.equal(wrongVerifier?.status, 400);
  assert.equal((await wrongVerifier.json()).error.code, "invalid_grant");

  const issued = await exchange(d1, code, verifier);
  assert.equal(issued?.status, 200);
  const pair = await issued.json();
  assert.deepEqual(Object.keys(pair), [
    "accessToken",
    "tokenType",
    "expiresIn",
    "refreshToken",
    "refreshExpiresIn",
    "scope",
  ]);
  assert.equal(pair.tokenType, "Bearer");
  assert.equal(pair.expiresIn, 600);
  assert.equal(pair.refreshExpiresIn, 2_592_000);
  assert.equal(pair.scope, SCOPE);
  assert.match(pair.accessToken, /^[A-Za-z0-9_-]{43}$/);
  assert.match(pair.refreshToken, /^[A-Za-z0-9_-]{43}$/);

  const rawSecrets = sqlite.prepare(`SELECT
      (SELECT COUNT(*) FROM native_oauth_access_tokens WHERE token_hash = ?) AS raw_access,
      (SELECT COUNT(*) FROM native_oauth_refresh_tokens WHERE token_hash = ?) AS raw_refresh`)
    .get(pair.accessToken, pair.refreshToken);
  assert.equal(rawSecrets.raw_access, 0);
  assert.equal(rawSecrets.raw_refresh, 0);

  const bearer = new Request(`${ORIGIN}/api/profile`, {
    headers: { Authorization: `Bearer ${pair.accessToken}` },
  });
  assert.equal(hasStrictNativeBearerCandidate(bearer), true);
  const identity = await getNativeAccessIdentity(
    bearer,
    environment(d1),
    ["profile:read"],
    LEGAL_VERSION,
  );
  assert.equal(identity?.user.id, "user_native");
  assert.deepEqual(identity?.scopes, ["profile:read", "trips:write"]);
  assert.equal(
    await getNativeAccessIdentity(bearer, environment(d1), ["profile:read", "trips:write"], LEGAL_VERSION)
      .then((value) => value?.user.id),
    "user_native",
  );

  const mixedAuthority = new Request(`${ORIGIN}/api/profile`, {
    headers: {
      Authorization: `Bearer ${pair.accessToken}`,
      Cookie: "__Host-cc_session=ambient",
    },
  });
  assert.equal(hasStrictNativeBearerCandidate(mixedAuthority), false);
  assert.equal(
    await getNativeAccessIdentity(mixedAuthority, environment(d1), ["profile:read"], LEGAL_VERSION),
    null,
  );

  const replay = await exchange(d1, code, verifier);
  assert.equal(replay?.status, 400);
  assert.equal((await replay.json()).error.code, "invalid_grant");
});

test("refresh rotation revokes prior access and reuse revokes the complete token family", async () => {
  const { d1 } = await database();
  const { code, verifier } = await authorize(d1);
  const issued = await exchange(d1, code, verifier);
  const first = await issued.json();

  const rotated = await handleNativeOAuthRequest(
    jsonRequest("/api/native/oauth/token", {
      grantType: "refresh_token",
      clientId: CLIENT_ID,
      refreshToken: first.refreshToken,
    }),
    environment(d1),
    null,
  );
  assert.equal(rotated?.status, 200);
  const second = await rotated.json();
  assert.notEqual(second.accessToken, first.accessToken);
  assert.notEqual(second.refreshToken, first.refreshToken);

  const firstAccess = new Request(`${ORIGIN}/api/profile`, {
    headers: { Authorization: `Bearer ${first.accessToken}` },
  });
  const secondAccess = new Request(`${ORIGIN}/api/profile`, {
    headers: { Authorization: `Bearer ${second.accessToken}` },
  });
  assert.equal(
    await getNativeAccessIdentity(firstAccess, environment(d1), ["profile:read"], LEGAL_VERSION),
    null,
  );
  assert.equal(
    await getNativeAccessIdentity(secondAccess, environment(d1), ["profile:read"], LEGAL_VERSION)
      .then((value) => value?.user.id),
    "user_native",
  );

  const reused = await handleNativeOAuthRequest(
    jsonRequest("/api/native/oauth/token", {
      grantType: "refresh_token",
      clientId: CLIENT_ID,
      refreshToken: first.refreshToken,
    }),
    environment(d1),
    null,
  );
  assert.equal(reused?.status, 400);
  assert.match((await reused.json()).error.message, /reuse was detected/);
  assert.equal(
    await getNativeAccessIdentity(secondAccess, environment(d1), ["profile:read"], LEGAL_VERSION),
    null,
  );
});

test("native revocation is idempotent and does not disclose unknown tokens", async () => {
  const { d1 } = await database();
  const { code, verifier } = await authorize(d1);
  const issued = await exchange(d1, code, verifier);
  const pair = await issued.json();

  for (const token of [pair.refreshToken, "u".repeat(43)]) {
    const revoked = await handleNativeOAuthRequest(
      jsonRequest("/api/native/oauth/revoke", {
        clientId: CLIENT_ID,
        token,
        tokenTypeHint: "refresh_token",
      }),
      environment(d1),
      null,
    );
    assert.equal(revoked?.status, 200);
    assert.deepEqual(await revoked.json(), { revoked: true });
  }
  const access = new Request(`${ORIGIN}/api/profile`, {
    headers: { Authorization: `Bearer ${pair.accessToken}` },
  });
  assert.equal(
    await getNativeAccessIdentity(access, environment(d1), ["profile:read"], LEGAL_VERSION),
    null,
  );
});

test("native credential retention drains children before bounded family deletion", async () => {
  const { sqlite, d1 } = await database();
  const expired = "2020-01-01T00:00:00.000Z";
  const insertCode = sqlite.prepare(`INSERT INTO native_oauth_authorization_codes (
    code_hash, user_id, client_id, redirect_uri, code_challenge, scope, issued_at, expires_at
  ) VALUES (?, 'user_native', ?, ?, ?, ?, ?, ?)`);
  const insertFamily = sqlite.prepare(`INSERT INTO native_oauth_refresh_families (
    id, user_id, client_id, scope, created_at, expires_at
  ) VALUES (?, 'user_native', ?, ?, ?, ?)`);
  const insertRefresh = sqlite.prepare(`INSERT INTO native_oauth_refresh_tokens (
    token_hash, family_id, generation, created_at, expires_at
  ) VALUES (?, ?, 0, ?, ?)`);
  const insertAccess = sqlite.prepare(`INSERT INTO native_oauth_access_tokens (
    token_hash, family_id, user_id, client_id, scope, created_at, expires_at
  ) VALUES (?, ?, 'user_native', ?, ?, ?, ?)`);

  sqlite.exec("BEGIN IMMEDIATE");
  try {
    for (let index = 0; index < 101; index += 1) {
      const suffix = String(index).padStart(3, "0");
      const familyId = `family_expired_${suffix}`;
      insertCode.run(`code_${suffix}`, CLIENT_ID, REDIRECT_URI, "c".repeat(43), SCOPE, expired, expired);
      insertFamily.run(familyId, CLIENT_ID, SCOPE, expired, expired);
      insertRefresh.run(`refresh_${suffix}`, familyId, expired, expired);
      insertAccess.run(`access_${suffix}`, familyId, CLIENT_ID, SCOPE, expired, expired);
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }

  await cleanupNativeOAuthData(environment(d1));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM native_oauth_authorization_codes").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM native_oauth_refresh_tokens").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM native_oauth_access_tokens").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM native_oauth_refresh_families").get().count, 1);

  await cleanupNativeOAuthData(environment(d1));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM native_oauth_authorization_codes").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM native_oauth_refresh_tokens").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM native_oauth_access_tokens").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM native_oauth_refresh_families").get().count, 0);
});
