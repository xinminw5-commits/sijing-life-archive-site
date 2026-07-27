import type { Metadata } from "next";
import { PilotIntake } from "./PilotIntake";

export const metadata: Metadata = {
  title: "首批封闭内测｜四派人生档案会诊",
  description: "先提交出生资料，锁定首轮判断，再补充人生事实。首批8—12例封闭验证，不承诺准确率。",
};

const process = [
  ["01", "出生资料", "只核对日期、时间、地点、来源与误差，不接收人生经历。"],
  ["02", "人工锁定", "完成候选命盘、首轮判断和反证问题，记录版本、编号与时间。"],
  ["03", "事实回填", "参与者持锁定编号补充至少三个客观人生锚点。"],
  ["04", "逐条核验", "匹配、部分、冲突、未知同等保留，并安排一次延迟回访。"],
];

export default function PilotPage() {
  return (
    <main className="pilot-page">
      <header className="site-header pilot-header">
        <a className="brand" href="/" aria-label="返回四派人生档案会诊首页">
          <span className="brand-seal">四</span>
          <span>
            <strong>人生档案会诊</strong>
            <small>封闭内测 · PILOT V0</small>
          </span>
        </a>
        <nav aria-label="内测页导航">
          <a href="#how">流程</a>
          <a href="#criteria">入选条件</a>
          <a className="nav-cta" href="#intake">填写资料</a>
        </nav>
      </header>

      <section className="pilot-hero" id="top">
        <div className="pilot-hero-copy">
          <p className="eyebrow"><span /> 首批 8—12 例 · 邀请制</p>
          <h1>不是来证明“很准”，<br /><em>是来检查哪里会错。</em></h1>
          <p>
            第一批封闭内测采用两阶段流程：先交出生资料，等首轮判断锁定后，再交真实经历。命中、冲突和不知道都会留下。
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#intake">进入两阶段资料台 <span>↓</span></a>
            <a className="text-link" href="/">返回服务介绍 <span>↗</span></a>
          </div>
        </div>
        <aside className="pilot-hero-card">
          <span>本轮目标</span>
          <strong>建立第一批<br />可反证样本</strong>
          <ul>
            <li>不提前收人生经历</li>
            <li>不只保留“命中”</li>
            <li>不公开真实身份</li>
            <li>不宣传未经证明的准确率</li>
          </ul>
          <small>当前为人工封闭流程，不是自动算命工具。</small>
        </aside>
      </section>

      <section className="pilot-process" id="how">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow"><span /> 为什么分两次</p>
            <h2>先锁答案，<br />再让事实进场。</h2>
          </div>
          <p>如果先看到人生经历，后来再说“命盘早已显示”，就无法区分事前判断与事后解释。两阶段不是仪式，而是最低证据门槛。</p>
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
          <p className="eyebrow light"><span /> 适合参加</p>
          <h2>时间可以不完美，<br />但来源必须诚实。</h2>
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
          <p><b>本页不上传资料</b>所有内容只在当前页面内生成，由参与者主动复制。</p>
          <p><b>三种授权分开</b>完成服务、匿名研究、公开展示分别选择，后两项默认关闭。</p>
          <p><b>高风险问题中止</b>医疗、法律、重大财务及人身安全问题回到现实专业支持。</p>
          <p><b>首批不计算准确率</b>8—12例用于发现流程和规则问题，不能证明整体有效。</p>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="/">
          <span className="brand-seal">四</span>
          <span><strong>人生档案会诊</strong><small>先盲断 · 后核验</small></span>
        </a>
        <p>参与不是认可结论；冲突与退出同样会被记录。</p>
        <a href="#top">回到顶部 ↑</a>
      </footer>
    </main>
  );
}

