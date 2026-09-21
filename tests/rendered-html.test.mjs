import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

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
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the finished consultation site", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>四镜人生档案｜先盲断，再核验<\/title>/);
  assert.match(html, /从一个问题开始/);
  assert.match(html, /建立你的人生档案/);
  assert.match(html, /档案编辑部/);
  assert.match(html, /命盘研究室/);
  assert.match(html, /当代东方/);
  assert.match(html, /出生地点/);
  assert.match(html, /生成我的体验卡/);
  assert.match(html, /结构/);
  assert.match(html, /环境/);
  assert.match(html, /气机/);
  assert.match(html, /事件/);
  assert.match(html, /不会上传/);
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

test("pilot route is public and server-renders the intake without a login or invite", async () => {
  const response = await render("/pilot");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("cache-control"), "no-store");

  const html = await response.text();
  assert.match(html, /无需邀请码|公开体验/);
  assert.match(html, /填写出生资料，网页直接生成你的整体档案/);
  assert.doesNotMatch(html, /请输入邀请码|name="inviteCode"|ChatGPT 账户登录/);
});

test("encoded and normalized pilot paths remain public", async () => {
  for (const pathname of ["/%70ilot", "/p%69lot", "/pilot%2fintake", "/x/../pilot"]) {
    const response = await render(pathname);
    const html = await response.text();
    assert.doesNotMatch(html, /请输入邀请码|INVITE ONLY/, pathname);
    if (pathname !== "/pilot%2fintake") {
      assert.equal(response.status, 200, pathname);
      assert.match(html, /填写出生资料，网页直接生成你的整体档案/, pathname);
    } else {
      assert.equal(response.status, 404, pathname);
    }
  }
});

test("pilot intake keeps its evidence and privacy boundaries in open mode", async () => {
  const response = await render("/pilot");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /公开体验｜四镜人生档案/);
  assert.match(html, /填写出生资料，网页直接生成你的整体档案/);
  assert.match(html, /如何获得初步判断/);
  assert.match(html, /本页会在当前浏览器直接计算/);
  assert.match(html, /第一阶段/);
  assert.match(html, /可选核验/);
  assert.match(html, /出生资料仅用于本次排盘和 DeepSeek 报告生成/);
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
  assert.match(pilotIntake, /renderAnalysis/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../package-lock.json", templateRoot)));
});
