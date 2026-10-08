"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { answerPreview, createWorkspace, FREE_ANSWERS, prompts, sampleProfiles, type Topic, type Workspace } from "../../domain/preview/workspace";

export function PreviewWorkspace() {
  const [records, setRecords] = useState<Record<Workspace["account"], Workspace>>({ C07: createWorkspace("C07"), C08: createWorkspace("C08") });
  const [account, setAccount] = useState<Workspace["account"]>("C07");
  const [signedIn, setSignedIn] = useState(true);
  const [view, setView] = useState<"user" | "admin">("user");
  const [chatOpen, setChatOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [audit, setAudit] = useState<string[]>([]);
  const [adminRecord, setAdminRecord] = useState<Workspace["account"] | null>(null);
  const [reason, setReason] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const state = records[account];
  const profile = sampleProfiles[account];
  useEffect(() => {
    if (chatOpen) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [chatOpen]);
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [state.answered]);
  function answer(topic: Topic) {
    setRecords(prev => ({ ...prev, [account]: answerPreview(prev[account], topic) }));
    setNotice("");
  }
  function exportSample() {
    const blob = new Blob([JSON.stringify({ preview: true, profile, ...state }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${account}-示例档案.json`; anchor.click(); URL.revokeObjectURL(url);
  }
  return <main className="preview-workspace">
    <header className="site-header"><Link className="brand" href="/"><span className="brand-seal">四</span><span><strong>四境人生档案</strong><small>SIJING ARCHIVE</small></span></Link><Link href="/">回到首页</Link></header>
    <div className="preview-shell">
      <div className="preview-banner"><b>功能预览 · 合成示例资料</b><span>登录、回复与后台均为演示。资料只在当前页面内保留，刷新会重置；未开通邮箱发信、云端存档或支付。</span></div>
      <div className="preview-title"><div><p className="eyebrow">PERSONAL WORKSPACE</p><h1>{view === "user" ? "我的四境档案" : "均均的存档工作台"}</h1></div><div className="preview-tabs" aria-label="预览视角"><button aria-pressed={view === "user"} onClick={() => setView("user")}>用户视角</button><button aria-pressed={view === "admin"} onClick={() => setView("admin")}>后台演示</button></div></div>
      {view === "user" ? <>
        <div className="preview-account"><label>示例账号<select value={account} onChange={e => { setAccount(e.target.value as Workspace["account"]); setNotice(""); }}><option>C07</option><option>C08</option></select></label><span>计划采用邮箱验证码登录</span><button onClick={() => { setSignedIn(!signedIn); setNotice(signedIn ? "已退出示例账号。重新进入后可恢复当前页面内的记录。" : "已恢复这个示例账号的档案和对话。 "); }}>{signedIn ? "退出示例账号" : "进入示例账号"}</button></div>
        {!signedIn ? <section className="preview-card"><h2>再次进入，继续上次的讨论</h2><p>正式版本会验证邮箱后恢复本人档案。此处点击「进入示例账号」体验恢复流程。</p></section> : <>
          <div className="preview-grid"><section className="preview-card"><p className="eyebrow">个人资料 · 示例</p><h2>{profile.name} 的档案</h2><dl className="preview-facts"><div><dt>出生日期</dt><dd>{profile.date}</dd></div><div><dt>出生时间</dt><dd>{profile.time}</dd></div><div><dt>出生地点</dt><dd>{profile.place}</dd></div></dl><p>{profile.context}</p><p className="preview-muted">以上为虚构资料，仅用于体验流程。账号切换后，各自的讨论和额度独立。</p><button className="preview-link" onClick={exportSample}>导出示例档案 ↓</button></section>
          <section className="preview-card preview-discussion"><p className="eyebrow">把判断带回现实</p><h2>交叉核验，继续追问</h2><p>判断吻合吗？用具体经历回应，让原判断、现实反馈和修正记录一起留下来。</p><div className="preview-quota"><strong>{Math.max(0, FREE_ANSWERS - state.answered)}</strong><span>次免费回答剩余<small>共 3 次有效回答</small></span></div><button ref={trigger} className="preview-primary" onClick={() => setChatOpen(true)}>打开核验对话 <span>↗</span></button><small>本预览使用预设回复，真实 AI 解答将在正式接入后启用。</small></section></div>
          <section className="preview-card"><p className="eyebrow">验证记录</p><h2>让修正有迹可循</h2><div className="preview-verification"><span className="preview-tag">原始判断 · 示例</span><p>“更适合独自工作”——待验证，不能直接定论。</p>{state.corrected ? <><span className="preview-tag correction">用户反馈 · 不吻合</span><p>“更喜欢团队协作”已记入本次示例档案。原始判断保留，后续需要结合具体项目继续核验。</p></> : <button className="preview-link" onClick={() => setChatOpen(true)}>补充不吻合的经历 →</button>}</div></section>
        </>}
      </> : <>
        <section className="preview-card"><p className="eyebrow">存档总览 · 2 份示例</p><h2>看见资料，也看见修正过程</h2><p>此处开放切换视角供你测试。正式后台需要管理员身份；查看资料前填写用途，并留下访问记录。</p><label className="preview-reason">本次查看用途<select value={reason} onChange={e => { setReason(e.target.value); setAdminRecord(null); }}><option value="">请选择用途</option><option value="用户请求复核">用户请求复核</option><option value="协助用户导出">协助用户导出</option></select></label>
          <div className="preview-archive-list">{Object.values(records).map(record => <div key={record.account}><span><b>{record.account}</b><small>{record.answered} 次示例回答 · {record.corrected ? "有反证待复核" : "尚未补充反证"}</small></span><button disabled={!reason} onClick={() => { setAdminRecord(record.account); setAudit(prev => [`查看 ${record.account} · ${reason}`, ...prev]); }}>查看示例档案</button></div>)}</div>
        </section>
        {adminRecord && <section className="preview-card"><h2>{adminRecord} · 示例档案详情</h2><p>{sampleProfiles[adminRecord].date} · {sampleProfiles[adminRecord].time} · {sampleProfiles[adminRecord].place}</p><p>{sampleProfiles[adminRecord].context}</p><p>反馈：{records[adminRecord].corrected ? "独自工作判断不吻合，更喜欢团队协作（待复核）。" : "暂无反证。"}</p>{records[adminRecord].messages.map((message, i) => <p className="preview-admin-message" key={i}><b>{message.role === "user" ? "用户" : "示例回复"}：</b>{message.text}</p>)}</section>}
        <section className="preview-card"><h2>访问记录 · 演示</h2>{audit.length ? <ol>{audit.map((line, i) => <li key={i}>{line}</li>)}</ol> : <p>选择用途并查看档案后，这里会出现一条记录。</p>}</section>
      </>}
      {notice && <p role="status" className="preview-notice">{notice}</p>}
      <p className="preview-footnote">正式开放前将接入邮箱验证码、账户隔离和受控存档。本预览不接收真实个人资料，也不产生付费订单。</p>
    </div>
    <dialog ref={dialog} className="preview-chat" aria-labelledby="preview-chat-title" onCancel={() => setChatOpen(false)} onClose={() => { setChatOpen(false); trigger.current?.focus(); }}>
      <div className="preview-chat-head"><div><small>{account} · 预设互动演示</small><h2 id="preview-chat-title">交叉核验</h2></div><button aria-label="关闭对话" onClick={() => setChatOpen(false)}>✕</button></div>
      <div className="preview-chat-body" aria-live="polite"><p className="preview-chat-intro">我会围绕这份示例档案回应。请从下方选择一个问题，体验对话和反证留档。</p>{state.messages.map((message, i) => <div className={`preview-message ${message.role}`} key={i}><small>{message.role === "user" ? profile.name : "四境 · 示例回复"}</small><p>{message.text}</p></div>)}
        {state.answered === FREE_ANSWERS && <div className="preview-summary"><b>本次核验小结</b><p>已完成 3 次示例回答。{state.corrected ? "已保留团队协作的反证，原判断待复核。" : "目前补充的信息仍不足以确认原判断。"}问题和回复已保留在当前页面内，可返回档案导出。</p><h3>继续深入一个具体问题</h3><p>下一步可提供专题解读或均均人工复核。价格与支付尚未开放，演示不会扣款。</p><button onClick={() => setNotice("已选中专题解读体验入口；正式服务尚未开放，不产生订单。")}>了解专题解读</button><button onClick={() => setNotice("已选中人工复核体验入口；正式服务尚未开放，不产生订单。")}>了解均均复核</button>{notice && <p role="status">{notice}</p>}</div>}<div ref={chatEnd} /></div>
      <div className="preview-chat-controls"><span>剩余 {FREE_ANSWERS - state.answered} / 3 次有效回答</span><div>{(Object.keys(prompts) as Topic[]).map(topic => <button disabled={state.answered >= FREE_ANSWERS} onClick={() => answer(topic)} key={topic}>{topic === "career" ? "事业方向" : topic === "relationship" ? "关系核验" : "原判断不吻合"}</button>)}</div><small>点击问题即可体验。失败不扣次数；关闭窗口再打开可继续。</small></div>
    </dialog>
  </main>;
}
