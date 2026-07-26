/**
 * Public account-flow timing values shared by the Worker receipt producer and
 * browser receipt validator. Changing one of these values is an API contract
 * change and must update both sides through this module.
 */

export const AUTH_AGE_PROOF_MINUTES = 10;
export const AUTH_AGE_PROOF_SECONDS = AUTH_AGE_PROOF_MINUTES * 60;
export const AUTH_EMAIL_CHALLENGE_MINUTES = 15;
export const AUTH_EMAIL_CHALLENGE_MILLISECONDS = AUTH_EMAIL_CHALLENGE_MINUTES * 60_000;
export const AUTH_RESEND_COOLDOWN_SECONDS = 60;
