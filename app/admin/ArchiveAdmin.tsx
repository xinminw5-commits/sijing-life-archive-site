"use client";
import Link from "next/link";
import { useState } from "react";
type Row = { id: string; created_at: string; answers: number };
type Snapshot = { birth: { callName: string; date: string; time: string; place: string; context: string }; report: string; messages: { question: string; answer: string }[] };
export function ArchiveAdmin() {
  const [reason, setReason] = useState("user_support"); const [ticket, setTicket] = useState("");
  const [rows, setRows] = useState<Row[]>([]); const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false);
  async function load(accountId?: string) {
    setBusy(true);setError("");setSnapshot(null);
    try {
      const response = await fetch("/api/account/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, ticket, accountId }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || "无法查看档案");
      if(accountId)setSnapshot(value.snapshot);else {setRows(value.results);setLoaded(true);}
    } catch(e){setError(e instanceof Error?e.message:"请求未完成，请重试");}finally{setBusy(false);}
  }
  return <main><header className="site-header"><Link className="brand" href="/"><span className="brand-seal">四</span><span><strong>四境人生档案</strong></span></Link><Link href="/#intake">登录／回到档案</Link></header><div className="admin-shell"><p className="eyebrow">存档管理</p><h1>继续一份档案的复核</h1><p>仅管理员可查看。每次查询记录用途与工单；这里只处理用户授权的服务资料。</p><form className="admin-controls" onSubmit={e=>{e.preventDefault();void load();}}><label>查看用途<select value={reason} onChange={e=>{setReason(e.target.value);setRows([]);setSnapshot(null);setLoaded(false);}}><option value="user_support">用户请求复核</option><option value="user_export_request">用户请求导出</option></select></label><label>工单／复核记录编号<input value={ticket} maxLength={80} onChange={e=>{setTicket(e.target.value);setRows([]);setSnapshot(null);setLoaded(false);}} placeholder="填写本次服务记录编号" required /></label><button disabled={busy||!ticket.trim()}>{busy?"读取中…":"查看存档"}</button></form>{error&&<p role="alert" className="archive-error">{error}</p>}{loaded&&!rows.length&&<p>暂无已保存的档案。</p>}<div className="admin-records">{rows.map(row=><div key={row.id}><span><b>档案 {row.id.slice(0,8)}</b><small>{new Date(row.created_at).toLocaleDateString("zh-CN")} · {row.answers}次解答</small></span><button disabled={busy||!ticket.trim()} onClick={()=>void load(row.id)}>查看</button></div>)}</div>{snapshot&&<section className="admin-detail"><h2>{snapshot.birth.callName}</h2><p>{snapshot.birth.date} · {snapshot.birth.time} · {snapshot.birth.place}</p><p>{snapshot.birth.context}</p><h3>当前报告</h3><p>{snapshot.report||"尚未保存报告正文。"}</p><h3>讨论与反馈</h3>{snapshot.messages.map((message,i)=><div key={i}><p className="account-question">{message.question}</p><p className="account-answer">{message.answer}</p></div>)}</section>}</div></main>;
}
