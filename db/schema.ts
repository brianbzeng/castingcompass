import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordSalt: text("password_salt").notNull(),
    passwordHash: text("password_hash").notNull(),
    ageEligibilityConfirmedAt: text("age_eligibility_confirmed_at"),
    termsAcceptedAt: text("terms_accepted_at"),
    termsVersion: text("terms_version"),
    privacyAcceptedAt: text("privacy_accepted_at"),
    privacyVersion: text("privacy_version"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("auth_sessions_user_idx").on(table.userId, table.expiresAt)],
);

export const savedSites = sqliteTable(
  "saved_sites",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    siteId: text("site_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.siteId] })],
);

export const authAttempts = sqliteTable(
  "auth_attempts",
  {
    id: text("id").primaryKey(),
    emailHash: text("email_hash").notNull(),
    attemptedAt: text("attempted_at").notNull(),
    successful: integer("successful", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [index("auth_attempts_email_time_idx").on(table.emailHash, table.attemptedAt)],
);

export const emailChallenges = sqliteTable(
  "email_challenges",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    email: text("email").notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    passwordSalt: text("password_salt"),
    passwordHash: text("password_hash"),
    ageEligibilityConfirmedAt: text("age_eligibility_confirmed_at"),
    termsVersion: text("terms_version"),
    privacyVersion: text("privacy_version"),
    expiresAt: text("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    resendCount: integer("resend_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("email_challenges_kind_check", sql`${table.kind} in ('signup', 'password_reset')`),
    index("email_challenges_email_time_idx").on(table.email, table.createdAt),
  ],
);

export const signupAgeProofs = sqliteTable(
  "signup_age_proofs",
  {
    tokenHash: text("token_hash").primaryKey(),
    confirmedAt: text("confirmed_at").notNull(),
    gateVersion: text("gate_version").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("signup_age_proofs_expiry_idx").on(table.expiresAt, table.consumedAt)],
);

export const privacyDeletionJobs = sqliteTable(
  "privacy_deletion_jobs",
  {
    id: text("id").primaryKey(),
    receiptHash: text("receipt_hash").notNull(),
    scope: text("scope").notNull(),
    subjectHash: text("subject_hash").notNull(),
    ownerSubjectHash: text("owner_subject_hash").notNull(),
    state: text("state").notNull(),
    objectsTotal: integer("objects_total").notNull().default(0),
    objectsDeleted: integer("objects_deleted").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    requestedAt: text("requested_at").notNull(),
    activeDataRemovedAt: text("active_data_removed_at"),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("privacy_deletion_jobs_receipt_unique").on(table.receiptHash),
    index("privacy_deletion_jobs_state_updated_idx").on(table.state, table.updatedAt),
    index("privacy_deletion_jobs_owner_state_idx").on(table.ownerSubjectHash, table.state, table.updatedAt),
    check("privacy_deletion_jobs_scope_check", sql`${table.scope} in ('account', 'trip')`),
    check(
      "privacy_deletion_jobs_state_check",
      sql`${table.state} in ('active_data_removed', 'purging', 'completed', 'needs_attention')`,
    ),
  ],
);

export const privacyDeletionTasks = sqliteTable(
  "privacy_deletion_tasks",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull().references(() => privacyDeletionJobs.id, { onDelete: "cascade" }),
    objectKey: text("object_key"),
    objectKeyHash: text("object_key_hash").notNull(),
    state: text("state").notNull(),
    attempts: integer("attempts").notNull().default(0),
    availableAt: text("available_at").notNull(),
    leaseExpiresAt: text("lease_expires_at"),
    leaseToken: text("lease_token"),
    lastErrorCode: text("last_error_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("privacy_deletion_tasks_job_object_unique").on(table.jobId, table.objectKeyHash),
    index("privacy_deletion_tasks_retry_idx").on(table.state, table.availableAt, table.leaseExpiresAt),
    check("privacy_deletion_tasks_state_check", sql`${table.state} in ('pending', 'leased', 'completed', 'needs_attention')`),
    check(
      "privacy_deletion_tasks_locator_check",
      sql`((${table.state} = 'completed' and ${table.objectKey} is null) or (${table.state} != 'completed' and ${table.objectKey} is not null))`,
    ),
  ],
);

export const gearProfiles = sqliteTable(
  "gear_profiles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rod: text("rod"),
    reel: text("reel"),
    baitLure: text("bait_lure"),
    rig: text("rig"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("gear_profiles_user_name_unique").on(table.userId, table.name),
    index("gear_profiles_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const trips = sqliteTable(
  "trips",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").notNull(),
    source: text("source").notNull(),
    siteId: text("site_id").notNull(),
    startedAt: text("started_at").notNull(),
    endedAt: text("ended_at"),
    mode: text("mode").notNull(),
    fishingMethod: text("fishing_method"),
    gear: text("gear"),
    gearProfileId: text("gear_profile_id"),
    rod: text("rod"),
    reel: text("reel"),
    baitLure: text("bait_lure"),
    rig: text("rig"),
    anglerCount: integer("angler_count").notNull(),
    anglerHours: real("angler_hours"),
    keeperCount: integer("keeper_count"),
    shortReleasedCount: integer("short_released_count"),
    halibutEncounters: integer("halibut_encounters"),
    noCatch: integer("no_catch", { mode: "boolean" }),
    otherCatchCount: integer("other_catch_count"),
    otherSpecies: text("other_species"),
    observationsJson: text("observations_json"),
    observationContractVersion: text("observation_contract_version"),
    taxonCatalogVersion: text("taxon_catalog_version"),
    targetTaxonId: text("target_taxon_id").notNull().default("california-halibut"),
    contractStatus: text("contract_status"),
    taxonObservationsJson: text("taxon_observations_json"),
    outcomeClass: text("outcome_class"),
    targetEncounterCount: integer("target_encounter_count"),
    anyFishEncounterCount: integer("any_fish_encounter_count"),
    targetIdentificationConfidence: text("target_identification_confidence"),
    notes: text("notes"),
    consent: integer("consent", { mode: "boolean" }).notNull(),
    consentAt: text("consent_at"),
    moderationStatus: text("moderation_status").notNull(),
    reporterKeyHash: text("reporter_key_hash").notNull(),
    referralCode: text("referral_code"),
    tokenHash: text("token_hash"),
    opportunityWindowId: text("opportunity_window_id"),
    opportunityScore: real("opportunity_score"),
    habitatScore: real("habitat_score"),
    seasonalityScore: real("seasonality_score"),
    conditionsScore: real("conditions_score"),
    fishabilityScore: real("fishability_score"),
    modelVersion: text("model_version"),
    scoreInfluencedChoice: integer("score_influenced_choice", { mode: "boolean" }),
    predictionMetadataJson: text("prediction_metadata_json"),
    photoKey: text("photo_key"),
    photoContentType: text("photo_content_type"),
    photoSizeBytes: integer("photo_size_bytes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
    aiReviewStatus: text("ai_review_status"),
    aiReviewJson: text("ai_review_json"),
    aiReviewModel: text("ai_review_model"),
    aiReviewedAt: text("ai_reviewed_at"),
  },
  (table) => [
    check("trips_status_check", sql`${table.status} in ('active', 'completed')`),
    check("trips_source_check", sql`${table.source} in ('live', 'past_report')`),
    check(
      "trips_moderation_status_check",
      sql`${table.moderationStatus} in ('pending', 'approved', 'rejected')`,
    ),
    check("trips_angler_count_check", sql`${table.anglerCount} between 1 and 12`),
    check(
      "trips_contract_status_check",
      sql`${table.contractStatus} is null or ${table.contractStatus} in ('valid', 'legacy_unverified', 'rejected')`,
    ),
    check(
      "trips_outcome_class_check",
      sql`${table.outcomeClass} is null or ${table.outcomeClass} in ('target_encountered', 'non_target_only', 'no_fish')`,
    ),
    check(
      "trips_target_encounter_count_check",
      sql`${table.targetEncounterCount} is null or ${table.targetEncounterCount} >= 0`,
    ),
    check(
      "trips_any_fish_encounter_count_check",
      sql`${table.anyFishEncounterCount} is null or ${table.anyFishEncounterCount} >= 0`,
    ),
    check(
      "trips_target_identification_confidence_check",
      sql`${table.targetIdentificationConfidence} is null or ${table.targetIdentificationConfidence} in ('verified', 'self_reported', 'uncertain', 'unresolved', 'not_observed')`,
    ),
    check("trips_target_taxon_check", sql`${table.targetTaxonId} = 'california-halibut'`),
    check(
      "trips_species_contract_coherence_check",
      sql`(
        ${table.status} != 'completed' or ${table.contractStatus} is not null
      ) and (
        ${table.contractStatus} is not null or (
          ${table.observationContractVersion} is null
          and ${table.taxonCatalogVersion} is null
          and ${table.taxonObservationsJson} is null
          and ${table.outcomeClass} is null
          and ${table.targetEncounterCount} is null
          and ${table.anyFishEncounterCount} is null
          and ${table.targetIdentificationConfidence} is null
        )
      ) and (
        ${table.contractStatus} != 'legacy_unverified' or (
          ${table.observationContractVersion} is null
          and ${table.taxonCatalogVersion} is null
          and ${table.taxonObservationsJson} is null
          and ${table.outcomeClass} is null
          and ${table.targetEncounterCount} is null
          and ${table.anyFishEncounterCount} is null
          and ${table.targetIdentificationConfidence} is null
        )
      ) and (
        ${table.contractStatus} != 'valid' or (
          ${table.status} = 'completed'
          and ${table.observationContractVersion} = 'castingcompass.observation/2.0.0'
          and ${table.taxonCatalogVersion} = 'castingcompass.taxa/1.0.0'
          and ${table.targetTaxonId} = 'california-halibut'
          and typeof(${table.anglerCount}) = 'integer'
          and ${table.anglerCount} between 1 and 12
          and typeof(${table.anglerHours}) in ('integer', 'real')
          and ${table.anglerHours} > 0
          and ${table.anglerHours} <= 432
          and typeof(${table.keeperCount}) = 'integer'
          and typeof(${table.shortReleasedCount}) = 'integer'
          and typeof(${table.halibutEncounters}) = 'integer'
          and typeof(${table.noCatch}) = 'integer'
          and typeof(${table.otherCatchCount}) = 'integer'
          and typeof(${table.targetEncounterCount}) = 'integer'
          and typeof(${table.anyFishEncounterCount}) = 'integer'
          and ${table.keeperCount} between 0 and 25
          and ${table.shortReleasedCount} between 0 and 25
          and ${table.keeperCount} + ${table.shortReleasedCount} <= 40
          and ${table.otherCatchCount} between 0 and 100
          and ${table.noCatch} in (0, 1)
          and typeof(${table.mode}) = 'text'
          and ${table.mode} in ('shore', 'beach', 'pier', 'jetty', 'kayak', 'boat', 'other')
          and typeof(${table.startedAt}) = 'text'
          and typeof(${table.endedAt}) = 'text'
          and length(${table.startedAt}) = 24
          and length(${table.endedAt}) = 24
          and strftime('%Y-%m-%dT%H:%M:%fZ', ${table.startedAt}) = ${table.startedAt}
          and strftime('%Y-%m-%dT%H:%M:%fZ', ${table.endedAt}) = ${table.endedAt}
          and julianday(${table.endedAt}) > julianday(${table.startedAt})
          and ${table.taxonObservationsJson} is not null
          and json_valid(${table.taxonObservationsJson}) = 1
          and ${table.outcomeClass} is not null
          and ${table.targetEncounterCount} is not null
          and ${table.anyFishEncounterCount} is not null
          and ${table.targetIdentificationConfidence} is not null
          and ${table.targetEncounterCount} = ${table.keeperCount} + ${table.shortReleasedCount}
          and ${table.halibutEncounters} = ${table.targetEncounterCount}
          and ${table.anyFishEncounterCount} = ${table.targetEncounterCount} + ${table.otherCatchCount}
          and ${table.targetEncounterCount} <= ${table.anyFishEncounterCount}
          and ${table.targetIdentificationConfidence} = case
            when ${table.targetEncounterCount} > 0 then 'self_reported'
            else 'not_observed'
          end
          and ${table.noCatch} = case when ${table.anyFishEncounterCount} = 0 then 1 else 0 end
          and ${table.outcomeClass} = case
            when ${table.targetEncounterCount} > 0 then 'target_encountered'
            when ${table.anyFishEncounterCount} > 0 then 'non_target_only'
            else 'no_fish'
          end
          and ${table.taxonObservationsJson} = case
            when ${table.otherCatchCount} > 0 then json_array(
              json_object(
                'taxon_id', 'california-halibut',
                'encounter_count', ${table.targetEncounterCount},
                'retained_count', ${table.keeperCount},
                'released_count', ${table.shortReleasedCount},
                'disposition_unknown_count', 0,
                'identification_confidence', ${table.targetIdentificationConfidence},
                'identification_basis', case when ${table.targetEncounterCount} > 0 then 'angler-report' else 'not-observed' end
              ),
              json_object(
                'taxon_id', 'unresolved-fish',
                'encounter_count', ${table.otherCatchCount},
                'retained_count', 0,
                'released_count', 0,
                'disposition_unknown_count', ${table.otherCatchCount},
                'identification_confidence', 'unresolved',
                'identification_basis', 'unresolved'
              )
            )
            else json_array(json_object(
              'taxon_id', 'california-halibut',
              'encounter_count', ${table.targetEncounterCount},
              'retained_count', ${table.keeperCount},
              'released_count', ${table.shortReleasedCount},
              'disposition_unknown_count', 0,
              'identification_confidence', ${table.targetIdentificationConfidence},
              'identification_basis', case when ${table.targetEncounterCount} > 0 then 'angler-report' else 'not-observed' end
            ))
          end
        )
      )`,
    ),
    index("trips_status_started_idx").on(table.status, table.startedAt),
    index("trips_site_started_idx").on(table.siteId, table.startedAt),
    index("trips_reporter_created_idx").on(table.reporterKeyHash, table.createdAt),
    index("trips_referral_created_idx").on(table.referralCode, table.createdAt),
    index("trips_user_completed_idx").on(table.userId, table.completedAt),
    index("trips_contract_target_completed_idx").on(
      table.contractStatus,
      table.targetTaxonId,
      table.completedAt,
    ),
  ],
);

export const siteDiscussionPosts = sqliteTable(
  "site_discussion_posts",
  {
    id: text("id").primaryKey(),
    tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    siteId: text("site_id").notNull(),
    summary: text("summary").notNull(),
    gearSummary: text("gear_summary"),
    techniqueTagsJson: text("technique_tags_json"),
    observedAt: text("observed_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    reviewModel: text("review_model"),
    approvedAt: text("approved_at"),
    approvedBy: text("approved_by"),
    sourceAiReviewedAt: text("source_ai_reviewed_at"),
  },
  (table) => [
    uniqueIndex("site_discussion_posts_trip_unique").on(table.tripId),
    index("site_discussion_posts_site_time_idx").on(table.siteId, table.observedAt),
  ],
);
