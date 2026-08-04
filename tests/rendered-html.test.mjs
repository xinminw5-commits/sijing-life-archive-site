import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

const pilotInviteCode = "JUNJUN-TEST-ACCESS";

async function render(pathname = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html", host: "localhost" },
      ...init,
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      PILOT_INVITE_CODE: pilotInviteCode,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished consultation site", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>四派人生档案会诊｜先盲断，再核验<\/title>/);
  assert.match(html, /不急着告诉你答案/);
  assert.match(html, /结构轴/);
  assert.match(html, /环境轴/);
  assert.match(html, /气机轴/);
  assert.match(html, /事件轴/);
  assert.match(html, /隐私默认不留存/);
  assert.match(html, /http:\/\/localhost\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("metadata does not trust an arbitrary Host header", async () => {
  const response = await render("/", {
    headers: { accept: "text/html", host: "attacker.example" },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /https:\/\/attacker\.example/);
  assert.match(html, /https:\/\/example\.invalid\/og\.png/);
});

test("pilot route shows the invite gate without an access cookie", async () => {
  const response = await render("/pilot");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /请输入邀请人/);
  assert.match(html, /name="inviteCode"/);
  assert.doesNotMatch(html, /先生成资料包，再由均均完成人工初判/);
});

test("encoded and normalized pilot paths cannot bypass the invite gate", async () => {
  for (const pathname of ["/%70ilot", "/p%69lot", "/pilot%2fintake", "/x/../pilot"]) {
    const response = await render(pathname);
    assert.equal(response.status, 200, pathname);
    const html = await response.text();
    assert.match(html, /请输入邀请人/, pathname);
    assert.doesNotMatch(html, /先生成资料包，再由均均完成人工初判/, pathname);
  }
});

test("pilot route rejects an incorrect invite code", async () => {
  const response = await render("/pilot", {
    method: "POST",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded",
      host: "localhost",
    },
    body: new URLSearchParams({ inviteCode: "WRONG-CODE" }),
  });
  assert.equal(response.status, 401);
  assert.match(await response.text(), /邀请码不正确/);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("pilot gate rejects unsupported or oversized request bodies before parsing", async () => {
  const unsupported = await render("/pilot", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost" },
    body: JSON.stringify({ inviteCode: pilotInviteCode }),
  });
  assert.equal(unsupported.status, 415);
  assert.equal(unsupported.headers.get("set-cookie"), null);

  const oversized = await render("/pilot", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", host: "localhost" },
    body: new URLSearchParams({ inviteCode: "X".repeat(2048) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.headers.get("set-cookie"), null);
});

test("pilot access token has a server-verified expiry", async () => {
  const expiredAt = Math.floor(Date.now() / 1000) - 1;
  const signature = createHmac("sha256", pilotInviteCode)
    .update(`pilot-access-v2:${expiredAt}`)
    .digest("hex");
  const response = await render("/pilot", {
    headers: {
      accept: "text/html",
      cookie: `pilot_access=${expiredAt}.${signature}`,
      host: "localhost",
    },
  });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /请输入邀请人/);
  assert.doesNotMatch(html, /先生成资料包，再由均均完成人工初判/);
});

test("pilot route accepts the invite code and server-renders the intake", async () => {
  const unlockResponse = await render("/pilot", {
    method: "POST",
    headers: {
      accept: "text/html",
      "content-type": "application/x-www-form-urlencoded",
      host: "localhost",
    },
    body: new URLSearchParams({ inviteCode: pilotInviteCode }),
  });
  assert.equal(unlockResponse.status, 303);
  assert.equal(unlockResponse.headers.get("location"), "/pilot");
  const cookie = unlockResponse.headers.get("set-cookie");
  assert.match(cookie ?? "", /^pilot_access=\d{10}\.[a-f0-9]{64};/);
  assert.match(cookie ?? "", /HttpOnly/);
  assert.match(cookie ?? "", /SameSite=Lax/);

  const response = await render("/pilot", {
    headers: {
      accept: "text/html",
      cookie: cookie?.split(";")[0] ?? "",
      host: "localhost",
    },
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("cache-control"), "private, no-store");

  const html = await response.text();
  assert.match(html, /首批封闭内测｜四派人生档案会诊/);
  assert.match(html, /先生成资料包，再由均均完成人工初判/);
  assert.match(html, /如何获得初步判断/);
  assert.match(html, /本页不会自动提交，也不会自动分析/);
  assert.match(html, /第一阶段/);
  assert.match(html, /收到初步判断后/);
  assert.match(html, /本页没有提交接口/);
  assert.match(html, /匿名内部研究（可选）/);
  assert.doesNotMatch(html, /真实姓名|手机号码|微信号/);
});

test("removes starter preview code and dependency", async () => {
  const [page, layout, pilotIntake, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pilot/PilotIntake.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /ConsultationStarter/);
  assert.match(layout, /generateMetadata/);
  assert.match(pilotIntake, /客观事实锚点暂未开放/);
  assert.match(pilotIntake, /页面本身不会自动出现反馈/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../package-lock.json", templateRoot)));
});
