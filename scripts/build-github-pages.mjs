import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const project = join(root, "..");
const pages = join(project, "docs");
const dist = join(project, "dist");

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("pages", `${pathname}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html", host: "localhost" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  if (!response.ok) throw new Error(`Unable to render ${pathname}: ${response.status}`);
  return response.text();
}

function rewrite(html, prefix) {
  return html
    .replaceAll('/assets/', `${prefix}assets/`)
    .replaceAll('http://localhost/', 'https://xinminw5-commits.github.io/sijing-life-archive-site/')
    .replaceAll('href="/favicon.svg"', `href="${prefix}favicon.svg"`)
    .replaceAll('href="/og.png"', `href="${prefix}og.png"`)
    .replaceAll('href="/"', `href="${prefix}"`);
}

await rm(pages, { recursive: true, force: true });
await mkdir(join(pages, "pilot"), { recursive: true });
await cp(join(dist, "client", "assets"), join(pages, "assets"), { recursive: true });
await cp(join(project, "public", "favicon.svg"), join(pages, "favicon.svg"));
await cp(join(project, "public", "og.png"), join(pages, "og.png"));

await writeFile(join(pages, "index.html"), rewrite(await render("/"), "./"));
await writeFile(join(pages, "pilot", "index.html"), rewrite(await render("/pilot"), "../"));

console.log(`GitHub Pages output written to ${relative(project, pages)}`);
