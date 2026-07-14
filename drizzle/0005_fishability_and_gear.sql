ALTER TABLE trips ADD COLUMN gear_profile_id TEXT;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN rod TEXT;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN reel TEXT;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN bait_lure TEXT;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN rig TEXT;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN other_catch_count INTEGER;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN other_species TEXT;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN observations_json TEXT;
--> statement-breakpoint
ALTER TABLE trips ADD COLUMN fishability_score REAL;
--> statement-breakpoint
ALTER TABLE email_challenges ADD COLUMN resend_count INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS gear_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  rod TEXT,
  reel TEXT,
  bait_lure TEXT,
  rig TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS gear_profiles_user_name_unique ON gear_profiles (user_id, name);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS gear_profiles_user_updated_idx ON gear_profiles (user_id, updated_at);
