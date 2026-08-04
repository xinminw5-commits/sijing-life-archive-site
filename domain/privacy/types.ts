export type AccountRole = "user" | "admin" | "researcher";
export type AccountStatus = "active" | "deletion_pending" | "deleted";
export type StorageMode =
  | "session_only"
  | "personal_archive"
  | "personal_archive_research";
export type ArchiveStatus = "active" | "processing_suspended" | "deletion_pending";
export type ConsentPurpose =
  | "service_processing"
  | "anonymous_research"
  | "public_display";
export type ConsentAction = "grant" | "withdraw";
export type SensitivityLevel = "ordinary" | "sensitive" | "highly_sensitive";
export type ArchiveRecordType =
  | "chart"
  | "workflow_snapshot"
  | "candidate_verification"
  | "blind_reading"
  | "life_event"
  | "verification"
  | "consultation";

export type AdminReasonCode =
  | "user_support"
  | "user_export_request"
  | "user_deletion_request"
  | "security_investigation";

export interface UserPrincipal {
  role: "user";
  accountId: string;
  requestId: string;
}

export interface AdminPrincipal {
  role: "admin";
  accountId: string;
  requestId: string;
  reasonCode: AdminReasonCode;
  ticketId: string;
}

export interface SystemPrincipal {
  role: "system";
  accountId: "system";
  requestId: string;
  reasonCode: "retention_expiry" | "identity_provisioning" | "service_processing";
}

export interface ResearchPrincipal {
  role: "researcher";
  accountId: string;
  requestId: string;
  studyId: string;
}

export interface ResearchAssignment {
  assignmentId: string;
  accountId: string;
  studyId: string;
  assignedAt: string;
}

export type Principal = UserPrincipal | AdminPrincipal | ResearchPrincipal;
export type InternalPrincipal = Principal | SystemPrincipal;

export interface Account {
  accountId: string;
  role: AccountRole;
  status: AccountStatus;
  defaultStorageMode: StorageMode;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ExternalIdentity {
  identityId: string;
  accountId: string;
  issuer: string;
  subjectDigest: string;
  linkedAt: string;
}

export interface AuthSession {
  sessionId: string;
  accountId: string;
  tokenDigest: string;
  createdAt: string;
  expiresAt: string;
}

export interface SessionLease {
  sessionId: string;
  ownerAccountId: string;
  payload: unknown;
  createdAt: string;
  expiresAt: string;
}

export interface UserArchive {
  archiveId: string;
  ownerAccountId: string;
  storageMode: "personal_archive" | "personal_archive_research";
  status: ArchiveStatus;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  retentionNoticeAt?: string;
  retentionDeleteAt?: string;
}

export interface ArchiveRecord {
  recordId: string;
  archiveId: string;
  ownerAccountId: string;
  recordType: ArchiveRecordType;
  schemaVersion: string;
  sensitivity: SensitivityLevel;
  payload: unknown;
  createdAt: string;
  supersedesRecordId?: string;
  tombstonedAt?: string;
}

export interface ConsentDecision {
  decisionId: string;
  archiveId: string;
  ownerAccountId: string;
  purpose: ConsentPurpose;
  action: ConsentAction;
  policyVersion: string;
  scope: ReadonlyArray<string>;
  occurredAt: string;
}

export interface ResearchRecord {
  researchRecordId: string;
  archiveId: string;
  ownerAccountId: string;
  consentDecisionId: string;
  studyId: string;
  subjectDigest: string;
  payload: unknown;
  createdAt: string;
  expiresAt: string;
}

export interface PublicCase {
  publicCaseId: string;
  archiveId: string;
  ownerAccountId: string;
  consentDecisionId: string;
  status: "draft" | "published";
  redactionVersion: string;
  reviewerId: string;
  payload: unknown;
  createdAt: string;
  publishedAt?: string;
}

export interface DerivedIndexRecord {
  indexId: string;
  archiveId: string;
  ownerAccountId: string;
  indexType: string;
  tokenDigest: string;
  createdAt: string;
}

export interface ExportJob {
  exportJobId: string;
  archiveId: string;
  ownerAccountId: string;
  status: "ready";
  createdAt: string;
  expiresAt: string;
}

export interface ArchiveExportBundle {
  schemaVersion: "archive-export.v0";
  exportedAt: string;
  archive: UserArchive;
  records: ReadonlyArray<ArchiveRecord>;
  consentHistory: ReadonlyArray<ConsentDecision>;
  accessHistory: ReadonlyArray<UserVisibleAuditEvent>;
  readableText: string;
}

export interface ArchiveSnapshot {
  archive: UserArchive;
  records: ReadonlyArray<ArchiveRecord>;
  consentHistory: ReadonlyArray<ConsentDecision>;
}

export interface DeletionReceipt {
  receiptId: string;
  requestedByAccountId?: string;
  requestedByDigest?: string;
  targetType: "archive" | "account";
  targetDigest: string;
  deletedAt: string;
  backupPurgeDueAt: string;
}

export type AuditAction =
  | "account.created"
  | "identity.linked"
  | "auth_session.created"
  | "research_assignment.created"
  | "session.created"
  | "session.read"
  | "archive.created"
  | "archive.read"
  | "record.created"
  | "consent.recorded"
  | "research_record.created"
  | "research_record.read"
  | "public_case.created"
  | "public_case.read"
  | "index.created"
  | "archive.exported"
  | "export_job.read"
  | "archive.deleted"
  | "account.deleted"
  | "deletion_receipt.read"
  | "audit.read"
  | "retention.notice"
  | "retention.purged";

export interface AuditEvent {
  auditEventId: string;
  actorAccountId?: string;
  actorDigest?: string;
  actorRole: "user" | "admin" | "researcher" | "system";
  action: AuditAction;
  targetType: string;
  targetId?: string;
  targetDigest?: string;
  reasonCode?: AdminReasonCode | SystemPrincipal["reasonCode"];
  ticketId?: string;
  requestId: string;
  outcome: "success" | "denied";
  occurredAt: string;
}

export interface UserVisibleAuditEvent {
  auditEventId: string;
  actorRole: AuditEvent["actorRole"];
  action: AuditAction;
  targetType: string;
  outcome: AuditEvent["outcome"];
  occurredAt: string;
}

export interface RetentionRunResult {
  scheduledArchiveIds: ReadonlyArray<string>;
  deletedArchiveDigests: ReadonlyArray<string>;
  purgedSessionIds: ReadonlyArray<string>;
  purgedExportJobIds: ReadonlyArray<string>;
  purgedResearchRecordIds: ReadonlyArray<string>;
  purgedAuditEventIds: ReadonlyArray<string>;
}

export type PrivacyErrorCode =
  | "INVALID_INPUT"
  | "DUPLICATE_ID"
  | "NOT_FOUND_OR_FORBIDDEN"
  | "ACCOUNT_INACTIVE"
  | "ADMIN_CONTEXT_REQUIRED"
  | "CONSENT_REQUIRED"
  | "CONSENT_WITHDRAWN"
  | "ARCHIVE_NOT_PERSISTABLE"
  | "ARCHIVE_SUSPENDED"
  | "IMMUTABLE_RECORD"
  | "RETENTION_NOT_DUE";

export class PrivacyError extends Error {
  public readonly code: PrivacyErrorCode;

  constructor(code: PrivacyErrorCode, message: string) {
    super(message);
    this.name = "PrivacyError";
    this.code = code;
  }
}

export interface PrivacyStoreOptions {
  digestIdentifier: (value: string) => string;
}
