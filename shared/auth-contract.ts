/**
 * Public account-flow timing values shared by the Worker receipt producer and
 * browser receipt validator. Changing one of these values is an API contract
 * change and must update both sides through this module.
 */

export const AUTH_AGE_PROOF_MINUTES = 10;
export const AUTH_AGE_PROOF_SECONDS = 600;
export const AUTH_EMAIL_CHALLENGE_MINUTES = 15;
export const AUTH_EMAIL_CHALLENGE_MILLISECONDS = 900_000;
export const AUTH_RESEND_COOLDOWN_SECONDS = 60;
