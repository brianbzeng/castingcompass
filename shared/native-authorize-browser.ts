import {
  NATIVE_OAUTH_AUTHORIZATION_CODE_SECONDS,
  NATIVE_OAUTH_CODE_CHALLENGE_METHOD,
  NATIVE_OAUTH_SCOPE,
} from "./native-auth-contract.ts";

const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STATE_PATTERN = /^[A-Za-z0-9._~-]{32,160}$/;
const CALLBACK_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/;
const REQUEST_FIELDS = [
  "client_id",
  "redirect_uri",
  "code_challenge",
  "code_challenge_method",
  "state",
  "scope",
] as const;

export interface NativeAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: typeof NATIVE_OAUTH_CODE_CHALLENGE_METHOD;
  state: string;
  scope: typeof NATIVE_OAUTH_SCOPE;
}

export function parseNativeAuthorizationRequest(search: string): NativeAuthorizationRequest | null {
  const params = new URLSearchParams(search);
  const actualFields = [...params.keys()];
  if (actualFields.length !== REQUEST_FIELDS.length
    || REQUEST_FIELDS.some((field) => params.getAll(field).length !== 1)
    || actualFields.some((field) => !REQUEST_FIELDS.includes(field as typeof REQUEST_FIELDS[number]))) {
    return null;
  }
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const codeChallenge = params.get("code_challenge") ?? "";
  const codeChallengeMethod = params.get("code_challenge_method") ?? "";
  const state = params.get("state") ?? "";
  const scope = params.get("scope") ?? "";
  if (!CLIENT_ID_PATTERN.test(clientId)
    || !isSafeNativeCallbackBase(redirectUri)
    || !CODE_CHALLENGE_PATTERN.test(codeChallenge)
    || codeChallengeMethod !== NATIVE_OAUTH_CODE_CHALLENGE_METHOD
    || !STATE_PATTERN.test(state)
    || scope !== NATIVE_OAUTH_SCOPE) {
    return null;
  }
  return {
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod: NATIVE_OAUTH_CODE_CHALLENGE_METHOD,
    state,
    scope: NATIVE_OAUTH_SCOPE,
  };
}

export function isSafeNativeCallbackBase(value: string) {
  if (value.length < 12 || value.length > 512) return false;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.search || parsed.hash
      || parsed.protocol === "http:" || parsed.protocol === "file:"
      || parsed.protocol === "data:" || parsed.protocol === "javascript:") {
      return false;
    }
    if (parsed.protocol === "https:") return Boolean(parsed.hostname) && parsed.pathname !== "/";
    return /^[a-z][a-z0-9+.-]{2,63}:$/.test(parsed.protocol) && parsed.pathname !== "/";
  } catch {
    return false;
  }
}

export function verifiedNativeAuthorizationCallback(
  body: unknown,
  request: NativeAuthorizationRequest,
) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== 2
    || typeof record.redirectTo !== "string"
    || record.expiresInSeconds !== NATIVE_OAUTH_AUTHORIZATION_CODE_SECONDS) {
    return null;
  }
  try {
    const expected = new URL(request.redirectUri);
    const actual = new URL(record.redirectTo);
    if (actual.protocol !== expected.protocol
      || actual.username !== expected.username
      || actual.password !== expected.password
      || actual.host !== expected.host
      || actual.pathname !== expected.pathname
      || actual.hash
      || actual.searchParams.size !== 2
      || actual.searchParams.getAll("code").length !== 1
      || actual.searchParams.getAll("state").length !== 1
      || !CALLBACK_CODE_PATTERN.test(actual.searchParams.get("code") ?? "")
      || actual.searchParams.get("state") !== request.state) {
      return null;
    }
    return actual.toString();
  } catch {
    return null;
  }
}
