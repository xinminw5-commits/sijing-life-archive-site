import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html", host: "localhost" },
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

test("server-renders the closed pilot intake route", async () => {
  const response = await render("/pilot");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /首批封闭内测｜四派人生档案会诊/);
  assert.match(html, /先交出生资料，锁定后再交事实/);
  assert.match(html, /第一阶段/);
  assert.match(html, /第二阶段/);
  assert.match(html, /本页没有提交接口/);
  assert.match(html, /匿名内部研究（可选）/);
  assert.doesNotMatch(html, /真实姓名|手机号码|微信号/);
});

test("removes starter preview code and dependency", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /ConsultationStarter/);
  assert.match(layout, /generateMetadata/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../package-lock.json", templateRoot)));
});
