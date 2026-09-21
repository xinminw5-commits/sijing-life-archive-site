import type { Metadata } from "next";
import Link from "next/link";
import { PilotIntake } from "./PilotIntake";

export const metadata: Metadata = {
  title: "公开体验｜四镜人生档案",
  description: "无需邀请码或账号。填写一次出生资料，网页自动生成结构化排盘和普通人看得懂的整体断盘报告。",
};

const process = [
  ["01", "出生资料", "填写日期、时间、地点和计算所需的边界信息。"],
  ["02", "网页计算", "在当前浏览器直接生成四柱、日主和大运结构。"],
  ["03", "整体档案", "用户先查看自己的完整结构，不必先把资料发给均均。"],
  ["04", "具体追问", "只有需要解释或核验现实问题时，再带着问题来咨询。"],
];

export default function PilotPage() {
  return (
    <main className="pilot-page">
      <header className="site-header pilot-header">
        <Link className="brand" href="/" aria-label="返回四镜人生档案首页">
          <span className="brand-seal">四</span>
          <span>
            <strong>四镜人生档案</strong>
            <small>公开体验 · PILOT V0</small>
          </span>
        </Link>
        <nav aria-label="内测页导航">
          <a href="#how">流程</a>
          <a href="#criteria">入选条件</a>
            <a className="nav-cta" href="#intake">开始填写</a>
        </nav>
      </header>

      <section className="pilot-hero" id="top">
        <div className="pilot-hero-copy">
          <p className="eyebrow"><span /> 无需邀请码 · 无需账号</p>
            <h1>填写一次资料，<br /><em>直接看懂自己。</em></h1>
          <p>
            先填写出生资料，网页会自动生成一份普通人看得懂的整体断盘报告；只有想继续追问时，再来找均均。
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#intake">开始填写资料 <span>↓</span></a>
            <Link className="text-link" href="/">返回服务介绍 <span>↗</span></Link>
          </div>
        </div>
        <aside className="pilot-hero-card">
          <span>本轮目标</span>
          <strong>让流程公开<br />接受真实检验</strong>
          <ul>
            <li>不提前收人生经历</li>
            <li>不只保留“命中”</li>
            <li>不公开真实身份</li>
            <li>不宣传未经证明的准确率</li>
          </ul>
            <small>当前先提供结构化自助结果，复杂判断仍需单独核验。</small>
        </aside>
      </section>

      <section className="pilot-process" id="how">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow"><span /> 使用方式</p>
            <h2>填写一次，<br />先看懂整体。</h2>
          </div>
          <p>网页先根据出生资料生成整体档案和通俗说明，不要求你先整理人生经历。只有报告里出现具体疑问时，再带着问题来咨询。</p>
        </div>
        <ol>
          {process.map(([number, title, body]) => (
            <li key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="pilot-criteria" id="criteria">
        <div>
          <p className="eyebrow light"><span /> 使用边界</p>
          <h2>可以不懂命理，<br />但请如实填写。</h2>
        </div>
        <div className="pilot-criteria-grid">
          <article>
            <span>可进入前瞻样本</span>
            <ul>
              <li>年满18周岁</li>
              <li>能说明出生时间来自哪里</li>
              <li>愿意提供至少三个客观事实锚点</li>
              <li>愿意反馈冲突与不知道</li>
              <li>分析者事前不了解主要经历</li>
            </ul>
          </article>
          <article>
            <span>只能转为回顾性材料</span>
            <ul>
              <li>已经完整讲过个人经历</li>
              <li>只愿意评价“像不像”</li>
              <li>出生信息主要来自事后推时</li>
              <li>不愿保留不命中内容</li>
              <li>要求确定预测灾祸、疾病或死亡</li>
            </ul>
          </article>
        </div>
      </section>

      <div id="intake">
        <PilotIntake />
      </div>

      <section className="pilot-boundaries">
        <div>
          <p className="eyebrow"><span /> 数据与服务边界</p>
          <h2>当前先把流程跑真，<br />不把功能装完整。</h2>
        </div>
        <div className="boundary-grid">
          <p><b>只为生成本次报告</b>出生资料会发送给 DeepSeek，网站不建立长期个人档案。</p>
          <p><b>三种授权分开</b>完成服务、匿名研究、公开展示分别选择，后两项默认关闭。</p>
          <p><b>高风险问题中止</b>医疗、法律、重大财务及人身安全问题回到现实专业支持。</p>
          <p><b>首批不计算准确率</b>8—12例用于发现流程和规则问题，不能证明整体有效。</p>
        </div>
      </section>

      <footer>
        <Link className="brand footer-brand" href="/">
          <span className="brand-seal">四</span>
          <span><strong>四镜人生档案</strong><small>先盲断 · 后核验</small></span>
        </Link>
        <p>参与不是认可结论；冲突与退出同样会被记录。</p>
        <a href="#top">回到顶部 ↑</a>
      </footer>
    </main>
  );
}
