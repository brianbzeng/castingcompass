CREATE TABLE `email_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`email` text NOT NULL,
	`user_id` text,
	`code_hash` text NOT NULL,
	`password_salt` text,
	`password_hash` text,
	`expires_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT `email_challenges_kind_check` CHECK("email_challenges"."kind" in ('signup', 'password_reset')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_challenges_email_time_idx` ON `email_challenges` (`email`,`created_at`);
