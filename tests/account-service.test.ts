import type { ConsultationContext } from "../server/consultation-context.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import test from "node:test";
import { accountRequest, seal, unseal, type Database, type Statement, type Env } from "../server/account-service.ts";

function fixture() {
  const sqlite = new DatabaseSync(":memory:"); sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec(readFileSync(new URL("../drizzle/0000_sad_thunderball.sql", import.meta.url), "utf8").replaceAll("--> statement-breakpoint", ""));
  sqlite.exec(readFileSync(new URL("../drizzle/0001_login_chat.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0002_login_limit_retention.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../drizzle/0003_account_profile.sql", import.meta.url), "utf8"));
  class Query implements Statement {
    query: string; values: SQLInputValue[] = []; constructor(query: string) { this.query = query; }
    bind(...values: (string | number | null)[]) { this.values = values; return this; }
    async first<T>() { return (sqlite.prepare(this.query).get(...this.values) as T) ?? null; }
    async all<T>() { return { results: sqlite.prepare(this.query).all(...this.values) as T[] }; }
    async run() { return { meta: { changes: Number(sqlite.prepare(this.query).run(...this.values).changes) } }; }
  }
  const db: Database = { prepare: q => new Query(q), batch: async statements => { sqlite.exec("BEGIN"); try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec("COMMIT"); return results; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
  const env: Env = { DB: db, ACCOUNT_SECRET: "synthetic-hmac-secret-not-production", ARCHIVE_KEY: btoa("x".repeat(32)), RESEND_API_KEY: "synthetic-mail-key", MAIL_FROM: "test@example.com", ACCOUNT_ENABLED: "true" };
  let time = Date.now(); const codes = new Map<string, string>();
  const deps = { now: () => time, sendMail: async (email: string, code: string) => { codes.set(email, code); }, reply: async () => "合成回答：请对照具体项目核验，不作确定性判断。" };
  function request(path: string, body?: unknown, cookie = "", origin = "https://test.example") { if (path === "verify" && body && typeof body === "object") body = { action: "register", displayName: "Synthetic account", registrationConsent: true, ...body }; return new Request(`https://test.example/api/account/${path}`, { method: body === undefined ? "GET" : "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie, "CF-Connecting-IP": "192.0.2.1" }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  async function call(path: string, body?: unknown, cookie = "") { return accountRequest(request(path, body, cookie), env, deps); }
  async function login(email: string) { time += 61000; assert.equal((await call("send", { email })).status, 200); const verified = await call("verify", { email, code: codes.get(email) }); assert.equal(verified.status, 200); return verified.headers.get("set-cookie")!.split(";")[0]; }
  return { sqlite, env, deps, request, call, codes, login, advance: (ms: number) => { time += ms; } };
}
const birth = { callName: "Synthetic", date: "1992-06-15", time: "09:30", place: "杭州", gender: "女", calendar: "公历", focus: "事业", context: "合成项目经历", consent: true };
test("deployment gate never sends mail or accepts records without configuration", async () => {
  const f = fixture(); const response = await accountRequest(f.request("send", { email: "a@example.com" }), { ...f.env, ACCOUNT_ENABLED: "false" }, f.deps);
  assert.equal(response.status, 503); assert.equal(f.codes.size, 0);
});
test("OTP is single-use and sessions use HttpOnly Secure SameSite cookies", async () => {
  const f = fixture(); await f.call("send", { email: "a@example.com" });
  const response = await f.call("verify", { email: "a@example.com", code: f.codes.get("a@example.com") });
  assert.match(response.headers.get("set-cookie")!, /HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await f.call("verify", { email: "a@example.com", code: f.codes.get("a@example.com") })).status, 400);
});
test("five wrong attempts exhaust a code; expired codes are rejected", async () => {
  const f = fixture(); await f.call("send", { email: "a@example.com" }); const wrong = f.codes.get("a@example.com") === "000000" ? "111111" : "000000";
  for (let i=0;i<5;i++) assert.equal((await f.call("verify", { email:"a@example.com", code:wrong })).status,400);
  assert.equal((await f.call("verify",{email:"a@example.com",code:f.codes.get("a@example.com")})).status,400);
  f.advance(61000); await f.call("send",{email:"a@example.com"}); f.advance(600001);
  assert.equal((await f.call("verify",{email:"a@example.com",code:f.codes.get("a@example.com")})).status,400);
});
test("failed mail cannot produce a usable OTP", async () => {
  const f=fixture(); const response=await accountRequest(f.request("send",{email:"a@example.com"}),f.env,{...f.deps,sendMail:async()=>{throw new Error("offline");}});
  assert.equal(response.status,502); assert.equal(f.sqlite.prepare("SELECT count(*) n FROM login_codes").get()!.n,0);
});
test("rate limit and origin checks run on the server", async () => {
  const f=fixture(); assert.equal((await f.call("send",{email:"a@example.com"})).status,200); assert.equal((await f.call("send",{email:"a@example.com"})).status,429);
  assert.equal((await accountRequest(f.request("send",{email:"b@example.com"},"","https://evil.example"),f.env,f.deps)).status,403);
});
test("authenticated owner isolation and encrypted append-only archive", async () => {
  const f=fixture(); const a=await f.login("a@example.com"),b=await f.login("b@example.com");
  assert.equal((await f.call("save",{birth,report:"合成报告"},a)).status,200);
  const other=await (await f.call("me",undefined,b)).json() as {snapshot:unknown}; assert.equal(other.snapshot,null);
  assert.equal((await f.call("save",{birth:{...birth,context:"合成反证"}},a)).status,200);
  const rows=f.sqlite.prepare("SELECT * FROM archive_records").all(); assert.equal(rows.length,2); assert.ok(!JSON.stringify(rows).includes("Synthetic"));
  assert.throws(()=>f.sqlite.prepare("UPDATE archive_records SET payload_ciphertext='tampered'").run(),/append-only/);
  assert.equal((await f.call("save",{birth},"")).status,401);
});
test("quota is account-wide, exactly three answers, replay is idempotent", async () => {
  const f=fixture(); const cookie=await f.login("a@example.com"); await f.call("save",{birth},cookie);
  const requestId=crypto.randomUUID(); assert.equal((await f.call("chat",{question:"合成问题",requestId},cookie)).status,200);
  assert.equal((await f.call("chat",{question:"合成问题",requestId},cookie)).status,200);
  assert.equal((await f.call("chat",{question:"修改问题",requestId},cookie)).status,409);
  for(let i=0;i<2;i++) assert.equal((await f.call("chat",{question:"合成追问",requestId:crypto.randomUUID()},cookie)).status,200);
  assert.equal((await f.call("chat",{question:"第四次",requestId:crypto.randomUUID()},cookie)).status,402);
  const me=await (await f.call("me",undefined,cookie)).json() as {remaining:number;snapshot:{messages:unknown[]}}; assert.equal(me.remaining,0);assert.equal(me.snapshot.messages.length,3);
  await f.call("delete",{confirm:"删除档案"},cookie); await f.call("save",{birth},cookie);
  assert.equal((await f.call("chat",{question:"重建后",requestId:crypto.randomUUID()},cookie)).status,402);
});
test("model failure and missing profile do not charge quota", async () => {
  const f=fixture();const cookie=await f.login("a@example.com");
  assert.equal((await f.call("chat",{question:"问题",requestId:crypto.randomUUID()},cookie)).status,400);
  await f.call("save",{birth},cookie);
  const response=await accountRequest(f.request("chat",{question:"问题",requestId:crypto.randomUUID()},cookie),f.env,{...f.deps,reply:async()=>{throw new Error("offline");}});
  assert.equal(response.status,502);const me=await (await f.call("me",undefined,cookie)).json() as {remaining:number}; assert.equal(me.remaining,3);
});
test("parallel chat attempts cannot exceed the quota", async () => {
  const f=fixture();const cookie=await f.login("a@example.com");await f.call("save",{birth},cookie);
  const responses=await Promise.all([1,2,3,4].map(()=>f.call("chat",{question:"问题",requestId:crypto.randomUUID()},cookie)));
  assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===409).length,3);
});
test("admin is server assigned and every view requires an audit purpose and ticket", async () => {
  const f=fixture(); const cookie=await f.login("a@example.com");await f.call("save",{birth},cookie);
  assert.equal((await f.call("admin",{reason:"user_support",ticket:"SYNTHETIC-1"},cookie)).status,403);
  f.sqlite.prepare("UPDATE accounts SET role='admin'").run();
  assert.equal((await f.call("admin",{reason:"user_support"},cookie)).status,400);
  const response=await f.call("admin",{reason:"user_support",ticket:"SYNTHETIC-1"},cookie);assert.equal(response.status,200);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM audit_events WHERE action='list'").get()!.n,1);
});
test("AEAD refuses tampering and records rebound to another owner", async () => {
  const key=crypto.getRandomValues(new Uint8Array(32));const value=await seal(key,{synthetic:true},"owner-a");
  assert.deepEqual(await unseal(key,value,"owner-a"),{synthetic:true});
  await assert.rejects(unseal(key,value,"owner-b")); await assert.rejects(unseal(key,{...value,tag:btoa("z".repeat(16))},"owner-a"));
});
test("logout invalidates server session, export and delete only affect owner", async () => {
  const f=fixture();const a=await f.login("a@example.com"),b=await f.login("b@example.com");await f.call("save",{birth},a);await f.call("save",{birth:{...birth,callName:"Other"}},b);
  const data=await (await f.call("export",undefined,a)).text(); assert.match(data,/Synthetic/);assert.doesNotMatch(data,/Other/);
  assert.equal((await f.call("delete",{confirm:"删除档案"},a)).status,200);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM archive_records").get()!.n,1);
  await f.call("logout",{},a);assert.equal((await f.call("me",undefined,a)).status,401);
});

test("login-only deployment authenticates but blocks all archive and admin routes", async () => {
  const f = fixture(); f.env.ACCOUNT_ENABLED = "login-only";
  const status = await (await f.call("status")).json();
  assert.deepEqual(status, { available: true, storageAvailable: false });
  const cookie = await f.login("synthetic@example.com");
  const me = await (await f.call("me", undefined, cookie)).json();
  assert.equal(me.signedIn, true); assert.equal(me.snapshot, null); assert.equal(me.storageAvailable, false);
  for (const path of ["save", "chat", "delete", "admin", "export"]) {
    assert.equal((await f.call(path, path === "export" ? undefined : { birth }, cookie)).status, 503);
  }
  assert.equal((f.sqlite.prepare("SELECT count(*) AS n FROM user_archives").get() as { n: number }).n, 0);
  assert.equal((await f.call("logout", {}, cookie)).status, 200);
  assert.equal((await f.call("me", undefined, cookie)).status, 401);
});

test("explicit registration creates encrypted account profile; login resumes the same account", async () => {
  const f = fixture(); const cookie = await f.login("registered@example.com");
  const first = await (await f.call("me", undefined, cookie)).json();
  assert.equal(first.account.displayName, "Synthetic account");
  assert.ok(!String(f.sqlite.prepare("SELECT profile_ciphertext FROM accounts").get()!.profile_ciphertext).includes("Synthetic account"));
  await f.call("save", { birth, report: "历史报告" }, cookie);
  await f.call("logout", {}, cookie); f.advance(61000);
  await f.call("send", { email: "registered@example.com" });
  const login = await f.call("verify", { email: "registered@example.com", code: f.codes.get("registered@example.com"), action: "login" });
  assert.equal(login.status, 200); assert.match(login.headers.get("set-cookie")!, /Max-Age=2592000/);
  const restored = await (await f.call("me", undefined, login.headers.get("set-cookie")!.split(";")[0])).json();
  assert.equal(restored.snapshot.report, "历史报告"); assert.equal(restored.account.displayName, first.account.displayName);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM accounts").get()!.n, 1);
  f.advance(30 * 86400000 + 1);
  assert.equal((await f.call("me", undefined, login.headers.get("set-cookie")!.split(";")[0])).status, 401);
});
test("login does not silently register and duplicate registration never overwrites an account", async () => {
  const f = fixture(); await f.call("send", { email: "new@example.com" });
  assert.equal((await f.call("verify", { email: "new@example.com", code: f.codes.get("new@example.com"), action: "login" })).status, 404);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM accounts").get()!.n, 0);
  await f.login("new@example.com"); f.advance(61000); await f.call("send", { email: "new@example.com" });
  assert.equal((await f.call("verify", { email: "new@example.com", code: f.codes.get("new@example.com") })).status, 409);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM accounts").get()!.n, 1);
});
test("history pagination and details are scoped to the authenticated owner", async () => {
  const f = fixture(); const a = await f.login("a@example.com"), b = await f.login("b@example.com");
  for (let i = 0; i < 22; i++) await f.call("save", { birth, report: `历史${i}` }, a);
  await f.call("save", { birth: { ...birth, callName: "Other" }, report: "Other private report" }, b);
  const page = await (await f.call("history", undefined, a)).json(); assert.equal(page.items.length, 20);
  const next = await (await f.call(`history?cursor=${page.nextCursor}`, undefined, a)).json(); assert.equal(next.items.length, 2); assert.equal(next.nextCursor, null);
  const detail = await (await f.call(`history?id=${page.items[0].id}`, undefined, a)).json(); assert.equal(detail.snapshot.report, "历史21");
  assert.equal((await f.call(`history?id=${page.items[0].id}`, undefined, b)).status, 404);
  assert.equal((await f.call(`history?cursor=${page.nextCursor}`, undefined, b)).status, 400);
  await f.call("delete", { confirm: "删除档案" }, a);
  assert.equal((await f.call(`history?id=${page.items[0].id}`, undefined, a)).status, 404);
  assert.equal((await (await f.call("history", undefined, a)).json()).items.length, 0);
});

test("three saved replies survive overnight, report revisions and a new chart; filtered history still opens them", async () => {
  const f = fixture(); const cookie = await f.login("overnight@example.com");
  await f.call("save", { birth, report: "原报告" }, cookie);
  for (let n=1; n<=3; n++) {
    const response = await f.call("chat", { question: `追问${n}`, requestId: crypto.randomUUID() }, cookie);
    const value = await response.json(); assert.equal(value.saved, true); assert.equal(value.message.question, `追问${n}`);
  }
  f.advance(12 * 3600_000);
  await f.call("save", { birth: { ...birth, date: "1993-06-15" }, report: "新盘报告" }, cookie);
  const me = await (await f.call("me", undefined, cookie)).json(); assert.equal(me.snapshot.messages.length, 0); assert.ok(me.latestDiscussion);
  const discussions = await (await f.call("history?kind=consultation", undefined, cookie)).json();
  assert.equal(discussions.items.length, 3); assert.equal(discussions.items[0].lastQuestion, "追问3");
  const detail = await (await f.call(`history?id=${me.latestDiscussion.id}`, undefined, cookie)).json();
  assert.deepEqual(detail.snapshot.messages.map((m: { question: string }) => m.question), ["追问1", "追问2", "追问3"]);
  assert.equal(detail.snapshot.report, "原报告");
  const reports = await (await f.call("history?kind=chart", undefined, cookie)).json(); assert.equal(reports.items.length, 2);
  assert.equal((await f.call("history?kind=invalid", undefined, cookie)).status, 400);
});

test("reply receives server-calculated chart, actual rule bodies, user context, conversation and current time", async () => {
  const f = fixture(); const cookie = await f.login("knowledge@example.com"); await f.call("save", { birth, report: "不是事实的旧初稿" }, cookie);
  const captured: { value?: ConsultationContext } = {};
  const response = await accountRequest(f.request("chat", { question: "事业上为什么投入没有成果", requestId: crypto.randomUUID() }, cookie), f.env, { ...f.deps, reply: async c => { captured.value = c as ConsultationContext; return "合成回答"; } });
  assert.equal(response.status, 200); const context = captured.value!; assert.deepEqual(context.personal.birth, birth);
  assert.equal(context.personal.chart.selectedVariant!.pillars.length, 4);
  assert.ok(context.knowledge.rules.find((r) => r.id === "ZP007")!["使用条件"].includes("日主"));
  assert.ok(context.knowledge.rules.find((r) => r.id === "DT002")!["失效条件"]);
  assert.ok(context.knowledge.rules.every((r) => r.realityValidation === "unvalidated"));
  assert.ok(context.evidenceBoundary.includes("初稿和旧回答不是用户事实")); assert.ok(context.asOf);
});

test("translation is bound to the saved source, cached encrypted and never spends a question", async () => {
  const f = fixture(); const a = await f.login("translation@example.com"), b = await f.login("other@example.com");
  const source = "月令财为主，食神作为来源；但是否有承载和连续路径仍需核验，不能从一颗财星推断经营收益。";
  await f.call("save", { birth, report: `结构境 观其序\n${source}` }, a);
  let calls = 0; const deps = { ...f.deps, translate: async () => { calls++; return { source, plainLanguage: "合成译文", example: "合成类比" }; } };
  const req = () => accountRequest(f.request("translate", { title: "结构境 观其序", source }, a), f.env, deps);
  assert.equal((await req()).status, 200); assert.equal((await req()).status, 200); assert.equal(calls, 1);
  const me = await (await f.call("me", undefined, a)).json(); assert.equal(me.remaining, 3); assert.equal(me.snapshot.translations["结构境 观其序"].source, source);
  assert.equal((await accountRequest(f.request("translate", { title: "结构境 观其序", source }, b), f.env, deps)).status, 409);
  assert.equal((await accountRequest(f.request("translate", { title: "结构境 观其序", source: "不存在的原文" }, a), f.env, deps)).status, 409);
  const encrypted = JSON.stringify(f.sqlite.prepare("SELECT payload_ciphertext FROM archive_records").all()); assert.ok(!encrypted.includes("合成译文"));
});

test("a generic model response without structured personal evidence does not spend quota or store a reply", async () => {
  const f = fixture(); const cookie = await f.login("quality@example.com"); await f.call("save", { birth }, cookie);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ output_text: "保持积极，注意沟通，你有很大潜力。" });
    const response = await accountRequest(f.request("chat", { question: "具体怎么做？", requestId: crypto.randomUUID() }, cookie), { ...f.env, DEEPSEEK_API_KEY: "synthetic" }, { now: f.deps.now });
    assert.equal(response.status, 502); assert.equal((await (await f.call("me", undefined, cookie)).json()).remaining, 3);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM chat_receipts").get()!.n, 0);
  } finally { globalThis.fetch = original; }
});

test("structured reply is persisted with plain language, sources and saved receipt, and replay returns the same answer", async () => {
  const f = fixture(); const cookie = await f.login("structured@example.com"); await f.call("save", { birth, report: "合成报告" }, cookie);
  const original = globalThis.fetch; let modelCalls = 0;
  try {
    globalThis.fetch = async (_url, options) => {
      modelCalls++; const sent = JSON.parse(String(options?.body)); const context = JSON.parse(sent.input) as ConsultationContext;
      const anchors = context.allowedChartAnchors.slice(0,2);
      return Response.json({ output_text: JSON.stringify({
        directAnswer: "按你提供的项目经历，先核对投入有没有转成明确的成果与交付，再判断是能力不足还是承接条件不足。现在还不能由盘面直接决定是否换工作。",
        reasoning: `你的${anchors.join("与")}是排盘事实，月令主气提供了财这一候选切入点。ZP001要求先看月令再查配合，DT002要求检查来源、过程和落点。若只见投入却没有产出被采用的事实，就不能宣布这条路径已经成立。尚不清楚项目产出是否被客户或团队实际接受。`,
        plainLanguage: "换成日常说法：你投入了很多时间，不等于这些时间已经变成别人愿意采用的成果。先看作品有没有完成、交付有没有被采用，再看岗位是否提供了承接条件。这是当前需要核对的两种可能，并不是在说你没有能力，也不是承诺换环境就一定成功。",
        example: { scenario: "一个合成情境是：某人做出了产品样稿，但一直没有约定谁来验收。他误以为自己的技术不好，实际问题可能是交付和采用的环节没接上。这个例子只说明投入、产出和承接是不同环节。", limit: "没有你真实的交付记录，不能把这个情境直接当成你的经历或结论。" },
        nextSteps: ["列出最近一个项目已完成的交付物与实际验收结果。"], verification: "最近一次产出是没有完成，还是已经完成却没有被采用？",
        chartAnchors: anchors, ruleIds: ["ZP001", "DT002"],
      }) });
    };
    const requestId = crypto.randomUUID(); const body = { question: "投入为何没有成果？", requestId };
    const call = () => accountRequest(f.request("chat", body, cookie), { ...f.env, DEEPSEEK_API_KEY: "synthetic" }, { now: f.deps.now });
    const first = await (await call()).json(); assert.equal(first.saved, true); assert.equal(first.remaining, 2); assert.ok(first.message.reading.plainLanguage.includes("投入"));
    const replay = await (await call()).json(); assert.equal(replay.replayed, true); assert.deepEqual(replay.message, first.message); assert.equal(modelCalls, 1);
    const me = await (await f.call("me", undefined, cookie)).json(); assert.equal(me.snapshot.messages.length, 1); assert.equal(me.snapshot.messages[0].reading.sources[1].id, "DT002");
    assert.ok(!JSON.stringify(f.sqlite.prepare("SELECT payload_ciphertext FROM archive_records").all()).includes("投入为何"));
  } finally { globalThis.fetch = original; }
});
