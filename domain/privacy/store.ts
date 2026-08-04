import type {
  Account,
  AccountRole,
  AdminPrincipal,
  ArchiveExportBundle,
  ArchiveRecord,
  ArchiveRecordType,
  ArchiveSnapshot,
  AuditAction,
  AuditEvent,
  AuthSession,
  ConsentAction,
  ConsentDecision,
  ConsentPurpose,
  DeletionReceipt,
  DerivedIndexRecord,
  ExportJob,
  ExternalIdentity,
  InternalPrincipal,
  Principal,
  PrivacyStoreOptions,
  PublicCase,
  ResearchPrincipal,
  ResearchAssignment,
  ResearchRecord,
  RetentionRunResult,
  SensitivityLevel,
  SessionLease,
  StorageMode,
  SystemPrincipal,
  UserArchive,
  UserVisibleAuditEvent,
} from "./types.ts";
import { PrivacyError } from "./types.ts";
import {
  addDays,
  addMonths,
  assertChronological,
  assertNonEmpty,
  assertOneOf,
  assertTimestamp,
  immutable,
  isAtOrAfter,
} from "./utils.ts";

const MAX_SESSION_MS = 24 * 60 * 60 * 1000;
const MAX_AUTH_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

interface CreateAccountInput {
  accountId: string;
  role: AccountRole;
  defaultStorageMode: StorageMode;
  createdAt: string;
}

interface CreateArchiveInput {
  archiveId: string;
  storageMode: "personal_archive" | "personal_archive_research";
  serviceConsentDecisionId: string;
  servicePolicyVersion: string;
  createdAt: string;
}

interface AppendRecordInput {
  archiveId: string;
  recordId: string;
  recordType: ArchiveRecordType;
  schemaVersion: string;
  sensitivity: SensitivityLevel;
  payload: unknown;
  createdAt: string;
  supersedesRecordId?: string;
}

export class InMemoryPrivacyStore {
  private readonly options: PrivacyStoreOptions;
  private readonly accounts = new Map<string, Account>();
  private readonly identities = new Map<string, ExternalIdentity>();
  private readonly authSessions = new Map<string, AuthSession>();
  private readonly researchAssignments = new Map<string, ResearchAssignment>();
  private readonly sessionLeases = new Map<string, SessionLease>();
  private readonly archives = new Map<string, UserArchive>();
  private readonly records = new Map<string, ArchiveRecord>();
  private readonly consents = new Map<string, ConsentDecision>();
  private readonly researchRecords = new Map<string, ResearchRecord>();
  private readonly publicCases = new Map<string, PublicCase>();
  private readonly indexes = new Map<string, DerivedIndexRecord>();
  private readonly exportJobs = new Map<string, ExportJob>();
  private readonly deletionReceipts = new Map<string, DeletionReceipt>();
  private readonly auditEvents = new Map<string, AuditEvent>();
  private auditSequence = 0;

  public constructor(options: PrivacyStoreOptions) {
    if (!options || typeof options.digestIdentifier !== "function") {
      throw new PrivacyError(
        "INVALID_INPUT",
        "Privacy store 必须注入带密钥的不可逆标识摘要器。",
      );
    }
    this.options = options;
  }

  public createAccount(input: CreateAccountInput): Account {
    this.assertIdAvailable(input.accountId);
    assertNonEmpty(input.accountId, "accountId");
    assertOneOf(input.role, ["user", "admin", "researcher"] as const, "role");
    assertOneOf(
      input.defaultStorageMode,
      ["session_only", "personal_archive", "personal_archive_research"] as const,
      "defaultStorageMode",
    );
    assertTimestamp(input.createdAt, "createdAt");
    const account: Account = {
      accountId: input.accountId,
      role: input.role,
      status: "active",
      defaultStorageMode: input.defaultStorageMode,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    };
    this.accounts.set(account.accountId, immutable(account));
    this.audit(
      this.systemPrincipal("identity_provisioning", `account-${input.accountId}`),
      "account.created",
      "account",
      input.createdAt,
      { targetId: account.accountId },
    );
    return immutable(account);
  }

  public linkExternalIdentity(
    principal: SystemPrincipal,
    input: {
      identityId: string;
      accountId: string;
      issuer: string;
      subjectDigest: string;
      linkedAt: string;
    },
  ): ExternalIdentity {
    this.assertSystem(principal, "identity_provisioning");
    this.requireActiveAccount(input.accountId);
    this.assertIdAvailable(input.identityId);
    for (const identity of this.identities.values()) {
      if (identity.issuer === input.issuer && identity.subjectDigest === input.subjectDigest) {
        throw new PrivacyError("DUPLICATE_ID", "同一外部身份已经建立映射。");
      }
    }
    for (const [field, value] of [
      ["identityId", input.identityId],
      ["issuer", input.issuer],
      ["subjectDigest", input.subjectDigest],
    ] as const) {
      assertNonEmpty(value, field);
    }
    assertTimestamp(input.linkedAt, "linkedAt");
    const identity = immutable<ExternalIdentity>({ ...input });
    this.identities.set(identity.identityId, identity);
    this.audit(principal, "identity.linked", "external_identity", input.linkedAt, {
      targetId: identity.identityId,
    });
    return identity;
  }

  public createAuthSession(
    principal: SystemPrincipal,
    input: AuthSession,
  ): AuthSession {
    this.assertSystem(principal, "identity_provisioning");
    this.requireActiveAccount(input.accountId);
    this.assertIdAvailable(input.sessionId);
    assertNonEmpty(input.tokenDigest, "tokenDigest");
    this.assertBoundedDuration(
      input.createdAt,
      input.expiresAt,
      MAX_AUTH_SESSION_MS,
      "authSession",
    );
    const session = immutable(input);
    this.authSessions.set(session.sessionId, session);
    this.audit(principal, "auth_session.created", "auth_session", input.createdAt, {
      targetId: input.sessionId,
    });
    return session;
  }

  public assignResearchStudy(
    principal: SystemPrincipal,
    input: ResearchAssignment,
  ): ResearchAssignment {
    this.assertSystem(principal, "identity_provisioning");
    const account = this.requireActiveAccount(input.accountId);
    if (account.role !== "researcher") {
      throw new PrivacyError("INVALID_INPUT", "只能向 researcher 账户分配研究。");
    }
    this.assertIdAvailable(input.assignmentId);
    assertNonEmpty(input.studyId, "studyId");
    assertTimestamp(input.assignedAt, "assignedAt");
    const key = this.researchAssignmentKey(input.accountId, input.studyId);
    if (this.researchAssignments.has(key)) {
      throw new PrivacyError("DUPLICATE_ID", "研究账户已分配该 study。");
    }
    const assignment = immutable(input);
    this.researchAssignments.set(key, assignment);
    this.audit(principal, "research_assignment.created", "research_assignment", input.assignedAt, {
      targetId: input.assignmentId,
    });
    return assignment;
  }

  public createSessionLease(
    principal: Principal,
    input: Omit<SessionLease, "ownerAccountId">,
  ): SessionLease {
    const account = this.requirePrincipal(principal);
    if (principal.role !== "user") {
      throw new PrivacyError("NOT_FOUND_OR_FORBIDDEN", "临时会话只能由用户本人创建。");
    }
    this.assertIdAvailable(input.sessionId);
    this.assertBoundedDuration(input.createdAt, input.expiresAt, MAX_SESSION_MS, "session");
    const lease = immutable<SessionLease>({
      ...input,
      ownerAccountId: account.accountId,
    });
    this.sessionLeases.set(lease.sessionId, lease);
    this.audit(principal, "session.created", "session", input.createdAt, {
      targetId: input.sessionId,
    });
    return lease;
  }

  public readSessionLease(
    principal: Principal,
    sessionId: string,
    readAt: string,
  ): SessionLease {
    this.requirePrincipal(principal);
    assertTimestamp(readAt, "readAt");
    const lease = this.sessionLeases.get(sessionId);
    if (
      !lease ||
      principal.role !== "user" ||
      lease.ownerAccountId !== principal.accountId ||
      isAtOrAfter(readAt, lease.expiresAt)
    ) {
      this.auditDenied(principal, "session.read", "session", sessionId, readAt);
      throw this.notFoundOrForbidden();
    }
    this.audit(principal, "session.read", "session", readAt, { targetId: sessionId });
    return immutable(lease);
  }

  public createArchive(principal: Principal, input: CreateArchiveInput): ArchiveSnapshot {
    const account = this.requirePrincipal(principal);
    if (principal.role !== "user") {
      throw new PrivacyError("NOT_FOUND_OR_FORBIDDEN", "档案只能由用户本人开立。");
    }
    this.assertIdAvailable(input.archiveId);
    this.assertIdAvailable(input.serviceConsentDecisionId);
    assertOneOf(
      input.storageMode,
      ["personal_archive", "personal_archive_research"] as const,
      "storageMode",
    );
    assertNonEmpty(input.servicePolicyVersion, "servicePolicyVersion");
    assertTimestamp(input.createdAt, "createdAt");
    const archive = immutable<UserArchive>({
      archiveId: input.archiveId,
      ownerAccountId: account.accountId,
      storageMode: input.storageMode,
      status: "active",
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      lastActivityAt: input.createdAt,
    });
    const consent = immutable<ConsentDecision>({
      decisionId: input.serviceConsentDecisionId,
      archiveId: archive.archiveId,
      ownerAccountId: archive.ownerAccountId,
      purpose: "service_processing",
      action: "grant",
      policyVersion: input.servicePolicyVersion,
      scope: ["archive_service"],
      occurredAt: input.createdAt,
    });
    this.archives.set(archive.archiveId, archive);
    this.consents.set(consent.decisionId, consent);
    this.audit(principal, "archive.created", "archive", input.createdAt, {
      targetId: archive.archiveId,
    });
    this.audit(principal, "consent.recorded", "consent", input.createdAt, {
      targetId: consent.decisionId,
    });
    return immutable({ archive, records: [], consentHistory: [consent] });
  }

  public readArchive(
    principal: Principal,
    archiveId: string,
    readAt: string,
  ): ArchiveSnapshot {
    const archive = this.authorizeArchive(principal, archiveId, "archive.read", readAt);
    if (principal.role === "user" && archive.ownerAccountId === principal.accountId) {
      this.touchArchive(archiveId, readAt);
    }
    this.audit(principal, "archive.read", "archive", readAt, { targetId: archiveId });
    return this.snapshot(this.requireArchive(archiveId));
  }

  public appendArchiveRecord(
    principal: Principal,
    input: AppendRecordInput,
  ): ArchiveRecord {
    const archive = this.authorizeArchive(
      principal,
      input.archiveId,
      "record.created",
      input.createdAt,
    );
    this.requireServiceProcessing(archive.archiveId);
    if (archive.status !== "active") {
      throw new PrivacyError("ARCHIVE_SUSPENDED", "档案已停止新处理。");
    }
    this.assertIdAvailable(input.recordId);
    assertOneOf(
      input.recordType,
      [
        "chart",
        "workflow_snapshot",
        "candidate_verification",
        "blind_reading",
        "life_event",
        "verification",
        "consultation",
      ] as const,
      "recordType",
    );
    assertOneOf(
      input.sensitivity,
      ["ordinary", "sensitive", "highly_sensitive"] as const,
      "sensitivity",
    );
    assertNonEmpty(input.schemaVersion, "schemaVersion");
    assertTimestamp(input.createdAt, "createdAt");
    assertChronological(archive.createdAt, input.createdAt, "recordCreation");
    if (input.supersedesRecordId) {
      const previous = this.records.get(input.supersedesRecordId);
      if (!previous || previous.archiveId !== archive.archiveId) {
        throw this.notFoundOrForbidden();
      }
      assertChronological(previous.createdAt, input.createdAt, "recordSupersession");
    }
    const record = immutable<ArchiveRecord>({
      ...input,
      ownerAccountId: archive.ownerAccountId,
      payload: immutable(input.payload),
    });
    this.records.set(record.recordId, record);
    this.touchArchive(archive.archiveId, input.createdAt);
    this.audit(principal, "record.created", "archive_record", input.createdAt, {
      targetId: record.recordId,
    });
    return record;
  }

  public recordConsent(
    principal: Principal,
    input: {
      decisionId: string;
      archiveId: string;
      purpose: ConsentPurpose;
      action: ConsentAction;
      policyVersion: string;
      scope: ReadonlyArray<string>;
      occurredAt: string;
    },
  ): ConsentDecision {
    const archive = this.authorizeArchive(
      principal,
      input.archiveId,
      "consent.recorded",
      input.occurredAt,
    );
    if (principal.role === "researcher") throw this.notFoundOrForbidden();
    if (principal.role === "admin") {
      this.assertAdmin(principal);
      if (input.action !== "withdraw" || principal.reasonCode !== "user_deletion_request") {
        throw new PrivacyError(
          "NOT_FOUND_OR_FORBIDDEN",
          "管理员不能代用户授权，只能按明确删除请求代执行撤回。",
        );
      }
    }
    this.assertIdAvailable(input.decisionId);
    assertOneOf(
      input.purpose,
      ["service_processing", "anonymous_research", "public_display"] as const,
      "purpose",
    );
    assertOneOf(input.action, ["grant", "withdraw"] as const, "action");
    assertNonEmpty(input.policyVersion, "policyVersion");
    if (!Array.isArray(input.scope) || input.scope.length === 0) {
      throw new PrivacyError("INVALID_INPUT", "scope 至少需要一项。");
    }
    for (const scope of input.scope) assertNonEmpty(scope, "scope");
    assertTimestamp(input.occurredAt, "occurredAt");
    const latest = this.latestConsent(archive.archiveId, input.purpose);
    if (latest && Date.parse(input.occurredAt) <= Date.parse(latest.occurredAt)) {
      throw new PrivacyError(
        "INVALID_INPUT",
        "同一目的的授权决定时间必须严格递增。",
      );
    }
    const decision = immutable<ConsentDecision>({
      ...input,
      ownerAccountId: archive.ownerAccountId,
      scope: [...input.scope],
    });
    this.consents.set(decision.decisionId, decision);
    if (input.purpose === "anonymous_research") {
      if (input.action === "grant") {
        this.replaceArchive(archive.archiveId, {
          storageMode: "personal_archive_research",
          updatedAt: input.occurredAt,
          lastActivityAt: input.occurredAt,
        });
      } else {
        this.deleteResearchForArchive(archive.archiveId);
        this.replaceArchive(archive.archiveId, {
          storageMode: "personal_archive",
          updatedAt: input.occurredAt,
          lastActivityAt: input.occurredAt,
        });
      }
    }
    if (input.purpose === "public_display" && input.action === "withdraw") {
      this.deletePublicCasesForArchive(archive.archiveId);
    }
    if (input.purpose === "service_processing") {
      this.replaceArchive(archive.archiveId, {
        status: input.action === "grant" ? "active" : "processing_suspended",
        updatedAt: input.occurredAt,
        lastActivityAt: input.occurredAt,
      });
    }
    this.touchArchive(archive.archiveId, input.occurredAt);
    this.audit(principal, "consent.recorded", "consent", input.occurredAt, {
      targetId: input.decisionId,
    });
    return decision;
  }

  public createResearchRecord(
    principal: ResearchPrincipal,
    input: Omit<ResearchRecord, "ownerAccountId" | "consentDecisionId" | "studyId">,
  ): ResearchRecord {
    this.requirePrincipal(principal);
    assertNonEmpty(principal.studyId, "studyId");
    const archive = this.requireArchive(input.archiveId);
    const consent = this.requireGrantedConsent(archive.archiveId, "anonymous_research");
    if (
      !consent.scope.includes(`study:${principal.studyId}`) &&
      !consent.scope.includes("all_approved_studies")
    ) {
      throw new PrivacyError("CONSENT_REQUIRED", "研究授权范围不包含当前 study。");
    }
    this.assertIdAvailable(input.researchRecordId);
    assertChronological(input.createdAt, input.expiresAt, "researchRetention");
    if (Date.parse(input.expiresAt) > Date.parse(addMonths(input.createdAt, 24))) {
      throw new PrivacyError("INVALID_INPUT", "researchRetention 超过 24 个月上限。");
    }
    assertNonEmpty(input.subjectDigest, "subjectDigest");
    const record = immutable<ResearchRecord>({
      ...input,
      ownerAccountId: archive.ownerAccountId,
      consentDecisionId: consent.decisionId,
      studyId: principal.studyId,
      payload: immutable(input.payload),
    });
    this.researchRecords.set(record.researchRecordId, record);
    this.audit(principal, "research_record.created", "research_record", input.createdAt, {
      targetId: record.researchRecordId,
    });
    return record;
  }

  public readResearchRecord(
    principal: ResearchPrincipal,
    researchRecordId: string,
    readAt: string,
  ): ResearchRecord {
    this.requirePrincipal(principal);
    assertNonEmpty(principal.studyId, "studyId");
    assertTimestamp(readAt, "readAt");
    const record = this.researchRecords.get(researchRecordId);
    if (!record || record.studyId !== principal.studyId) throw this.notFoundOrForbidden();
    this.requireGrantedConsent(record.archiveId, "anonymous_research");
    this.audit(principal, "research_record.read", "research_record", readAt, {
      targetId: record.researchRecordId,
    });
    return immutable(record);
  }

  public createPublicCase(
    principal: AdminPrincipal,
    input: Omit<PublicCase, "ownerAccountId" | "consentDecisionId">,
  ): PublicCase {
    this.requirePrincipal(principal);
    this.assertAdmin(principal);
    const archive = this.requireArchive(input.archiveId);
    const consent = this.requireGrantedConsent(archive.archiveId, "public_display");
    if (!consent.scope.includes("public_case")) {
      throw new PrivacyError("CONSENT_REQUIRED", "公开展示授权范围不包含 public_case。");
    }
    this.assertIdAvailable(input.publicCaseId);
    assertOneOf(input.status, ["draft", "published"] as const, "status");
    assertNonEmpty(input.redactionVersion, "redactionVersion");
    assertNonEmpty(input.reviewerId, "reviewerId");
    assertTimestamp(input.createdAt, "createdAt");
    if (input.status === "published") {
      if (!input.publishedAt) throw new PrivacyError("INVALID_INPUT", "publishedAt 缺失。");
      assertChronological(input.createdAt, input.publishedAt, "publication");
    }
    const publicCase = immutable<PublicCase>({
      ...input,
      ownerAccountId: archive.ownerAccountId,
      consentDecisionId: consent.decisionId,
      payload: immutable(input.payload),
    });
    this.publicCases.set(publicCase.publicCaseId, publicCase);
    this.audit(principal, "public_case.created", "public_case", input.createdAt, {
      targetId: publicCase.publicCaseId,
    });
    return publicCase;
  }

  public createDerivedIndex(
    principal: Principal,
    input: Omit<DerivedIndexRecord, "ownerAccountId">,
  ): DerivedIndexRecord {
    const archive = this.authorizeArchive(
      principal,
      input.archiveId,
      "index.created",
      input.createdAt,
    );
    this.requireServiceProcessing(archive.archiveId);
    this.assertIdAvailable(input.indexId);
    assertNonEmpty(input.indexType, "indexType");
    assertNonEmpty(input.tokenDigest, "tokenDigest");
    assertTimestamp(input.createdAt, "createdAt");
    const record = immutable<DerivedIndexRecord>({
      ...input,
      ownerAccountId: archive.ownerAccountId,
    });
    this.indexes.set(record.indexId, record);
    this.audit(principal, "index.created", "derived_index", input.createdAt, {
      targetId: record.indexId,
    });
    return record;
  }

  public readPublicCase(
    principal: AdminPrincipal,
    publicCaseId: string,
    readAt: string,
  ): PublicCase {
    this.requirePrincipal(principal);
    this.assertAdmin(principal);
    assertTimestamp(readAt, "readAt");
    const publicCase = this.publicCases.get(publicCaseId);
    if (!publicCase) throw this.notFoundOrForbidden();
    this.requireGrantedConsent(publicCase.archiveId, "public_display");
    this.audit(principal, "public_case.read", "public_case", readAt, {
      targetId: publicCaseId,
    });
    return immutable(publicCase);
  }

  public exportArchive(
    principal: Principal,
    input: { archiveId: string; exportJobId: string; exportedAt: string },
  ): { job: ExportJob; bundle: ArchiveExportBundle } {
    const archive = this.authorizeArchive(
      principal,
      input.archiveId,
      "archive.exported",
      input.exportedAt,
    );
    if (principal.role === "researcher") throw this.notFoundOrForbidden();
    this.assertIdAvailable(input.exportJobId);
    assertTimestamp(input.exportedAt, "exportedAt");
    const job = immutable<ExportJob>({
      exportJobId: input.exportJobId,
      archiveId: archive.archiveId,
      ownerAccountId: archive.ownerAccountId,
      status: "ready",
      createdAt: input.exportedAt,
      expiresAt: addDays(input.exportedAt, 1),
    });
    this.exportJobs.set(job.exportJobId, job);
    this.touchArchive(archive.archiveId, input.exportedAt);
    this.audit(principal, "archive.exported", "archive", input.exportedAt, {
      targetId: archive.archiveId,
    });
    const snapshot = this.snapshot(this.requireArchive(archive.archiveId));
    const accessHistory = this.userVisibleAudit(archive.archiveId);
    const bundle = immutable<ArchiveExportBundle>({
      schemaVersion: "archive-export.v0",
      exportedAt: input.exportedAt,
      archive: snapshot.archive,
      records: snapshot.records,
      consentHistory: snapshot.consentHistory,
      accessHistory,
      readableText: this.renderReadableExport(snapshot, accessHistory),
    });
    return immutable({ job, bundle });
  }

  public getExportJob(
    principal: Principal,
    exportJobId: string,
    readAt: string,
  ): ExportJob {
    this.requirePrincipal(principal);
    assertTimestamp(readAt, "readAt");
    const job = this.exportJobs.get(exportJobId);
    if (!job || isAtOrAfter(readAt, job.expiresAt)) throw this.notFoundOrForbidden();
    this.authorizeArchive(principal, job.archiveId, "archive.read", readAt);
    this.audit(principal, "export_job.read", "export_job", readAt, {
      targetDigest: this.options.digestIdentifier(job.exportJobId),
    });
    return immutable(job);
  }

  public deleteArchive(
    principal: Principal,
    input: { archiveId: string; receiptId: string; deletedAt: string },
  ): DeletionReceipt {
    this.authorizeArchive(principal, input.archiveId, "archive.deleted", input.deletedAt);
    if (principal.role === "researcher") throw this.notFoundOrForbidden();
    return this.performArchiveDeletion(principal, input);
  }

  public deleteAccount(
    principal: Principal,
    input: { accountId: string; receiptId: string; deletedAt: string },
  ): DeletionReceipt {
    const actor = this.requirePrincipal(principal);
    if (principal.role === "researcher") throw this.notFoundOrForbidden();
    if (principal.role === "user" && principal.accountId !== input.accountId) {
      this.auditDenied(principal, "account.deleted", "account", input.accountId, input.deletedAt);
      throw this.notFoundOrForbidden();
    }
    if (principal.role === "admin") this.assertAdmin(principal);
    const account = this.requireActiveAccount(input.accountId);
    assertTimestamp(input.deletedAt, "deletedAt");
    this.assertIdAvailable(input.receiptId);
    for (const archive of [...this.archives.values()]) {
      if (archive.ownerAccountId === account.accountId) {
        this.performArchiveDeletion(principal, {
          archiveId: archive.archiveId,
          receiptId: `${input.receiptId}:${this.options.digestIdentifier(archive.archiveId)}`,
          deletedAt: input.deletedAt,
        });
      }
    }
    for (const [id, identity] of this.identities) {
      if (identity.accountId === account.accountId) this.identities.delete(id);
    }
    for (const [id, session] of this.authSessions) {
      if (session.accountId === account.accountId) this.authSessions.delete(id);
    }
    for (const [key, assignment] of this.researchAssignments) {
      if (assignment.accountId === account.accountId) this.researchAssignments.delete(key);
    }
    for (const [id, lease] of this.sessionLeases) {
      if (lease.ownerAccountId === account.accountId) this.sessionLeases.delete(id);
    }
    const deletedAccount = immutable<Account>({
      ...account,
      status: "deleted",
      updatedAt: input.deletedAt,
      deletedAt: input.deletedAt,
    });
    this.accounts.set(account.accountId, deletedAccount);
    const targetDigest = this.options.digestIdentifier(account.accountId);
    this.scrubAuditTarget("account", account.accountId, targetDigest);
    this.scrubAuditActor(account.accountId, targetDigest);
    for (const [id, priorReceipt] of this.deletionReceipts) {
      if (priorReceipt.requestedByAccountId === account.accountId) {
        const scrubbed = { ...priorReceipt, requestedByDigest: targetDigest };
        delete scrubbed.requestedByAccountId;
        this.deletionReceipts.set(id, immutable(scrubbed));
      }
    }
    const receipt = immutable<DeletionReceipt>({
      receiptId: input.receiptId,
      ...(actor.accountId === account.accountId
        ? { requestedByDigest: targetDigest }
        : { requestedByAccountId: actor.accountId }),
      targetType: "account",
      targetDigest,
      deletedAt: input.deletedAt,
      backupPurgeDueAt: addDays(input.deletedAt, 30),
    });
    this.deletionReceipts.set(receipt.receiptId, receipt);
    this.audit(principal, "account.deleted", "account", input.deletedAt, { targetDigest });
    this.scrubAuditActor(account.accountId, targetDigest);
    return receipt;
  }

  public getDeletionReceipt(
    principal: AdminPrincipal,
    receiptId: string,
    readAt: string,
  ): DeletionReceipt {
    this.requirePrincipal(principal);
    this.assertAdmin(principal);
    assertTimestamp(readAt, "readAt");
    const receipt = this.deletionReceipts.get(receiptId);
    if (!receipt) throw this.notFoundOrForbidden();
    this.audit(principal, "deletion_receipt.read", "deletion_receipt", readAt, {
      targetDigest: this.options.digestIdentifier(receiptId),
    });
    return immutable(receipt);
  }

  public readAuditLog(
    principal: AdminPrincipal,
    readAt: string,
  ): ReadonlyArray<AuditEvent> {
    this.requirePrincipal(principal);
    this.assertAdmin(principal);
    assertTimestamp(readAt, "readAt");
    const result = immutable([...this.auditEvents.values()]);
    this.audit(principal, "audit.read", "audit_log", readAt, {});
    return result;
  }

  public runRetention(principal: SystemPrincipal, asOf: string): RetentionRunResult {
    this.assertSystem(principal, "retention_expiry");
    assertTimestamp(asOf, "asOf");
    const purgedSessionIds: string[] = [];
    const purgedExportJobIds: string[] = [];
    const purgedResearchRecordIds: string[] = [];
    const purgedAuditEventIds: string[] = [];
    const scheduledArchiveIds: string[] = [];
    const deletedArchiveDigests: string[] = [];

    for (const [id, lease] of this.sessionLeases) {
      if (isAtOrAfter(asOf, lease.expiresAt)) {
        this.sessionLeases.delete(id);
        purgedSessionIds.push(id);
      }
    }
    for (const [id, session] of this.authSessions) {
      if (isAtOrAfter(asOf, session.expiresAt)) this.authSessions.delete(id);
    }
    for (const [id, job] of this.exportJobs) {
      if (isAtOrAfter(asOf, job.expiresAt)) {
        this.exportJobs.delete(id);
        purgedExportJobIds.push(id);
      }
    }
    for (const [id, record] of this.researchRecords) {
      if (isAtOrAfter(asOf, record.expiresAt)) {
        this.researchRecords.delete(id);
        purgedResearchRecordIds.push(id);
      }
    }
    for (const [id, event] of this.auditEvents) {
      if (isAtOrAfter(asOf, addDays(event.occurredAt, 180))) {
        this.auditEvents.delete(id);
        purgedAuditEventIds.push(id);
      }
    }
    for (const archive of [...this.archives.values()]) {
      if (archive.retentionDeleteAt && isAtOrAfter(asOf, archive.retentionDeleteAt)) {
        const receipt = this.performArchiveDeletion(principal, {
          archiveId: archive.archiveId,
          receiptId: `RETENTION:${this.options.digestIdentifier(archive.archiveId)}:${asOf}`,
          deletedAt: asOf,
        });
        deletedArchiveDigests.push(receipt.targetDigest);
      } else if (
        !archive.retentionNoticeAt &&
        isAtOrAfter(asOf, addMonths(archive.lastActivityAt, 36))
      ) {
        this.replaceArchive(archive.archiveId, {
          retentionNoticeAt: asOf,
          retentionDeleteAt: addDays(asOf, 30),
          updatedAt: asOf,
        });
        scheduledArchiveIds.push(archive.archiveId);
        this.audit(principal, "retention.notice", "archive", asOf, {
          targetId: archive.archiveId,
        });
      }
    }
    this.audit(principal, "retention.purged", "retention_run", asOf, {});
    return immutable({
      scheduledArchiveIds,
      deletedArchiveDigests,
      purgedSessionIds,
      purgedExportJobIds,
      purgedResearchRecordIds,
      purgedAuditEventIds,
    });
  }

  private performArchiveDeletion(
    principal: InternalPrincipal,
    input: { archiveId: string; receiptId: string; deletedAt: string },
  ): DeletionReceipt {
    const archive = this.requireArchive(input.archiveId);
    this.assertIdAvailable(input.receiptId);
    assertTimestamp(input.deletedAt, "deletedAt");
    assertChronological(archive.createdAt, input.deletedAt, "archiveDeletion");
    const targetDigest = this.options.digestIdentifier(archive.archiveId);
    const childAuditTargets: Array<{ targetType: string; targetId: string }> = [];
    for (const [id, record] of this.records) {
      if (record.archiveId === archive.archiveId) {
        childAuditTargets.push({ targetType: "archive_record", targetId: id });
        this.records.delete(id);
      }
    }
    for (const [id, decision] of this.consents) {
      if (decision.archiveId === archive.archiveId) {
        childAuditTargets.push({ targetType: "consent", targetId: id });
        this.consents.delete(id);
      }
    }
    for (const [id, record] of this.researchRecords) {
      if (record.archiveId === archive.archiveId) {
        childAuditTargets.push({ targetType: "research_record", targetId: id });
      }
    }
    for (const [id, publicCase] of this.publicCases) {
      if (publicCase.archiveId === archive.archiveId) {
        childAuditTargets.push({ targetType: "public_case", targetId: id });
      }
    }
    this.deleteResearchForArchive(archive.archiveId);
    this.deletePublicCasesForArchive(archive.archiveId);
    for (const [id, index] of this.indexes) {
      if (index.archiveId === archive.archiveId) {
        childAuditTargets.push({ targetType: "derived_index", targetId: id });
        this.indexes.delete(id);
      }
    }
    for (const [id, job] of this.exportJobs) {
      if (job.archiveId === archive.archiveId) this.exportJobs.delete(id);
    }
    this.archives.delete(archive.archiveId);
    this.scrubAuditTarget("archive", archive.archiveId, targetDigest);
    for (const child of childAuditTargets) {
      this.scrubAuditTarget(
        child.targetType,
        child.targetId,
        this.options.digestIdentifier(child.targetId),
      );
    }
    const receipt = immutable<DeletionReceipt>({
      receiptId: input.receiptId,
      requestedByAccountId: principal.accountId,
      targetType: "archive",
      targetDigest,
      deletedAt: input.deletedAt,
      backupPurgeDueAt: addDays(input.deletedAt, 30),
    });
    this.deletionReceipts.set(receipt.receiptId, receipt);
    this.audit(principal, "archive.deleted", "archive", input.deletedAt, { targetDigest });
    return receipt;
  }

  private authorizeArchive(
    principal: Principal,
    archiveId: string,
    action: AuditAction,
    occurredAt: string,
  ): UserArchive {
    this.requirePrincipal(principal);
    assertTimestamp(occurredAt, "occurredAt");
    const archive = this.archives.get(archiveId);
    if (!archive) {
      this.auditDenied(principal, action, "archive", archiveId, occurredAt);
      throw this.notFoundOrForbidden();
    }
    if (principal.role === "user" && archive.ownerAccountId === principal.accountId) {
      return archive;
    }
    if (principal.role === "admin") {
      this.assertAdmin(principal);
      return archive;
    }
    this.auditDenied(principal, action, "archive", archiveId, occurredAt);
    throw this.notFoundOrForbidden();
  }

  private requirePrincipal(principal: Principal): Account {
    if (!principal || typeof principal !== "object") throw this.notFoundOrForbidden();
    assertNonEmpty(principal.accountId, "principal.accountId");
    assertNonEmpty(principal.requestId, "principal.requestId");
    const account = this.requireActiveAccount(principal.accountId);
    if (account.role !== principal.role) throw this.notFoundOrForbidden();
    if (principal.role === "admin") this.assertAdmin(principal);
    if (principal.role === "researcher") {
      assertNonEmpty(principal.studyId, "studyId");
      if (!this.researchAssignments.has(this.researchAssignmentKey(principal.accountId, principal.studyId))) {
        throw this.notFoundOrForbidden();
      }
    }
    return account;
  }

  private assertAdmin(principal: AdminPrincipal): void {
    if (
      !principal.reasonCode ||
      !principal.ticketId ||
      !principal.requestId
    ) {
      throw new PrivacyError(
        "ADMIN_CONTEXT_REQUIRED",
        "管理员操作必须包含原因、工单和请求 ID。",
      );
    }
    assertOneOf(
      principal.reasonCode,
      [
        "user_support",
        "user_export_request",
        "user_deletion_request",
        "security_investigation",
      ] as const,
      "reasonCode",
    );
    assertNonEmpty(principal.ticketId, "ticketId");
    assertNonEmpty(principal.requestId, "requestId");
  }

  private assertSystem(
    principal: SystemPrincipal,
    expectedReason: SystemPrincipal["reasonCode"],
  ): void {
    if (
      !principal ||
      principal.role !== "system" ||
      principal.accountId !== "system" ||
      principal.reasonCode !== expectedReason
    ) {
      throw new PrivacyError("ADMIN_CONTEXT_REQUIRED", "系统操作上下文不合法。");
    }
    assertNonEmpty(principal.requestId, "requestId");
  }

  private systemPrincipal(
    reasonCode: SystemPrincipal["reasonCode"],
    requestId: string,
  ): SystemPrincipal {
    return { role: "system", accountId: "system", reasonCode, requestId };
  }

  private requireActiveAccount(accountId: string): Account {
    const account = this.accounts.get(accountId);
    if (!account || account.status !== "active") {
      throw new PrivacyError("ACCOUNT_INACTIVE", "账户不存在或已停用。");
    }
    return account;
  }

  private requireArchive(archiveId: string): UserArchive {
    const archive = this.archives.get(archiveId);
    if (!archive) throw this.notFoundOrForbidden();
    return archive;
  }

  private requireServiceProcessing(archiveId: string): ConsentDecision {
    return this.requireGrantedConsent(archiveId, "service_processing");
  }

  private requireGrantedConsent(
    archiveId: string,
    purpose: ConsentPurpose,
  ): ConsentDecision {
    const latest = this.latestConsent(archiveId, purpose);
    if (!latest) throw new PrivacyError("CONSENT_REQUIRED", `${purpose} 尚未明确授权。`);
    if (latest.action !== "grant") {
      throw new PrivacyError("CONSENT_WITHDRAWN", `${purpose} 已撤回。`);
    }
    return latest;
  }

  private latestConsent(
    archiveId: string,
    purpose: ConsentPurpose,
  ): ConsentDecision | undefined {
    return [...this.consents.values()]
      .filter((item) => item.archiveId === archiveId && item.purpose === purpose)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
  }

  private snapshot(archive: UserArchive): ArchiveSnapshot {
    return immutable({
      archive,
      records: [...this.records.values()]
        .filter((record) => record.archiveId === archive.archiveId)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
      consentHistory: [...this.consents.values()]
        .filter((decision) => decision.archiveId === archive.archiveId)
        .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)),
    });
  }

  private replaceArchive(archiveId: string, patch: Partial<UserArchive>): void {
    const archive = this.requireArchive(archiveId);
    this.archives.set(archiveId, immutable({ ...archive, ...patch }));
  }

  private touchArchive(archiveId: string, occurredAt: string): void {
    const archive = this.requireArchive(archiveId);
    assertChronological(archive.updatedAt, occurredAt, "archiveActivity");
    this.replaceArchive(archiveId, {
      updatedAt: occurredAt,
      lastActivityAt: occurredAt,
      retentionNoticeAt: undefined,
      retentionDeleteAt: undefined,
    });
  }

  private deleteResearchForArchive(archiveId: string): void {
    for (const [id, record] of this.researchRecords) {
      if (record.archiveId === archiveId) {
        this.researchRecords.delete(id);
        this.scrubAuditTarget("research_record", id, this.options.digestIdentifier(id));
      }
    }
  }

  private deletePublicCasesForArchive(archiveId: string): void {
    for (const [id, publicCase] of this.publicCases) {
      if (publicCase.archiveId === archiveId) {
        this.publicCases.delete(id);
        this.scrubAuditTarget("public_case", id, this.options.digestIdentifier(id));
      }
    }
  }

  private renderReadableExport(
    snapshot: ArchiveSnapshot,
    accessHistory: ReadonlyArray<UserVisibleAuditEvent>,
  ): string {
    const lines = [
      `Archive ${snapshot.archive.archiveId}`,
      `Storage mode: ${snapshot.archive.storageMode}`,
      `Records: ${snapshot.records.length}`,
      `Consent decisions: ${snapshot.consentHistory.length}`,
      `Access events: ${accessHistory.length}`,
      "",
      ...snapshot.records.map(
        (record) =>
          `- ${record.recordType} v${record.schemaVersion} (${record.createdAt})\n  ${JSON.stringify(record.payload)}`,
      ),
    ];
    return lines.join("\n");
  }

  private userVisibleAudit(archiveId: string): ReadonlyArray<UserVisibleAuditEvent> {
    return [...this.auditEvents.values()]
      .filter((event) => event.targetId === archiveId)
      .map((event) => ({
        auditEventId: event.auditEventId,
        actorRole: event.actorRole,
        action: event.action,
        targetType: event.targetType,
        outcome: event.outcome,
        occurredAt: event.occurredAt,
      }));
  }

  private audit(
    principal: InternalPrincipal,
    action: AuditAction,
    targetType: string,
    occurredAt: string,
    target: { targetId?: string; targetDigest?: string },
    outcome: "success" | "denied" = "success",
  ): void {
    assertTimestamp(occurredAt, "audit.occurredAt");
    this.auditSequence += 1;
    const event: AuditEvent = {
      auditEventId: `AUDIT-${String(this.auditSequence).padStart(6, "0")}`,
      actorAccountId: principal.accountId,
      actorRole: principal.role,
      action,
      targetType,
      ...target,
      requestId: principal.requestId,
      outcome,
      occurredAt,
    };
    if (principal.role === "admin") {
      event.reasonCode = principal.reasonCode;
      event.ticketId = principal.ticketId;
    }
    if (principal.role === "system") event.reasonCode = principal.reasonCode;
    if (principal.role === "researcher") event.ticketId = principal.studyId;
    this.auditEvents.set(event.auditEventId, immutable(event));
  }

  private auditDenied(
    principal: Principal,
    action: AuditAction,
    targetType: string,
    targetId: string,
    occurredAt: string,
  ): void {
    try {
      this.audit(
        principal,
        action,
        targetType,
        occurredAt,
        { targetDigest: this.options.digestIdentifier(targetId) },
        "denied",
      );
    } catch {
      // 连审计上下文都无效时，仍不向调用方泄漏目标。
    }
  }

  private scrubAuditTarget(targetType: string, targetId: string, targetDigest: string): void {
    for (const [id, event] of this.auditEvents) {
      if (event.targetType === targetType && event.targetId === targetId) {
        const scrubbed = { ...event, targetDigest } as AuditEvent;
        delete scrubbed.targetId;
        this.auditEvents.set(id, immutable(scrubbed));
      }
    }
  }

  private scrubAuditActor(actorAccountId: string, actorDigest: string): void {
    for (const [id, event] of this.auditEvents) {
      if (event.actorAccountId === actorAccountId) {
        const scrubbed = { ...event, actorDigest } as AuditEvent;
        delete scrubbed.actorAccountId;
        this.auditEvents.set(id, immutable(scrubbed));
      }
    }
  }

  private assertIdAvailable(id: string): void {
    assertNonEmpty(id, "id");
    const maps: ReadonlyArray<Map<string, unknown>> = [
      this.accounts,
      this.identities,
      this.authSessions,
      new Map([...this.researchAssignments.values()].map((item) => [item.assignmentId, item])),
      this.sessionLeases,
      this.archives,
      this.records,
      this.consents,
      this.researchRecords,
      this.publicCases,
      this.indexes,
      this.exportJobs,
      this.deletionReceipts,
    ];
    if (maps.some((map) => map.has(id))) {
      throw new PrivacyError("DUPLICATE_ID", "ID 已存在。");
    }
  }

  private assertBoundedDuration(
    createdAt: string,
    expiresAt: string,
    maxDurationMs: number,
    field: string,
  ): void {
    assertChronological(createdAt, expiresAt, field);
    if (Date.parse(expiresAt) - Date.parse(createdAt) > maxDurationMs) {
      throw new PrivacyError("INVALID_INPUT", `${field} 超过保存上限。`);
    }
  }

  private notFoundOrForbidden(): PrivacyError {
    return new PrivacyError("NOT_FOUND_OR_FORBIDDEN", "对象不存在或无权访问。");
  }

  private researchAssignmentKey(accountId: string, studyId: string): string {
    return `${accountId}\u0000${studyId}`;
  }
}
