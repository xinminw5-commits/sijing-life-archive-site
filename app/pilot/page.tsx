import type { Metadata } from "next";
import Link from "next/link";
import { PilotIntake } from "./PilotIntake";

export const metadata: Metadata = {
  title: "基础排盘 四境人生档案",
  description: "填写出生资料 生成四柱与四轴基础人生档案",
};

export default function PilotPage() {
  return <main className="archive-home pilot-page"><header className="site-header archive-header"><Link className="brand" href="/" aria-label="返回四境人生档案首页"><span className="brand-seal">四</span><span><strong>四境人生档案</strong><small>SIJING ARCHIVE</small></span></Link><nav aria-label="排盘页导航"><Link href="/">四境体系</Link><a className="nav-cta" href="#intake">建立档案</a></nav></header><section className="archive-subhero"><p className="eyebrow"><span /> 基础档案</p><h1>从出生时刻<br /><em>看见人生的四个维度</em></h1><p>填写出生信息 生成结构 环境 气机与人生阶段的基础概览</p></section><PilotIntake /><section className="archive-quiet-note"><p>理解命盘<br />也尊重人生的复杂与选择</p></section></main>;
}
