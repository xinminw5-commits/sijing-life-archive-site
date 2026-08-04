import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const MIGRATION_URL = new URL("../drizzle/0000_sad_thunderball.sql", import.meta.url);

function migratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  const migration = readFileSync(MIGRATION_URL, "utf8").replaceAll(
    "--> statement-breakpoint",
    "",
  );
  db.exec(migration);
  return db;
}

function insertAccount(
  db: DatabaseSync,
  id: string,
  role: "user" | "admin" | "researcher" = "user",
): void {
  db.prepare(
    "INSERT INTO accounts (id, role, status, default_storage_mode, created_at, updated_at) VALUES (?, ?, 'active', 'personal_archive', ?, ?)",
  ).run(id, role, "2026-08-04T08:00:00.000Z", "2026-08-04T08:00:00.000Z");
}

function insertArchive(db: DatabaseSync, id: string, owner: string): void {
  db.prepare(
    "INSERT INTO user_archives (id, owner_account_id, storage_mode, status, data_key_ref, created_at, updated_at, last_activity_at) VALUES (?, ?, 'personal_archive', 'active', ?, ?, ?, ?)",
  ).run(
    id,
    owner,
    `KEY-${id}`,
    "2026-08-04T08:01:00.000Z",
    "2026-08-04T08:01:00.000Z",
    "2026-08-04T08:01:00.000Z",
  );
}

function insertConsent(
  db: DatabaseSync,
  input: {
    id: string;
    archiveId: string;
    owner: string;
    purpose: "service_processing" | "anonymous_research" | "public_display";
    action: "grant" | "withdraw";
    at: string;
    scope?: ReadonlyArray<string>;
  },
): void {
  db.prepare(
    "INSERT INTO consent_decisions (id, archive_id, owner_account_id, purpose, action, policy_version, scope_json, occurred_at) VALUES (?, ?, ?, ?, ?, 'policy-v1', ?, ?)",
  ).run(
    input.id,
    input.archiveId,
    input.owner,
    input.purpose,
    input.action,
    JSON.stringify(input.scope ?? ["synthetic"]),
    input.at,
  );
}

function insertArchiveRecord(db: DatabaseSync, id: string, archiveId: string, owner: string): void {
  db.prepare(
    "INSERT INTO archive_records (id, archive_id, owner_account_id, record_type, schema_version, sensitivity, payload_ciphertext, payload_nonce, payload_auth_tag, key_version, payload_digest, created_at) VALUES (?, ?, ?, 'workflow_snapshot', 'case-workflow.v0', 'highly_sensitive', 'ciphertext', 'nonce', 'tag', 'key-v1', 'digest', '2026-08-04T08:03:00.000Z')",
  ).run(id, archiveId, owner);
}

test("首版 D1 迁移可在 SQLite 完整执行，13 张表和关键触发器均存在", () => {
  const db = migratedDatabase();
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
  assert.equal(tables.length, 13);
  assert.ok(tables.includes("user_archives"));
  assert.ok(tables.includes("audit_events"));
  const triggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name")
    .all()
    .map((row) => (row as { name: string }).name);
  assert.deepEqual(triggers, [
    "archive_records_append_only",
    "archive_records_service_consent_guard",
    "consent_decisions_append_only",
    "public_cases_consent_cleanup",
    "public_cases_consent_guard",
    "research_records_consent_and_assignment_guard",
    "research_records_consent_cleanup",
  ]);
  db.close();
});

test("复合外键在数据库层拒绝把 B 所有者塞进 A 的档案", () => {
  const db = migratedDatabase();
  insertAccount(db, "ACCOUNT-A");
  insertAccount(db, "ACCOUNT-B");
  insertArchive(db, "ARCHIVE-A", "ACCOUNT-A");
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO derived_indexes (id, archive_id, owner_account_id, index_type, token_digest, created_at) VALUES ('INDEX-CROSS', 'ARCHIVE-A', 'ACCOUNT-B', 'synthetic', 'digest', '2026-08-04T08:02:00.000Z')",
        )
        .run(),
    /FOREIGN KEY constraint failed/,
  );
  db.close();
});

test("数据库层强制服务授权、受控枚举和追加不改写", () => {
  const db = migratedDatabase();
  insertAccount(db, "ACCOUNT-A");
  insertArchive(db, "ARCHIVE-A", "ACCOUNT-A");
  assert.throws(
    () => insertArchiveRecord(db, "RECORD-NO-CONSENT", "ARCHIVE-A", "ACCOUNT-A"),
    /active service_processing consent required/,
  );
  insertConsent(db, {
    id: "CONSENT-SERVICE-GRANT",
    archiveId: "ARCHIVE-A",
    owner: "ACCOUNT-A",
    purpose: "service_processing",
    action: "grant",
    at: "2026-08-04T08:02:00.000Z",
    scope: ["study:STUDY-1"],
  });
  insertArchiveRecord(db, "RECORD-VALID", "ARCHIVE-A", "ACCOUNT-A");
  assert.throws(
    () =>
      db
        .prepare("UPDATE archive_records SET schema_version = 'tampered' WHERE id = 'RECORD-VALID'")
        .run(),
    /archive_records are append-only/,
  );
  assert.throws(
    () =>
      db
        .prepare("UPDATE consent_decisions SET action = 'withdraw' WHERE id = 'CONSENT-SERVICE-GRANT'")
        .run(),
    /consent_decisions are append-only/,
  );
  insertConsent(db, {
    id: "CONSENT-SERVICE-WITHDRAW",
    archiveId: "ARCHIVE-A",
    owner: "ACCOUNT-A",
    purpose: "service_processing",
    action: "withdraw",
    at: "2026-08-04T08:04:00.000Z",
    scope: ["study:STUDY-1"],
  });
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM research_records").get() as { count: number }).count,
    0,
  );
  assert.throws(
    () => insertArchiveRecord(db, "RECORD-AFTER-WITHDRAW", "ARCHIVE-A", "ACCOUNT-A"),
    /active service_processing consent required/,
  );
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO audit_events (id, actor_role, action, target_type, target_id, request_id, outcome, occurred_at, purge_at) VALUES ('AUDIT-BAD-ADMIN', 'admin', 'archive.read', 'archive', 'ARCHIVE-A', 'REQ', 'success', '2026-08-04T08:05:00.000Z', '2027-01-31T08:05:00.000Z')",
        )
        .run(),
    /CHECK constraint failed: audit_events_privileged_context_check/,
  );
  db.close();
});

test("数据库层在研究或公开授权范围缩窄时立即清除旧副本", () => {
  const db = migratedDatabase();
  insertAccount(db, "ACCOUNT-A");
  insertAccount(db, "ACCOUNT-R", "researcher");
  insertArchive(db, "ARCHIVE-A", "ACCOUNT-A");
  db.prepare(
    "INSERT INTO research_study_assignments (id, account_id, study_id, assigned_at) VALUES ('ASSIGN-1', 'ACCOUNT-R', 'STUDY-1', '2026-08-04T08:01:30.000Z')",
  ).run();
  insertConsent(db, {
    id: "CONSENT-RESEARCH-GRANT-A",
    archiveId: "ARCHIVE-A",
    owner: "ACCOUNT-A",
    purpose: "anonymous_research",
    action: "grant",
    at: "2026-08-04T08:02:00.000Z",
    scope: ["study:STUDY-1"],
  });
  db.prepare(
    "INSERT INTO research_records (id, archive_id, owner_account_id, consent_decision_id, study_id, subject_digest, payload_ciphertext, payload_nonce, payload_auth_tag, key_version, created_at, expires_at) VALUES ('RESEARCH-1', 'ARCHIVE-A', 'ACCOUNT-A', 'CONSENT-RESEARCH-GRANT-A', 'STUDY-1', 'subject-digest', 'ciphertext', 'nonce', 'tag', 'key-v1', '2026-08-04T08:03:00.000Z', '2028-08-04T08:03:00.000Z')",
  ).run();
  insertConsent(db, {
    id: "CONSENT-RESEARCH-GRANT-B",
    archiveId: "ARCHIVE-A",
    owner: "ACCOUNT-A",
    purpose: "anonymous_research",
    action: "grant",
    at: "2026-08-04T08:04:00.000Z",
    scope: ["study:STUDY-2"],
  });
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM research_records").get() as { count: number }).count,
    0,
  );

  insertConsent(db, {
    id: "CONSENT-PUBLIC-GRANT-A",
    archiveId: "ARCHIVE-A",
    owner: "ACCOUNT-A",
    purpose: "public_display",
    action: "grant",
    at: "2026-08-04T08:05:00.000Z",
    scope: ["public_case"],
  });
  db.prepare(
    "INSERT INTO public_cases (id, archive_id, owner_account_id, consent_decision_id, status, redaction_version, reviewer_id, payload_ciphertext, payload_nonce, payload_auth_tag, key_version, created_at) VALUES ('PUBLIC-1', 'ARCHIVE-A', 'ACCOUNT-A', 'CONSENT-PUBLIC-GRANT-A', 'draft', 'redaction-v1', 'reviewer-1', 'ciphertext', 'nonce', 'tag', 'key-v1', '2026-08-04T08:06:00.000Z')",
  ).run();
  insertConsent(db, {
    id: "CONSENT-PUBLIC-GRANT-B",
    archiveId: "ARCHIVE-A",
    owner: "ACCOUNT-A",
    purpose: "public_display",
    action: "grant",
    at: "2026-08-04T08:07:00.000Z",
    scope: ["private_review"],
  });
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM public_cases").get() as { count: number }).count,
    0,
  );
  db.close();
});

test("研究副本必须同时具备当前研究授权和 study 分配，撤回后不能继续插入", () => {
  const db = migratedDatabase();
  insertAccount(db, "ACCOUNT-A");
  insertAccount(db, "ACCOUNT-R", "researcher");
  insertArchive(db, "ARCHIVE-A", "ACCOUNT-A");
  insertConsent(db, {
    id: "CONSENT-RESEARCH-GRANT",
    archiveId: "ARCHIVE-A",
    owner: "ACCOUNT-A",
    purpose: "anonymous_research",
    action: "grant",
    at: "2026-08-04T08:02:00.000Z",
  });
  const insertResearch = (id: string) =>
    db
      .prepare(
        "INSERT INTO research_records (id, archive_id, owner_account_id, consent_decision_id, study_id, subject_digest, payload_ciphertext, payload_nonce, payload_auth_tag, key_version, created_at, expires_at) VALUES (?, 'ARCHIVE-A', 'ACCOUNT-A', 'CONSENT-RESEARCH-GRANT', 'STUDY-1', 'subject-digest', 'ciphertext', 'nonce', 'tag', 'key-v1', '2026-08-04T08:03:00.000Z', '2028-08-04T08:03:00.000Z')",
      )
      .run(id);
  assert.throws(() => insertResearch("RESEARCH-NO-ASSIGNMENT"), /study assignment required/);
  db.prepare(
    "INSERT INTO research_study_assignments (id, account_id, study_id, assigned_at) VALUES ('ASSIGN-1', 'ACCOUNT-R', 'STUDY-1', '2026-08-04T08:02:30.000Z')",
  ).run();
  insertResearch("RESEARCH-VALID");
  insertConsent(db, {
    id: "CONSENT-RESEARCH-WITHDRAW",
    archiveId: "ARCHIVE-A",
    owner: "ACCOUNT-A",
    purpose: "anonymous_research",
    action: "withdraw",
    at: "2026-08-04T08:04:00.000Z",
  });
  assert.throws(() => insertResearch("RESEARCH-AFTER-WITHDRAW"), /research consent/);
  db.close();
});

test("删除档案时 SQLite 外键联删记录与授权，不留孤儿", () => {
  const db = migratedDatabase();
  insertAccount(db, "ACCOUNT-A");
  insertArchive(db, "ARCHIVE-A", "ACCOUNT-A");
  insertConsent(db, {
    id: "CONSENT-SERVICE-GRANT",
    archiveId: "ARCHIVE-A",
    owner: "ACCOUNT-A",
    purpose: "service_processing",
    action: "grant",
    at: "2026-08-04T08:02:00.000Z",
  });
  insertArchiveRecord(db, "RECORD-VALID", "ARCHIVE-A", "ACCOUNT-A");
  db.prepare("DELETE FROM user_archives WHERE id = 'ARCHIVE-A'").run();
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM archive_records").get() as { count: number }).count,
    0,
  );
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS count FROM consent_decisions").get() as { count: number }).count,
    0,
  );
  db.close();
});
