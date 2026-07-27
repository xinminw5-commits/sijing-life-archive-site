/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  PILOT_INVITE_CODE?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const PILOT_PATH = "/pilot";
const PILOT_COOKIE = "pilot_access";
const PILOT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const textEncoder = new TextEncoder();

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname === PILOT_PATH || url.pathname.startsWith(`${PILOT_PATH}/`)) {
      return handlePilotAccess(request, env, ctx);
    }

    return handler.fetch(request, env, ctx);
  },
};

async function handlePilotAccess(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const inviteCode = env.PILOT_INVITE_CODE?.trim();
  if (!inviteCode) {
    return inviteGateResponse({
      status: 503,
      message: "内测入口正在配置，请稍后再试或联系邀请人。",
    });
  }

  const expectedToken = await pilotAccessToken(inviteCode);
  const currentToken = readCookie(request.headers.get("cookie"), PILOT_COOKIE);

  if (currentToken && constantTimeEqual(currentToken, expectedToken)) {
    const response = await handler.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("cache-control", "private, no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  if (request.method === "POST") {
    const submittedCode = await readSubmittedInviteCode(request);
    if (submittedCode && await inviteCodesMatch(submittedCode, inviteCode)) {
      const headers = new Headers({
        "cache-control": "no-store",
        location: PILOT_PATH,
      });
      headers.append(
        "set-cookie",
        [
          `${PILOT_COOKIE}=${expectedToken}`,
          `Path=${PILOT_PATH}`,
          `Max-Age=${PILOT_COOKIE_MAX_AGE}`,
          "HttpOnly",
          "SameSite=Lax",
          new URL(request.url).protocol === "https:" ? "Secure" : "",
        ].filter(Boolean).join("; "),
      );
      return new Response(null, { status: 303, headers });
    }

    return inviteGateResponse({
      status: 401,
      message: "邀请码不正确，请核对后重新输入。",
      autofocus: true,
    });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD, POST" },
    });
  }

  return inviteGateResponse();
}

async function readSubmittedInviteCode(request: Request): Promise<string | null> {
  try {
    const form = await request.formData();
    const value = form.get("inviteCode");
    return typeof value === "string" ? value.trim() : null;
  } catch {
    return null;
  }
}

async function inviteCodesMatch(submitted: string, expected: string): Promise<boolean> {
  const [submittedHash, expectedHash] = await Promise.all([
    sha256(submitted),
    sha256(expected),
  ]);
  return constantTimeEqual(submittedHash, expectedHash);
}

async function pilotAccessToken(inviteCode: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(inviteCode),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode("pilot-access-v1"),
  );
  return toHex(new Uint8Array(signature));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) return rawValue.join("=") || null;
  }
  return null;
}

function inviteGateResponse(options: {
  status?: number;
  message?: string;
  autofocus?: boolean;
} = {}): Response {
  const status = options.status ?? 200;
  const message = options.message
    ? `<p class="message" role="alert">${escapeHtml(options.message)}</p>`
    : "";
  const autofocus = options.autofocus ? " autofocus" : "";
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>邀请码验证｜四派人生档案会诊</title>
  <style>
    :root{color-scheme:light;--paper:#f4f0e7;--ink:#17201e;--muted:#53605c;--teal:#183f3a;--red:#a84935;--line:rgba(23,32,30,.16)}
    *{box-sizing:border-box}
    body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 14% 12%,rgba(168,73,53,.09),transparent 28%),var(--paper);color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif}
    main{width:min(100%,520px);padding:clamp(30px,7vw,54px);border:1px solid var(--line);background:rgba(255,255,255,.46);box-shadow:0 28px 80px rgba(23,32,30,.11)}
    .brand{display:flex;align-items:center;gap:12px;margin-bottom:48px}
    .seal{width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--red);color:var(--red);font:20px "Songti SC","STSong",serif}
    .brand span:last-child{display:grid;gap:3px}
    .brand strong{font:600 16px "Songti SC","STSong",serif;letter-spacing:.14em}
    .brand small,.eyebrow{color:var(--muted);font-size:9px;letter-spacing:.18em}
    .eyebrow{margin:0 0 16px;color:var(--red)}
    h1{margin:0;font:500 clamp(34px,8vw,50px)/1.22 "Songti SC","STSong",serif;letter-spacing:-.035em}
    .intro{margin:20px 0 30px;color:var(--muted);font-size:14px;line-height:1.85}
    label{display:grid;gap:9px;font-size:12px;font-weight:600}
    input{width:100%;height:52px;padding:0 15px;border:1px solid var(--line);border-radius:0;background:#fffdf8;color:var(--ink);font:15px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;outline:none}
    input:focus{border-color:var(--teal);box-shadow:0 0 0 3px rgba(24,63,58,.1)}
    button{width:100%;height:52px;margin-top:14px;border:0;background:var(--teal);color:#fff;font:600 14px inherit;cursor:pointer}
    button:hover{background:#2c5b53}
    .message{margin:0 0 18px;padding:12px 14px;border-left:3px solid var(--red);background:rgba(168,73,53,.08);color:#7b3023;font-size:12px;line-height:1.6}
    .note{margin:20px 0 0;color:var(--muted);font-size:11px;line-height:1.7}
    a{color:var(--teal)}
  </style>
</head>
<body>
  <main>
    <div class="brand"><span class="seal">四</span><span><strong>人生档案会诊</strong><small>封闭内测 · INVITE ONLY</small></span></div>
    <p class="eyebrow">首批 8—12 例 · 邀请制</p>
    <h1>请输入邀请人<br>提供的邀请码。</h1>
    <p class="intro">网站介绍可以公开浏览；两阶段出生资料与事实核验入口只向受邀参与者开放。</p>
    ${message}
    <form action="${PILOT_PATH}" method="post">
      <label>邀请码
        <input name="inviteCode" type="text" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required${autofocus}>
      </label>
      <button type="submit">验证并进入内测</button>
    </form>
    <p class="note">验证通过后，本设备会保留 30 天访问资格。邀请码只用于进入内测，不会读取你的 ChatGPT 账户。<br><a href="/">返回网站介绍</a></p>
  </main>
</body>
</html>`;

  return new Response(html, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
    },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export default worker;
