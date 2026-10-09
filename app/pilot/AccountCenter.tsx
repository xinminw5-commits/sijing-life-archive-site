"use client";
import type { AccountProfile, AccountSummary } from "../../lib/account";
import type { Birth } from "../../server/account-service";

export function AccountIdentity({ account }: { account: AccountProfile | null }) {
  return <div className="account-identity">
    <span className="account-avatar" aria-hidden="true">{account?.displayName.slice(0, 1) || "四"}</span>
    <div><p className="account-eyebrow">个人账户</p><h4>{account?.displayName || "我的账户"}</h4><p className="account-number">{account ? `账户编号 · ${account.number}` : "账户资料加载中"}</p></div>
    {account && <small>加入于 {new Date(account.createdAt).toLocaleDateString("zh-CN")}</small>}
  </div>;
}

export function AccountOverview({ summary, savedBirth, hasReport, remaining, storageAvailable, onReports, onQuestions, onContinue, onBenefits, onViewArchive }: {
  summary: AccountSummary | null; savedBirth: Birth | null; hasReport: boolean; remaining: number; storageAvailable: boolean;
  onReports: () => void; onQuestions: () => void; onContinue: () => void; onBenefits: () => void; onViewArchive: () => void;
}) {
  return <div className="account-center-body">
    <div className="account-overview-grid">
      <section className="account-archive-card"><p className="account-eyebrow">我的档案</p><h4>{savedBirth?.callName || "还未建立档案"}</h4>
        <p>{savedBirth ? savedBirth.focus || "四境人生档案" : "留下出生信息与现实处境，开始建立自己的档案。"}</p>
        <small>{!storageAvailable ? "档案服务暂不可用" : savedBirth ? hasReport ? "出生资料与报告已保存" : "出生资料已保存，报告待生成" : "建档后会自动保存在这里"}</small>
        {summary?.lastSavedAt && <small>最近保存 {new Date(summary.lastSavedAt).toLocaleString("zh-CN")}</small>}
        <button type="button" onClick={onViewArchive} disabled={!storageAvailable}>{savedBirth ? "打开当前档案" : "去建立档案"}<span aria-hidden="true">↗</span></button>
      </section>
      <section className="account-record-card"><p className="account-eyebrow">我的记录</p><div className="account-stat-grid"><div><strong>{summary?.savedQuestions ?? "—"}</strong><span>已保存解答</span></div><div><strong>{summary?.savedVersions ?? "—"}</strong><span>档案保存版本</span></div></div>
        <div className="account-card-links"><button type="button" onClick={onQuestions} disabled={!storageAvailable}>历史问答 →</button><button type="button" onClick={onReports} disabled={!storageAvailable}>报告历史 →</button></div>
      </section>
    </div>
    <section className="account-continue-card"><div><h4>从上次的讨论继续</h4><p>{remaining ? `当前还有 ${remaining} 次体验解答，成功回答后自动保存。` : "体验解答已用完，之前的档案和问答仍可随时阅读。"}</p></div><button type="button" onClick={remaining ? onContinue : onQuestions} disabled={!storageAvailable}>{remaining ? "继续讨论" : "查看历史问答"}</button></section>
    <section className="account-benefit-teaser"><div><p className="account-eyebrow">积分与权益</p><h4>积分 · 邀请 · 充值</h4><p>正在准备，开放后可在账户中管理。</p></div><button type="button" onClick={onBenefits}>查看进度 →</button></section>
  </div>;
}

export function AccountBenefits() {
  return <div className="account-center-body"><section className="account-points-status"><p className="account-eyebrow">我的积分</p><h4>待开放</h4><p>积分规则确定后，这里会显示余额和每笔收支记录。</p></section>
    <div className="account-benefits-grid"><section><h4>邀请好友</h4><p>邀请奖励尚未开放，暂不生成邀请码或发放积分。</p><button type="button" disabled>暂未开放</button></section><section><h4>充值积分</h4><p>充值金额与支付方式确定后开放，目前不收款。</p><button type="button" disabled>暂未开放</button></section></div>
    <p className="account-section-note">当前体验解答按次数使用；积分开放后，会在发送问题前显示所需积分。</p>
  </div>;
}
