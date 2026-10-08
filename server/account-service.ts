import { calculateDeterministicChart } from "../domain/chart/index.ts";
import { consultationContext, CONSULTATION_INSTRUCTIONS, parseReading, readingText } from "./consultation-context.ts";
import { translatePlain, translationTitles } from "./plain-translation.ts";
import type { ConversationMessage, Reading, Translation } from "../lib/consultation.ts";

export interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
}
export interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown[]> }
export type Env = {
  DB?: Database; ACCOUNT_SECRET?: string; ARCHIVE_KEY?: string; RESEND_API_KEY?: string; MAIL_FROM?: string;
  DEEPSEEK_API_KEY?: string; DEEPSEEK_MODEL?: string; ACCOUNT_ENABLED?: string;
};
export type Dependencies = { sendMail?: (email: string, code: string) => Promise<void>; reply?: (context: unknown, question: string) => Promise<string | Reading>; translate?: (source: string, title: string) => Promise<Translation>; now?: () => number };
type User = { id: string; role: string };
type RecordRow = { id: string; archive_id: string; owner_account_id: string; payload_ciphertext: string; payload_nonce: string; payload_auth_tag: string; created_at: string; record_type: string };
type Archive = { id: string; data_key_ref: string };
export type Birth = { callName: string; date: string; time: string; place: string; gender: string; calendar: string; focus: string; context: string; consent: boolean };
type Snapshot = { birth: Birth; chart: unknown; report: string; messages: ConversationMessage[]; translations?: Record<string, Translation> };
const COOKIE = "__Host-sijing";
const encoder = new TextEncoder();
const id = () => crypto.randomUUID();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
class Fault extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
function fail(status: number, message: string): never { throw new Fault(status, message); }
const json = (value: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
export async function digest(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(text))));
}
async function aes(raw: Uint8Array, usage: KeyUsage[]) { return crypto.subtle.importKey("raw", new Uint8Array(raw).buffer, "AES-GCM", false, usage); }
export async function seal(rawKey: Uint8Array, value: unknown, aad: string) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: encoder.encode(aad) }, await aes(rawKey, ["encrypt"]), encoder.encode(JSON.stringify(value))));
  return { cipher: b64(encrypted.slice(0, -16)), nonce: b64(nonce), tag: b64(encrypted.slice(-16)) };
}
export async function unseal(rawKey: Uint8Array, value: { cipher: string; nonce: string; tag: string }, aad: string): Promise<unknown> {
  const encrypted = new Uint8Array([...bytes(value.cipher), ...bytes(value.tag)]);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(value.nonce), additionalData: encoder.encode(aad) }, await aes(rawKey, ["decrypt"]), encrypted)));
}
async function boundedBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json")) fail(415, "请使用网页提交资料");
  const reader = request.body?.getReader(); if (!reader) fail(400, "提交内容为空");
  let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > 100_000) { await reader.cancel(); fail(413, "提交资料过长"); } chunks.push(item.value); }
  const combined = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  try { const body = JSON.parse(new TextDecoder().decode(combined)); if (!body || Array.isArray(body) || typeof body !== "object") fail(400, "提交格式不正确"); return body; } catch { fail(400, "提交格式不正确"); }
}
function string(value: unknown, max: number, required = true) { if (typeof value !== "string" || value.length > max || (required && !value.trim())) fail(400, "资料不完整或内容过长"); return value.trim(); }
function emailOf(value: unknown) { const email = string(value, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "请填写有效邮箱"); return email; }
function profileOf(value: unknown): Birth {
  if (!value || typeof value !== "object") fail(400, "请补全出生资料");
  const p = value as Record<string, unknown>;
  if (p.consent !== true) fail(400, "请先同意保存和处理档案");
  const birth = { callName: string(p.callName, 60), date: string(p.date, 10), time: string(p.time, 5), place: string(p.place, 120), gender: string(p.gender, 1), calendar: string(p.calendar, 2), focus: string(p.focus, 200, false), context: string(p.context, 6000, false), consent: true };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth.date) || !/^\d{2}:\d{2}$/.test(birth.time) || !["男", "女"].includes(birth.gender) || !["公历", "农历"].includes(birth.calendar)) fail(400, "请核对出生日期、时间、历法和性别");
  return birth;
}
function chartOf(birth: Birth) {
  const [year, month, day] = birth.date.split("-").map(Number); const [hour, minute] = birth.time.split(":").map(Number);
  try { return calculateDeterministicChart({ calendar: birth.calendar === "公历" ? "gregorian" : "chinese_lunar", date: { year, month, day }, time: { hour, minute }, timeZone: "Asia/Shanghai", clockStandard: "china_standard_time", calculationTimeBasis: "china_standard_time", dayBoundary: "zi_hour_starts_next_day", gender: birth.gender === "女" ? "woman" : "man", birthPlace: { city: birth.place }, source: { timeSource: "S1", timePrecision: "P2", calendarConfirmed: true } }); } catch { fail(400, "这组出生资料无法排盘，请核对后重试"); }
}

export async function accountRequest(request: Request, env: Env, deps: Dependencies = {}): Promise<Response> {
  const now = deps.now?.() ?? Date.now(); const at = new Date(now).toISOString();
  const path = new URL(request.url).pathname.replace(/^\/api\/account\/?/, "").replace(/\/$/, "");
  const loginOnly = env.ACCOUNT_ENABLED === "login-only";
  const ready = !!(env.DB && env.ACCOUNT_SECRET && env.ARCHIVE_KEY && env.RESEND_API_KEY && env.MAIL_FROM && (env.ACCOUNT_ENABLED === "true" || loginOnly));
  if (path === "status" && request.method === "GET") return json({ available: ready, storageAvailable: ready && !loginOnly });
  if (!ready) return json({ error: "邮箱登录尚未开放，当前仍可生成本次档案。" }, 503);
  const db = env.DB!; const secret = env.ACCOUNT_SECRET!; const master = bytes(env.ARCHIVE_KEY!);
  const sql = (query: string, ...values: (string | number | null)[]) => db.prepare(query).bind(...values);
  const hash = (text: string) => digest(secret, text);
  const cookie = (token: string, maxAge = 30 * 86400) => `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
  async function principal(): Promise<User> {
    const token = request.headers.get("Cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!token || token.length > 100) fail(401, "请先登录，再继续保存或追问");
    const user = await sql("SELECT a.id, a.role FROM auth_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_digest=? AND s.expires_at>? AND a.status='active'", await hash(`session:${token}`), at).first<User>();
    if (!user) fail(401, "登录已过期，请重新登录"); return user;
  }
  async function loadArchive(user: User) { return sql("SELECT id,data_key_ref FROM user_archives WHERE owner_account_id=? AND status='active'", user.id).first<Archive>(); }
  async function keyOf(archive: Archive, user: User) { return bytes(await unseal(master, JSON.parse(archive.data_key_ref), `key:${user.id}:${archive.id}`) as string); }
  async function loadSnapshot(user: User, archive: Archive): Promise<Snapshot | null> {
    const row = await sql("SELECT * FROM archive_records WHERE owner_account_id=? AND archive_id=? ORDER BY rowid DESC LIMIT 1", user.id, archive.id).first<RecordRow>();
    if (!row) return null;
    return await unseal(await keyOf(archive, user), { cipher: row.payload_ciphertext, nonce: row.payload_nonce, tag: row.payload_auth_tag }, `${user.id}:${archive.id}:${row.id}`) as Snapshot;
  }
  async function record(user: User, archive: Archive, snapshot: Snapshot, recordId: string, type: string, lockToken: string) {
    const encrypted = await seal(await keyOf(archive, user), snapshot, `${user.id}:${archive.id}:${recordId}`);
    return sql("INSERT INTO archive_records(id,archive_id,owner_account_id,record_type,schema_version,sensitivity,payload_ciphertext,payload_nonce,payload_auth_tag,key_version,payload_digest,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM account_usage WHERE account_id=? AND lock_token=? AND lock_until>?)", recordId, archive.id, user.id, type, "service.v1", "highly_sensitive", encrypted.cipher, encrypted.nonce, encrypted.tag, "v1", await hash(JSON.stringify(snapshot)), at, user.id, lockToken, now);
  }
  async function lock(user: User) {
    const token = id(); const changed = await sql("UPDATE account_usage SET lock_token=?,lock_until=? WHERE account_id=? AND lock_until<=?", token, now + 120_000, user.id, now).run();
    if (!changed.meta.changes) fail(409, "上一条请求正在处理，请稍候再试"); return token;
  }
  const unlock = (user: User, token: string) => sql("UPDATE account_usage SET lock_token=NULL,lock_until=0 WHERE account_id=? AND lock_token=?", user.id, token).run();
  async function audit(user: User, action: string, target: string, reason: string | null = null, ticket: string | null = null) {
    return sql("INSERT INTO audit_events(id,actor_account_id,actor_role,action,target_type,target_id,reason_code,ticket_id,request_id,outcome,occurred_at,purge_at) VALUES(?,?,?,?,?,?,?,?,?,'success',?,?)", id(), user.id, user.role, action, "archive", target, reason, ticket, id(), at, new Date(now + 90 * 86400000).toISOString()).run();
  }
  try {
    if (request.method !== "GET" && request.headers.get("Origin") !== new URL(request.url).origin) fail(403, "请从本站页面提交请求");
    if (loginOnly && !["send", "verify", "me", "logout"].includes(path)) fail(503, "邮箱已接通，档案保存和讨论正在准备。当前不会保存出生资料。");
    if (path === "send" && request.method === "POST") {
      const body = await boundedBody(request); const email = emailOf(body.email); const emailDigest = await hash(`email:${email}`);
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      await sql("DELETE FROM login_limits WHERE expires_at<?", now).run();
      for (const [scope, limit, span] of [[`email:${emailDigest}`, 1, 60_000], [`hour:${emailDigest}`, 6, 3600_000], [`ip:${ip}`, 20, 3600_000]] as const) {
        const bucket = await hash(`rate:${scope}:${Math.floor(now / span)}`);
        const row = await sql("INSERT INTO login_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits", bucket, now + 2 * span).first<{ hits: number }>();
        if (!row || row.hits > limit) fail(429, "验证码发送过于频繁，请稍后再试");
      }
      // Rejection sampling avoids modulo bias in the six-digit OTP.
      let n: number; do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= 4294000000);
      const code = String(n % 1000000).padStart(6, "0"); const challenge = id();
      await sql("INSERT INTO login_codes(email_digest,code_digest,expires_at,attempts,used,ready,challenge) VALUES(?,?,?,0,0,0,?) ON CONFLICT(email_digest) DO UPDATE SET code_digest=excluded.code_digest,expires_at=excluded.expires_at,attempts=0,used=0,ready=0,challenge=excluded.challenge", emailDigest, await hash(`otp:${emailDigest}:${code}`), now + 600_000, challenge).run();
      try {
        if (deps.sendMail) await deps.sendMail(email, code);
        else {
          const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": challenge }, body: JSON.stringify({ from: env.MAIL_FROM, to: [email], subject: "四境人生档案 · 登录验证码", text: `你的登录验证码是 ${code}，10分钟内有效。如非本人操作，请忽略。` }), signal: AbortSignal.timeout(15_000) });
          if (!response.ok) throw new Error("mail failed");
        }
      } catch { await sql("DELETE FROM login_codes WHERE email_digest=? AND challenge=?", emailDigest, challenge).run(); fail(502, "邮件暂时未能发出，请稍后重试"); }
      await sql("UPDATE login_codes SET ready=1 WHERE email_digest=? AND challenge=?", emailDigest, challenge).run();
      return json({ sent: true });
    }
    if (path === "verify" && request.method === "POST") {
      const body = await boundedBody(request); const emailDigest = await hash(`email:${emailOf(body.email)}`); const code = string(body.code, 6);
      const action = body.action;
      if (action !== "register" && action !== "login") fail(400, "请选择注册或登录");
      const displayName = action === "register" ? string(body.displayName, 40) : "";
      if (action === "register" && body.registrationConsent !== true) fail(400, "请确认创建个人账户");
      if (!/^\d{6}$/.test(code)) fail(400, "请填写六位验证码");
      const row = await sql("UPDATE login_codes SET attempts=attempts+1,used=CASE WHEN code_digest=? THEN 1 ELSE used END WHERE email_digest=? AND expires_at>? AND attempts<5 AND used=0 AND ready=1 RETURNING used", await hash(`otp:${emailDigest}:${code}`), emailDigest, now).first<{ used: number }>();
      if (!row?.used) fail(400, "验证码错误或已失效，请重新获取");
      const accountId = await hash(`account:${emailDigest}`);
      const existing = await sql("SELECT id,status FROM accounts WHERE id=?", accountId).first<{ id: string; status: string }>();
      if (existing?.status !== undefined && existing.status !== "active") fail(403, "此账户已注销，不能继续登录");
      if (action === "login" && !existing) fail(404, "这个邮箱还没有个人账户，请先注册并重新获取验证码");
      if (action === "register" && existing) fail(409, "这个邮箱已经注册，请切换登录并重新获取验证码");
      const encryptedProfile = action === "register" ? JSON.stringify(await seal(master, { displayName }, `profile:${accountId}`)) : null;
      const token = b64(crypto.getRandomValues(new Uint8Array(32)));
      await db.batch([
        sql("INSERT OR IGNORE INTO accounts(id,role,status,default_storage_mode,created_at,updated_at) VALUES(?,'user','active','personal_archive',?,?)", accountId, at, at),
        sql("INSERT OR IGNORE INTO external_identities(id,account_id,issuer,subject_digest,linked_at) VALUES(?,?,'sijing-email-otp',?,?)", id(), accountId, emailDigest, at),
        ...(action === "register" ? [sql("UPDATE accounts SET profile_ciphertext=? WHERE id=? AND profile_ciphertext IS NULL", encryptedProfile, accountId)] : []),
        sql("INSERT OR IGNORE INTO account_usage(account_id) VALUES(?)", accountId),
        sql("INSERT INTO auth_sessions(id,account_id,token_digest,created_at,expires_at) VALUES(?,?,?,?,?)", id(), accountId, await hash(`session:${token}`), at, new Date(now + 30 * 86400000).toISOString()),
        sql("DELETE FROM auth_sessions WHERE expires_at<=?", at),
        sql("DELETE FROM login_codes WHERE expires_at<=?", now),
      ]);
      return json({ signedIn: true, registered: action === "register" }, 200, { "Set-Cookie": cookie(token) });
    }
    const user = await principal();
    if (path === "logout" && request.method === "POST") {
      const token = request.headers.get("Cookie")!.split(";").map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))!.slice(COOKIE.length + 1);
      await sql("DELETE FROM auth_sessions WHERE token_digest=?", await hash(`session:${token}`)).run(); return json({ signedIn: false }, 200, { "Set-Cookie": cookie("", 0) });
    }
    if (path === "me" && request.method === "GET") {
      const profile = await sql("SELECT profile_ciphertext FROM accounts WHERE id=?", user.id).first<{ profile_ciphertext: string | null }>();
      const account = profile?.profile_ciphertext ? await unseal(master, JSON.parse(profile.profile_ciphertext), `profile:${user.id}`) : { displayName: "我的账户" };
      if (loginOnly) return json({ signedIn: true, role: user.role, account, snapshot: null, remaining: 3, storageAvailable: false });
      const archive = await loadArchive(user); const snapshot = archive ? await loadSnapshot(user, archive) : null;
      const usage = await sql("SELECT answers FROM account_usage WHERE account_id=?", user.id).first<{ answers: number }>();
      const discussion = archive ? await sql("SELECT id,created_at FROM archive_records WHERE archive_id=? AND owner_account_id=? AND record_type='consultation' ORDER BY rowid DESC LIMIT 1", archive.id, user.id).first<{ id: string; created_at: string }>() : null;
      return json({ signedIn: true, role: user.role, account, snapshot, latestDiscussion: discussion ? { id: discussion.id, at: discussion.created_at } : null, remaining: Math.max(0, 3 - (usage?.answers ?? 0)), storageAvailable: true });
    }
    if (path === "history" && request.method === "GET") {
      const archive = await loadArchive(user); if (!archive) { if (new URL(request.url).searchParams.has("id")) fail(404, "这条历史记录不存在"); return json({ items: [], nextCursor: null }); }
      const params = new URL(request.url).searchParams; const recordId = params.get("id"); const cursor = params.get("cursor");
      const kind = params.get("kind") || "all";
      if (!["all", "chart", "consultation"].includes(kind)) fail(400, "历史记录类型无效");
      const key = await keyOf(archive, user);
      const decode = (row: RecordRow) => unseal(key, { cipher: row.payload_ciphertext, nonce: row.payload_nonce, tag: row.payload_auth_tag }, `${user.id}:${archive.id}:${row.id}`) as Promise<Snapshot>;
      if (recordId) {
        const row = await sql("SELECT * FROM archive_records WHERE id=? AND archive_id=? AND owner_account_id=?", string(recordId, 100), archive.id, user.id).first<RecordRow>();
        if (!row) fail(404, "这条历史记录不存在");
        return json({ id: row.id, type: row.record_type, at: row.created_at, snapshot: await decode(row) });
      }
      let before = Number.MAX_SAFE_INTEGER;
      if (cursor) {
        const row = await sql("SELECT rowid AS sequence FROM archive_records WHERE id=? AND archive_id=? AND owner_account_id=?", string(cursor, 100), archive.id, user.id).first<{ sequence: number }>();
        if (!row) fail(400, "历史记录位置无效"); before = row.sequence;
      }
      const rows = (await sql("SELECT * FROM archive_records WHERE archive_id=? AND owner_account_id=? AND rowid<? AND (?='all' OR record_type=?) ORDER BY rowid DESC LIMIT 21", archive.id, user.id, before, kind, kind).all<RecordRow>()).results;
      const page = rows.slice(0, 20);
      const items = await Promise.all(page.map(async row => { const snap = await decode(row); return { id: row.id, at: row.created_at, type: row.record_type, callName: snap.birth.callName, focus: snap.birth.focus, messages: snap.messages.length, lastQuestion: snap.messages.at(-1)?.question ?? "" }; }));
      return json({ items, nextCursor: rows.length > 20 ? page.at(-1)!.id : null });
    }
    if (path === "save" && request.method === "POST") {
      const body = await boundedBody(request); const birth = profileOf(body.birth); const chart = chartOf(birth); const report = string(body.report ?? "", 30000, false);
      const token = await lock(user);
      try {
        let archive = await loadArchive(user);
        if (!archive) {
          const archiveId = id(); const wrapped = await seal(master, b64(crypto.getRandomValues(new Uint8Array(32))), `key:${user.id}:${archiveId}`);
          archive = { id: archiveId, data_key_ref: JSON.stringify(wrapped) };
          await db.batch([
            sql("INSERT INTO user_archives(id,owner_account_id,storage_mode,status,data_key_ref,created_at,updated_at,last_activity_at) VALUES(?,?,'personal_archive','active',?,?,?,?)", archive.id, user.id, archive.data_key_ref, at, at, at),
            sql("INSERT INTO consent_decisions(id,archive_id,owner_account_id,purpose,action,policy_version,scope_json,occurred_at) VALUES(?, ?,?,'service_processing','grant','service.v1','[\"profile\",\"report\",\"chat\",\"administrator_review\"]',?)", id(), archive.id, user.id, at),
          ]);
        }
        const prior = await loadSnapshot(user, archive);
        if (prior && JSON.stringify(prior.birth) === JSON.stringify(birth) && prior.report === report) return json({ saved: true });
        const sameBirth = prior && ["date", "time", "place", "calendar", "gender"].every(field => prior.birth[field as keyof Birth] === birth[field as keyof Birth]);
        const snapshot = { birth, chart, report, messages: sameBirth ? prior.messages : [], ...(prior?.report === report && prior.translations ? { translations: prior.translations } : {}) };
        await (await record(user, archive, snapshot, id(), "chart", token)).run(); await audit(user, "save", archive.id);
        return json({ saved: true });
      } finally { await unlock(user, token); }
    }
    if (path === "translate" && request.method === "POST") {
      const body = await boundedBody(request); const title = string(body.title, 50); const source = string(body.source, 12000);
      if (!translationTitles.includes(title)) fail(400, "译注栏目无效");
      const token = await lock(user);
      try {
        const archive = await loadArchive(user); const snapshot = archive ? await loadSnapshot(user, archive) : null;
        if (!archive || !snapshot || !snapshot.report.includes(source)) fail(409, "报告已发生变化，请重新打开当前段落的译注");
        const cached = snapshot.translations?.[title];
        if (cached?.source === source && cached.version === "plain.v2") return json({ translation: cached, saved: true });
        let translation: Translation;
        try { translation = deps.translate ? await deps.translate(source, title) : await translatePlain(source, title, env); } catch { fail(502, "白话译注暂未生成，没有使用追问次数，请稍后重试"); }
        await (await record(user, archive, { ...snapshot, translations: { ...snapshot.translations, [title]: translation } }, id(), "chart", token)).run();
        return json({ translation, saved: true });
      } finally { await unlock(user, token); }
    }
    if (path === "chat" && request.method === "POST") {
      const body = await boundedBody(request); const question = string(body.question, 2000); const requestId = string(body.requestId, 36);
      if (!/^[a-f0-9-]{36}$/.test(requestId)) fail(400, "请求标识无效，请重新发送");
      const questionDigest = await hash(question);
      const receipt = await sql("SELECT question_digest,record_id FROM chat_receipts WHERE account_id=? AND request_id=?", user.id, requestId).first<{ question_digest: string; record_id: string }>();
      if (receipt) {
        if (receipt.question_digest !== questionDigest) fail(409, "请勿重复使用请求标识");
        const archive = await loadArchive(user);
        const row = archive ? await sql("SELECT * FROM archive_records WHERE id=? AND owner_account_id=? AND archive_id=?", receipt.record_id, user.id, archive.id).first<RecordRow>() : null;
        if (!archive || !row) fail(404, "这条问答已随档案删除");
        const snap = await unseal(await keyOf(archive, user), { cipher: row.payload_ciphertext, nonce: row.payload_nonce, tag: row.payload_auth_tag }, `${user.id}:${archive.id}:${row.id}`) as Snapshot;
        const usage = await sql("SELECT answers FROM account_usage WHERE account_id=?", user.id).first<{ answers: number }>();
        return json({ replayed: true, saved: true, message: snap.messages.at(-1), remaining: Math.max(0, 3 - (usage?.answers ?? 0)) });
      }
      const token = await lock(user);
      try {
        const usage = await sql("SELECT answers FROM account_usage WHERE account_id=?", user.id).first<{ answers: number }>();
        if ((usage?.answers ?? 0) >= 3) fail(402, "本次免费讨论已完成，档案和对话仍可查看。后续专题服务尚未开放。");
        const archive = await loadArchive(user); const snapshot = archive ? await loadSnapshot(user, archive) : null;
        if (!archive || !snapshot) fail(400, "请先保存完整档案，再继续追问");
        const final = usage?.answers === 2;
        const context = consultationContext(snapshot, chartOf(snapshot.birth), question, now);
        let answer: string; let reading: Reading | undefined;
        try {
          if (deps.reply) {
            const result = await deps.reply(context, question);
            if (typeof result === "string") answer = result;
            else { reading = result; answer = readingText(result); }
          } else {
            if (!env.DEEPSEEK_API_KEY) fail(503, "解答服务暂未开放");
            const response = await fetch("https://api.deepseek.com/responses", { method: "POST", headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.DEEPSEEK_MODEL || "deepseek-flash", instructions: CONSULTATION_INSTRUCTIONS + (final ? "这是第三条回答：仍完整回答本题，在nextSteps中归纳已澄清的关键点与尚需核验的问题，不留半个答案催促付费。" : ""), input: JSON.stringify(context), reasoning: { effort: "none" }, temperature: .25, max_output_tokens: 2800 }), signal: AbortSignal.timeout(90_000) });
            if (!response.ok) throw new Error("reply failed");
            const payload = await response.json() as { output_text?: string; output?: { content?: { text?: string }[] }[] };
            const raw = payload.output_text || payload.output?.flatMap(x => x.content ?? []).map(x => x.text ?? "").join("\n") || "";
            reading = parseReading(raw, context); answer = readingText(reading);
          }
          if (!answer.trim() || answer.length > 30000) throw new Error("empty reply");
        } catch (error) { if (error instanceof Fault) throw error; fail(502, "这次回答未完整生成或缺少具体依据，没有扣除次数，请重试"); }
        const latestNow = deps.now?.() ?? Date.now();
        const held = await sql("SELECT account_id FROM account_usage WHERE account_id=? AND lock_token=? AND lock_until>?", user.id, token, latestNow).first();
        if (!held) fail(409, "请求已超时，没有扣除次数，请重试");
        const message: ConversationMessage = { question, answer, ...(reading ? { reading } : {}), savedAt: new Date(latestNow).toISOString() };
        const next = { ...snapshot, messages: [...snapshot.messages, message] }; const recordId = id();
        await db.batch([
          await record(user, archive, next, recordId, "consultation", token),
          sql("INSERT INTO chat_receipts(account_id,request_id,question_digest,record_id) VALUES(?,?,?,?)", user.id, requestId, questionDigest, recordId),
          sql("UPDATE account_usage SET answers=answers+1 WHERE account_id=? AND lock_token=? AND answers<3", user.id, token),
        ]);
        return json({ answer, message, saved: true, remaining: 2 - (usage?.answers ?? 0) });
      } finally { await unlock(user, token); }
    }
    if (path === "export" && request.method === "GET") {
      const archive = await loadArchive(user); if (!archive) fail(404, "尚无保存的档案");
      await audit(user, "export", archive.id);
      const rows = await sql("SELECT * FROM archive_records WHERE archive_id=? AND owner_account_id=? ORDER BY rowid", archive.id, user.id).all<RecordRow>(); const key = await keyOf(archive, user);
      const versions = await Promise.all(rows.results.map(async row => ({ at: row.created_at, type: row.record_type, data: await unseal(key, { cipher: row.payload_ciphertext, nonce: row.payload_nonce, tag: row.payload_auth_tag }, `${user.id}:${archive.id}:${row.id}`) })));
      return json({ versions }, 200, { "Content-Disposition": 'attachment; filename="sijing-archive.json"' });
    }
    if (path === "delete" && request.method === "POST") {
      const body = await boundedBody(request); if (body.confirm !== "删除档案") fail(400, "请确认删除档案");
      const token = await lock(user);
      try {
        const archive = await loadArchive(user); if (archive) {
          const targetDigest = await hash(`deleted:${archive.id}`);
          await db.batch([
            sql("UPDATE audit_events SET target_digest=?,target_id=NULL WHERE target_id=?", targetDigest, archive.id),
            sql("INSERT INTO deletion_jobs(id,requester_account_id,target_type,target_digest,status,requested_at,completed_at,backup_purge_due_at) VALUES(?,?,'archive',?,'completed',?,?,?)", id(), user.id, targetDigest, at, at, new Date(now + 30 * 86400000).toISOString()),
            sql("DELETE FROM user_archives WHERE id=? AND owner_account_id=?", archive.id, user.id),
          ]);
        }
        return json({ deleted: true, note: "在线档案已删除；服务商历史备份按其保留窗口到期清理。" });
      } finally { await unlock(user, token); }
    }
    if (path === "admin" && request.method === "POST") {
      if (user.role !== "admin") fail(403, "没有查看权限");
      const body = await boundedBody(request); const reason = string(body.reason, 40); const ticket = string(body.ticket, 80);
      if (!["user_support", "user_export_request"].includes(reason)) fail(400, "请选择有效查看用途");
      if (!body.accountId) {
        await audit(user, "list", "archive-list", reason, ticket);
        return json(await sql("SELECT a.id,a.created_at,a.updated_at,u.answers FROM accounts a LEFT JOIN account_usage u ON u.account_id=a.id JOIN user_archives ar ON ar.owner_account_id=a.id WHERE a.status='active' ORDER BY a.created_at DESC LIMIT 100").all());
      }
      const owner: User = { id: string(body.accountId, 100), role: "user" }; const archive = await loadArchive(owner); if (!archive) fail(404, "档案不可用");
      await audit(user, "review", archive.id, reason, ticket);
      return json({ snapshot: await loadSnapshot(owner, archive) });
    }
    return json({ error: "接口不存在" }, 404);
  } catch (error) {
    if (error instanceof Fault) return json({ error: error.message }, error.status);
    return json({ error: "服务暂时不可用，请稍后再试" }, 500);
  }
}
