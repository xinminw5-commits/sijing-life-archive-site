import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${pathname}`, {
    headers: { accept: "text/html", host: "localhost" }, ...init,
  }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} });
}

test("home opens directly into the four-lens birth-data tool", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /一生万象/);
  assert.match(html, /建立你的四境档案/);
  assert.match(html, /怎么称呼你/);
  assert.match(html, /称呼就是这份档案的识别代号/);
  assert.match(html, /type="date"/);
  assert.match(html, /type="time"/);
  assert.match(html, /出生地/);
  assert.match(html, /结构境/);
  assert.match(html, /时序境/);
  assert.match(html, /气机境/);
  assert.match(html, /人生境/);
  assert.match(html, /生成我的基础档案/);
  assert.doesNotMatch(html, /DesignPreview|请输入邀请码/);
});

test("pilot is the same public core product", async () => {
  const response = await render("/pilot");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.match(html, /从出生时刻/);
  assert.match(html, /结构 环境 气机与人生阶段/);
  assert.match(html, /生成我的基础档案/);
  assert.doesNotMatch(html, /资格确认|DeepSeek|邀请码|客观事实锚点/);
});

test("metadata does not trust an arbitrary Host header", async () => {
  const response = await render("/", { headers: { accept: "text/html", host: "attacker.example" } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.doesNotMatch(html, /https:\/\/attacker\.example/);
  assert.match(html, /https:\/\/example\.invalid\/og\.png/);
});

test("source keeps deterministic chart calculation and no research stage", async () => {
  const [page, pilot, intake] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pilot/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pilot/PilotIntake.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /PilotIntake/);
  assert.match(pilot, /PilotIntake/);
  assert.match(intake, /calculateDeterministicChart/);
  assert.match(intake, /type="date"/);
  assert.match(intake, /type="time"/);
  assert.doesNotMatch(intake, /IntakeStage|客观事实锚点|pilot-stage-tabs|DeepSeek/);
  await access(new URL("../public/og.png", import.meta.url));
});
