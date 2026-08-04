import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  check,
  foreignKey,
  index,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    role: text("role", { enum: ["user", "admin", "researcher"] }).notNull(),
    status: text("status", { enum: ["active", "deletion_pending", "deleted"] })
      .notNull()
      .default("active"),
    defaultStorageMode: text("default_storage_mode", {
      enum: ["session_only", "personal_archive", "personal_archive_research"],
    })
      .notNull()
      .default("session_only"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    check("accounts_role_check", sql`${table.role} in ('user','admin','researcher')`),
    check(
      "accounts_status_check",
      sql`${table.status} in ('active','deletion_pending','deleted')`,
    ),
    check(
      "accounts_storage_mode_check",
      sql`${table.defaultStorageMode} in ('session_only','personal_archive','personal_archive_research')`,
    ),
    check(
      "accounts_deleted_timestamp_check",
      sql`${table.status} != 'deleted' or ${table.deletedAt} is not null`,
    ),
    index("accounts_status_idx").on(table.status),
  ],
);

export const externalIdentities = sqliteTable(
  "external_identities",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subjectDigest: text("subject_digest").notNull(),
    linkedAt: text("linked_at").notNull(),
  },
  (table) => [
    uniqueIndex("external_identities_issuer_subject_uq").on(
      table.issuer,
      table.subjectDigest,
    ),
    index("external_identities_account_idx").on(table.accountId),
  ],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    tokenDigest: text("token_digest").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_digest_uq").on(table.tokenDigest),
    index("auth_sessions_account_idx").on(table.accountId),
    index("auth_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const researchStudyAssignments = sqliteTable(
  "research_study_assignments",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    studyId: text("study_id").notNull(),
    assignedAt: text("assigned_at").notNull(),
  },
  (table) => [
    uniqueIndex("research_study_assignments_account_study_uq").on(
      table.accountId,
      table.studyId,
    ),
    index("research_study_assignments_study_idx").on(table.studyId),
  ],
);

export const userArchives = sqliteTable(
  "user_archives",
  {
    id: text("id").primaryKey(),
    ownerAccountId: text("owner_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    storageMode: text("storage_mode", {
      enum: ["personal_archive", "personal_archive_research"],
    }).notNull(),
    status: text("status", {
      enum: ["active", "processing_suspended", "deletion_pending"],
    })
      .notNull()
      .default("active"),
    dataKeyRef: text("data_key_ref").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastActivityAt: text("last_activity_at").notNull(),
    retentionNoticeAt: text("retention_notice_at"),
    retentionDeleteAt: text("retention_delete_at"),
  },
  (table) => [
    uniqueIndex("user_archives_owner_id_uq").on(table.ownerAccountId, table.id),
    index("user_archives_owner_idx").on(table.ownerAccountId),
    index("user_archives_retention_idx").on(table.retentionDeleteAt),
    check(
      "user_archives_storage_mode_check",
      sql`${table.storageMode} in ('personal_archive','personal_archive_research')`,
    ),
    check(
      "user_archives_status_check",
      sql`${table.status} in ('active','processing_suspended','deletion_pending')`,
    ),
  ],
);

export const archiveRecords = sqliteTable(
  "archive_records",
  {
    id: text("id").primaryKey(),
    archiveId: text("archive_id").notNull(),
    ownerAccountId: text("owner_account_id").notNull(),
    recordType: text("record_type", {
      enum: [
        "chart",
        "workflow_snapshot",
        "candidate_verification",
        "blind_reading",
        "life_event",
        "verification",
        "consultation",
      ],
    }).notNull(),
    schemaVersion: text("schema_version").notNull(),
    sensitivity: text("sensitivity", {
      enum: ["ordinary", "sensitive", "highly_sensitive"],
    }).notNull(),
    payloadCiphertext: text("payload_ciphertext").notNull(),
    payloadNonce: text("payload_nonce").notNull(),
    payloadAuthTag: text("payload_auth_tag").notNull(),
    keyVersion: text("key_version").notNull(),
    payloadDigest: text("payload_digest").notNull(),
    supersedesRecordId: text("supersedes_record_id").references(
      (): AnySQLiteColumn => archiveRecords.id,
      { onDelete: "set null" },
    ),
    createdAt: text("created_at").notNull(),
    tombstonedAt: text("tombstoned_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerAccountId, table.archiveId],
      foreignColumns: [userArchives.ownerAccountId, userArchives.id],
      name: "archive_records_owner_archive_fk",
    }).onDelete("cascade"),
    index("archive_records_archive_created_idx").on(table.archiveId, table.createdAt),
    index("archive_records_owner_type_idx").on(table.ownerAccountId, table.recordType),
    check(
      "archive_records_sensitivity_check",
      sql`${table.sensitivity} in ('ordinary','sensitive','highly_sensitive')`,
    ),
    check(
      "archive_records_type_check",
      sql`${table.recordType} in ('chart','workflow_snapshot','candidate_verification','blind_reading','life_event','verification','consultation')`,
    ),
  ],
);

export const consentDecisions = sqliteTable(
  "consent_decisions",
  {
    id: text("id").primaryKey(),
    archiveId: text("archive_id").notNull(),
    ownerAccountId: text("owner_account_id").notNull(),
    purpose: text("purpose", {
      enum: ["service_processing", "anonymous_research", "public_display"],
    }).notNull(),
    action: text("action", { enum: ["grant", "withdraw"] }).notNull(),
    policyVersion: text("policy_version").notNull(),
    scopeJson: text("scope_json").notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerAccountId, table.archiveId],
      foreignColumns: [userArchives.ownerAccountId, userArchives.id],
      name: "consent_decisions_owner_archive_fk",
    }).onDelete("cascade"),
    uniqueIndex("consent_decisions_archive_purpose_time_uq").on(
      table.archiveId,
      table.purpose,
      table.occurredAt,
    ),
    check(
      "consent_decisions_purpose_check",
      sql`${table.purpose} in ('service_processing','anonymous_research','public_display')`,
    ),
    check("consent_decisions_action_check", sql`${table.action} in ('grant','withdraw')`),
  ],
);

export const researchRecords = sqliteTable(
  "research_records",
  {
    id: text("id").primaryKey(),
    archiveId: text("archive_id")
      .notNull()
      .references(() => userArchives.id, { onDelete: "cascade" }),
    ownerAccountId: text("owner_account_id").notNull(),
    consentDecisionId: text("consent_decision_id")
      .notNull()
      .references(() => consentDecisions.id, { onDelete: "cascade" }),
    studyId: text("study_id").notNull(),
    subjectDigest: text("subject_digest").notNull(),
    payloadCiphertext: text("payload_ciphertext").notNull(),
    payloadNonce: text("payload_nonce").notNull(),
    payloadAuthTag: text("payload_auth_tag").notNull(),
    keyVersion: text("key_version").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerAccountId, table.archiveId],
      foreignColumns: [userArchives.ownerAccountId, userArchives.id],
      name: "research_records_owner_archive_fk",
    }).onDelete("cascade"),
    index("research_records_study_expiry_idx").on(table.studyId, table.expiresAt),
    index("research_records_archive_idx").on(table.archiveId),
  ],
);

export const publicCases = sqliteTable(
  "public_cases",
  {
    id: text("id").primaryKey(),
    archiveId: text("archive_id")
      .notNull()
      .references(() => userArchives.id, { onDelete: "cascade" }),
    ownerAccountId: text("owner_account_id").notNull(),
    consentDecisionId: text("consent_decision_id")
      .notNull()
      .references(() => consentDecisions.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["draft", "published"] }).notNull(),
    redactionVersion: text("redaction_version").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    payloadCiphertext: text("payload_ciphertext").notNull(),
    payloadNonce: text("payload_nonce").notNull(),
    payloadAuthTag: text("payload_auth_tag").notNull(),
    keyVersion: text("key_version").notNull(),
    createdAt: text("created_at").notNull(),
    publishedAt: text("published_at"),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerAccountId, table.archiveId],
      foreignColumns: [userArchives.ownerAccountId, userArchives.id],
      name: "public_cases_owner_archive_fk",
    }).onDelete("cascade"),
    index("public_cases_status_idx").on(table.status),
    check("public_cases_status_check", sql`${table.status} in ('draft','published')`),
    check(
      "public_cases_published_timestamp_check",
      sql`${table.status} != 'published' or ${table.publishedAt} is not null`,
    ),
  ],
);

export const derivedIndexes = sqliteTable(
  "derived_indexes",
  {
    id: text("id").primaryKey(),
    archiveId: text("archive_id").notNull(),
    ownerAccountId: text("owner_account_id").notNull(),
    indexType: text("index_type").notNull(),
    tokenDigest: text("token_digest").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerAccountId, table.archiveId],
      foreignColumns: [userArchives.ownerAccountId, userArchives.id],
      name: "derived_indexes_owner_archive_fk",
    }).onDelete("cascade"),
    index("derived_indexes_archive_idx").on(table.archiveId),
  ],
);

export const exportJobs = sqliteTable(
  "export_jobs",
  {
    id: text("id").primaryKey(),
    archiveId: text("archive_id").notNull(),
    ownerAccountId: text("owner_account_id").notNull(),
    status: text("status", { enum: ["ready"] }).notNull().default("ready"),
    objectKeyDigest: text("object_key_digest").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerAccountId, table.archiveId],
      foreignColumns: [userArchives.ownerAccountId, userArchives.id],
      name: "export_jobs_owner_archive_fk",
    }).onDelete("cascade"),
    index("export_jobs_expiry_idx").on(table.expiresAt),
    check("export_jobs_status_check", sql`${table.status} = 'ready'`),
  ],
);

export const deletionJobs = sqliteTable(
  "deletion_jobs",
  {
    id: text("id").primaryKey(),
    requesterAccountId: text("requester_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    targetType: text("target_type", { enum: ["archive", "account"] }).notNull(),
    targetArchiveId: text("target_archive_id").references(() => userArchives.id, {
      onDelete: "set null",
    }),
    targetDigest: text("target_digest").notNull(),
    status: text("status", { enum: ["pending", "completed", "failed"] }).notNull(),
    requestedAt: text("requested_at").notNull(),
    completedAt: text("completed_at"),
    backupPurgeDueAt: text("backup_purge_due_at").notNull(),
  },
  (table) => [
    index("deletion_jobs_target_digest_idx").on(table.targetDigest),
    index("deletion_jobs_status_idx").on(table.status),
    check("deletion_jobs_target_type_check", sql`${table.targetType} in ('archive','account')`),
    check(
      "deletion_jobs_status_check",
      sql`${table.status} in ('pending','completed','failed')`,
    ),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorAccountId: text("actor_account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    actorDigest: text("actor_digest"),
    actorRole: text("actor_role", {
      enum: ["user", "admin", "researcher", "system"],
    }).notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    targetDigest: text("target_digest"),
    reasonCode: text("reason_code"),
    ticketId: text("ticket_id"),
    requestId: text("request_id").notNull(),
    outcome: text("outcome", { enum: ["success", "denied"] }).notNull(),
    occurredAt: text("occurred_at").notNull(),
    purgeAt: text("purge_at").notNull(),
  },
  (table) => [
    index("audit_events_actor_idx").on(table.actorAccountId, table.occurredAt),
    index("audit_events_target_idx").on(table.targetType, table.targetId),
    index("audit_events_purge_idx").on(table.purgeAt),
    check(
      "audit_events_actor_role_check",
      sql`${table.actorRole} in ('user','admin','researcher','system')`,
    ),
    check("audit_events_outcome_check", sql`${table.outcome} in ('success','denied')`),
    check(
      "audit_events_target_reference_check",
      sql`${table.targetId} is not null or ${table.targetDigest} is not null or ${table.targetType} in ('audit_log','retention_run')`,
    ),
    check(
      "audit_events_privileged_context_check",
      sql`(${table.actorRole} != 'admin' or (${table.reasonCode} is not null and ${table.ticketId} is not null)) and (${table.actorRole} != 'researcher' or ${table.ticketId} is not null)`,
    ),
  ],
);

export type DatabaseSchema = {
  accounts: typeof accounts;
  externalIdentities: typeof externalIdentities;
  authSessions: typeof authSessions;
  researchStudyAssignments: typeof researchStudyAssignments;
  userArchives: typeof userArchives;
  archiveRecords: typeof archiveRecords;
  consentDecisions: typeof consentDecisions;
  researchRecords: typeof researchRecords;
  publicCases: typeof publicCases;
  derivedIndexes: typeof derivedIndexes;
  exportJobs: typeof exportJobs;
  deletionJobs: typeof deletionJobs;
  auditEvents: typeof auditEvents;
};
