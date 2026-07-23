/**
 * Executable API access-control inventory.
 *
 * A Worker API route does not exist until it is classified here. The entry
 * point returns a generic 404 for unclassified API paths, a registry-derived
 * 405 for unclassified methods, a generic 503 when more than one policy claims
 * the same request, and a generic 403 when an admitted same-origin route lacks
 * an exact Origin. Adding or overlapping a handler branch without one
 * unambiguous security policy therefore fails closed before body parsing.
 */

export type ApiAuthorization = "public" | "optional_session" | "receipt" | "owner";
export type ApiHandler = "health" | "turnstile" | "account" | "trips" | "discussions";
export type RequestLimitClass = "auth" | "email" | "write" | "sensitive" | "read";

type ApiMethod = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "*";

export interface ApiRoutePolicy {
  id: string;
  pathTemplate: string;
  examplePath: string;
  methods: readonly ApiMethod[];
  authorization: ApiAuthorization;
  handler: ApiHandler;
  sameOriginRequired: boolean;
  currentLegalAcceptanceRequired: boolean;
  deletionFenceAccessAllowed: boolean;
  rateLimitTags: readonly Exclude<RequestLimitClass, "read" | "write">[];
  matches(pathname: string): boolean;
}

export interface ApiRouteRejection {
  status: 403 | 404 | 405 | 503;
  code: "invalid_origin" | "not_found" | "method_not_allowed" | "route_unavailable";
  message: string;
  allowedMethods: readonly ApiMethod[];
}

const exact = (expected: string) => (pathname: string) => pathname === expected;

export const API_ROUTE_PATTERNS = {
  discussion: /^\/api\/discussions\/([a-z0-9-]+)$/,
  gearProfile: /^\/api\/gear-profiles\/(gear_[a-f0-9-]{36})$/,
  profileExportDownload: /^\/api\/profile\/exports\/(pexj_[a-f0-9]{32})\/download$/,
  profileExportPhoto: /^\/api\/profile\/export\/photos\/(trip_[a-f0-9-]{36})$/,
  profileExportStatus: /^\/api\/profile\/exports\/(pexj_[a-f0-9]{32})$/,
  profileTrip: /^\/api\/profile\/trips\/(trip_[a-f0-9-]{36})$/,
  savedSite: /^\/api\/saved-sites\/([a-z0-9-]+)$/,
  tripCancel: /^\/api\/trips\/([^/]+)\/cancel$/,
  tripComplete: /^\/api\/trips\/([^/]+)\/complete$/,
} as const;

const route = (
  id: string,
  pathTemplate: string,
  examplePath: string,
  methods: readonly ApiMethod[],
  authorization: ApiAuthorization,
  handler: ApiHandler,
  options: {
    sameOriginRequired?: boolean;
    currentLegalAcceptanceRequired?: boolean;
    deletionFenceAccessAllowed?: boolean;
    rateLimitTags?: readonly Exclude<RequestLimitClass, "read" | "write">[];
    matches?: (pathname: string) => boolean;
  } = {},
): ApiRoutePolicy => ({
  id,
  pathTemplate,
  examplePath,
  methods,
  authorization,
  handler,
  sameOriginRequired: options.sameOriginRequired ?? false,
  currentLegalAcceptanceRequired: options.currentLegalAcceptanceRequired ?? false,
  deletionFenceAccessAllowed: options.deletionFenceAccessAllowed ?? false,
  rateLimitTags: options.rateLimitTags ?? [],
  matches: options.matches ?? exact(pathTemplate),
});

const ownerMutation = {
  authorization: "owner" as const,
  sameOriginRequired: true,
  currentLegalAcceptanceRequired: true,
};

export const API_ROUTE_POLICIES: readonly ApiRoutePolicy[] = [
  route("health", "/api/health", "/api/health", ["GET", "HEAD"], "public", "health"),
  route(
    "auth.turnstile_config",
    "/api/auth/turnstile-config",
    "/api/auth/turnstile-config",
    ["GET", "HEAD"],
    "public",
    "turnstile",
  ),
  route("auth.session", "/api/auth/session", "/api/auth/session", ["GET"], "optional_session", "account"),
  route("auth.signup_retired", "/api/auth/signup", "/api/auth/signup", ["*"], "public", "account"),
  route(
    "auth.signup_eligibility.read",
    "/api/auth/signup/eligibility",
    "/api/auth/signup/eligibility",
    ["GET"],
    "public",
    "account",
  ),
  route(
    "auth.signup_eligibility.submit",
    "/api/auth/signup/eligibility",
    "/api/auth/signup/eligibility",
    ["POST"],
    "public",
    "account",
    { sameOriginRequired: true, rateLimitTags: ["auth"] },
  ),
  route(
    "privacy.deletion_status.read",
    "/api/privacy/deletion-status",
    "/api/privacy/deletion-status",
    ["GET"],
    "receipt",
    "account",
  ),
  route(
    "privacy.deletion_status.clear",
    "/api/privacy/deletion-status",
    "/api/privacy/deletion-status",
    ["DELETE"],
    "public",
    "account",
    { sameOriginRequired: true },
  ),
  route(
    "auth.signup_request",
    "/api/auth/signup/request",
    "/api/auth/signup/request",
    ["POST"],
    "public",
    "account",
    { sameOriginRequired: true, rateLimitTags: ["auth", "email"] },
  ),
  route(
    "auth.signup_verify",
    "/api/auth/signup/verify",
    "/api/auth/signup/verify",
    ["POST"],
    "public",
    "account",
    { sameOriginRequired: true, rateLimitTags: ["auth", "email"] },
  ),
  route(
    "auth.challenge_resend",
    "/api/auth/challenge/resend",
    "/api/auth/challenge/resend",
    ["POST"],
    "public",
    "account",
    { sameOriginRequired: true, rateLimitTags: ["auth", "email"] },
  ),
  route(
    "auth.password_request",
    "/api/auth/password/request",
    "/api/auth/password/request",
    ["POST"],
    "public",
    "account",
    { sameOriginRequired: true, rateLimitTags: ["auth", "email"] },
  ),
  route(
    "auth.password_reset",
    "/api/auth/password/reset",
    "/api/auth/password/reset",
    ["POST"],
    "public",
    "account",
    { sameOriginRequired: true, rateLimitTags: ["auth"] },
  ),
  route(
    "auth.login",
    "/api/auth/login",
    "/api/auth/login",
    ["POST"],
    "public",
    "account",
    { sameOriginRequired: true, rateLimitTags: ["auth"] },
  ),
  route(
    "auth.logout",
    "/api/auth/logout",
    "/api/auth/logout",
    ["POST"],
    "optional_session",
    "account",
    { sameOriginRequired: true },
  ),
  route(
    "auth.eligibility",
    "/api/auth/eligibility",
    "/api/auth/eligibility",
    ["POST"],
    "owner",
    "account",
    { sameOriginRequired: true },
  ),
  route(
    "profile.export_photo",
    "/api/profile/export/photos/{tripId}",
    "/api/profile/export/photos/trip_00000000-0000-4000-8000-000000000000",
    ["GET"],
    "owner",
    "account",
    {
      deletionFenceAccessAllowed: true,
      rateLimitTags: ["sensitive"],
      matches: (path) => API_ROUTE_PATTERNS.profileExportPhoto.test(path),
    },
  ),
  route(
    "profile.export_status",
    "/api/profile/exports/{jobId}",
    "/api/profile/exports/pexj_00000000000000000000000000000000",
    ["GET"],
    "owner",
    "account",
    {
      deletionFenceAccessAllowed: true,
      matches: (path) => API_ROUTE_PATTERNS.profileExportStatus.test(path),
    },
  ),
  route(
    "profile.export_download",
    "/api/profile/exports/{jobId}/download",
    "/api/profile/exports/pexj_00000000000000000000000000000000/download",
    ["GET"],
    "owner",
    "account",
    {
      deletionFenceAccessAllowed: true,
      rateLimitTags: ["sensitive"],
      matches: (path) => API_ROUTE_PATTERNS.profileExportDownload.test(path),
    },
  ),
  route(
    "profile.export",
    "/api/profile/export",
    "/api/profile/export",
    ["GET"],
    "owner",
    "account",
    { deletionFenceAccessAllowed: true, rateLimitTags: ["sensitive"] },
  ),
  route(
    "profile.export_request",
    "/api/profile/export",
    "/api/profile/export",
    ["POST"],
    "owner",
    "account",
    { sameOriginRequired: true, rateLimitTags: ["sensitive"] },
  ),
  route("profile.read", "/api/profile", "/api/profile", ["GET"], "owner", "account", {
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: true,
  }),
  route("profile.delete", "/api/profile", "/api/profile", ["DELETE"], "owner", "account", {
    sameOriginRequired: true,
    deletionFenceAccessAllowed: true,
    rateLimitTags: ["sensitive"],
  }),
  route(
    "profile.reviews_retry",
    "/api/profile/reviews/retry",
    "/api/profile/reviews/retry",
    ["POST"],
    ownerMutation.authorization,
    "account",
    { ...ownerMutation, rateLimitTags: ["sensitive"] },
  ),
  route("gear_profiles.read", "/api/gear-profiles", "/api/gear-profiles", ["GET"], "owner", "account", {
    currentLegalAcceptanceRequired: true,
  }),
  route(
    "gear_profiles.create",
    "/api/gear-profiles",
    "/api/gear-profiles",
    ["POST"],
    ownerMutation.authorization,
    "account",
    ownerMutation,
  ),
  route(
    "gear_profiles.update",
    "/api/gear-profiles/{gearId}",
    "/api/gear-profiles/gear_00000000-0000-4000-8000-000000000000",
    ["PATCH"],
    ownerMutation.authorization,
    "account",
    { ...ownerMutation, matches: (path) => API_ROUTE_PATTERNS.gearProfile.test(path) },
  ),
  route(
    "gear_profiles.delete",
    "/api/gear-profiles/{gearId}",
    "/api/gear-profiles/gear_00000000-0000-4000-8000-000000000000",
    ["DELETE"],
    ownerMutation.authorization,
    "account",
    { ...ownerMutation, matches: (path) => API_ROUTE_PATTERNS.gearProfile.test(path) },
  ),
  route(
    "profile.trip_update",
    "/api/profile/trips/{tripId}",
    "/api/profile/trips/trip_00000000-0000-4000-8000-000000000000",
    ["PATCH"],
    ownerMutation.authorization,
    "account",
    { ...ownerMutation, matches: (path) => API_ROUTE_PATTERNS.profileTrip.test(path) },
  ),
  route(
    "profile.trip_delete",
    "/api/profile/trips/{tripId}",
    "/api/profile/trips/trip_00000000-0000-4000-8000-000000000000",
    ["DELETE"],
    ownerMutation.authorization,
    "account",
    {
      ...ownerMutation,
      rateLimitTags: ["sensitive"],
      matches: (path) => API_ROUTE_PATTERNS.profileTrip.test(path),
    },
  ),
  route("saved_sites.read", "/api/saved-sites", "/api/saved-sites", ["GET"], "owner", "account", {
    currentLegalAcceptanceRequired: true,
  }),
  route(
    "saved_sites.create",
    "/api/saved-sites/{siteId}",
    "/api/saved-sites/ocean-beach",
    ["POST"],
    ownerMutation.authorization,
    "account",
    { ...ownerMutation, matches: (path) => API_ROUTE_PATTERNS.savedSite.test(path) },
  ),
  route(
    "saved_sites.delete",
    "/api/saved-sites/{siteId}",
    "/api/saved-sites/ocean-beach",
    ["DELETE"],
    ownerMutation.authorization,
    "account",
    { ...ownerMutation, matches: (path) => API_ROUTE_PATTERNS.savedSite.test(path) },
  ),
  route("trips.summary", "/api/trips/summary", "/api/trips/summary", ["GET"], "public", "trips"),
  route("trips.start", "/api/trips/start", "/api/trips/start", ["POST"], "owner", "trips", ownerMutation),
  route(
    "trips.cancel",
    "/api/trips/{tripId}/cancel",
    "/api/trips/trip_00000000-0000-4000-8000-000000000000/cancel",
    ["POST"],
    ownerMutation.authorization,
    "trips",
    { ...ownerMutation, matches: (path) => API_ROUTE_PATTERNS.tripCancel.test(path) },
  ),
  route(
    "trips.complete",
    "/api/trips/{tripId}/complete",
    "/api/trips/trip_00000000-0000-4000-8000-000000000000/complete",
    ["POST"],
    ownerMutation.authorization,
    "trips",
    { ...ownerMutation, matches: (path) => API_ROUTE_PATTERNS.tripComplete.test(path) },
  ),
  route("trips.report", "/api/trips/report", "/api/trips/report", ["POST"], "owner", "trips", ownerMutation),
  route(
    "discussions.site",
    "/api/discussions/{siteId}",
    "/api/discussions/ocean-beach",
    ["GET"],
    "public",
    "discussions",
    { matches: (path) => API_ROUTE_PATTERNS.discussion.test(path) },
  ),
];

type ReviewedPublicApiRouteContract = Readonly<{
  pathTemplate: string;
  pathPattern: RegExp;
  methods: readonly ApiMethod[];
  handler: ApiHandler;
  sameOriginRequired: boolean;
  rateLimitTags: readonly Exclude<RequestLimitClass, "read" | "write">[];
}>;

type ReviewedOwnerApiRouteContract = Readonly<{
  pathTemplate: string;
  pathPattern: RegExp;
  methods: readonly ApiMethod[];
  handler: ApiHandler;
  sameOriginRequired: boolean;
  currentLegalAcceptanceRequired: boolean;
  deletionFenceAccessAllowed: boolean;
  rateLimitTags: readonly Exclude<RequestLimitClass, "read" | "write">[];
}>;

type ReviewedOptionalSessionApiRouteContract = Readonly<{
  pathTemplate: string;
  pathPattern: RegExp;
  methods: readonly ApiMethod[];
  handler: ApiHandler;
  sameOriginRequired: boolean;
  currentLegalAcceptanceRequired: boolean;
  deletionFenceAccessAllowed: boolean;
  rateLimitTags: readonly Exclude<RequestLimitClass, "read" | "write">[];
}>;

/**
 * Independent execution boundary for routes that intentionally require no
 * account, session, or resource-token authority. A new or changed `public`
 * policy must update this exhaustive contract before the Worker will execute
 * it; merely changing the primary registry cannot silently widen anonymous
 * access.
 */
const REVIEWED_PUBLIC_API_ROUTE_CONTRACTS: Readonly<Record<string, ReviewedPublicApiRouteContract>> = {
  health: {
    pathTemplate: "/api/health",
    pathPattern: /^\/api\/health$/,
    methods: ["GET", "HEAD"],
    handler: "health",
    sameOriginRequired: false,
    rateLimitTags: [],
  },
  "auth.turnstile_config": {
    pathTemplate: "/api/auth/turnstile-config",
    pathPattern: /^\/api\/auth\/turnstile-config$/,
    methods: ["GET", "HEAD"],
    handler: "turnstile",
    sameOriginRequired: false,
    rateLimitTags: [],
  },
  "auth.signup_retired": {
    pathTemplate: "/api/auth/signup",
    pathPattern: /^\/api\/auth\/signup$/,
    methods: ["*"],
    handler: "account",
    sameOriginRequired: false,
    rateLimitTags: [],
  },
  "auth.signup_eligibility.read": {
    pathTemplate: "/api/auth/signup/eligibility",
    pathPattern: /^\/api\/auth\/signup\/eligibility$/,
    methods: ["GET"],
    handler: "account",
    sameOriginRequired: false,
    rateLimitTags: [],
  },
  "auth.signup_eligibility.submit": {
    pathTemplate: "/api/auth/signup/eligibility",
    pathPattern: /^\/api\/auth\/signup\/eligibility$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    rateLimitTags: ["auth"],
  },
  "privacy.deletion_status.clear": {
    pathTemplate: "/api/privacy/deletion-status",
    pathPattern: /^\/api\/privacy\/deletion-status$/,
    methods: ["DELETE"],
    handler: "account",
    sameOriginRequired: true,
    rateLimitTags: [],
  },
  "auth.signup_request": {
    pathTemplate: "/api/auth/signup/request",
    pathPattern: /^\/api\/auth\/signup\/request$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    rateLimitTags: ["auth", "email"],
  },
  "auth.signup_verify": {
    pathTemplate: "/api/auth/signup/verify",
    pathPattern: /^\/api\/auth\/signup\/verify$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    rateLimitTags: ["auth", "email"],
  },
  "auth.challenge_resend": {
    pathTemplate: "/api/auth/challenge/resend",
    pathPattern: /^\/api\/auth\/challenge\/resend$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    rateLimitTags: ["auth", "email"],
  },
  "auth.password_request": {
    pathTemplate: "/api/auth/password/request",
    pathPattern: /^\/api\/auth\/password\/request$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    rateLimitTags: ["auth", "email"],
  },
  "auth.password_reset": {
    pathTemplate: "/api/auth/password/reset",
    pathPattern: /^\/api\/auth\/password\/reset$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    rateLimitTags: ["auth"],
  },
  "auth.login": {
    pathTemplate: "/api/auth/login",
    pathPattern: /^\/api\/auth\/login$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    rateLimitTags: ["auth"],
  },
  "trips.summary": {
    pathTemplate: "/api/trips/summary",
    pathPattern: /^\/api\/trips\/summary$/,
    methods: ["GET"],
    handler: "trips",
    sameOriginRequired: false,
    rateLimitTags: [],
  },
  "discussions.site": {
    pathTemplate: "/api/discussions/{siteId}",
    pathPattern: /^\/api\/discussions\/[a-z0-9-]+$/,
    methods: ["GET"],
    handler: "discussions",
    sameOriginRequired: false,
    rateLimitTags: [],
  },
};

/**
 * Independent execution boundary for routes that act with account authority.
 * The primary registry selects a candidate, but this exhaustive contract must
 * separately agree with its actual request, handler, legal/fence controls, and
 * stronger abuse tags before the Worker resolves a session or reads a body.
 */
const REVIEWED_OWNER_API_ROUTE_CONTRACTS: Readonly<Record<string, ReviewedOwnerApiRouteContract>> = {
  "auth.eligibility": {
    pathTemplate: "/api/auth/eligibility",
    pathPattern: /^\/api\/auth\/eligibility$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: false,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "profile.export_photo": {
    pathTemplate: "/api/profile/export/photos/{tripId}",
    pathPattern: /^\/api\/profile\/export\/photos\/trip_[a-f0-9-]{36}$/,
    methods: ["GET"],
    handler: "account",
    sameOriginRequired: false,
    currentLegalAcceptanceRequired: false,
    deletionFenceAccessAllowed: true,
    rateLimitTags: ["sensitive"],
  },
  "profile.export_status": {
    pathTemplate: "/api/profile/exports/{jobId}",
    pathPattern: /^\/api\/profile\/exports\/pexj_[a-f0-9]{32}$/,
    methods: ["GET"],
    handler: "account",
    sameOriginRequired: false,
    currentLegalAcceptanceRequired: false,
    deletionFenceAccessAllowed: true,
    rateLimitTags: [],
  },
  "profile.export_download": {
    pathTemplate: "/api/profile/exports/{jobId}/download",
    pathPattern: /^\/api\/profile\/exports\/pexj_[a-f0-9]{32}\/download$/,
    methods: ["GET"],
    handler: "account",
    sameOriginRequired: false,
    currentLegalAcceptanceRequired: false,
    deletionFenceAccessAllowed: true,
    rateLimitTags: ["sensitive"],
  },
  "profile.export": {
    pathTemplate: "/api/profile/export",
    pathPattern: /^\/api\/profile\/export$/,
    methods: ["GET"],
    handler: "account",
    sameOriginRequired: false,
    currentLegalAcceptanceRequired: false,
    deletionFenceAccessAllowed: true,
    rateLimitTags: ["sensitive"],
  },
  "profile.export_request": {
    pathTemplate: "/api/profile/export",
    pathPattern: /^\/api\/profile\/export$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: false,
    deletionFenceAccessAllowed: false,
    rateLimitTags: ["sensitive"],
  },
  "profile.read": {
    pathTemplate: "/api/profile",
    pathPattern: /^\/api\/profile$/,
    methods: ["GET"],
    handler: "account",
    sameOriginRequired: false,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: true,
    rateLimitTags: [],
  },
  "profile.delete": {
    pathTemplate: "/api/profile",
    pathPattern: /^\/api\/profile$/,
    methods: ["DELETE"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: false,
    deletionFenceAccessAllowed: true,
    rateLimitTags: ["sensitive"],
  },
  "profile.reviews_retry": {
    pathTemplate: "/api/profile/reviews/retry",
    pathPattern: /^\/api\/profile\/reviews\/retry$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: ["sensitive"],
  },
  "gear_profiles.read": {
    pathTemplate: "/api/gear-profiles",
    pathPattern: /^\/api\/gear-profiles$/,
    methods: ["GET"],
    handler: "account",
    sameOriginRequired: false,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "gear_profiles.create": {
    pathTemplate: "/api/gear-profiles",
    pathPattern: /^\/api\/gear-profiles$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "gear_profiles.update": {
    pathTemplate: "/api/gear-profiles/{gearId}",
    pathPattern: /^\/api\/gear-profiles\/gear_[a-f0-9-]{36}$/,
    methods: ["PATCH"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "gear_profiles.delete": {
    pathTemplate: "/api/gear-profiles/{gearId}",
    pathPattern: /^\/api\/gear-profiles\/gear_[a-f0-9-]{36}$/,
    methods: ["DELETE"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "profile.trip_update": {
    pathTemplate: "/api/profile/trips/{tripId}",
    pathPattern: /^\/api\/profile\/trips\/trip_[a-f0-9-]{36}$/,
    methods: ["PATCH"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "profile.trip_delete": {
    pathTemplate: "/api/profile/trips/{tripId}",
    pathPattern: /^\/api\/profile\/trips\/trip_[a-f0-9-]{36}$/,
    methods: ["DELETE"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: ["sensitive"],
  },
  "saved_sites.read": {
    pathTemplate: "/api/saved-sites",
    pathPattern: /^\/api\/saved-sites$/,
    methods: ["GET"],
    handler: "account",
    sameOriginRequired: false,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "saved_sites.create": {
    pathTemplate: "/api/saved-sites/{siteId}",
    pathPattern: /^\/api\/saved-sites\/[a-z0-9-]+$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "saved_sites.delete": {
    pathTemplate: "/api/saved-sites/{siteId}",
    pathPattern: /^\/api\/saved-sites\/[a-z0-9-]+$/,
    methods: ["DELETE"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "trips.start": {
    pathTemplate: "/api/trips/start",
    pathPattern: /^\/api\/trips\/start$/,
    methods: ["POST"],
    handler: "trips",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "trips.cancel": {
    pathTemplate: "/api/trips/{tripId}/cancel",
    pathPattern: /^\/api\/trips\/trip_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/cancel$/,
    methods: ["POST"],
    handler: "trips",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "trips.complete": {
    pathTemplate: "/api/trips/{tripId}/complete",
    pathPattern: /^\/api\/trips\/trip_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/complete$/,
    methods: ["POST"],
    handler: "trips",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "trips.report": {
    pathTemplate: "/api/trips/report",
    pathPattern: /^\/api\/trips\/report$/,
    methods: ["POST"],
    handler: "trips",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: true,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
};

/**
 * Independent execution boundary for the two routes that may discover or
 * revoke a session without requiring one to exist. The primary registry may
 * select a candidate, but it cannot silently widen this authority class or
 * weaken logout's same-origin control before storage/schema preflight.
 */
const REVIEWED_OPTIONAL_SESSION_API_ROUTE_CONTRACTS: Readonly<
  Record<string, ReviewedOptionalSessionApiRouteContract>
> = {
  "auth.session": {
    pathTemplate: "/api/auth/session",
    pathPattern: /^\/api\/auth\/session$/,
    methods: ["GET"],
    handler: "account",
    sameOriginRequired: false,
    currentLegalAcceptanceRequired: false,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
  "auth.logout": {
    pathTemplate: "/api/auth/logout",
    pathPattern: /^\/api\/auth\/logout$/,
    methods: ["POST"],
    handler: "account",
    sameOriginRequired: true,
    currentLegalAcceptanceRequired: false,
    deletionFenceAccessAllowed: false,
    rateLimitTags: [],
  },
};

function sameOrderedValues<T>(actual: readonly T[], expected: readonly T[]) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function isReviewedPublicApiRequest(request: Request, policy: ApiRoutePolicy): boolean {
  const reviewed = REVIEWED_PUBLIC_API_ROUTE_CONTRACTS[policy.id];
  const { pathname } = new URL(request.url);
  return Boolean(reviewed) &&
    policy.authorization === "public" &&
    policy.pathTemplate === reviewed.pathTemplate &&
    reviewed.pathPattern.test(pathname) &&
    sameOrderedValues(policy.methods, reviewed.methods) &&
    (reviewed.methods.includes("*") || reviewed.methods.includes(request.method as ApiMethod)) &&
    policy.handler === reviewed.handler &&
    policy.sameOriginRequired === reviewed.sameOriginRequired &&
    policy.currentLegalAcceptanceRequired === false &&
    policy.deletionFenceAccessAllowed === false &&
    sameOrderedValues(policy.rateLimitTags, reviewed.rateLimitTags);
}

export function isReviewedOwnerApiRequest(request: Request, policy: ApiRoutePolicy): boolean {
  const reviewed = REVIEWED_OWNER_API_ROUTE_CONTRACTS[policy.id];
  const { pathname } = new URL(request.url);
  return Boolean(reviewed) &&
    policy.authorization === "owner" &&
    policy.pathTemplate === reviewed.pathTemplate &&
    reviewed.pathPattern.test(pathname) &&
    sameOrderedValues(policy.methods, reviewed.methods) &&
    reviewed.methods.includes(request.method as ApiMethod) &&
    policy.handler === reviewed.handler &&
    policy.sameOriginRequired === reviewed.sameOriginRequired &&
    policy.currentLegalAcceptanceRequired === reviewed.currentLegalAcceptanceRequired &&
    policy.deletionFenceAccessAllowed === reviewed.deletionFenceAccessAllowed &&
    sameOrderedValues(policy.rateLimitTags, reviewed.rateLimitTags);
}

export function isReviewedOptionalSessionApiRequest(request: Request, policy: ApiRoutePolicy): boolean {
  const reviewed = REVIEWED_OPTIONAL_SESSION_API_ROUTE_CONTRACTS[policy.id];
  const { pathname } = new URL(request.url);
  return Boolean(reviewed) &&
    policy.authorization === "optional_session" &&
    policy.pathTemplate === reviewed.pathTemplate &&
    reviewed.pathPattern.test(pathname) &&
    sameOrderedValues(policy.methods, reviewed.methods) &&
    reviewed.methods.includes(request.method as ApiMethod) &&
    policy.handler === reviewed.handler &&
    policy.sameOriginRequired === reviewed.sameOriginRequired &&
    policy.currentLegalAcceptanceRequired === reviewed.currentLegalAcceptanceRequired &&
    policy.deletionFenceAccessAllowed === reviewed.deletionFenceAccessAllowed &&
    sameOrderedValues(policy.rateLimitTags, reviewed.rateLimitTags);
}

function apiRoutePoliciesForRequest(
  request: Request,
  policies: readonly ApiRoutePolicy[],
): readonly ApiRoutePolicy[] {
  const { pathname } = new URL(request.url);
  return policies.filter((policy) =>
    policy.matches(pathname) && (policy.methods.includes("*") || policy.methods.includes(request.method as ApiMethod))
  );
}

function requestHasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    const parsedOrigin = new URL(origin).origin;
    return origin === parsedOrigin && parsedOrigin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** Admit a request only when exactly one executable policy claims it. */
export function apiRoutePolicyForRequest(
  request: Request,
  policies: readonly ApiRoutePolicy[] = API_ROUTE_POLICIES,
): ApiRoutePolicy | null {
  const matches = apiRoutePoliciesForRequest(request, policies);
  return matches.length === 1 ? matches[0] : null;
}

export function isKnownApiPath(
  pathname: string,
  policies: readonly ApiRoutePolicy[] = API_ROUTE_POLICIES,
) {
  return policies.some((policy) => policy.matches(pathname));
}

const API_METHOD_ORDER: readonly ApiMethod[] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];

/**
 * Return the exact methods admitted by policy for a recognized API path.
 *
 * Handlers must not be the authority for discovering a method. Keeping this
 * list derived from the registry lets the Worker reject an unclassified
 * method before any handler can accidentally grow a new route outside the
 * access-control matrix.
 */
export function allowedApiMethodsForPath(
  pathname: string,
  policies: readonly ApiRoutePolicy[] = API_ROUTE_POLICIES,
): readonly ApiMethod[] {
  const pathPolicies = policies.filter((policy) => policy.matches(pathname));
  if (pathPolicies.some((policy) => policy.methods.includes("*"))) return ["*"];
  const allowed = new Set(pathPolicies.flatMap((policy) => policy.methods));
  return API_METHOD_ORDER.filter((method) => allowed.has(method));
}

/** Reject API requests that have zero, multiple, or origin-invalid policy matches. */
export function apiRouteRejectionForRequest(
  request: Request,
  policies: readonly ApiRoutePolicy[] = API_ROUTE_POLICIES,
): ApiRouteRejection | null {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return null;
  const matches = apiRoutePoliciesForRequest(request, policies);
  if (matches.length > 1) {
    return {
      status: 503,
      code: "route_unavailable",
      message: "This API route is temporarily unavailable.",
      allowedMethods: [],
    };
  }
  if (matches.length === 1) {
    if (matches[0].sameOriginRequired && !requestHasSameOrigin(request)) {
      return {
        status: 403,
        code: "invalid_origin",
        message: "State-changing requests must come from CastingCompass.",
        allowedMethods: [],
      };
    }
    return null;
  }
  const allowedMethods = allowedApiMethodsForPath(pathname, policies);
  if (allowedMethods.length > 0) {
    return {
      status: 405,
      code: "method_not_allowed",
      message: "That method is not available for this API route.",
      allowedMethods,
    };
  }
  return {
    status: 404,
    code: "not_found",
    message: "API route not found.",
    allowedMethods: [],
  };
}

export function rateLimitClassesForRequest(
  request: Request,
  policies: readonly ApiRoutePolicy[] = API_ROUTE_POLICIES,
): RequestLimitClass[] {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith("/api/")) return [];

  const matchingPolicies = apiRoutePoliciesForRequest(request, policies);
  if (pathname === "/api/health" && matchingPolicies.length <= 1) return [];
  const classes = new Set<RequestLimitClass>();
  if (request.method === "GET" || request.method === "HEAD") classes.add("read");
  for (const policy of matchingPolicies) {
    for (const tag of policy.rateLimitTags) classes.add(tag);
  }
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !classes.has("auth")) {
    classes.add("write");
  }
  return [...classes];
}
