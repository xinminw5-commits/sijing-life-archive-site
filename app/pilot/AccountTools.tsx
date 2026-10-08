"use client";
import { useEffect, useRef, useState } from "react";
import type { Birth } from "../../server/account-service";
type Saved = { birth: Birth; chart: unknown; report: string; messages: { question: string; answer: string }[] };
export function AccountTools({ birth, report, onRestore }: { birth: Birth; report: string; onRestore: (saved: Saved) => void }) {
  const [signedIn, setSignedIn] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "chat">("login");
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [remaining, setRemaining] = useState(3); const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Saved["messages"]>([]);
  const [deletePrompt, setDeletePrompt] = useState(false); const [confirmation, setConfirmation] = useState("");
  const [retry, setRetry] = useState<{ question: string; id: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const onRestoreRef = useRef(onRestore); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { onRestoreRef.current = onRestore; }, [onRestore]);
  const renderMirror = typeof window !== "undefined" && window.location.hostname.endsWith(".onrender.com");
  async function api(path: string, body?: unknown) {
    const response = await fetch(`/api/account/${path}`, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    let value; try { value = await response.json(); } catch { throw new Error("当前地址尚未连接账号服务，请使用主站登录。"); }
    if (!response.ok) { if (response.status === 401) setSignedIn(false); throw new Error(value.error || "请求暂未完成，请重试"); } return value;
  }
  async function me(restore: boolean) { const value = await api("me"); setSignedIn(true); setStorageAvailable(value.storageAvailable === true); setRemaining(value.remaining); setMessages(value.snapshot?.messages ?? []); if (restore && value.snapshot) onRestoreRef.current(value.snapshot); }
  useEffect(() => { if (!renderMirror) { let active = true; void fetch("/api/account/status").then(r => r.json()).then(value => { if (active) setStorageAvailable(value.storageAvailable === true); if (active && value.available) return fetch("/api/account/me").then(r => { if (!r.ok) throw new Error("No session"); return r.json(); }).then(saved => { if (!active) return; setSignedIn(true); setRemaining(saved.remaining); setMessages(saved.snapshot?.messages ?? []); if (saved.snapshot) onRestoreRef.current(saved.snapshot); }); }).catch(() => {}); return () => { active = false; }; } }, [renderMirror]); // Restore only after a server-authenticated session.
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  async function act(task: () => Promise<void>) { setBusy(true); setError(""); try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "暂时未完成，请重试"); } finally { setBusy(false); } }
  function show(next: "login" | "chat") {
    if (renderMirror) { window.location.href = "https://sijinglife.com/#intake"; return; }
    setError(""); setMode(signedIn ? next : "login"); setOpen(true);
  }
  async function save() { if (!signedIn) { show("login"); return; } await act(async () => { await api("save", { birth, report }); setNotice("档案已保存，下次登录可继续。"); await me(false); }); }
  async function sendQuestion() {
    if (!question.trim() || busy || !remaining) return;
    const requestId = retry?.question === question ? retry.id : crypto.randomUUID(); setRetry({ question, id: requestId });
    await act(async () => { await api("chat", { question, requestId }); await me(false); setQuestion(""); setRetry(null); });
  }
  return <div className="account-inline">
    <div className="account-inline-actions">{(!signedIn || storageAvailable) && <button type="button" onClick={() => signedIn ? void save() : show("login")} disabled={busy}>{signedIn ? "保存档案" : storageAvailable ? "登录保存档案" : "邮箱登录"}</button>}{signedIn && <>{storageAvailable && <><button type="button" onClick={() => show("chat")}>继续讨论</button><a href="/api/account/export">导出</a><button type="button" onClick={() => setDeletePrompt(!deletePrompt)}>删除档案</button></>}<button type="button" onClick={() => void act(async () => { await api("logout", {}); setSignedIn(false); setMessages([]); setNotice("已退出账号。"); })}>退出</button></>}</div>
    {signedIn && !storageAvailable && <small>邮箱已登录，档案保存和讨论正在准备。</small>}
    {signedIn && storageAvailable && <small>已登录 · 资料仅用于你的档案与解答，不加入研究或公开展示。授权均均为服务复核查看，访问会留痕。</small>}
    {deletePrompt && signedIn && <div className="account-delete"><p>删除后在线档案和对话无法恢复，历史备份按服务商保留窗口到期清理。填写「删除档案」确认。</p><input aria-label="删除确认" value={confirmation} onChange={e => setConfirmation(e.target.value)} /><button disabled={busy || confirmation !== "删除档案"} onClick={() => void act(async () => { const value = await api("delete", { confirm: confirmation }); setMessages([]); setDeletePrompt(false); setConfirmation(""); setNotice(value.note); })}>确认删除</button></div>}
    {notice && <p role="status">{notice}</p>}{error && !open && <p role="alert" className="archive-error">{error}</p>}
    <dialog className="account-dialog" ref={dialog} aria-labelledby="account-dialog-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <div className="account-dialog-head"><h3 id="account-dialog-title">{mode === "login" ? "继续你的档案" : "把问题带回现实"}</h3><button aria-label="关闭窗口" onClick={() => setOpen(false)}>✕</button></div>
      {mode === "login" ? <form className="account-login" onSubmit={e => { e.preventDefault(); void act(async () => { await api("verify", { email, code }); await me(true); setCode(""); setSent(false); setOpen(false); setNotice("邮箱验证成功，已登录。"); }); }}>
        <p>用邮箱登录，找回自己的资料和上次讨论。</p><label>邮箱<input type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setSent(false); }} required maxLength={254} /></label>
        <button type="button" disabled={busy || !email.trim()} onClick={() => void act(async () => { await api("send", { email }); setSent(true); })}>{sent ? "重新发送验证码" : "发送验证码"}</button>
        {sent && <><p>验证码已发送，10分钟内有效，请检查邮箱。</p><label>验证码<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} required /></label><button type="submit" disabled={busy || code.length !== 6}>登录</button></>}
        <small>首次验证邮箱会建立账号。只有主动保存并授权后，出生资料才会留档。</small>
      </form> : <><div className="account-chat-history" aria-live="polite"><p className="account-chat-note">AI 解答 · 结合已保存资料与现实反馈，判断仍可核对和修正。</p>{messages.map((message, index) => <div key={index}><p className="account-question">{message.question}</p><p className="account-answer">{message.answer}</p></div>)}{!remaining && <div className="account-complete"><b>本次讨论已完成</b><p>档案与对话已保存，可随时回来查看。专题解读和均均复核将在开放后接续。</p></div>}<div ref={end} /></div><form className="account-composer" onSubmit={e => { e.preventDefault(); void sendQuestion(); }}><label>你想补充或追问什么？<textarea rows={3} value={question} maxLength={2000} disabled={busy || !remaining} onChange={e => setQuestion(e.target.value)} placeholder="哪里吻合、哪里不吻合？可以从一段具体经历说起。" /></label><div><small>{remaining ? `还可继续 ${remaining} 次` : "本次免费讨论已结束"}</small><button disabled={busy || !remaining || !question.trim()}>{busy ? "正在整理回答…" : "发送"}</button></div></form></>}
      {error && <p role="alert" className="archive-error account-dialog-error">{error}</p>}
    </dialog>
  </div>;
}
