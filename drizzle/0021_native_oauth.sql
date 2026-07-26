-- Native applications are public OAuth clients: no client secret is stored or
-- accepted. Authorization codes and bearer credentials are opaque; only
-- SHA-256 hashes are retained.

CREATE TABLE `native_oauth_authorization_codes` (
  `code_hash` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `client_id` text NOT NULL,
  `redirect_uri` text NOT NULL,
  `code_challenge` text NOT NULL,
  `scope` text NOT NULL,
  `issued_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `consumed_at` text,
  `consumed_by` text,
  CONSTRAINT `native_oauth_authorization_codes_consumption_check`
    CHECK ((`consumed_at` IS NULL AND `consumed_by` IS NULL)
      OR (`consumed_at` IS NOT NULL AND `consumed_by` IS NOT NULL)),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `native_oauth_authorization_codes_expiry_idx`
  ON `native_oauth_authorization_codes` (`expires_at`, `code_hash`);
--> statement-breakpoint
CREATE INDEX `native_oauth_authorization_codes_user_client_expiry_idx`
  ON `native_oauth_authorization_codes` (`user_id`, `client_id`, `consumed_at`, `expires_at`);
--> statement-breakpoint

CREATE TABLE `native_oauth_refresh_families` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `client_id` text NOT NULL,
  `scope` text NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `revoked_at` text,
  `compromise_detected_at` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `native_oauth_refresh_families_user_idx`
  ON `native_oauth_refresh_families` (`user_id`, `expires_at`);
--> statement-breakpoint
CREATE INDEX `native_oauth_refresh_families_expiry_idx`
  ON `native_oauth_refresh_families` (`expires_at`, `id`);
--> statement-breakpoint

CREATE TABLE `native_oauth_refresh_tokens` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `family_id` text NOT NULL,
  `generation` integer NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `consumed_at` text,
  `consumed_by` text,
  `successor_token_hash` text,
  CONSTRAINT `native_oauth_refresh_tokens_generation_check` CHECK (`generation` >= 0),
  CONSTRAINT `native_oauth_refresh_tokens_consumption_check`
    CHECK ((`consumed_at` IS NULL AND `consumed_by` IS NULL AND `successor_token_hash` IS NULL)
      OR (`consumed_at` IS NOT NULL AND `consumed_by` IS NOT NULL
        AND `successor_token_hash` IS NOT NULL)),
  CONSTRAINT `native_oauth_refresh_tokens_family_generation_unique`
    UNIQUE (`family_id`, `generation`),
  FOREIGN KEY (`family_id`) REFERENCES `native_oauth_refresh_families`(`id`)
    ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `native_oauth_refresh_tokens_expiry_idx`
  ON `native_oauth_refresh_tokens` (`expires_at`, `token_hash`);
--> statement-breakpoint

CREATE TABLE `native_oauth_access_tokens` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `family_id` text NOT NULL,
  `user_id` text NOT NULL,
  `client_id` text NOT NULL,
  `scope` text NOT NULL,
  `created_at` text NOT NULL,
  `expires_at` text NOT NULL,
  `revoked_at` text,
  FOREIGN KEY (`family_id`) REFERENCES `native_oauth_refresh_families`(`id`)
    ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `native_oauth_access_tokens_user_idx`
  ON `native_oauth_access_tokens` (`user_id`, `expires_at`);
--> statement-breakpoint
CREATE INDEX `native_oauth_access_tokens_family_idx`
  ON `native_oauth_access_tokens` (`family_id`, `expires_at`);
--> statement-breakpoint
CREATE INDEX `native_oauth_access_tokens_expiry_idx`
  ON `native_oauth_access_tokens` (`expires_at`, `token_hash`);
