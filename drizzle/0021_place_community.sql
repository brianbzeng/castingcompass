CREATE TABLE `community_profiles` (
  `user_id` text PRIMARY KEY NOT NULL,
  `handle` text NOT NULL,
  `handle_key` text NOT NULL,
  `bio` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `community_profiles_handle_check`
    CHECK (length(`handle`) BETWEEN 3 AND 24
      AND `handle_key` GLOB '[a-z0-9_]*'
      AND `handle_key` NOT GLOB '*[^a-z0-9_]*'),
  CONSTRAINT `community_profiles_bio_check`
    CHECK (`bio` IS NULL OR length(`bio`) <= 160)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_profiles_handle_unique`
  ON `community_profiles` (`handle_key`);
--> statement-breakpoint
CREATE TABLE `community_posts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `site_id` text NOT NULL,
  `title` text NOT NULL,
  `body` text NOT NULL,
  `moderation_status` text NOT NULL DEFAULT 'pending',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `deleted_at` text,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `community_posts_title_check`
    CHECK (length(`title`) BETWEEN 3 AND 120),
  CONSTRAINT `community_posts_body_check`
    CHECK (length(`body`) BETWEEN 3 AND 2000),
  CONSTRAINT `community_posts_moderation_check`
    CHECK (`moderation_status` IN ('pending', 'published', 'rejected', 'removed'))
);
--> statement-breakpoint
CREATE INDEX `community_posts_site_feed_idx`
  ON `community_posts` (`site_id`, `moderation_status`, `created_at` DESC, `id` DESC);
--> statement-breakpoint
CREATE INDEX `community_posts_owner_idx`
  ON `community_posts` (`user_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `community_comments` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `user_id` text NOT NULL,
  `body` text NOT NULL,
  `moderation_status` text NOT NULL DEFAULT 'pending',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `deleted_at` text,
  FOREIGN KEY (`post_id`) REFERENCES `community_posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `community_comments_body_check`
    CHECK (length(`body`) BETWEEN 1 AND 1000),
  CONSTRAINT `community_comments_moderation_check`
    CHECK (`moderation_status` IN ('pending', 'published', 'rejected', 'removed'))
);
--> statement-breakpoint
CREATE INDEX `community_comments_post_feed_idx`
  ON `community_comments` (`post_id`, `moderation_status`, `created_at`, `id`);
--> statement-breakpoint
CREATE INDEX `community_comments_owner_idx`
  ON `community_comments` (`user_id`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE `community_blocks` (
  `blocker_user_id` text NOT NULL,
  `blocked_user_id` text NOT NULL,
  `created_at` text NOT NULL,
  PRIMARY KEY (`blocker_user_id`, `blocked_user_id`),
  FOREIGN KEY (`blocker_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`blocked_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `community_blocks_self_check`
    CHECK (`blocker_user_id` != `blocked_user_id`)
);
--> statement-breakpoint
CREATE INDEX `community_blocks_blocked_idx`
  ON `community_blocks` (`blocked_user_id`);
--> statement-breakpoint
CREATE TABLE `community_reports` (
  `id` text PRIMARY KEY NOT NULL,
  `reporter_user_id` text NOT NULL,
  `target_kind` text NOT NULL,
  `target_id` text NOT NULL,
  `reason` text NOT NULL,
  `detail` text,
  `status` text NOT NULL DEFAULT 'open',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`reporter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `community_reports_kind_check`
    CHECK (`target_kind` IN ('post', 'comment')),
  CONSTRAINT `community_reports_reason_check`
    CHECK (`reason` IN ('privacy', 'harassment', 'spam', 'unsafe', 'misinformation', 'other')),
  CONSTRAINT `community_reports_detail_check`
    CHECK (`detail` IS NULL OR length(`detail`) <= 500),
  CONSTRAINT `community_reports_status_check`
    CHECK (`status` IN ('open', 'reviewing', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_reports_reporter_target_unique`
  ON `community_reports` (`reporter_user_id`, `target_kind`, `target_id`);
--> statement-breakpoint
CREATE INDEX `community_reports_queue_idx`
  ON `community_reports` (`status`, `created_at`);
--> statement-breakpoint
CREATE TABLE `community_moderation_queue` (
  `id` text PRIMARY KEY NOT NULL,
  `entity_kind` text NOT NULL,
  `entity_id` text NOT NULL,
  `reason` text NOT NULL,
  `priority` integer NOT NULL DEFAULT 0,
  `status` text NOT NULL DEFAULT 'pending',
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  CONSTRAINT `community_moderation_queue_kind_check`
    CHECK (`entity_kind` IN ('post', 'comment', 'report')),
  CONSTRAINT `community_moderation_queue_priority_check`
    CHECK (`priority` BETWEEN 0 AND 3),
  CONSTRAINT `community_moderation_queue_status_check`
    CHECK (`status` IN ('pending', 'reviewing', 'resolved'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `community_moderation_queue_entity_unique`
  ON `community_moderation_queue` (`entity_kind`, `entity_id`);
--> statement-breakpoint
CREATE INDEX `community_moderation_queue_work_idx`
  ON `community_moderation_queue` (`status`, `priority` DESC, `created_at`);
--> statement-breakpoint
CREATE TRIGGER `community_posts_queue_cleanup`
AFTER DELETE ON `community_posts`
BEGIN
  DELETE FROM `community_reports`
    WHERE `target_kind` = 'post' AND `target_id` = OLD.`id`;
  DELETE FROM `community_moderation_queue`
    WHERE `entity_id` = OLD.`id`
      AND `entity_kind` IN ('post', 'report');
END;
--> statement-breakpoint
CREATE TRIGGER `community_comments_queue_cleanup`
AFTER DELETE ON `community_comments`
BEGIN
  DELETE FROM `community_reports`
    WHERE `target_kind` = 'comment' AND `target_id` = OLD.`id`;
  DELETE FROM `community_moderation_queue`
    WHERE `entity_id` = OLD.`id`
      AND `entity_kind` IN ('comment', 'report');
END;
--> statement-breakpoint
CREATE TRIGGER `community_reports_queue_cleanup`
AFTER DELETE ON `community_reports`
WHEN NOT EXISTS (
  SELECT 1 FROM `community_reports`
  WHERE `target_kind` = OLD.`target_kind` AND `target_id` = OLD.`target_id`
)
BEGIN
  DELETE FROM `community_moderation_queue`
    WHERE `entity_kind` = 'report' AND `entity_id` = OLD.`target_id`;
END;
