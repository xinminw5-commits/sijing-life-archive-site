import type { Metadata } from "next";
import { HeroSignals } from "./HeroSignals";
import { PilotIntake } from "./pilot/PilotIntake";

export const metadata: Metadata = {
  title: "四境人生档案 一生万象 映于四境",
  description: "填写出生资料 生成结构轴 环境轴 气机轴 事件轴四轴基础人生档案",
};

const axes = [
  ["结构境", "看见内在秩序", "从月令 格局和组合关系入手 理解一张命盘真正的核心结构", "子平真诠"],
  ["时序境", "看见时势条件", "观察季节与环境如何放大或限制同一种禀赋 避免脱离现实谈命盘", "穷通宝鉴"],
  ["气机境", "看见流动方式", "理解力量从哪里来 向哪里去 以及一个人如何承接与转化", "滴天髓"],
  ["人生境", "看见人生节奏", "把命盘带回真实经历与时间变化 让判断可以被核对 修正和延续", "岁运与现实验证"],
] as const;

export default function Home() {
  return <main className="archive-home">
    <header className="site-header archive-header"><a className="brand" href="#top" aria-label="四境人生档案首页"><span className="brand-seal">四</span><span><strong>四境人生档案</strong><small>SIJING ARCHIVE</small></span></a><nav aria-label="主导航"><a href="#method">四境体系</a><a href="#boundary">解读边界</a><a className="nav-cta" href="#intake">建立档案</a></nav></header>
    <section className="premium-hero premium-hero-workbench" id="top">
      <div className="workbench-center">
        <p className="eyebrow"><span /> PERSONAL LIFE ARCHIVE</p>
        <h1>一生万象<br /><em>映于四境</em></h1>
        <p className="workbench-lead">从出生时间开始，建立一份可以阅读、追问，也可以被现实修正的个人档案。</p>
        <div className="workbench-compass" aria-hidden="true"><div className="compass-ring compass-ring-outer" /><div className="compass-ring compass-ring-inner" /><span className="compass-word compass-word-top">观其序</span><span className="compass-word compass-word-right">察其时</span><span className="compass-word compass-word-bottom">验其应</span><span className="compass-word compass-word-left">通其气</span><div className="compass-core"><small>四境</small><strong>档案</strong><em>ARCHIVE</em></div></div>
        <HeroSignals />
      </div>
      <aside className="workbench-index"><div className="workbench-index-head"><span>四境分工</span><b>SIJING<br />ARCHIVE</b></div><p className="workbench-index-title">一份档案<br />四种观看方式</p><div className="workbench-axis-list">{axes.map(([title, subtitle, , source], index) => <div className={`workbench-axis-row axis-${index + 1}`} key={title}><strong>0{index + 1}</strong><span><b>{title}</b><small>{subtitle}</small></span><em>{source}</em></div>)}</div><p className="workbench-index-note">不以一个标签概括一生<br />让结构、时序、气机与经历互相核对。</p></aside>
      <PilotIntake compact />
    </section>
    <section className="archive-method" id="method"><div className="archive-section-heading"><p className="eyebrow"><span /> 四境体系</p><h2>同一段人生<br />需要四种观看方式</h2><p>我们不依赖单一标签解释一个人 而是把结构 处境 流动与时间放在一起理解</p></div><div className="archive-axis-cards">{axes.map(([title, subtitle, body, source]) => <article key={title}><small>{source}</small><h3>{title}</h3><strong>{subtitle}</strong><p>{body}</p></article>)}</div></section>
    <section className="archive-boundary-section" id="boundary"><div><p className="eyebrow light"><span /> 解读边界</p><h2>有依据<br />也保留边界</h2></div><div className="archive-boundary-list"><p><b>不掩盖不确定性</b>出生时间或判断条件存在边界时 会明确说明 不用笃定语气替代证据</p><p><b>不利用恐惧成交</b>不渲染灾祸 疾病和危险 也不替代医疗 法律与财务等专业意见</p><p><b>深入解读需要真实处境</b>事业 关系 迁移和具体年份 需要结合你的现实问题 由均均继续分析</p></div></section>
    <footer><a className="brand footer-brand" href="#top"><span className="brand-seal">四</span><span><strong>四境人生档案</strong><small>结构　时序　气机　人生</small></span></a><p>理解命盘<br />也尊重人生的复杂与选择</p><a href="#top">回到顶部</a></footer>
  </main>;
}
