"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ConversationAnswer } from "./ConversationAnswer";
import { AccountIdentity, AccountOverview, AccountBenefits } from "./AccountCenter";
import type { AccountProfile, AccountSummary } from "../../lib/account";
import type { ConversationMessage } from "../../lib/consultation";
import type { Birth } from "../../server/account-service";
type Saved = { birth: Birth; chart: unknown; report: string; messages: ConversationMessage[]; translations?: Record<string, import("../../lib/consultation").Translation> };
type Session = { account: AccountProfile; summary?: AccountSummary; snapshot: Saved | null; remaining: number; storageAvailable: boolean; latestDiscussion?: { id: string; at: string } | null };
type Mode = "auth" | "overview" | "chat" | "history" | "benefits" | "settings";
type HistoryItem = { id: string; at: string; type: string; callName: string; focus: string; messages: number; lastQuestion?: string };
const fingerprint = (birth: Birth, report: string) => JSON.stringify({ birth, report });
export function AccountTools({ birth, report, onRestore, onRegisterName, onLogout }: { birth: Birth; report: string; onRestore: (saved: Saved) => void; onRegisterName: (name: string) => void; onLogout: () => void }) {
  const [signedIn, setSignedIn] = useState(false); const [storageAvailable, setStorageAvailable] = useState(false);
  const [loading, setLoading] = useState(true); const [displayName, setDisplayName] = useState("");
  const [open, setOpen] = useState(false); const [mode, setMode] = useState<Mode>("auth");
  const [account, setAccount] = useState<AccountProfile | null>(null); const [summary, setSummary] = useState<AccountSummary | null>(null); const [savedSnapshot, setSavedSnapshot] = useState<Saved | null>(null);
  const [editName, setEditName] = useState("");
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [email, setEmail] = useState(""); const [code, setCode] = useState(""); const [sent, setSent] = useState(false);
  const [newName, setNewName] = useState(""); const [registrationConsent, setRegistrationConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [remaining, setRemaining] = useState(3); const [question, setQuestion] = useState(""); const [messages, setMessages] = useState<Saved["messages"]>([]);
  const [items, setItems] = useState<HistoryItem[]>([]); const [cursor, setCursor] = useState<string | null>(null);
  const [historyKind, setHistoryKind] = useState<"chart" | "consultation">("consultation");
  const [latestDiscussion, setLatestDiscussion] = useState<Session["latestDiscussion"]>(null);
  const [restoreError, setRestoreError] = useState("");
  const [selected, setSelected] = useState<{ at: string; type: string; snapshot: Saved } | null>(null);
  const [deletePrompt, setDeletePrompt] = useState(false); const [confirmation, setConfirmation] = useState("");
  const [retry, setRetry] = useState<{ question: string; id: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null); const end = useRef<HTMLDivElement>(null);
  const restore = useRef(onRestore); const currentBirth = useRef(birth); const lastSaved = useRef(""); const epoch = useRef(0); const historyRequest = useRef(0);
  useEffect(() => { restore.current = onRestore; currentBirth.current = birth; }, [onRestore, birth]);
  const renderMirror = typeof window !== "undefined" && window.location.hostname.endsWith(".onrender.com");
  async function api(path: string, body?: unknown) {
    const response = await fetch(`/api/account/${path}`, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    let value; try { value = await response.json(); } catch { throw new Error("当前地址尚未连接账号服务，请使用主站登录。"); }
    if (!response.ok) { if (response.status === 401) { clearAccountState(); setAuthMode("login"); setMode("auth"); } throw new Error(value.error || "请求暂未完成，请重试"); } return value;
  }
  function applySession(value: Session, shouldRestore: boolean) {
    setAccount(value.account); setSummary(value.summary ?? null); setSavedSnapshot(value.snapshot); setEditName(value.account.displayName);
    setRestoreError(""); setLatestDiscussion(value.latestDiscussion); setSignedIn(true); setDisplayName(value.account.displayName); setStorageAvailable(value.storageAvailable); setRemaining(value.remaining); setMessages(value.snapshot?.messages ?? []);
    if (shouldRestore && value.snapshot) { lastSaved.current = fingerprint(value.snapshot.birth, value.snapshot.report); restore.current(value.snapshot); }
  }
  async function me(shouldRestore: boolean) { const version = epoch.current; const value = await api("me"); if (version === epoch.current) applySession(value, shouldRestore); }
  const refreshAfterSave = useEffectEvent(() => me(false));
  const persistAutomatic = useEffectEvent((data: Birth, report: string) => api("save", { birth: data, report }));
  useEffect(() => {
    if (renderMirror) return;
    let active = true; const version = epoch.current;
    void fetch("/api/account/status").then(async r => { if (!r.ok) throw new Error("账户服务加载失败"); return r.json(); }).then(async value => {
      if (!active || version !== epoch.current) return;
      setStorageAvailable(value.storageAvailable === true);
      if (value.available) {
        const response = await fetch("/api/account/me");
        if (response.status === 401) return;
        if (!response.ok) throw new Error("历史档案暂未加载成功，记录不会因此删除。");
        const saved = await response.json(); if (active && version === epoch.current) applySession(saved, true);
      }
    }).catch(e => { if (active) setRestoreError(e.message || "历史记录加载失败，请重试。"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [renderMirror]); // Server cookie identifies the account; personal data is never stored in localStorage.
  useEffect(() => { window.dispatchEvent(new CustomEvent("sijing-account-state", { detail: { signedIn, displayName } })); }, [signedIn, displayName]);
  useEffect(() => {
    function navigate(event: Event) { const intent = (event as CustomEvent).detail; if (intent === "auth") { setAuthMode("register"); show("auth"); } else show("history"); }
    window.addEventListener("sijing-account-open", navigate); return () => window.removeEventListener("sijing-account-open", navigate);
  });
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length]);
  useEffect(() => {
    const data = currentBirth.current;
    if (!signedIn || !storageAvailable || !report || !data.consent || !data.date || !data.time || !data.place || !data.gender || !data.callName.trim()) return;
    const signature = fingerprint(data, report); if (lastSaved.current === signature) return;
    lastSaved.current = signature; const version = epoch.current; let active = true;
    void persistAutomatic(data, report).then(async () => { if (active && version === epoch.current) { setNotice("报告已保存到个人账户，下次打开可继续查看。"); try { await refreshAfterSave(); } catch { setNotice("报告已保存；账户概览暂未同步，重新打开后可查看。"); } } }).catch(e => { if (active && version === epoch.current) { lastSaved.current = ""; setError(`${e.message} 请点击保存当前档案重试。`); } });
    return () => { active = false; };
  }, [report, signedIn, storageAvailable]);
  async function act(task: () => Promise<void>) { setBusy(true); setError(""); try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "暂时未完成，请重试"); } finally { setBusy(false); } }
  async function history(more = false, kind = historyKind) { const request = ++historyRequest.current; const version = epoch.current; const value = await api(`history?kind=${kind}${more && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`); if (request !== historyRequest.current || version !== epoch.current) return; setItems(old => more ? [...old, ...value.items] : value.items); setCursor(value.nextCursor); }
  function show(next: Mode, kind = historyKind) {
    if (renderMirror) { window.location.href = "https://sijinglife.com/"; return; }
    const target = signedIn ? (next === "auth" ? "overview" : next) : "auth";
    setError(""); setNotice(""); setMode(target); setSelected(null); setDeletePrompt(false); setConfirmation(""); setOpen(true);
    if (target === "history") { setItems([]); setCursor(null); setHistoryKind(kind); void act(() => history(false, kind)); }
    if (target === "overview") void act(() => me(false));
    if (target === "settings") setEditName(displayName);
  }
  async function save() { if (!signedIn) { show("auth"); return; } await act(async () => { await api("save", { birth, report }); lastSaved.current = fingerprint(birth, report); setNotice("当前档案已保存。"); await me(false); }); }
  async function sendQuestion() {
    if (!question.trim() || busy || !remaining) return;
    const requestId = retry?.question === question ? retry.id : crypto.randomUUID(); setRetry({ question, id: requestId });
    await act(async () => {
      const value = await api("chat", { question, requestId });
      if (!value.saved || !value.message) throw new Error("回答保存未确认，请使用同一问题重试。");
      setMessages(old => old.some(m => m.savedAt && m.savedAt === value.message.savedAt) ? old : [...old, value.message]);
      setRemaining(value.remaining); setQuestion(""); setRetry(null); setNotice("这条问答已保存，可在历史问答中查看。");
      try { await me(false); } catch { setNotice("这条问答已保存；账户同步暂未完成，刷新后可查看。"); }
    });
  }
  function clearAccountState() { epoch.current++; setSignedIn(false); setDisplayName(""); setAccount(null); setSummary(null); setSavedSnapshot(null); setEditName(""); setMessages([]); setItems([]); setLatestDiscussion(null); setSelected(null); setQuestion(""); setRetry(null); setEmail(""); setCode(""); setSent(false); setDeletePrompt(false); setConfirmation(""); setNotice(""); lastSaved.current = ""; onLogout(); }
  async function logout() { await api("logout", {}); clearAccountState(); setOpen(false); setNotice("已退出登录。个人档案保留在账户中。"); }
  async function deleteArchive() { const value = await api("delete", { confirm: confirmation }); setMessages([]); setItems([]); setLatestDiscussion(null); setSelected(null); setDeletePrompt(false); setConfirmation(""); lastSaved.current = ""; onLogout(); setNotice(value.note); await me(false); }
  function viewCurrentArchive() { if (savedSnapshot) { lastSaved.current = fingerprint(savedSnapshot.birth, savedSnapshot.report); restore.current(savedSnapshot); } setOpen(false); document.getElementById(savedSnapshot?.report ? "deeper" : "intake")?.scrollIntoView({ behavior: "smooth" }); }
  function switchAuth(next: "register" | "login") { setAuthMode(next); setSent(false); setCode(""); setError(""); }
  return <div className="account-inline">
    {signedIn && <p className="account-owner">{displayName}的个人账户</p>}
    <div className="account-inline-actions">
      {!signedIn ? <button type="button" onClick={() => show("auth")} disabled={(loading && !renderMirror) || busy}>注册 / 登录</button> : <>
        <button type="button" onClick={() => show("overview")} disabled={busy}>我的账户</button>
        {storageAvailable && <><button type="button" onClick={() => void save()} disabled={busy}>保存当前档案</button><button type="button" onClick={() => show("chat")} disabled={busy}>继续讨论</button></>}
      </>}
    </div>
    {!signedIn && <small>注册个人账户，保存你的档案、报告与对话。</small>}
    {signedIn && storageAvailable && <small>报告和对话保存于你的账户；有效登录期间，再次打开会自动加载。资料仅用于个人档案与均均服务复核。</small>}
    {signedIn && !storageAvailable && <small>账户已登录，档案服务暂不可用。</small>}
    {restoreError && <p role="alert" className="archive-error">{restoreError} <button type="button" disabled={busy} onClick={() => void act(async () => { await me(true); })}>重新加载我的记录</button></p>}
    {signedIn && latestDiscussion && <p className="account-last-discussion">上次讨论 · {new Date(latestDiscussion.at).toLocaleString("zh-CN")} <button type="button" onClick={() => { setMode("history"); setHistoryKind("consultation"); setSelected(null); setOpen(true); void act(async () => { setSelected(await api(`history?id=${encodeURIComponent(latestDiscussion.id)}`)); }); }}>打开已保存的问答</button></p>}
    {notice && <p role="status">{notice}</p>}{error && !open && <p role="alert" className="archive-error">{error}</p>}
    <dialog className={`account-dialog${signedIn && mode !== "auth" ? " account-dialog--center" : ""}`} ref={dialog} aria-labelledby="account-dialog-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <div className="account-dialog-head"><h3 id="account-dialog-title">{mode === "auth" ? authMode === "register" ? "注册个人账户" : "登录个人账户" : "我的账户"}</h3><button aria-label="关闭窗口" onClick={() => setOpen(false)}>✕</button></div>
      {signedIn && mode !== "auth" && <><AccountIdentity account={account} /><nav className="account-center-nav" aria-label="个人账户导航"><button type="button" disabled={busy} aria-pressed={mode === "overview"} onClick={() => show("overview")}>账户概览</button><button type="button" disabled={busy || !storageAvailable} aria-pressed={mode === "history" && historyKind === "chart"} onClick={() => show("history", "chart")}>报告历史</button><button type="button" disabled={busy || !storageAvailable} aria-pressed={mode === "history" && historyKind === "consultation"} onClick={() => show("history", "consultation")}>历史问答</button><button type="button" disabled={busy} aria-pressed={mode === "benefits"} onClick={() => show("benefits")}>积分与权益</button><button type="button" disabled={busy} aria-pressed={mode === "settings"} onClick={() => show("settings")}>账户设置</button></nav></>}
      {mode === "auth" ? <form className="account-login" onSubmit={e => { e.preventDefault(); void act(async () => { const value = await api("verify", { email, code, action: authMode, displayName: newName, registrationConsent }); epoch.current++; await me(true); if (value.registered) onRegisterName(newName.trim()); setCode(""); setSent(false); setOpen(false); setNotice(value.registered ? "个人账户已建立，填写资料后即可生成并保存档案。" : "已登录，个人档案和对话已加载。"); }); }}>
        <div className="account-auth-tabs" aria-label="账户操作"><button type="button" aria-pressed={authMode === "register"} onClick={() => switchAuth("register")}>注册</button><button type="button" aria-pressed={authMode === "login"} onClick={() => switchAuth("login")}>登录</button></div>
        <p>{authMode === "register" ? "建立属于你的个人账户，留存每次报告与讨论。" : "登录后继续查看你的档案、报告与历史讨论。"}</p>
        {authMode === "register" && <label>怎么称呼你<input autoComplete="nickname" value={newName} onChange={e => setNewName(e.target.value)} required maxLength={40} /></label>}
        <label>邮箱<input type="email" autoComplete="email" value={email} onChange={e => { setEmail(e.target.value); setSent(false); setCode(""); }} required maxLength={254} /></label>
        <button type="button" disabled={busy || !email.trim()} onClick={() => void act(async () => { await api("send", { email }); setSent(true); })}>{busy ? "正在发送…" : sent ? "重新发送验证码" : "发送验证码"}</button>
        {sent && <><p>验证码已发送，10分钟内有效，请检查邮箱。</p><label>验证码<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value)} required /></label></>}
        {authMode === "register" && <label className="account-consent"><input type="checkbox" checked={registrationConsent} onChange={e => setRegistrationConsent(e.target.checked)} required /><span>创建个人账户。出生资料将在我同意生成并保存档案后留存，仅用于个人档案与服务复核。</span></label>}
        {sent && <button type="submit" disabled={busy || code.length !== 6 || (authMode === "register" && (!newName.trim() || !registrationConsent))}>{busy ? "正在处理…" : authMode === "register" ? "创建账户" : "登录"}</button>}
        <small>邮箱用于验证账户身份，无需另设密码。此设备可保持登录30天；退出后需要重新验证。</small>
      </form> : mode === "overview" ? <AccountOverview summary={summary} savedBirth={savedSnapshot?.birth ?? null} hasReport={!!savedSnapshot?.report} remaining={remaining} storageAvailable={storageAvailable} onReports={() => show("history", "chart")} onQuestions={() => show("history", "consultation")} onContinue={() => show("chat")} onBenefits={() => show("benefits")} onViewArchive={viewCurrentArchive} /> : mode === "benefits" ? <AccountBenefits /> : mode === "settings" ? <div className="account-center-body account-settings">
        <form onSubmit={event => { event.preventDefault(); void act(async () => { const value = await api("profile", { displayName: editName }); setAccount(value.account); setDisplayName(value.account.displayName); setEditName(value.account.displayName); setNotice("账户名称已保存。"); }); }}><h4>账户名称</h4><label>怎么称呼你<input autoComplete="nickname" required maxLength={40} value={editName} onChange={event => setEditName(event.target.value)} /></label><p>用于显示个人账户。档案中的人物称呼保留原样。</p><button type="submit" disabled={busy || !storageAvailable || !editName.trim() || editName.trim() === displayName}>保存名称</button></form>
        <section><h4>登录方式</h4><p>邮箱验证码。此设备可保持登录30天；会话到期后重新登录，档案和历史记录保留。</p><button type="button" disabled={busy} onClick={() => void act(logout)}>退出当前设备</button></section>
        {storageAvailable && <section><h4>我的资料</h4><p>可下载自己的全部在线档案、报告和问答。</p><a href="/api/account/export" download>导出档案</a><details className="account-delete-section"><summary>删除全部在线档案</summary><p>会删除全部在线档案和问答，账户及已用体验次数保留；历史备份最迟30天到期。</p><button type="button" disabled={busy} onClick={() => setDeletePrompt(true)}>准备删除</button>{deletePrompt && <div className="account-delete"><label>填写「删除档案」确认<input aria-label="删除确认" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label><button type="button" disabled={busy || confirmation !== "删除档案"} onClick={() => void act(deleteArchive)}>确认删除</button><button type="button" disabled={busy} onClick={() => { setDeletePrompt(false); setConfirmation(""); }}>取消</button></div>}</details></section>}
      </div> : mode === "history" ? <div className="account-history">
        {selected ? <><button type="button" onClick={() => setSelected(null)}>返回历史列表</button><p>{new Date(selected.at).toLocaleString("zh-CN")} · {selected.snapshot.birth.callName}</p><h4>{selected.snapshot.birth.focus || "基础人生档案"}</h4>{selected.type === "consultation" ? <>{selected.snapshot.messages.map((message, index) => <ConversationAnswer key={index} message={message} />)}<details className="account-reference-report"><summary>本次讨论对应的档案报告</summary><div className="account-saved-report">{selected.snapshot.report || "本次仅保存了出生资料与基础排盘。"}</div></details></> : <><div className="account-saved-report">{selected.snapshot.report || "本次仅保存了出生资料与基础排盘。"}</div>{selected.snapshot.messages.map((message, index) => <ConversationAnswer key={index} message={message} />)}</>}</> : <>
          <p>{historyKind === "consultation" ? "每次讨论保存后，都可以在这里重新阅读；追问次数用完仍可查看。" : "报告按保存时间排列。"}查看旧记录不会替换你当前的档案。</p>
          {!items.length && !busy && <p>{historyKind === "consultation" ? "还没有已保存的问答。成功解答后会显示在这里。" : "还没有报告历史。生成并保存后会显示在这里。"}</p>}
          {items.map(item => <button className="account-history-item" type="button" disabled={busy} key={item.id} onClick={() => void act(async () => { setSelected(await api(`history?id=${encodeURIComponent(item.id)}`)); })}><span>{historyKind === "consultation" ? item.lastQuestion || "历史讨论" : item.focus || "基础人生档案"} · {item.type === "consultation" ? "讨论" : "报告"}</span><small>{new Date(item.at).toLocaleString("zh-CN")} · {item.messages}条解答</small></button>)}
          {cursor && <button type="button" disabled={busy} onClick={() => void act(() => history(true))}>查看更多</button>}{busy && <p role="status">正在加载…</p>}
        </>}
      </div> : <><div className="account-chat-history" aria-live="polite"><p className="account-chat-note">AI解答结合当前档案与现实反馈，讨论会自动保存。</p>{messages.map((message, index) => <ConversationAnswer key={index} message={message} />)}{!remaining && <div className="account-complete"><b>本次讨论已完成</b><p>档案与对话已保存，可随时回来查看。专题解读和均均复核将在开放后接续。</p></div>}<div ref={end} /></div><form className="account-composer" onSubmit={e => { e.preventDefault(); void sendQuestion(); }}><label>你想补充或追问什么？<textarea rows={3} value={question} maxLength={2000} disabled={busy || !remaining} onChange={e => setQuestion(e.target.value)} placeholder="哪里吻合、哪里不吻合？可以从一段具体经历说起。" /></label><div><small>{remaining ? `还可继续 ${remaining} 次` : "本次免费讨论已结束"}</small><button disabled={busy || !remaining || !question.trim()}>{busy ? "正在整理回答…" : "发送"}</button></div></form></>}
      {notice && mode !== "auth" && <p role="status" className="account-dialog-notice">{notice}</p>}{error && <p role="alert" className="archive-error account-dialog-error">{error}</p>}
    </dialog>
  </div>;
}
