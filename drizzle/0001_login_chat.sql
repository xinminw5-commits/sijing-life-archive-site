CREATE TABLE login_codes (
 email_digest TEXT PRIMARY KEY, code_digest TEXT NOT NULL, expires_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, used INTEGER NOT NULL DEFAULT 0, ready INTEGER NOT NULL DEFAULT 0,
 challenge TEXT NOT NULL
);
CREATE TABLE login_limits (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL);
CREATE TABLE account_usage (
 account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 answers INTEGER NOT NULL DEFAULT 0 CHECK(answers BETWEEN 0 AND 3),
 lock_token TEXT, lock_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE chat_receipts (
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL, question_digest TEXT NOT NULL, record_id TEXT NOT NULL REFERENCES archive_records(id) ON DELETE CASCADE,
 PRIMARY KEY(account_id, request_id)
);
CREATE UNIQUE INDEX one_service_archive ON user_archives(owner_account_id);
