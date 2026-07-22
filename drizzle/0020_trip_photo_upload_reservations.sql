-- Establish account deletion as the write linearization point before taking a
-- private-object inventory. The short lease serializes retrying deletion
-- requests; the row itself remains a write fence until the user is deleted.
CREATE TABLE `account_deletion_fences` (
  `user_id` text PRIMARY KEY NOT NULL,
  `owner_subject_hash` text NOT NULL,
  `lease_token` text NOT NULL,
  `lease_expires_at` text NOT NULL,
  `requested_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `account_deletion_fences_owner_hash_check`
    CHECK (length(`owner_subject_hash`) = 64 AND `owner_subject_hash` NOT GLOB '*[^a-f0-9]*'),
  CONSTRAINT `account_deletion_fences_lease_token_check`
    CHECK (length(`lease_token`) >= 40 AND length(`lease_token`) <= 160)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_deletion_fences_owner_unique`
  ON `account_deletion_fences` (`owner_subject_hash`);
--> statement-breakpoint
-- Record each candidate private photo locator before the R2 write. The row is
-- removed only after an exact trip attachment is observed or the object has
-- been idempotently deleted, so a lost D1/R2 response cannot create an
-- undiscoverable object.
CREATE TABLE `trip_photo_upload_reservations` (
  `id` text PRIMARY KEY NOT NULL,
  `trip_id` text NOT NULL,
  `owner_subject_hash` text NOT NULL,
  `object_key` text NOT NULL,
  `object_key_hash` text NOT NULL,
  `state` text NOT NULL,
  `attempts` integer NOT NULL DEFAULT 0,
  `available_at` text NOT NULL,
  `lease_expires_at` text,
  `lease_token` text,
  `last_error_code` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `trip_photo_upload_reservations_state_check`
    CHECK (`state` in ('pending', 'leased', 'needs_attention')),
  CONSTRAINT `trip_photo_upload_reservations_attempts_check`
    CHECK (`attempts` >= 0 AND `attempts` <= 8),
  CONSTRAINT `trip_photo_upload_reservations_hash_check`
    CHECK (length(`object_key_hash`) = 64 AND `object_key_hash` NOT GLOB '*[^a-f0-9]*'),
  CONSTRAINT `trip_photo_upload_reservations_owner_hash_check`
    CHECK (length(`owner_subject_hash`) = 64 AND `owner_subject_hash` NOT GLOB '*[^a-f0-9]*'),
  CONSTRAINT `trip_photo_upload_reservations_lease_check`
    CHECK ((`state` = 'leased' AND `lease_expires_at` IS NOT NULL AND `lease_token` IS NOT NULL)
      OR (`state` != 'leased' AND `lease_expires_at` IS NULL AND `lease_token` IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_photo_upload_reservations_object_key_unique`
  ON `trip_photo_upload_reservations` (`object_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `trip_photo_upload_reservations_object_key_hash_unique`
  ON `trip_photo_upload_reservations` (`object_key_hash`);
--> statement-breakpoint
CREATE INDEX `trip_photo_upload_reservations_retry_idx`
  ON `trip_photo_upload_reservations` (`state`, `available_at`, `lease_expires_at`);
--> statement-breakpoint
CREATE INDEX `trip_photo_upload_reservations_trip_idx`
  ON `trip_photo_upload_reservations` (`trip_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `trip_photo_upload_reservations_owner_idx`
  ON `trip_photo_upload_reservations` (`owner_subject_hash`, `created_at`);
