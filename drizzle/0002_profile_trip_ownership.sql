ALTER TABLE `trips` ADD `user_id` text REFERENCES users(id) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `trips_user_completed_idx` ON `trips` (`user_id`,`completed_at`);
