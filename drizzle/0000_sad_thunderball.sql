CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`default_storage_mode` text DEFAULT 'session_only' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	CONSTRAINT "accounts_role_check" CHECK("accounts"."role" in ('user','admin','researcher')),
	CONSTRAINT "accounts_status_check" CHECK("accounts"."status" in ('active','deletion_pending','deleted')),
	CONSTRAINT "accounts_storage_mode_check" CHECK("accounts"."default_storage_mode" in ('session_only','personal_archive','personal_archive_research')),
	CONSTRAINT "accounts_deleted_timestamp_check" CHECK("accounts"."status" != 'deleted' or "accounts"."deleted_at" is not null)
);
--> statement-breakpoint
CREATE INDEX `accounts_status_idx` ON `accounts` (`status`);--> statement-breakpoint
CREATE TABLE `archive_records` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`owner_account_id` text NOT NULL,
	`record_type` text NOT NULL,
	`schema_version` text NOT NULL,
	`sensitivity` text NOT NULL,
	`payload_ciphertext` text NOT NULL,
	`payload_nonce` text NOT NULL,
	`payload_auth_tag` text NOT NULL,
	`key_version` text NOT NULL,
	`payload_digest` text NOT NULL,
	`supersedes_record_id` text,
	`created_at` text NOT NULL,
	`tombstoned_at` text,
	FOREIGN KEY (`supersedes_record_id`) REFERENCES `archive_records`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`owner_account_id`,`archive_id`) REFERENCES `user_archives`(`owner_account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "archive_records_sensitivity_check" CHECK("archive_records"."sensitivity" in ('ordinary','sensitive','highly_sensitive')),
	CONSTRAINT "archive_records_type_check" CHECK("archive_records"."record_type" in ('chart','workflow_snapshot','candidate_verification','blind_reading','life_event','verification','consultation'))
);
--> statement-breakpoint
CREATE INDEX `archive_records_archive_created_idx` ON `archive_records` (`archive_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `archive_records_owner_type_idx` ON `archive_records` (`owner_account_id`,`record_type`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_account_id` text,
	`actor_digest` text,
	`actor_role` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`target_digest` text,
	`reason_code` text,
	`ticket_id` text,
	`request_id` text NOT NULL,
	`outcome` text NOT NULL,
	`occurred_at` text NOT NULL,
	`purge_at` text NOT NULL,
	FOREIGN KEY (`actor_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_events_actor_role_check" CHECK("audit_events"."actor_role" in ('user','admin','researcher','system')),
	CONSTRAINT "audit_events_outcome_check" CHECK("audit_events"."outcome" in ('success','denied')),
	CONSTRAINT "audit_events_target_reference_check" CHECK("audit_events"."target_id" is not null or "audit_events"."target_digest" is not null or "audit_events"."target_type" in ('audit_log','retention_run')),
	CONSTRAINT "audit_events_privileged_context_check" CHECK(("audit_events"."actor_role" != 'admin' or ("audit_events"."reason_code" is not null and "audit_events"."ticket_id" is not null)) and ("audit_events"."actor_role" != 'researcher' or "audit_events"."ticket_id" is not null))
);
--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_account_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `audit_events_target_idx` ON `audit_events` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `audit_events_purge_idx` ON `audit_events` (`purge_at`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`token_digest` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_digest_uq` ON `auth_sessions` (`token_digest`);--> statement-breakpoint
CREATE INDEX `auth_sessions_account_idx` ON `auth_sessions` (`account_id`);--> statement-breakpoint
CREATE INDEX `auth_sessions_expiry_idx` ON `auth_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `consent_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`owner_account_id` text NOT NULL,
	`purpose` text NOT NULL,
	`action` text NOT NULL,
	`policy_version` text NOT NULL,
	`scope_json` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`owner_account_id`,`archive_id`) REFERENCES `user_archives`(`owner_account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "consent_decisions_purpose_check" CHECK("consent_decisions"."purpose" in ('service_processing','anonymous_research','public_display')),
	CONSTRAINT "consent_decisions_action_check" CHECK("consent_decisions"."action" in ('grant','withdraw'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consent_decisions_archive_purpose_time_uq` ON `consent_decisions` (`archive_id`,`purpose`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `deletion_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_account_id` text,
	`target_type` text NOT NULL,
	`target_archive_id` text,
	`target_digest` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` text NOT NULL,
	`completed_at` text,
	`backup_purge_due_at` text NOT NULL,
	FOREIGN KEY (`requester_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_archive_id`) REFERENCES `user_archives`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "deletion_jobs_target_type_check" CHECK("deletion_jobs"."target_type" in ('archive','account')),
	CONSTRAINT "deletion_jobs_status_check" CHECK("deletion_jobs"."status" in ('pending','completed','failed'))
);
--> statement-breakpoint
CREATE INDEX `deletion_jobs_target_digest_idx` ON `deletion_jobs` (`target_digest`);--> statement-breakpoint
CREATE INDEX `deletion_jobs_status_idx` ON `deletion_jobs` (`status`);--> statement-breakpoint
CREATE TABLE `derived_indexes` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`owner_account_id` text NOT NULL,
	`index_type` text NOT NULL,
	`token_digest` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_account_id`,`archive_id`) REFERENCES `user_archives`(`owner_account_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `derived_indexes_archive_idx` ON `derived_indexes` (`archive_id`);--> statement-breakpoint
CREATE TABLE `export_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`owner_account_id` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`object_key_digest` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`owner_account_id`,`archive_id`) REFERENCES `user_archives`(`owner_account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "export_jobs_status_check" CHECK("export_jobs"."status" = 'ready')
);
--> statement-breakpoint
CREATE INDEX `export_jobs_expiry_idx` ON `export_jobs` (`expires_at`);--> statement-breakpoint
CREATE TABLE `external_identities` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`issuer` text NOT NULL,
	`subject_digest` text NOT NULL,
	`linked_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `external_identities_issuer_subject_uq` ON `external_identities` (`issuer`,`subject_digest`);--> statement-breakpoint
CREATE INDEX `external_identities_account_idx` ON `external_identities` (`account_id`);--> statement-breakpoint
CREATE TABLE `public_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`owner_account_id` text NOT NULL,
	`consent_decision_id` text NOT NULL,
	`status` text NOT NULL,
	`redaction_version` text NOT NULL,
	`reviewer_id` text NOT NULL,
	`payload_ciphertext` text NOT NULL,
	`payload_nonce` text NOT NULL,
	`payload_auth_tag` text NOT NULL,
	`key_version` text NOT NULL,
	`created_at` text NOT NULL,
	`published_at` text,
	FOREIGN KEY (`archive_id`) REFERENCES `user_archives`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`consent_decision_id`) REFERENCES `consent_decisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_account_id`,`archive_id`) REFERENCES `user_archives`(`owner_account_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "public_cases_status_check" CHECK("public_cases"."status" in ('draft','published')),
	CONSTRAINT "public_cases_published_timestamp_check" CHECK("public_cases"."status" != 'published' or "public_cases"."published_at" is not null)
);
--> statement-breakpoint
CREATE INDEX `public_cases_status_idx` ON `public_cases` (`status`);--> statement-breakpoint
CREATE TABLE `research_records` (
	`id` text PRIMARY KEY NOT NULL,
	`archive_id` text NOT NULL,
	`owner_account_id` text NOT NULL,
	`consent_decision_id` text NOT NULL,
	`study_id` text NOT NULL,
	`subject_digest` text NOT NULL,
	`payload_ciphertext` text NOT NULL,
	`payload_nonce` text NOT NULL,
	`payload_auth_tag` text NOT NULL,
	`key_version` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`archive_id`) REFERENCES `user_archives`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`consent_decision_id`) REFERENCES `consent_decisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_account_id`,`archive_id`) REFERENCES `user_archives`(`owner_account_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_records_study_expiry_idx` ON `research_records` (`study_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `research_records_archive_idx` ON `research_records` (`archive_id`);--> statement-breakpoint
CREATE TABLE `research_study_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`study_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_study_assignments_account_study_uq` ON `research_study_assignments` (`account_id`,`study_id`);--> statement-breakpoint
CREATE INDEX `research_study_assignments_study_idx` ON `research_study_assignments` (`study_id`);--> statement-breakpoint
CREATE TABLE `user_archives` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_account_id` text NOT NULL,
	`storage_mode` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`data_key_ref` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_activity_at` text NOT NULL,
	`retention_notice_at` text,
	`retention_delete_at` text,
	FOREIGN KEY (`owner_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_archives_storage_mode_check" CHECK("user_archives"."storage_mode" in ('personal_archive','personal_archive_research')),
	CONSTRAINT "user_archives_status_check" CHECK("user_archives"."status" in ('active','processing_suspended','deletion_pending'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_archives_owner_id_uq` ON `user_archives` (`owner_account_id`,`id`);--> statement-breakpoint
CREATE INDEX `user_archives_owner_idx` ON `user_archives` (`owner_account_id`);--> statement-breakpoint
CREATE INDEX `user_archives_retention_idx` ON `user_archives` (`retention_delete_at`);
--> statement-breakpoint
CREATE TRIGGER `archive_records_append_only`
BEFORE UPDATE ON `archive_records`
BEGIN
	SELECT RAISE(ABORT, 'archive_records are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `consent_decisions_append_only`
BEFORE UPDATE ON `consent_decisions`
BEGIN
	SELECT RAISE(ABORT, 'consent_decisions are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `archive_records_service_consent_guard`
BEFORE INSERT ON `archive_records`
WHEN NOT EXISTS (
	SELECT 1
	FROM `consent_decisions` AS `decision`
	WHERE `decision`.`archive_id` = NEW.`archive_id`
		AND `decision`.`owner_account_id` = NEW.`owner_account_id`
		AND `decision`.`purpose` = 'service_processing'
		AND `decision`.`action` = 'grant'
		AND `decision`.`occurred_at` = (
			SELECT MAX(`latest`.`occurred_at`)
			FROM `consent_decisions` AS `latest`
			WHERE `latest`.`archive_id` = NEW.`archive_id`
				AND `latest`.`purpose` = 'service_processing'
		)
)
BEGIN
	SELECT RAISE(ABORT, 'active service_processing consent required');
END;
--> statement-breakpoint
CREATE TRIGGER `research_records_consent_and_assignment_guard`
BEFORE INSERT ON `research_records`
WHEN NOT EXISTS (
	SELECT 1
	FROM `consent_decisions` AS `decision`
	WHERE `decision`.`id` = NEW.`consent_decision_id`
		AND `decision`.`archive_id` = NEW.`archive_id`
		AND `decision`.`owner_account_id` = NEW.`owner_account_id`
		AND `decision`.`purpose` = 'anonymous_research'
		AND `decision`.`action` = 'grant'
		AND `decision`.`occurred_at` = (
			SELECT MAX(`latest`.`occurred_at`)
			FROM `consent_decisions` AS `latest`
			WHERE `latest`.`archive_id` = NEW.`archive_id`
				AND `latest`.`purpose` = 'anonymous_research'
		)
)
OR NOT EXISTS (
	SELECT 1
	FROM `research_study_assignments` AS `assignment`
	WHERE `assignment`.`study_id` = NEW.`study_id`
)
BEGIN
	SELECT RAISE(ABORT, 'active research consent and study assignment required');
END;
--> statement-breakpoint
CREATE TRIGGER `public_cases_consent_guard`
BEFORE INSERT ON `public_cases`
WHEN NOT EXISTS (
	SELECT 1
	FROM `consent_decisions` AS `decision`
	WHERE `decision`.`id` = NEW.`consent_decision_id`
		AND `decision`.`archive_id` = NEW.`archive_id`
		AND `decision`.`owner_account_id` = NEW.`owner_account_id`
		AND `decision`.`purpose` = 'public_display'
		AND `decision`.`action` = 'grant'
		AND `decision`.`occurred_at` = (
			SELECT MAX(`latest`.`occurred_at`)
			FROM `consent_decisions` AS `latest`
			WHERE `latest`.`archive_id` = NEW.`archive_id`
				AND `latest`.`purpose` = 'public_display'
		)
)
BEGIN
	SELECT RAISE(ABORT, 'active public_display consent required');
END;
--> statement-breakpoint
CREATE TRIGGER `research_records_consent_cleanup`
AFTER INSERT ON `consent_decisions`
WHEN NEW.`purpose` = 'anonymous_research'
BEGIN
	DELETE FROM `research_records`
	WHERE `archive_id` = NEW.`archive_id`
		AND (
			NEW.`action` = 'withdraw'
			OR NOT EXISTS (
				SELECT 1
				FROM json_each(NEW.`scope_json`) AS `scope`
				WHERE `scope`.`value` = 'all_approved_studies'
					OR `scope`.`value` = 'study:' || `research_records`.`study_id`
			)
		);
END;
--> statement-breakpoint
CREATE TRIGGER `public_cases_consent_cleanup`
AFTER INSERT ON `consent_decisions`
WHEN NEW.`purpose` = 'public_display'
BEGIN
	DELETE FROM `public_cases`
	WHERE `archive_id` = NEW.`archive_id`
		AND (
			NEW.`action` = 'withdraw'
			OR NOT EXISTS (
				SELECT 1
				FROM json_each(NEW.`scope_json`) AS `scope`
				WHERE `scope`.`value` = 'public_case'
			)
		);
END;
