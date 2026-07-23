export const ACTIVE_TRIP_KEY = "castingcompass.active-trip.v1";
export const LEGACY_ACTIVE_TRIP_KEY = "contourcast.active-trip.v1";
export const REPORTER_KEY = "castingcompass.reporter-key.v1";
export const LEGACY_REPORTER_KEY = "contourcast.reporter-key.v1";
export const TRIP_DRAFT_PREFIX = "castingcompass.trip-draft.v1.";
export const PROFILE_TRIP_DRAFT_PREFIX = "castingcompass.profile-trip-draft.v1.";
export const TRIP_REQUEST_PREFIX = "castingcompass.trip-request.v1.";
export const TRIP_PENDING_PREFIX = "castingcompass.trip-pending.v1.";

export const ACCOUNT_STORAGE_EXACT_KEYS = Object.freeze([
  ACTIVE_TRIP_KEY,
  REPORTER_KEY,
  LEGACY_ACTIVE_TRIP_KEY,
  LEGACY_REPORTER_KEY,
]);

export const ACCOUNT_STORAGE_PREFIXES = Object.freeze([
  TRIP_DRAFT_PREFIX,
  PROFILE_TRIP_DRAFT_PREFIX,
  TRIP_REQUEST_PREFIX,
  TRIP_PENDING_PREFIX,
  "contourcast.trip-draft.v1.",
  "contourcast.profile-trip-draft.v1.",
]);

function isAccountStorageKey(key: string) {
  return ACCOUNT_STORAGE_EXACT_KEYS.includes(key)
    || ACCOUNT_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function storageKeys(storage: Storage) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key));
}

/**
 * Remove only CastingCompass account/trip recovery state after the server has
 * authoritatively confirmed sign-out or account deletion. Other site
 * preferences remain untouched. The return value is verified, not assumed.
 */
export function clearCastingCompassAccountStorage() {
  let cleared = true;
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[storageName];
      for (const key of storageKeys(storage)) {
        if (isAccountStorageKey(key)) storage.removeItem(key);
      }
      if (storageKeys(storage).some(isAccountStorageKey)) cleared = false;
    } catch {
      // A browser can block storage access; confirmed server-side sign-out or
      // deletion still stands, but the UI must disclose that local cleanup was
      // not verified.
      cleared = false;
    }
  }
  return cleared;
}
