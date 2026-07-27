export const NATIVE_TRIP_CLIENT_CONTRACT_VERSION =
  "castingcompass.native-trip-client/1.0.0" as const;

export const NATIVE_TRIP_API_VERSION = "1" as const;
export const NATIVE_TRIP_API_VERSION_HEADER = "X-CastingCompass-API-Version" as const;
export const NATIVE_TRIP_REQUIRED_SCOPE = "trips:write" as const;

export const NATIVE_TRIP_SUPPORTED_MODES = [
  "shore",
  "beach",
  "pier",
  "jetty",
] as const;

export const NATIVE_TRIP_CANCELLATION_REASONS = [
  "weather",
  "water_safety",
  "access",
  "health",
  "personal",
  "other",
] as const;

export const NATIVE_TRIP_START_FIELDS = [
  "clientTripId",
  "requestToken",
  "reporterKey",
  "siteId",
  "startedAt",
  "anglerCount",
  "mode",
  "scoreInfluencedChoice",
  "primaryTargetConfirmed",
  "consent",
] as const;

export const NATIVE_TRIP_COMPLETE_FIELDS = [
  "token",
  "reporterKey",
  "anglerCount",
  "mode",
  "scoreInfluencedChoice",
  "keeperCount",
  "shortReleasedCount",
  "otherCatchCount",
  "otherSpecies",
  "consent",
  "primaryTargetConfirmed",
  "completeAttempt",
] as const;

export const NATIVE_TRIP_CANCEL_FIELDS = [
  "token",
  "reason",
] as const;

export const NATIVE_TRIP_START_ACCEPTED_FIELDS = [
  "clientTripId",
  "requestToken",
  "reporterKey",
  "siteId",
  "startedAt",
  "anglerCount",
  "mode",
  "scoreInfluencedChoice",
  "primaryTargetConfirmed",
  "consent",
  "method",
  "opportunityWindowId",
  "referralCode",
] as const;

export const NATIVE_TRIP_COMPLETE_ACCEPTED_FIELDS = [
  "token",
  "reporterKey",
  "anglerCount",
  "mode",
  "scoreInfluencedChoice",
  "keeperCount",
  "shortReleasedCount",
  "otherCatchCount",
  "consent",
  "primaryTargetConfirmed",
  "completeAttempt",
  "otherSpecies",
  "method",
] as const;

export const NATIVE_TRIP_CANCEL_ACCEPTED_FIELDS = [
  "token",
  "reason",
] as const;

export const NATIVE_TRIP_ROUTES = {
  start: {
    method: "POST",
    pathTemplate: "/api/trips/start",
    contentType: "application/json",
    receiptOperation: "start",
  },
  complete: {
    method: "POST",
    pathTemplate: "/api/trips/{tripId}/complete",
    contentType: "multipart/form-data",
    receiptOperation: "complete",
  },
  cancel: {
    method: "POST",
    pathTemplate: "/api/trips/{tripId}/cancel",
    contentType: "application/json",
    receiptOperation: "cancel",
  },
} as const;

export const NATIVE_TRIP_RECOVERY_STATES = [
  "draft",
  "pending_submission",
  "confirmed",
  "needs_user_attention",
] as const;
