import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { getTableColumns } from "drizzle-orm";

import {
  accounts,
  archiveRecords,
  auditEvents,
  consentDecisions,
  researchRecords,
  userArchives,
} from "../db/schema.ts";
import {
  InMemoryPrivacyStore,
  PrivacyError,
  type AdminPrincipal,
  type ResearchPrincipal,
  type SystemPrincipal,
  type UserPrincipal,
} from "../domain/privacy/index.ts";

const T = {
  created: "2026-08-04T08:00:00.000Z",
  archive: "2026-08-04T08:01:00.000Z",
  record1: "2026-08-04T08:02:00.000Z",
  consent1: "2026-08-04T08:03:00.000Z",
  derived1: "2026-08-04T08:04:00.000Z",
  consent2: "2026-08-04T08:05:00.000Z",
  record2: "2026-08-04T08:06:00.000Z",
  export: "2026-08-04T08:07:00.000Z",
  delete: "2026-08-04T08:08:00.000Z",
  read: "2026-08-04T08:09:00.000Z",
};

const SYS_IDENTITY: SystemPrincipal = {
  role: "system",
  accountId: "system",
  reasonCode: "identity_provisioning",
  requestId: "REQ-SYSTEM-IDENTITY",
};
const SYS_RETENTION: SystemPrincipal = {
  role: "system",
  accountId: "system",
  reasonCode: "retention_expiry",
  requestId: "REQ-SYSTEM-RETENTION",
};
const USER_A: UserPrincipal = { role: "user", accountId: "ACCOUNT-A", requestId: "REQ-A" };
const USER_B: UserPrincipal = { role: "user", accountId: "ACCOUNT-B", requestId: "REQ-B" };
const ADMIN: AdminPrincipal = {
  role: "admin",
  accountId: "ACCOUNT-ADMIN",
  requestId: "REQ-ADMIN",
  reasonCode: "user_support",
  ticketId: "TICKET-001",
};
const RESEARCHER: ResearchPrincipal = {
  role: "researcher",
  accountId: "ACCOUNT-RESEARCHER",
  requestId: "REQ-RESEARCH",
  studyId: "STUDY-001",
};

function digestIdentifier(value: string): string {
  return `hmac-sha256:${createHmac("sha256", "synthetic-test-key").update(value).digest("hex")}`;
}

function setupStore(): InMemoryPrivacyStore {
  const store = new InMemoryPrivacyStore({ digestIdentifier });
  store.createAccount({
    accountId: USER_A.accountId,
    role: "user",
    defaultStorageMode: "personal_archive",
    createdAt: T.created,
  });
  store.createAccount({
    accountId: USER_B.accountId,
    role: "user",
    defaultStorageMode: "session_only",
    createdAt: T.created,
  });
  store.createAccount({
    accountId: ADMIN.accountId,
    role: "admin",
    defaultStorageMode: "session_only",
    createdAt: T.created,
  });
  store.createAccount({
    accountId: RESEARCHER.accountId,
    role: "researcher",
    defaultStorageMode: "session_only",
    createdAt: T.created,
  });
  store.assignResearchStudy(SYS_IDENTITY, {
    assignmentId: "ASSIGNMENT-001",
    accountId: RESEARCHER.accountId,
    studyId: RESEARCHER.studyId,
    assignedAt: T.created,
  });
  return store;
}

function createArchive(
  store: InMemoryPrivacyStore,
  principal: UserPrincipal = USER_A,
  archiveId = "ARCHIVE-A",
) {
  return store.createArchive(principal, {
    archiveId,
    storageMode: "personal_archive",
    serviceConsentDecisionId: `CONSENT-SERVICE-${archiveId}`,
    servicePolicyVersion: "service-policy-v1",
    createdAt: T.archive,
  });
}

function appendSecret(
  store: InMemoryPrivacyStore,
  principal: UserPrincipal = USER_A,
  archiveId = "ARCHIVE-A",
  recordId = "RECORD-A-1",
  createdAt = T.record1,
  payload: unknown = { note: "SYNTHETIC-SECRET-A" },
) {
  return store.appendArchiveRecord(principal, {
    archiveId,
    recordId,
    recordType: "workflow_snapshot",
    schemaVersion: "case-workflow.v0",
    sensitivity: "highly_sensitive",
    payload,
    createdAt,
  });
}

test("外部身份只接受 issuer + subject digest，不以邮箱作数据键", () => {
  const store = setupStore();
  const identity = store.linkExternalIdentity(SYS_IDENTITY, {
    identityId: "IDENTITY-A",
    accountId: USER_A.accountId,
    issuer: "https://identity.synthetic",
    subjectDigest: digestIdentifier("stable-provider-subject-A"),
    linkedAt: T.archive,
  });
  assert.equal(identity.accountId, USER_A.accountId);
  assert.equal("email" in identity, false);
  assert.equal("fullName" in identity, false);
  assert.throws(
    () =>
      store.linkExternalIdentity(SYS_IDENTITY, {
        identityId: "IDENTITY-DUPLICATE",
        accountId: USER_B.accountId,
        issuer: identity.issuer,
        subjectDigest: identity.subjectDigest,
        linkedAt: T.record1,
      }),
    (error: unknown) => error instanceof PrivacyError && error.code === "DUPLICATE_ID",
  );
});

test("session_only 不建持久档案，24 小时上限和到期清理均生效", () => {
  const store = setupStore();
  assert.throws(
    () =>
      store.createArchive(USER_B, {
        archiveId: "ARCHIVE-ILLEGAL-SESSION",
        storageMode: "session_only" as never,
        serviceConsentDecisionId: "CONSENT-ILLEGAL",
        servicePolicyVersion: "v1",
        createdAt: T.archive,
      }),
    (error: unknown) => error instanceof PrivacyError && error.code === "INVALID_INPUT",
  );
  assert.throws(
    () =>
      store.createSessionLease(USER_B, {
        sessionId: "SESSION-TOO-LONG",
        payload: { synthetic: true },
        createdAt: T.created,
        expiresAt: "2026-08-05T08:00:01.000Z",
      }),
    (error: unknown) => error instanceof PrivacyError && error.code === "INVALID_INPUT",
  );
  store.createSessionLease(USER_B, {
    sessionId: "SESSION-B",
    payload: { note: "SYNTHETIC-SESSION-SECRET" },
    createdAt: T.created,
    expiresAt: "2026-08-05T07:59:59.000Z",
  });
  const result = store.runRetention(SYS_RETENTION, "2026-08-05T08:00:00.000Z");
  assert.deepEqual(result.purgedSessionIds, ["SESSION-B"]);
  assert.throws(
    () => store.readSessionLease(USER_B, "SESSION-B", "2026-08-05T08:01:00.000Z"),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
});

test("A 不能用 ID 猜测读、写、导出或删除 B，且不暴露存在性", () => {
  const store = setupStore();
  createArchive(store, USER_B, "ARCHIVE-B");
  const operations = [
    () => store.readArchive(USER_A, "ARCHIVE-B", T.record1),
    () => appendSecret(store, USER_A, "ARCHIVE-B", "RECORD-ATTACK", T.record1),
    () =>
      store.exportArchive(USER_A, {
        archiveId: "ARCHIVE-B",
        exportJobId: "EXPORT-ATTACK",
        exportedAt: T.export,
      }),
    () =>
      store.deleteArchive(USER_A, {
        archiveId: "ARCHIVE-B",
        receiptId: "DELETE-ATTACK",
        deletedAt: T.delete,
      }),
    () => store.readArchive(USER_A, "ARCHIVE-NOT-THERE", T.record1),
  ];
  for (const operation of operations) {
    assert.throws(
      operation,
      (error: unknown) =>
        error instanceof PrivacyError && error.code === "NOT_FOUND_OR_FORBIDDEN",
    );
  }
});

test("管理员缺原因或工单时失败，合法查看会留受控审计", () => {
  const store = setupStore();
  createArchive(store);
  const incompleteAdmin = {
    role: "admin",
    accountId: ADMIN.accountId,
    requestId: "REQ-INCOMPLETE",
  } as AdminPrincipal;
  assert.throws(
    () => store.readArchive(incompleteAdmin, "ARCHIVE-A", T.record1),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "ADMIN_CONTEXT_REQUIRED",
  );
  store.readArchive(ADMIN, "ARCHIVE-A", T.record1);
  const audit = store.readAuditLog(ADMIN, T.read);
  const adminRead = audit.find(
    (event) => event.action === "archive.read" && event.actorRole === "admin",
  );
  assert.equal(adminRead?.reasonCode, ADMIN.reasonCode);
  assert.equal(adminRead?.ticketId, ADMIN.ticketId);
  assert.equal(adminRead?.requestId, ADMIN.requestId);
});

test("档案记录只追加新版本，旧版本与输出都不可原地修改", () => {
  const store = setupStore();
  createArchive(store);
  const first = appendSecret(store);
  const second = store.appendArchiveRecord(USER_A, {
    archiveId: "ARCHIVE-A",
    recordId: "RECORD-A-2",
    recordType: "workflow_snapshot",
    schemaVersion: "case-workflow.v0",
    sensitivity: "highly_sensitive",
    payload: { note: "SYNTHETIC-SECRET-A-V2" },
    supersedesRecordId: first.recordId,
    createdAt: T.record2,
  });
  const snapshot = store.readArchive(USER_A, "ARCHIVE-A", T.export);
  assert.equal(snapshot.records.length, 2);
  assert.equal(second.supersedesRecordId, first.recordId);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.records[0].payload), true);
  assert.throws(() => {
    (snapshot.records[0].payload as { note: string }).note = "tampered";
  }, TypeError);
});

test("研究必须同时通过独立角色、study 分配和明确范围，撤回后副本立即删除", () => {
  const store = setupStore();
  createArchive(store);
  assert.throws(
    () =>
      store.createResearchRecord(RESEARCHER, {
        researchRecordId: "RESEARCH-1",
        archiveId: "ARCHIVE-A",
        subjectDigest: digestIdentifier("SUBJECT-A"),
        payload: { synthetic: "research" },
        createdAt: T.derived1,
        expiresAt: "2028-08-04T08:04:00.000Z",
      }),
    (error: unknown) => error instanceof PrivacyError && error.code === "CONSENT_REQUIRED",
  );
  store.recordConsent(USER_A, {
    decisionId: "CONSENT-RESEARCH-GRANT",
    archiveId: "ARCHIVE-A",
    purpose: "anonymous_research",
    action: "grant",
    policyVersion: "research-policy-v1",
    scope: ["study:STUDY-001"],
    occurredAt: T.consent1,
  });
  const record = store.createResearchRecord(RESEARCHER, {
    researchRecordId: "RESEARCH-1",
    archiveId: "ARCHIVE-A",
    subjectDigest: digestIdentifier("SUBJECT-A"),
    payload: { synthetic: "research" },
    createdAt: T.derived1,
    expiresAt: "2028-08-04T08:04:00.000Z",
  });
  assert.equal(store.readResearchRecord(RESEARCHER, record.researchRecordId, T.consent2).studyId, "STUDY-001");
  store.recordConsent(USER_A, {
    decisionId: "CONSENT-RESEARCH-WITHDRAW",
    archiveId: "ARCHIVE-A",
    purpose: "anonymous_research",
    action: "withdraw",
    policyVersion: "research-policy-v1",
    scope: ["study:STUDY-001"],
    occurredAt: T.consent2,
  });
  assert.throws(
    () => store.readResearchRecord(RESEARCHER, record.researchRecordId, T.record2),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
  const auditText = JSON.stringify(store.readAuditLog(ADMIN, T.export));
  assert.match(auditText, /research_record\.read/);
  assert.doesNotMatch(auditText, /RESEARCH-1/);
  appendSecret(store, USER_A, "ARCHIVE-A", "RECORD-AFTER-RESEARCH-WITHDRAW", T.record2);
});

test("公开展示与研究不捆绑，管理员不能代同意，撤回后立即下架", () => {
  const store = setupStore();
  createArchive(store);
  assert.throws(
    () =>
      store.recordConsent(ADMIN, {
        decisionId: "CONSENT-ADMIN-GRANT",
        archiveId: "ARCHIVE-A",
        purpose: "public_display",
        action: "grant",
        policyVersion: "public-policy-v1",
        scope: ["public_case"],
        occurredAt: T.consent1,
      }),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
  store.recordConsent(USER_A, {
    decisionId: "CONSENT-PUBLIC-GRANT",
    archiveId: "ARCHIVE-A",
    purpose: "public_display",
    action: "grant",
    policyVersion: "public-policy-v1",
    scope: ["public_case"],
    occurredAt: T.consent1,
  });
  const publicCase = store.createPublicCase(ADMIN, {
    publicCaseId: "PUBLIC-CASE-1",
    archiveId: "ARCHIVE-A",
    status: "published",
    redactionVersion: "redaction-v1",
    reviewerId: "REVIEWER-SYNTHETIC",
    payload: { public: "SYNTHETIC-REDACTED" },
    createdAt: T.derived1,
    publishedAt: T.derived1,
  });
  assert.equal(store.readPublicCase(ADMIN, publicCase.publicCaseId, T.consent2).status, "published");
  store.recordConsent(USER_A, {
    decisionId: "CONSENT-PUBLIC-WITHDRAW",
    archiveId: "ARCHIVE-A",
    purpose: "public_display",
    action: "withdraw",
    policyVersion: "public-policy-v1",
    scope: ["public_case"],
    occurredAt: T.record2,
  });
  assert.throws(
    () => store.readPublicCase(ADMIN, publicCase.publicCaseId, T.export),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
  const auditText = JSON.stringify(store.readAuditLog(ADMIN, T.read));
  assert.match(auditText, /public_case\.read/);
  assert.doesNotMatch(auditText, /PUBLIC-CASE-1/);
});

test("档案导出同时可机读和人读，只包含当前所有者的追加历史", () => {
  const store = setupStore();
  createArchive(store, USER_A, "ARCHIVE-A");
  appendSecret(store, USER_A, "ARCHIVE-A", "RECORD-A-1", T.record1, {
    note: "SYNTHETIC-SECRET-A",
  });
  createArchive(store, USER_B, "ARCHIVE-B");
  appendSecret(store, USER_B, "ARCHIVE-B", "RECORD-B-1", T.record1, {
    note: "SYNTHETIC-SECRET-B",
  });
  const { job, bundle } = store.exportArchive(USER_A, {
    archiveId: "ARCHIVE-A",
    exportJobId: "EXPORT-A",
    exportedAt: T.export,
  });
  const serialized = JSON.stringify(bundle);
  assert.match(serialized, /SYNTHETIC-SECRET-A/);
  assert.doesNotMatch(serialized, /SYNTHETIC-SECRET-B/);
  assert.match(bundle.readableText, /Records: 1/);
  assert.equal(bundle.consentHistory[0].purpose, "service_processing");
  assert.equal(job.expiresAt, "2026-08-05T08:07:00.000Z");
});

test("撤回服务处理后禁止新写入，但仍允许导出或删除", () => {
  const store = setupStore();
  createArchive(store);
  store.recordConsent(USER_A, {
    decisionId: "CONSENT-SERVICE-WITHDRAW",
    archiveId: "ARCHIVE-A",
    purpose: "service_processing",
    action: "withdraw",
    policyVersion: "service-policy-v1",
    scope: ["archive_service"],
    occurredAt: T.consent1,
  });
  assert.throws(
    () => appendSecret(store, USER_A, "ARCHIVE-A", "RECORD-BLOCKED", T.derived1),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "CONSENT_WITHDRAWN",
  );
  assert.equal(
    store.exportArchive(USER_A, {
      archiveId: "ARCHIVE-A",
      exportJobId: "EXPORT-AFTER-WITHDRAW",
      exportedAt: T.export,
    }).bundle.archive.status,
    "processing_suspended",
  );
});

test("删除档案会联删服务、研究、公开、索引和导出，审计不泄漏内容", () => {
  const store = setupStore();
  createArchive(store);
  appendSecret(store, USER_A, "ARCHIVE-A", "RECORD-A-SECRET", T.record1, {
    note: "TOP-SECRET-SYNTHETIC-PAYLOAD",
  });
  store.recordConsent(USER_A, {
    decisionId: "CONSENT-RESEARCH-GRANT",
    archiveId: "ARCHIVE-A",
    purpose: "anonymous_research",
    action: "grant",
    policyVersion: "research-policy-v1",
    scope: ["study:STUDY-001"],
    occurredAt: T.consent1,
  });
  store.createResearchRecord(RESEARCHER, {
    researchRecordId: "RESEARCH-A",
    archiveId: "ARCHIVE-A",
    subjectDigest: digestIdentifier("SUBJECT-A"),
    payload: { derived: "TOP-SECRET-DERIVED" },
    createdAt: T.derived1,
    expiresAt: "2028-08-04T08:04:00.000Z",
  });
  store.createDerivedIndex(USER_A, {
    indexId: "INDEX-A",
    archiveId: "ARCHIVE-A",
    indexType: "synthetic",
    tokenDigest: digestIdentifier("INDEX-TOKEN-A"),
    createdAt: T.consent2,
  });
  store.exportArchive(USER_A, {
    archiveId: "ARCHIVE-A",
    exportJobId: "EXPORT-A",
    exportedAt: T.export,
  });
  const receipt = store.deleteArchive(USER_A, {
    archiveId: "ARCHIVE-A",
    receiptId: "DELETE-A",
    deletedAt: T.delete,
  });
  assert.match(receipt.targetDigest, /^hmac-sha256:/);
  assert.equal(receipt.backupPurgeDueAt, "2026-09-03T08:08:00.000Z");
  assert.throws(
    () => store.readArchive(USER_A, "ARCHIVE-A", T.read),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
  assert.throws(
    () => store.readResearchRecord(RESEARCHER, "RESEARCH-A", T.read),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
  assert.throws(
    () => store.getExportJob(USER_A, "EXPORT-A", T.read),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
  const auditText = JSON.stringify(store.readAuditLog(ADMIN, T.read));
  assert.doesNotMatch(auditText, /TOP-SECRET/);
  assert.doesNotMatch(auditText, /ARCHIVE-A/);
});

test("注销账户联删档案、身份映射和会话，并保留无内容回执", () => {
  const store = setupStore();
  createArchive(store);
  store.linkExternalIdentity(SYS_IDENTITY, {
    identityId: "IDENTITY-A",
    accountId: USER_A.accountId,
    issuer: "https://identity.synthetic",
    subjectDigest: digestIdentifier("subject-A"),
    linkedAt: T.record1,
  });
  store.createAuthSession(SYS_IDENTITY, {
    sessionId: "AUTH-A",
    accountId: USER_A.accountId,
    tokenDigest: digestIdentifier("token-A"),
    createdAt: T.record1,
    expiresAt: "2026-09-03T08:02:00.000Z",
  });
  const receipt = store.deleteAccount(USER_A, {
    accountId: USER_A.accountId,
    receiptId: "DELETE-ACCOUNT-A",
    deletedAt: T.delete,
  });
  assert.equal(receipt.targetType, "account");
  assert.throws(
    () => store.readArchive(USER_A, "ARCHIVE-A", T.read),
    (error: unknown) => error instanceof PrivacyError && error.code === "ACCOUNT_INACTIVE",
  );
  assert.equal(
    store.getDeletionReceipt(ADMIN, "DELETE-ACCOUNT-A", T.read).targetDigest,
    receipt.targetDigest,
  );
  const receiptAfterDeletion = store.getDeletionReceipt(ADMIN, "DELETE-ACCOUNT-A", T.read);
  assert.equal(receiptAfterDeletion.requestedByAccountId, undefined);
  assert.equal(receiptAfterDeletion.requestedByDigest, receipt.targetDigest);
  const auditText = JSON.stringify(store.readAuditLog(ADMIN, T.read));
  assert.doesNotMatch(auditText, /"ACCOUNT-A"/);
  assert.doesNotMatch(auditText, /DELETE-ACCOUNT-A/);
  assert.match(auditText, /deletion_receipt\.read/);
});

test("保存期先通知再等待 30 天，不在首次超期扫描时偷偷删档", () => {
  const store = setupStore();
  createArchive(store);
  const first = store.runRetention(SYS_RETENTION, "2029-08-04T08:01:00.000Z");
  assert.deepEqual(first.scheduledArchiveIds, ["ARCHIVE-A"]);
  assert.equal(store.readArchive(USER_A, "ARCHIVE-A", "2029-08-05T08:01:00.000Z").archive.archiveId, "ARCHIVE-A");
  const cancelledByActivity = store.runRetention(
    SYS_RETENTION,
    "2029-09-03T08:01:00.000Z",
  );
  assert.deepEqual(cancelledByActivity.deletedArchiveDigests, []);
  assert.equal(
    store.readArchive(USER_A, "ARCHIVE-A", "2029-09-03T08:02:00.000Z").archive.archiveId,
    "ARCHIVE-A",
  );

  const untouched = setupStore();
  createArchive(untouched);
  untouched.runRetention(SYS_RETENTION, "2029-08-04T08:01:00.000Z");
  const second = untouched.runRetention(SYS_RETENTION, "2029-09-03T08:01:00.000Z");
  assert.equal(second.deletedArchiveDigests.length, 1);
  assert.throws(
    () => untouched.readArchive(USER_A, "ARCHIVE-A", "2029-09-03T08:02:00.000Z"),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
});

test("未分配的 study 不能靠伪造 principal 读取已授权研究副本", () => {
  const store = setupStore();
  createArchive(store);
  store.recordConsent(USER_A, {
    decisionId: "CONSENT-RESEARCH-GRANT",
    archiveId: "ARCHIVE-A",
    purpose: "anonymous_research",
    action: "grant",
    policyVersion: "research-policy-v1",
    scope: ["study:STUDY-001"],
    occurredAt: T.consent1,
  });
  const record = store.createResearchRecord(RESEARCHER, {
    researchRecordId: "RESEARCH-1",
    archiveId: "ARCHIVE-A",
    subjectDigest: digestIdentifier("SUBJECT-A"),
    payload: { synthetic: true },
    createdAt: T.derived1,
    expiresAt: "2028-08-04T08:04:00.000Z",
  });
  const forged = { ...RESEARCHER, studyId: "STUDY-UNASSIGNED" };
  assert.throws(
    () => store.readResearchRecord(forged, record.researchRecordId, T.consent2),
    (error: unknown) =>
      error instanceof PrivacyError && error.code === "NOT_FOUND_OR_FORBIDDEN",
  );
});

test("运行时也拒绝未受控授权目的和时间倒序", () => {
  const store = setupStore();
  createArchive(store);
  assert.throws(
    () =>
      store.recordConsent(USER_A, {
        decisionId: "CONSENT-INVALID-PURPOSE",
        archiveId: "ARCHIVE-A",
        purpose: "model_training" as never,
        action: "grant",
        policyVersion: "v1",
        scope: ["all"],
        occurredAt: T.consent1,
      }),
    (error: unknown) => error instanceof PrivacyError && error.code === "INVALID_INPUT",
  );
  appendSecret(store);
  assert.throws(
    () =>
      store.appendArchiveRecord(USER_A, {
        archiveId: "ARCHIVE-A",
        recordId: "RECORD-REVERSE-TIME",
        recordType: "workflow_snapshot",
        schemaVersion: "case-workflow.v0",
        sensitivity: "sensitive",
        payload: { synthetic: true },
        createdAt: "2026-08-04T07:59:00.000Z",
      }),
    (error: unknown) => error instanceof PrivacyError && error.code === "INVALID_INPUT",
  );
});

test("D1 schema 含所有者复合约束、密文封装和审计最小字段，不含邮箱姓名", () => {
  const accountColumns = Object.keys(getTableColumns(accounts));
  assert.doesNotMatch(accountColumns.join(" "), /email|name/i);
  const archiveColumns = Object.keys(getTableColumns(userArchives));
  assert.ok(archiveColumns.includes("ownerAccountId"));
  assert.ok(archiveColumns.includes("dataKeyRef"));
  const recordColumns = Object.keys(getTableColumns(archiveRecords));
  assert.ok(recordColumns.includes("ownerAccountId"));
  assert.ok(recordColumns.includes("payloadCiphertext"));
  assert.ok(recordColumns.includes("payloadNonce"));
  assert.ok(recordColumns.includes("payloadAuthTag"));
  assert.ok(recordColumns.includes("keyVersion"));
  assert.ok(Object.keys(getTableColumns(consentDecisions)).includes("policyVersion"));
  assert.ok(Object.keys(getTableColumns(researchRecords)).includes("studyId"));
  const auditColumns = Object.keys(getTableColumns(auditEvents));
  assert.equal(auditColumns.includes("payload"), false);
  assert.equal(auditColumns.includes("userWords"), false);
});
