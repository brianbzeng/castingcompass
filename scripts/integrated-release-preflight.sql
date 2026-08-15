WITH expected_legal_columns(table_name, column_name) AS (
  VALUES
    ('users', 'age_eligibility_confirmed_at'),
    ('users', 'terms_accepted_at'),
    ('users', 'terms_version'),
    ('users', 'privacy_accepted_at'),
    ('users', 'privacy_version'),
    ('email_challenges', 'age_eligibility_confirmed_at'),
    ('email_challenges', 'terms_version'),
    ('email_challenges', 'privacy_version')
), legal_columns AS (
  SELECT 'users' AS table_name, name, lower(type) AS type, "notnull", dflt_value, pk
  FROM pragma_table_info('users')
  UNION ALL
  SELECT 'email_challenges' AS table_name, name, lower(type) AS type, "notnull", dflt_value, pk
  FROM pragma_table_info('email_challenges')
), later_tables(name) AS (
  VALUES
    ('signup_age_proofs'),
    ('privacy_deletion_jobs'),
    ('privacy_deletion_tasks'),
    ('privacy_export_jobs'),
    ('account_deletion_fences'),
    ('trip_photo_upload_reservations'),
    ('ai_review_jobs'),
    ('forecast_impressions'),
    ('trip_validation_provenance'),
    ('validation_feasibility_activations'),
    ('validation_feasibility_events'),
    ('validation_feasibility_recruitment_campaigns'),
    ('validation_feasibility_recruitment_events'),
    ('validation_feasibility_corrections'),
    ('validation_feasibility_recruitment_removals'),
    ('validation_feasibility_correction_removals'),
    ('validation_feasibility_privacy_removals'),
    ('validation_feasibility_snapshot_suppressions')
), later_trip_columns(name) AS (
  VALUES
    ('observation_contract_version'),
    ('taxon_catalog_version'),
    ('target_taxon_id'),
    ('contract_status'),
    ('taxon_observations_json'),
    ('outcome_class'),
    ('target_encounter_count'),
    ('any_fish_encounter_count'),
    ('target_identification_confidence'),
    ('idempotency_key_hash'),
    ('photo_key_hash')
), later_indexes(name) AS (
  VALUES
    ('auth_sessions_expires_idx'),
    ('saved_sites_user_created_idx'),
    ('auth_attempts_attempted_idx'),
    ('email_challenges_expires_idx'),
    ('email_challenges_user_idx'),
    ('signup_age_proofs_consumed_idx'),
    ('privacy_deletion_jobs_scope_subject_idx'),
    ('privacy_deletion_jobs_state_completed_idx'),
    ('trips_user_history_idx'),
    ('trips_user_created_idx'),
    ('trips_ai_review_backlog_idx'),
    ('trips_reporter_active_created_idx'),
    ('trip_validation_provenance_forecast_trip_idx'),
    ('validation_feasibility_recruitment_user_sequence_idx'),
    ('validation_feasibility_correction_activation_sequence_idx'),
    ('ai_review_jobs_trip_unique'),
    ('ai_review_jobs_dispatch_idx'),
    ('privacy_export_jobs_active_user_unique'),
    ('privacy_export_jobs_object_key_unique'),
    ('privacy_export_jobs_dispatch_idx'),
    ('privacy_export_jobs_expiry_idx'),
    ('privacy_export_jobs_owner_idx'),
    ('account_deletion_fences_owner_unique'),
    ('trip_photo_upload_reservations_object_key_unique'),
    ('trip_photo_upload_reservations_object_key_hash_unique'),
    ('trip_photo_upload_reservations_retry_idx'),
    ('trip_photo_upload_reservations_trip_idx'),
    ('trip_photo_upload_reservations_owner_idx')
)
SELECT
  COALESCE((
    SELECT json_group_array(name)
    FROM (SELECT name FROM d1_migrations ORDER BY id)
  ), '[]') AS applied_migrations_json,
  (SELECT COUNT(*) FROM expected_legal_columns) AS legal_columns_expected,
  (SELECT COUNT(*)
    FROM expected_legal_columns AS expected
    JOIN legal_columns AS actual
      ON actual.table_name = expected.table_name AND actual.name = expected.column_name
  ) AS legal_columns_present,
  (SELECT COUNT(*)
    FROM expected_legal_columns AS expected
    JOIN legal_columns AS actual
      ON actual.table_name = expected.table_name AND actual.name = expected.column_name
    WHERE actual.type = 'text' AND actual."notnull" = 0
      AND actual.dflt_value IS NULL AND actual.pk = 0
  ) AS legal_columns_exact,
  (SELECT COUNT(*)
    FROM pragma_table_info('site_discussion_posts')
    WHERE name IN ('approved_at', 'approved_by', 'source_ai_reviewed_at')
  ) AS approval_columns_found,
  (SELECT COUNT(*)
    FROM sqlite_master
    WHERE type = 'table' AND name IN (SELECT name FROM later_tables)
  ) AS later_tables_found,
  (SELECT COUNT(*)
    FROM pragma_table_info('trips')
    WHERE name IN (SELECT name FROM later_trip_columns)
  ) AS later_trip_columns_found,
  (SELECT COUNT(*)
    FROM sqlite_master
    WHERE type = 'index' AND name IN (SELECT name FROM later_indexes)
  ) AS later_indexes_found,
  (SELECT COUNT(*)
    FROM sqlite_master
    WHERE type = 'trigger' AND name IN (
      'trips_completed_contract_insert_guard',
      'trips_completed_contract_update_guard'
    )
  ) AS later_triggers_found,
  (SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'signup_age_proofs')
    AS preledger_signup_age_proofs_schema,
  (SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'privacy_deletion_jobs')
    AS preledger_privacy_deletion_jobs_schema,
  (SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'privacy_deletion_tasks')
    AS preledger_privacy_deletion_tasks_schema,
  (SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'forecast_impressions')
    AS preledger_forecast_impressions_schema,
  (SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'trip_validation_provenance')
    AS preledger_trip_validation_provenance_schema,
  (SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'signup_age_proofs_expiry_idx')
    AS preledger_signup_age_proofs_expiry_index_schema,
  (SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'privacy_deletion_jobs_state_updated_idx')
    AS preledger_privacy_deletion_jobs_state_index_schema,
  (SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'privacy_deletion_jobs_owner_state_idx')
    AS preledger_privacy_deletion_jobs_owner_index_schema,
  (SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'privacy_deletion_tasks_retry_idx')
    AS preledger_privacy_deletion_tasks_retry_index_schema,
  COALESCE((SELECT json_group_array(name) FROM (
    SELECT name FROM sqlite_master
    WHERE type = 'index' AND tbl_name IN (
      'signup_age_proofs', 'privacy_deletion_jobs', 'privacy_deletion_tasks'
    ) ORDER BY name
  )), '[]') AS preledger_privacy_indexes_json,
  COALESCE((SELECT json_group_array(name) FROM (
    SELECT name FROM sqlite_master
    WHERE type = 'index' AND tbl_name IN (
      'forecast_impressions', 'trip_validation_provenance'
    ) ORDER BY name
  )), '[]') AS preledger_validation_indexes_json,
  (SELECT COUNT(*) FROM sqlite_master
    WHERE type = 'trigger' AND tbl_name IN (
      'signup_age_proofs', 'privacy_deletion_jobs', 'privacy_deletion_tasks'
    )) AS preledger_privacy_triggers,
  (SELECT COUNT(*) FROM sqlite_master
    WHERE type = 'trigger' AND tbl_name IN (
      'forecast_impressions', 'trip_validation_provenance'
    )) AS preledger_validation_triggers,
  (SELECT COUNT(*) FROM signup_age_proofs) AS preledger_signup_age_proof_rows,
  (SELECT COUNT(*) FROM privacy_deletion_jobs) AS preledger_privacy_deletion_job_rows,
  (SELECT COUNT(*) FROM privacy_deletion_tasks) AS preledger_privacy_deletion_task_rows,
  (SELECT COUNT(*) FROM forecast_impressions) AS preledger_forecast_impression_rows,
  (SELECT COUNT(*) FROM trip_validation_provenance) AS preledger_trip_validation_provenance_rows,
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM users WHERE age_eligibility_confirmed_at IS NULL) AS users_missing_age_eligibility,
  (SELECT COUNT(*) FROM users
    WHERE terms_accepted_at IS NULL OR terms_version IS NULL
      OR privacy_accepted_at IS NULL OR privacy_version IS NULL
  ) AS users_missing_legal_acceptance,
  (SELECT COUNT(*) FROM trips) AS trips,
  (SELECT COUNT(*) FROM site_discussion_posts) AS discussion_rows,
  (SELECT COUNT(*) FROM trips WHERE photo_key IS NOT NULL) AS trip_photo_locators,
  (SELECT COUNT(*) FROM pragma_foreign_key_check) AS foreign_key_violations;
