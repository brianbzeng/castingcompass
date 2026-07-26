import {
  NATIVE_OAUTH_ACCESS_TOKEN_SECONDS,
  NATIVE_OAUTH_AUTHORIZATION_CODE_SECONDS,
  NATIVE_OAUTH_CODE_CHALLENGE_METHOD,
  NATIVE_OAUTH_REFRESH_TOKEN_SECONDS,
  NATIVE_OAUTH_SCOPE,
  NATIVE_OAUTH_TOKEN_TYPE,
  isSafeNativeRedirectUri,
  type NativeOAuthScope,
} from "../shared/native-auth-contract.ts";
import type { AuthUser, AuthenticatedSession } from "./auth.ts";
import type { D1DatabaseLike } from "./trips.ts";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const STATE_PATTERN = /^[A-Za-z0-9._~-]{32,160}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const NATIVE_AUTH_RETENTION_BATCH = 100;

export interface NativeOAuthEnv {
  DB?: D1DatabaseLike;
  NATIVE_OAUTH_ENABLED?: string;
  NATIVE_OAUTH_CLIENT_ID?: string;
  NATIVE_OAUTH_REDIRECT_URI?: string;
}

export interface NativeAccessIdentity {
  user: AuthUser;
  accountVersion: {
    id: string;
    email: string;
    ageEligibilityConfirmedAt: string;
    termsAcceptedAt: string | null;
    termsVersion: string | null;
    privacyAcceptedAt: string | null;
    privacyVersion: string | null;
    createdAt: string;
    updatedAt: string;
  };
  accessTokenHash: string;
  accessTokenExpiresAt: string;
  clientId: string;
  scopes: readonly NativeOAuthScope[];
  deletionFenced: boolean;
}

interface NativeOAuthConfiguration {
  clientId: string;
  redirectUri: string;
}

class NativeOAuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "NativeOAuthError";
    this.status = status;
    this.code = code;
  }
}

const NATIVE_SCHEMA_READY_SQL = `SELECT
  (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
    'native_oauth_authorization_codes', 'native_oauth_refresh_families',
    'native_oauth_refresh_tokens', 'native_oauth_access_tokens'
  )) AS required_tables,
  (SELECT COUNT(*) FROM pragma_table_info('native_oauth_authorization_codes')
    WHERE name IN ('code_hash', 'consumed_at', 'consumed_by')) AS code_columns,
  (SELECT COUNT(*) FROM pragma_table_info('native_oauth_refresh_tokens')
    WHERE name IN ('token_hash', 'consumed_at', 'consumed_by', 'successor_token_hash')) AS refresh_columns`;

const initializedDatabases = new WeakMap<object, Promise<void>>();

async function initializeNativeOAuth(db: D1DatabaseLike) {
  let pending = initializedDatabases.get(db as object);
  if (!pending) {
    pending = (async () => {
      const readiness = await db.prepare(NATIVE_SCHEMA_READY_SQL)
        .first<{ required_tables: number; code_columns: number; refresh_columns: number }>();
      if (Number(readiness?.required_tables ?? 0) !== 4
        || Number(readiness?.code_columns ?? 0) !== 3
        || Number(readiness?.refresh_columns ?? 0) !== 4) {
        throw new NativeOAuthError(
          503,
          "native_auth_schema_unavailable",
          "Native sign-in is paused until the reviewed database migration is complete.",
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

function nativeOAuthConfiguration(env: NativeOAuthEnv): NativeOAuthConfiguration {
  if (env.NATIVE_OAUTH_ENABLED !== "true") {
    throw new NativeOAuthError(503, "native_auth_disabled", "Native sign-in is not enabled.");
  }
  const clientId = env.NATIVE_OAUTH_CLIENT_ID ?? "";
  const redirectUri = env.NATIVE_OAUTH_REDIRECT_URI ?? "";
  if (!CLIENT_ID_PATTERN.test(clientId) || !isSafeNativeRedirectUri(redirectUri)) {
    throw new NativeOAuthError(
      503,
      "native_auth_configuration_invalid",
      "Native sign-in configuration is unavailable.",
    );
  }
  return { clientId, redirectUri };
}

export function hasStrictNativeBearerCandidate(request: Request) {
  return parseNativeBearerToken(request) !== null;
}

function parseNativeBearerToken(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization || request.headers.has("Cookie")) return null;
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]{43})$/);
  return match?.[1] ?? null;
}

export async function getNativeAccessIdentity(
  request: Request,
  env: NativeOAuthEnv,
  requiredScopes: readonly NativeOAuthScope[],
  legalVersion: string,
): Promise<NativeAccessIdentity | null> {
  const token = parseNativeBearerToken(request);
  if (!token || requiredScopes.length === 0 || !env.DB) return null;
  let configuration: NativeOAuthConfiguration;
  try {
    configuration = nativeOAuthConfiguration(env);
    await initializeNativeOAuth(env.DB);
  } catch {
    return null;
  }
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`SELECT
      users.id, users.email, users.age_eligibility_confirmed_at,
      users.terms_accepted_at, users.terms_version,
      users.privacy_accepted_at, users.privacy_version,
      users.created_at, users.updated_at,
      native_oauth_access_tokens.expires_at AS access_expires_at,
      native_oauth_access_tokens.client_id,
      native_oauth_access_tokens.scope,
      CASE WHEN users.age_eligibility_confirmed_at IS NOT NULL THEN 1 ELSE 0 END AS age_eligible,
      CASE WHEN users.age_eligibility_confirmed_at IS NOT NULL
        AND users.terms_version = ? AND users.privacy_version = ?
        THEN 1 ELSE 0 END AS legal_accepted,
      CASE WHEN EXISTS (SELECT 1 FROM account_deletion_fences
        WHERE account_deletion_fences.user_id = users.id)
        THEN 1 ELSE 0 END AS deletion_fenced
    FROM native_oauth_access_tokens
    JOIN native_oauth_refresh_families
      ON native_oauth_refresh_families.id = native_oauth_access_tokens.family_id
    JOIN users ON users.id = native_oauth_access_tokens.user_id
    WHERE native_oauth_access_tokens.token_hash = ?
      AND native_oauth_access_tokens.client_id = ?
      AND native_oauth_access_tokens.expires_at > ?
      AND native_oauth_access_tokens.revoked_at IS NULL
      AND native_oauth_refresh_families.client_id = ?
      AND native_oauth_refresh_families.expires_at > ?
      AND native_oauth_refresh_families.revoked_at IS NULL
    LIMIT 1`)
    .bind(
      legalVersion,
      legalVersion,
      tokenHash,
      configuration.clientId,
      now,
      configuration.clientId,
      now,
    )
    .first<{
      id: string;
      email: string;
      age_eligibility_confirmed_at: string | null;
      terms_accepted_at: string | null;
      terms_version: string | null;
      privacy_accepted_at: string | null;
      privacy_version: string | null;
      created_at: string;
      updated_at: string;
      access_expires_at: string;
      client_id: string;
      scope: string;
      age_eligible: number;
      legal_accepted: number;
      deletion_fenced: number;
    }>();
  if (!row || row.client_id !== configuration.clientId) return null;
  const scopes = parseStoredScopes(row.scope);
  if (!scopes || requiredScopes.some((scope) => !scopes.includes(scope))) return null;
  return {
    accountVersion: {
      id: row.id,
      email: row.email,
      ageEligibilityConfirmedAt: row.age_eligibility_confirmed_at ?? "",
      termsAcceptedAt: row.terms_accepted_at,
      termsVersion: row.terms_version,
      privacyAcceptedAt: row.privacy_accepted_at,
      privacyVersion: row.privacy_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    accessTokenHash: tokenHash,
    accessTokenExpiresAt: row.access_expires_at,
    clientId: row.client_id,
    scopes,
    deletionFenced: Boolean(row.deletion_fenced),
    user: {
      id: row.id,
      email: row.email,
      ageEligible: Boolean(row.age_eligible),
      legalAccepted: Boolean(row.legal_accepted),
    },
  };
}

export async function handleNativeOAuthRequest(
  request: Request,
  env: NativeOAuthEnv,
  browserSession: AuthenticatedSession | null,
): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/native/oauth/")) return null;
  if (!env.DB) return oauthError(503, "storage_unavailable", "Native sign-in storage is unavailable.");

  try {
    const configuration = nativeOAuthConfiguration(env);
    await initializeNativeOAuth(env.DB);
    if (pathname === "/api/native/oauth/authorize") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      if (request.headers.get("Origin") !== new URL(request.url).origin
        || !request.headers.has("Cookie")) {
        return oauthError(403, "invalid_origin", "Use the first-party CastingCompass browser to continue.");
      }
      if (!browserSession || browserSession.credentialKind !== "browser_cookie") {
        return oauthError(401, "authentication_required", "Sign in in this browser before continuing.");
      }
      if (browserSession.deletionFenced) {
        return oauthError(409, "account_deletion_in_progress", "This account is being deleted.");
      }
      if (!browserSession.user.legalAccepted) {
        return oauthError(428, "legal_acceptance_required", "Accept the current legal terms before continuing.");
      }
      return await issueAuthorizationCode(
        env.DB,
        configuration,
        browserSession.user.id,
        await readJson(request),
      );
    }
    if (pathname === "/api/native/oauth/token") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      assertNativeBackchannelRequest(request);
      const body = await readJson(request);
      if (body.grantType === "authorization_code") {
        return await exchangeAuthorizationCode(env.DB, configuration, body);
      }
      if (body.grantType === "refresh_token") {
        return await rotateRefreshToken(env.DB, configuration, body);
      }
      throw new NativeOAuthError(422, "unsupported_grant_type", "Use authorization_code or refresh_token.");
    }
    if (pathname === "/api/native/oauth/revoke") {
      if (request.method !== "POST") return methodNotAllowed("POST");
      assertNativeBackchannelRequest(request);
      return await revokeNativeToken(env.DB, configuration, await readJson(request));
    }
    return null;
  } catch (error) {
    if (error instanceof NativeOAuthError) {
      return oauthError(error.status, error.code, error.message);
    }
    return oauthError(500, "native_auth_unavailable", "Native sign-in is temporarily unavailable.");
  }
}

function assertNativeBackchannelRequest(request: Request) {
  if (request.headers.has("Origin")
    || request.headers.has("Cookie")
    || request.headers.has("Authorization")) {
    throw new NativeOAuthError(
      400,
      "invalid_request",
      "Native token operations must not include browser or bearer authority.",
    );
  }
}

async function issueAuthorizationCode(
  db: D1DatabaseLike,
  configuration: NativeOAuthConfiguration,
  userId: string,
  body: Record<string, unknown>,
) {
  assertOnlyFields(body, [
    "clientId",
    "redirectUri",
    "codeChallenge",
    "codeChallengeMethod",
    "state",
    "scope",
  ]);
  assertClientRequest(body, configuration);
  const codeChallenge = parseCodeChallenge(body.codeChallenge);
  if (body.codeChallengeMethod !== NATIVE_OAUTH_CODE_CHALLENGE_METHOD) {
    throw new NativeOAuthError(422, "invalid_request", "PKCE S256 is required.");
  }
  if (body.scope !== NATIVE_OAUTH_SCOPE) {
    throw new NativeOAuthError(422, "invalid_scope", "The requested native scope is unavailable.");
  }
  if (typeof body.state !== "string" || !STATE_PATTERN.test(body.state)) {
    throw new NativeOAuthError(422, "invalid_request", "A high-entropy state value is required.");
  }
  const now = new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + NATIVE_OAUTH_AUTHORIZATION_CODE_SECONDS * 1000).toISOString();
  const active = await db.prepare(`SELECT COUNT(*) AS count
    FROM native_oauth_authorization_codes
    WHERE user_id = ? AND client_id = ? AND consumed_at IS NULL AND expires_at > ?`)
    .bind(userId, configuration.clientId, issuedAt)
    .first<{ count: number }>();
  if (!active || !Number.isSafeInteger(Number(active.count))) {
    throw new NativeOAuthError(503, "authorization_accounting_unavailable", "Authorization could not be confirmed.");
  }
  if (Number(active.count) >= 5) {
    throw new NativeOAuthError(429, "too_many_authorizations", "Too many sign-in attempts are still active.");
  }
  const code = randomSecret();
  const codeHash = await sha256(code);
  try {
    await db.prepare(`INSERT INTO native_oauth_authorization_codes (
        code_hash, user_id, client_id, redirect_uri, code_challenge, scope, issued_at, expires_at
      )
      SELECT ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
        AND NOT EXISTS (SELECT 1 FROM account_deletion_fences WHERE user_id = ?)
        AND (SELECT COUNT(*) FROM native_oauth_authorization_codes
          WHERE user_id = ? AND client_id = ?
            AND consumed_at IS NULL AND expires_at > ?) < 5`)
      .bind(
        codeHash,
        userId,
        configuration.clientId,
        configuration.redirectUri,
        codeChallenge,
        NATIVE_OAUTH_SCOPE,
        issuedAt,
        expiresAt,
        userId,
        userId,
        userId,
        configuration.clientId,
        issuedAt,
      )
      .run();
  } catch {
    // The random code hash is the post-state receipt key.
  }
  const receipt = await db.prepare(`SELECT code_hash
    FROM native_oauth_authorization_codes
    WHERE code_hash = ? AND user_id = ? AND client_id = ? AND redirect_uri = ?
      AND code_challenge = ? AND scope = ? AND issued_at = ? AND expires_at = ?
      AND consumed_at IS NULL AND consumed_by IS NULL
      AND NOT EXISTS (SELECT 1 FROM account_deletion_fences WHERE user_id = ?)
    LIMIT 1`)
    .bind(
      codeHash,
      userId,
      configuration.clientId,
      configuration.redirectUri,
      codeChallenge,
      NATIVE_OAUTH_SCOPE,
      issuedAt,
      expiresAt,
      userId,
    )
    .first<{ code_hash: string }>();
  if (receipt?.code_hash !== codeHash) {
    await bestEffortDeleteAuthorizationCode(db, codeHash);
    throw new NativeOAuthError(503, "authorization_unconfirmed", "Authorization could not be confirmed.");
  }
  const redirect = new URL(configuration.redirectUri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", body.state);
  return jsonResponse({
    redirectTo: redirect.toString(),
    expiresInSeconds: NATIVE_OAUTH_AUTHORIZATION_CODE_SECONDS,
  });
}

async function exchangeAuthorizationCode(
  db: D1DatabaseLike,
  configuration: NativeOAuthConfiguration,
  body: Record<string, unknown>,
) {
  assertOnlyFields(body, ["grantType", "clientId", "redirectUri", "code", "codeVerifier"]);
  assertClientRequest(body, configuration);
  const code = parseOpaqueToken(body.code, "authorization code");
  const verifier = parseCodeVerifier(body.codeVerifier);
  const codeHash = await sha256(code);
  const row = await db.prepare(`SELECT user_id, client_id, redirect_uri, code_challenge, scope,
      issued_at, expires_at, consumed_at, consumed_by
    FROM native_oauth_authorization_codes WHERE code_hash = ? LIMIT 1`)
    .bind(codeHash)
    .first<{
      user_id: string;
      client_id: string;
      redirect_uri: string;
      code_challenge: string;
      scope: string;
      issued_at: string;
      expires_at: string;
      consumed_at: string | null;
      consumed_by: string | null;
    }>();
  const now = new Date();
  const timestamp = now.toISOString();
  const expectedChallenge = await pkceChallenge(verifier);
  if (!row || row.client_id !== configuration.clientId
    || row.redirect_uri !== configuration.redirectUri
    || row.scope !== NATIVE_OAUTH_SCOPE
    || row.expires_at <= timestamp
    || row.consumed_at !== null
    || row.consumed_by !== null
    || !constantTimeEqual(row.code_challenge, expectedChallenge)) {
    throw new NativeOAuthError(400, "invalid_grant", "The authorization code is invalid or expired.");
  }

  const exchangeId = `exchange_${crypto.randomUUID()}`;
  const familyId = `native_family_${crypto.randomUUID()}`;
  const refreshToken = randomSecret();
  const accessToken = randomSecret();
  const refreshTokenHash = await sha256(refreshToken);
  const accessTokenHash = await sha256(accessToken);
  const accessExpiresAt = new Date(now.getTime() + NATIVE_OAUTH_ACCESS_TOKEN_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(now.getTime() + NATIVE_OAUTH_REFRESH_TOKEN_SECONDS * 1000).toISOString();
  try {
    await db.batch([
      db.prepare(`UPDATE native_oauth_authorization_codes
        SET consumed_at = ?, consumed_by = ?
        WHERE code_hash = ? AND user_id = ? AND client_id = ? AND redirect_uri = ?
          AND code_challenge = ? AND scope = ? AND issued_at = ? AND expires_at = ?
          AND expires_at > ? AND consumed_at IS NULL AND consumed_by IS NULL`)
        .bind(
          timestamp,
          exchangeId,
          codeHash,
          row.user_id,
          row.client_id,
          row.redirect_uri,
          row.code_challenge,
          row.scope,
          row.issued_at,
          row.expires_at,
          timestamp,
        ),
      db.prepare(`INSERT INTO native_oauth_refresh_families (
          id, user_id, client_id, scope, created_at, expires_at
        )
        SELECT ?, user_id, client_id, scope, ?, ?
        FROM native_oauth_authorization_codes
        WHERE code_hash = ? AND consumed_at = ? AND consumed_by = ?
          AND EXISTS (SELECT 1 FROM users
            WHERE users.id = native_oauth_authorization_codes.user_id)
          AND NOT EXISTS (SELECT 1 FROM account_deletion_fences
            WHERE account_deletion_fences.user_id = native_oauth_authorization_codes.user_id)`)
        .bind(familyId, timestamp, refreshExpiresAt, codeHash, timestamp, exchangeId),
      db.prepare(`INSERT INTO native_oauth_refresh_tokens (
          token_hash, family_id, generation, created_at, expires_at
        )
        SELECT ?, id, 0, ?, expires_at FROM native_oauth_refresh_families
        WHERE id = ? AND revoked_at IS NULL AND expires_at > ?`)
        .bind(refreshTokenHash, timestamp, familyId, timestamp),
      db.prepare(`INSERT INTO native_oauth_access_tokens (
          token_hash, family_id, user_id, client_id, scope, created_at, expires_at
        )
        SELECT ?, id, user_id, client_id, scope, ?, ?
        FROM native_oauth_refresh_families
        WHERE id = ? AND revoked_at IS NULL AND expires_at > ?`)
        .bind(accessTokenHash, timestamp, accessExpiresAt, familyId, timestamp),
    ]);
  } catch {
    // Exact post-state below decides whether either bearer credential may escape.
  }
  const confirmed = await confirmIssuedPair(
    db,
    familyId,
    row.user_id,
    configuration.clientId,
    refreshTokenHash,
    0,
    accessTokenHash,
    timestamp,
    accessExpiresAt,
    refreshExpiresAt,
  );
  if (!confirmed) {
    await revokeFamily(db, familyId, timestamp, false);
    throw new NativeOAuthError(503, "token_issuance_unconfirmed", "Native credentials could not be confirmed.");
  }
  return tokenPairResponse(accessToken, refreshToken, NATIVE_OAUTH_REFRESH_TOKEN_SECONDS);
}

async function rotateRefreshToken(
  db: D1DatabaseLike,
  configuration: NativeOAuthConfiguration,
  body: Record<string, unknown>,
) {
  assertOnlyFields(body, ["grantType", "clientId", "refreshToken"]);
  assertClientId(body.clientId, configuration);
  const refreshToken = parseOpaqueToken(body.refreshToken, "refresh token");
  const refreshTokenHash = await sha256(refreshToken);
  const row = await db.prepare(`SELECT
      native_oauth_refresh_tokens.family_id,
      native_oauth_refresh_tokens.generation,
      native_oauth_refresh_tokens.created_at,
      native_oauth_refresh_tokens.expires_at AS token_expires_at,
      native_oauth_refresh_tokens.consumed_at,
      native_oauth_refresh_tokens.consumed_by,
      native_oauth_refresh_tokens.successor_token_hash,
      native_oauth_refresh_families.user_id,
      native_oauth_refresh_families.client_id,
      native_oauth_refresh_families.scope,
      native_oauth_refresh_families.expires_at AS family_expires_at,
      native_oauth_refresh_families.revoked_at
    FROM native_oauth_refresh_tokens
    JOIN native_oauth_refresh_families
      ON native_oauth_refresh_families.id = native_oauth_refresh_tokens.family_id
    WHERE native_oauth_refresh_tokens.token_hash = ? LIMIT 1`)
    .bind(refreshTokenHash)
    .first<{
      family_id: string;
      generation: number;
      created_at: string;
      token_expires_at: string;
      consumed_at: string | null;
      consumed_by: string | null;
      successor_token_hash: string | null;
      user_id: string;
      client_id: string;
      scope: string;
      family_expires_at: string;
      revoked_at: string | null;
    }>();
  const now = new Date();
  const timestamp = now.toISOString();
  if (!row || row.client_id !== configuration.clientId || row.scope !== NATIVE_OAUTH_SCOPE
    || row.family_expires_at <= timestamp || row.token_expires_at <= timestamp || row.revoked_at) {
    throw new NativeOAuthError(400, "invalid_grant", "The refresh token is invalid or expired.");
  }
  if (row.consumed_at || row.consumed_by || row.successor_token_hash) {
    if (!await revokeFamily(db, row.family_id, timestamp, true)) {
      throw new NativeOAuthError(503, "revocation_unconfirmed", "The token family could not be safely revoked.");
    }
    throw new NativeOAuthError(400, "invalid_grant", "Refresh-token reuse was detected; sign in again.");
  }

  const generation = Number(row.generation);
  if (!Number.isSafeInteger(generation) || generation < 0 || generation >= 1_000_000) {
    await revokeFamily(db, row.family_id, timestamp, true);
    throw new NativeOAuthError(400, "invalid_grant", "The refresh token is invalid.");
  }
  const rotationId = `rotation_${crypto.randomUUID()}`;
  const nextRefreshToken = randomSecret();
  const nextAccessToken = randomSecret();
  const nextRefreshHash = await sha256(nextRefreshToken);
  const nextAccessHash = await sha256(nextAccessToken);
  const accessExpiresAt = new Date(now.getTime() + NATIVE_OAUTH_ACCESS_TOKEN_SECONDS * 1000).toISOString();
  try {
    await db.batch([
      db.prepare(`UPDATE native_oauth_refresh_tokens
        SET consumed_at = ?, consumed_by = ?, successor_token_hash = ?
        WHERE token_hash = ? AND family_id = ? AND generation = ?
          AND created_at = ? AND expires_at = ? AND expires_at > ?
          AND consumed_at IS NULL AND consumed_by IS NULL AND successor_token_hash IS NULL
          AND EXISTS (SELECT 1 FROM native_oauth_refresh_families
            WHERE id = ? AND revoked_at IS NULL AND expires_at > ?)`)
        .bind(
          timestamp,
          rotationId,
          nextRefreshHash,
          refreshTokenHash,
          row.family_id,
          generation,
          row.created_at,
          row.token_expires_at,
          timestamp,
          row.family_id,
          timestamp,
        ),
      db.prepare(`UPDATE native_oauth_access_tokens SET revoked_at = ?
        WHERE family_id = ? AND revoked_at IS NULL
          AND EXISTS (SELECT 1 FROM native_oauth_refresh_tokens
            WHERE token_hash = ? AND consumed_at = ? AND consumed_by = ?
              AND successor_token_hash = ?)`)
        .bind(timestamp, row.family_id, refreshTokenHash, timestamp, rotationId, nextRefreshHash),
      db.prepare(`INSERT INTO native_oauth_refresh_tokens (
          token_hash, family_id, generation, created_at, expires_at
        )
        SELECT ?, family_id, generation + 1, ?, ?
        FROM native_oauth_refresh_tokens
        WHERE token_hash = ? AND consumed_at = ? AND consumed_by = ?
          AND successor_token_hash = ?`)
        .bind(
          nextRefreshHash,
          timestamp,
          row.family_expires_at,
          refreshTokenHash,
          timestamp,
          rotationId,
          nextRefreshHash,
        ),
      db.prepare(`INSERT INTO native_oauth_access_tokens (
          token_hash, family_id, user_id, client_id, scope, created_at, expires_at
        )
        SELECT ?, id, user_id, client_id, scope, ?, ?
        FROM native_oauth_refresh_families
        WHERE id = ? AND revoked_at IS NULL AND expires_at > ?
          AND EXISTS (SELECT 1 FROM native_oauth_refresh_tokens
            WHERE token_hash = ? AND family_id = ? AND generation = ?)`)
        .bind(
          nextAccessHash,
          timestamp,
          accessExpiresAt,
          row.family_id,
          timestamp,
          nextRefreshHash,
          row.family_id,
          generation + 1,
        ),
    ]);
  } catch {
    // A readable exact successor is required before returning either raw token.
  }
  const confirmed = await confirmIssuedPair(
    db,
    row.family_id,
    row.user_id,
    configuration.clientId,
    nextRefreshHash,
    generation + 1,
    nextAccessHash,
    timestamp,
    accessExpiresAt,
    row.family_expires_at,
  );
  if (!confirmed) {
    await revokeFamily(db, row.family_id, timestamp, true);
    throw new NativeOAuthError(503, "token_rotation_unconfirmed", "Native credentials could not be rotated safely.");
  }
  const refreshSecondsRemaining = Math.max(
    0,
    Math.floor((new Date(row.family_expires_at).getTime() - now.getTime()) / 1000),
  );
  return tokenPairResponse(nextAccessToken, nextRefreshToken, refreshSecondsRemaining);
}

async function revokeNativeToken(
  db: D1DatabaseLike,
  configuration: NativeOAuthConfiguration,
  body: Record<string, unknown>,
) {
  assertOnlyFields(body, ["clientId", "token", "tokenTypeHint"]);
  assertClientId(body.clientId, configuration);
  const token = parseOpaqueToken(body.token, "token");
  if (body.tokenTypeHint !== "refresh_token" && body.tokenTypeHint !== "access_token") {
    throw new NativeOAuthError(422, "invalid_request", "A supported token type hint is required.");
  }
  const tokenHash = await sha256(token);
  const timestamp = new Date().toISOString();
  const refresh = await db.prepare(`SELECT native_oauth_refresh_tokens.family_id
    FROM native_oauth_refresh_tokens
    JOIN native_oauth_refresh_families
      ON native_oauth_refresh_families.id = native_oauth_refresh_tokens.family_id
    WHERE native_oauth_refresh_tokens.token_hash = ?
      AND native_oauth_refresh_families.client_id = ? LIMIT 1`)
    .bind(tokenHash, configuration.clientId)
    .first<{ family_id: string }>();
  if (refresh?.family_id) {
    if (!await revokeFamily(db, refresh.family_id, timestamp, false)) {
      throw new NativeOAuthError(503, "revocation_unconfirmed", "Native sign-out could not be confirmed.");
    }
    return jsonResponse({ revoked: true });
  }
  const access = await db.prepare(`SELECT family_id FROM native_oauth_access_tokens
    WHERE token_hash = ? AND client_id = ? LIMIT 1`)
    .bind(tokenHash, configuration.clientId)
    .first<{ family_id: string }>();
  if (access) {
    try {
      await db.prepare(`UPDATE native_oauth_access_tokens SET revoked_at = COALESCE(revoked_at, ?)
        WHERE token_hash = ? AND client_id = ?`)
        .bind(timestamp, tokenHash, configuration.clientId)
        .run();
    } catch {
      // Exact revocation receipt below decides success.
    }
    const receipt = await db.prepare(`SELECT COUNT(*) AS count FROM native_oauth_access_tokens
      WHERE token_hash = ? AND client_id = ? AND revoked_at IS NULL`)
      .bind(tokenHash, configuration.clientId)
      .first<{ count: number }>();
    if (Number(receipt?.count) !== 0) {
      throw new NativeOAuthError(503, "revocation_unconfirmed", "Native sign-out could not be confirmed.");
    }
  }
  // Unknown tokens deliberately receive the same idempotent response.
  return jsonResponse({ revoked: true });
}

async function confirmIssuedPair(
  db: D1DatabaseLike,
  familyId: string,
  userId: string,
  clientId: string,
  refreshTokenHash: string,
  generation: number,
  accessTokenHash: string,
  createdAt: string,
  accessExpiresAt: string,
  refreshExpiresAt: string,
) {
  try {
    const receipt = await db.prepare(`SELECT
        (SELECT COUNT(*) FROM native_oauth_refresh_families
          WHERE id = ? AND user_id = ? AND client_id = ? AND scope = ?
            AND expires_at = ? AND revoked_at IS NULL AND compromise_detected_at IS NULL) AS family_count,
        (SELECT COUNT(*) FROM native_oauth_refresh_tokens
          WHERE token_hash = ? AND family_id = ? AND generation = ?
            AND created_at = ? AND expires_at = ?
            AND consumed_at IS NULL AND consumed_by IS NULL
            AND successor_token_hash IS NULL) AS refresh_count,
        (SELECT COUNT(*) FROM native_oauth_access_tokens
          WHERE token_hash = ? AND family_id = ? AND user_id = ? AND client_id = ?
            AND scope = ? AND created_at = ? AND expires_at = ?
            AND revoked_at IS NULL) AS access_count,
        (SELECT COUNT(*) FROM account_deletion_fences WHERE user_id = ?) AS fence_count`)
      .bind(
        familyId,
        userId,
        clientId,
        NATIVE_OAUTH_SCOPE,
        refreshExpiresAt,
        refreshTokenHash,
        familyId,
        generation,
        createdAt,
        refreshExpiresAt,
        accessTokenHash,
        familyId,
        userId,
        clientId,
        NATIVE_OAUTH_SCOPE,
        createdAt,
        accessExpiresAt,
        userId,
      )
      .first<{ family_count: number; refresh_count: number; access_count: number; fence_count: number }>();
    return Number(receipt?.family_count) === 1 &&
      Number(receipt?.refresh_count) === 1 &&
      Number(receipt?.access_count) === 1 &&
      Number(receipt?.fence_count) === 0;
  } catch {
    return false;
  }
}

async function revokeFamily(
  db: D1DatabaseLike,
  familyId: string,
  timestamp: string,
  compromised: boolean,
) {
  try {
    await db.batch([
      db.prepare(`UPDATE native_oauth_refresh_families
        SET revoked_at = COALESCE(revoked_at, ?),
          compromise_detected_at = CASE
            WHEN ? = 1 THEN COALESCE(compromise_detected_at, ?)
            ELSE compromise_detected_at
          END
        WHERE id = ?`)
        .bind(timestamp, compromised ? 1 : 0, timestamp, familyId),
      db.prepare(`UPDATE native_oauth_access_tokens
        SET revoked_at = COALESCE(revoked_at, ?)
        WHERE family_id = ?`)
        .bind(timestamp, familyId),
    ]);
  } catch {
    // Exact absence of active family/access state below decides success.
  }
  try {
    const receipt = await db.prepare(`SELECT
        (SELECT COUNT(*) FROM native_oauth_refresh_families
          WHERE id = ? AND revoked_at IS NULL) AS active_family_count,
        (SELECT COUNT(*) FROM native_oauth_access_tokens
          WHERE family_id = ? AND revoked_at IS NULL) AS active_access_count`)
      .bind(familyId, familyId)
      .first<{ active_family_count: number; active_access_count: number }>();
    return Number(receipt?.active_family_count) === 0 &&
      Number(receipt?.active_access_count) === 0;
  } catch {
    return false;
  }
}

export async function cleanupNativeOAuthData(env: NativeOAuthEnv) {
  if (!env.DB) return;
  try {
    await initializeNativeOAuth(env.DB);
  } catch (error) {
    if (error instanceof NativeOAuthError && error.code === "native_auth_schema_unavailable") return;
    throw error;
  }
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM native_oauth_authorization_codes WHERE code_hash IN (
      SELECT code_hash FROM native_oauth_authorization_codes
      WHERE expires_at <= ? ORDER BY expires_at, code_hash LIMIT ?
    )`).bind(now, NATIVE_AUTH_RETENTION_BATCH),
    env.DB.prepare(`DELETE FROM native_oauth_access_tokens WHERE token_hash IN (
      SELECT token_hash FROM native_oauth_access_tokens
      WHERE expires_at <= ? ORDER BY expires_at, token_hash LIMIT ?
    )`).bind(now, NATIVE_AUTH_RETENTION_BATCH),
    env.DB.prepare(`DELETE FROM native_oauth_refresh_tokens WHERE token_hash IN (
      SELECT token_hash FROM native_oauth_refresh_tokens
      WHERE expires_at <= ? ORDER BY expires_at, token_hash LIMIT ?
    )`).bind(now, NATIVE_AUTH_RETENTION_BATCH),
    env.DB.prepare(`DELETE FROM native_oauth_refresh_families WHERE id IN (
      SELECT families.id FROM native_oauth_refresh_families AS families
      WHERE families.expires_at <= ?
        AND NOT EXISTS (SELECT 1 FROM native_oauth_refresh_tokens
          WHERE native_oauth_refresh_tokens.family_id = families.id)
        AND NOT EXISTS (SELECT 1 FROM native_oauth_access_tokens
          WHERE native_oauth_access_tokens.family_id = families.id)
      ORDER BY families.expires_at, families.id LIMIT ?
    )`).bind(now, NATIVE_AUTH_RETENTION_BATCH),
  ]);
}

function tokenPairResponse(accessToken: string, refreshToken: string, refreshExpiresIn: number) {
  return jsonResponse({
    accessToken,
    tokenType: NATIVE_OAUTH_TOKEN_TYPE,
    expiresIn: NATIVE_OAUTH_ACCESS_TOKEN_SECONDS,
    refreshToken,
    refreshExpiresIn,
    scope: NATIVE_OAUTH_SCOPE,
  });
}

function assertClientRequest(body: Record<string, unknown>, configuration: NativeOAuthConfiguration) {
  assertClientId(body.clientId, configuration);
  if (body.redirectUri !== configuration.redirectUri) {
    throw new NativeOAuthError(400, "invalid_request", "The redirect URI does not match the registered client.");
  }
}

function assertClientId(value: unknown, configuration: NativeOAuthConfiguration) {
  if (value !== configuration.clientId) {
    throw new NativeOAuthError(400, "invalid_client", "The native client is not registered.");
  }
}

function parseCodeChallenge(value: unknown) {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) {
    throw new NativeOAuthError(422, "invalid_request", "A valid PKCE challenge is required.");
  }
  return value;
}

function parseCodeVerifier(value: unknown) {
  if (typeof value !== "string" || !CODE_VERIFIER_PATTERN.test(value)) {
    throw new NativeOAuthError(400, "invalid_grant", "The PKCE verifier is invalid.");
  }
  return value;
}

function parseOpaqueToken(value: unknown, label: string) {
  if (typeof value !== "string" || !TOKEN_PATTERN.test(value)) {
    throw new NativeOAuthError(400, "invalid_grant", `The ${label} is invalid.`);
  }
  return value;
}

function parseStoredScopes(value: string): readonly NativeOAuthScope[] | null {
  if (value !== NATIVE_OAUTH_SCOPE) return null;
  return ["profile:read", "trips:write"];
}

function assertOnlyFields(body: Record<string, unknown>, allowed: readonly string[]) {
  const keys = Object.keys(body);
  if (keys.length !== allowed.length || !keys.every((key) => allowed.includes(key))) {
    throw new NativeOAuthError(422, "invalid_request", "The native authorization request is invalid.");
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type") ?? "")) {
    throw new NativeOAuthError(415, "invalid_request", "Use application/json.");
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new NativeOAuthError(400, "invalid_request", "The request body is not valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NativeOAuthError(400, "invalid_request", "The request body must be an object.");
  }
  return value as Record<string, unknown>;
}

async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomSecret() {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function bestEffortDeleteAuthorizationCode(
  db: D1DatabaseLike,
  value: string,
) {
  try {
    await db.prepare("DELETE FROM native_oauth_authorization_codes WHERE code_hash = ?")
      .bind(value)
      .run();
  } catch {
    // The raw secret is withheld, so an orphaned hash is inert until retention cleanup.
  }
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

function oauthError(status: number, code: string, message: string) {
  return jsonResponse({ error: { code, message } }, status);
}

function methodNotAllowed(allow: string) {
  const response = oauthError(405, "method_not_allowed", "That method is unavailable.");
  response.headers.set("Allow", allow);
  return response;
}
