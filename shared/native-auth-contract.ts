export const NATIVE_OAUTH_AUTHORIZATION_CODE_SECONDS = 5 * 60;
export const NATIVE_OAUTH_ACCESS_TOKEN_SECONDS = 10 * 60;
export const NATIVE_OAUTH_REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;

export const NATIVE_OAUTH_SCOPE_VALUES = [
  "profile:read",
  "trips:write",
] as const;

export type NativeOAuthScope = typeof NATIVE_OAUTH_SCOPE_VALUES[number];

export const NATIVE_OAUTH_SCOPE = NATIVE_OAUTH_SCOPE_VALUES.join(" ");
export const NATIVE_OAUTH_CODE_CHALLENGE_METHOD = "S256";
export const NATIVE_OAUTH_TOKEN_TYPE = "Bearer";
export const NATIVE_OAUTH_ALLOWED_REDIRECT_PROTOCOLS = ["https:", "castingcompass:"] as const;

export function isSafeNativeRedirectUri(value: string) {
  if (value.length < 12 || value.length > 512) return false;
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    if (!NATIVE_OAUTH_ALLOWED_REDIRECT_PROTOCOLS.includes(
      parsed.protocol as typeof NATIVE_OAUTH_ALLOWED_REDIRECT_PROTOCOLS[number],
    )) return false;
    if (parsed.protocol === "https:") return Boolean(parsed.hostname) && parsed.pathname !== "/";
    return parsed.protocol === "castingcompass:" && parsed.pathname !== "/";
  } catch {
    return false;
  }
}
