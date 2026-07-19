export const API_COMPATIBILITY_VERSION = "1";
export const API_VERSION_HEADER = "X-CastingCompass-API-Version";

/**
 * Existing first-party browser clients do not send a version header and remain
 * compatible. Clients that opt into negotiation must send the one exact
 * compatibility version; ambiguous, duplicated, or future values fail before
 * rate limiting, body reads, authentication, and route/provider work.
 */
export function unsupportedApiVersionResponse(request: Request): Response | null {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;

  const requestedVersion = request.headers.get(API_VERSION_HEADER);
  if (requestedVersion === null || requestedVersion === API_COMPATIBILITY_VERSION) return null;

  return new Response(JSON.stringify({
    error: {
      code: "unsupported_api_version",
      message: `This client is not compatible with CastingCompass API version ${API_COMPATIBILITY_VERSION}.`,
    },
  }), {
    status: 400,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      [API_VERSION_HEADER]: API_COMPATIBILITY_VERSION,
    },
  });
}
