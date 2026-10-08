"use client";

import { ScrollLink } from "../ScrollLink";
import { AccountTools } from "./AccountTools";
import { useRef, useState } from "react";
import { provinces, resolveBirthPlace, type RegionSelection } from "../../lib/regions/index.ts";
import { calculateDeterministicChart, ChartCalculationError, type DeterministicChartResult } from "../../domain/chart/index.ts";

const axisCopy = [
  ["结构境 观其序", "先辨一局之主次 组合与承载 不以一词概括一生"],
  ["时序境 察其时", "再察四时寒暖燥湿 明其所宜 亦明其所待"],
  ["气机境 通其气", "看力量从何而来 向何处去 辨其流转与阻滞"],
  ["人生境 验其应", "最后落回岁运与真实人生 于经历之中逐一求证"],
] as const;

const reportHeadings = ["总脉络", "结构境 观其序", "时序境 察其时", "气机境 通其气", "人生境 验其应", "事业与财务", "关系与边界", "当前阶段", "现实核验清单", "结语"] as const;

const axisExplanations: Record<string, string> = {
  "结构境 观其序": "这一部分是在说：你的命盘内部，哪些力量是主线，哪些力量在支持或牵制它。先看清这个底层顺序，才不会把某一个性格标签当成全部人生。",
  "时序境 察其时": "这一部分是在说：同一种能力放在不同的环境和阶段里，表现会不一样。这里关注的是当下的条件、压力与机会，而不是给你贴一个永远不变的标签。",
  "气机境 通其气": "这一部分是在说：你的精力、表达、资源和行动是怎样流动的，哪里容易卡住，怎样转换之后更容易形成实际成果。",
  "人生境 验其应": "这一部分是在说：把前面的结构带回真实经历，用工作、关系、迁移和阶段变化去核对。能被事实验证的才保留，不能对应的就继续标为待确认。",
};

const axisMeta: Record<string, { source: string; question: string; links: string }> = {
  "结构境 观其序": { source: "子平真诠", question: "这张命盘的主次与承载是什么？", links: "时序境 · 气机境" },
  "时序境 察其时": { source: "穷通宝鉴", question: "同一种力量，为什么在此时这样表现？", links: "结构境 · 人生境" },
  "气机境 通其气": { source: "滴天髓", question: "力量从哪里来，又如何变成行动？", links: "结构境 · 现实表现" },
  "人生境 验其应": { source: "岁运与现实验证", question: "哪些判断能回到经历中被核对？", links: "当前阶段 · 核验清单" },
};

type ReportBlock = { title: string; body: string };

function parseReport(report: string): ReportBlock[] {
  const matches = [...report.matchAll(/^(?:#{1,3}\s*)?(.+?)\s*$/gm)]
    .filter((match) => reportHeadings.includes(match[1].trim() as typeof reportHeadings[number]));
  if (!matches.length) return [{ title: "完整分析", body: report.trim() }];
  return matches.map((match, index) => ({
    title: match[1].trim(),
    body: report.slice(match.index! + match[0].length, matches[index + 1]?.index ?? report.length)
      .replace(/^\s+/, "")
      .trim(),
  })).filter((block) => block.body);
}

export function PilotIntake({ compact = false }: { compact?: boolean }) {
  const generation = useRef(0);
  const [birth, setBirth] = useState({ callName: "", date: "", time: "", place: "", gender: "", calendar: "公历", focus: "", context: "", consent: false });
  const [region, setRegion] = useState<RegionSelection>({ province: "", city: "", district: "" });
  const [manualPlace, setManualPlace] = useState(false);
  const regionPlace = resolveBirthPlace(region);
  const place = manualPlace ? birth.place.trim() : regionPlace;
  const cities = provinces.find((item) => item.code === region.province)?.children ?? [];
  const districts = cities.find((item) => item.code === region.city)?.children ?? [];
  const [chart, setChart] = useState<DeterministicChartResult | null>(null);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [copied, setCopied] = useState(false);
  const [openExplanations, setOpenExplanations] = useState<Record<string, boolean>>({});

  const ready = Boolean(birth.callName.trim() && birth.date && birth.time && place && birth.gender && birth.consent);

  function update(key: keyof typeof birth, value: string | boolean) {
    generation.current++; setAnalysisLoading(false);
    setBirth((current) => ({ ...current, [key]: value }));
    setChart(null); setError(""); setAnalysis(""); setAnalysisError(""); setOpenExplanations({});
  }

  function updateRegion(level: keyof RegionSelection, value: string) {
    setRegion((current) => level === "province"
      ? { province: value, city: "", district: "" }
      : level === "city" ? { ...current, city: value, district: "" }
      : { ...current, district: value });
    update("place", "");
  }

  async function requestAnalysis(result: DeterministicChartResult, version: number) {
    setAnalysisLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birth: { callName: birth.callName.trim(), date: birth.date, time: birth.time, place, gender: birth.gender, focus: birth.focus.trim() || "整体人生结构", context: birth.context.trim() },
          chart: result,
        }),
      });
      const raw = await response.text();
      let payload: { report?: string; error?: string };
      try {
        payload = JSON.parse(raw) as { report?: string; error?: string };
      } catch {
        throw new Error("分析接口暂时没有返回有效结果，请刷新页面后重试");
      }
      if (!response.ok || !payload.report) throw new Error(payload.error || "补充说明暂时无法生成");
      if (generation.current === version) setAnalysis(payload.report);
    } catch (requestError) {
      if (generation.current === version) setAnalysisError(requestError instanceof Error ? requestError.message : "补充说明暂时无法生成");
    } finally {
      if (generation.current === version) setAnalysisLoading(false);
    }
  }

  function generate() {
    if (!ready) return;
    const dateParts = birth.date.split("-").map(Number);
    const timeParts = birth.time.split(":").map(Number);
    try {
      const result = calculateDeterministicChart({
        calendar: birth.calendar === "公历" ? "gregorian" : "chinese_lunar",
        date: { year: dateParts[0], month: dateParts[1], day: dateParts[2] },
        time: { hour: timeParts[0], minute: timeParts[1] },
        timeZone: "Asia/Shanghai", clockStandard: "china_standard_time",
        calculationTimeBasis: "china_standard_time", dayBoundary: "zi_hour_starts_next_day",
        gender: birth.gender === "女" ? "woman" : "man", birthPlace: { city: place },
        source: { timeSource: "S1", timePrecision: "P2", calendarConfirmed: true },
      });
      setChart(result); setError(""); void requestAnalysis(result, ++generation.current);
    } catch (calculationError) {
      setChart(null);
      setError(calculationError instanceof ChartCalculationError ? calculationError.message : "这组资料暂时无法计算 请检查日期和时间");
    }
  }

  function summary() {
    if (!chart) return "";
    const variant = chart.selectedVariant;
    return [
      "四境人生档案 基础结果",
      `称呼 ${birth.callName.trim()}`,
      `出生资料 ${birth.date} ${birth.time} ${place}`,
      variant ? `四柱 ${variant.pillars.map((pillar) => pillar.name).join(" ")}` : "命盘状态 存在多个候选结果 需要核对出生时间",
      variant ? `日主 ${variant.pillars.find((pillar) => pillar.position === "day")?.stem || "待确认"}` : "",
      "说明 这是按固定历法口径生成的基础档案 不是已经完成现实核验的确定性结论",
    ].filter(Boolean).join("\n");
  }

  async function copyResult() {
    try { await navigator.clipboard.writeText(summary()); setCopied(true); window.setTimeout(() => setCopied(false), 2200); } catch { setCopied(false); }
  }

  function clear() {
    setRegion({ province: "", city: "", district: "" }); setManualPlace(false);
    setBirth({ callName: "", date: "", time: "", place: "", gender: "", calendar: "公历", focus: "", context: "", consent: false });
    setChart(null); setError(""); setAnalysis(""); setAnalysisError(""); setOpenExplanations({});
  }

  return (
    <section className={`archive-tool${compact ? " archive-tool--hero" : ""}`} id="intake" aria-labelledby="archive-tool-title">
      {!compact && <div className="archive-tool-heading">
        <div>
          <p className="eyebrow"><span /> 基础档案</p>
          <h2 id="archive-tool-title">建立你的四境档案</h2>
          <p>先留下称呼<br />再建立属于你的四轴档案</p>
        </div>
        <button className="archive-clear" type="button" onClick={clear}>清空本页</button>
      </div>}

      <div className="archive-form-card">
        {compact && <div className="archive-form-title"><span>免费基础档案</span><h2 id="archive-tool-title">建立你的四境档案</h2><p>先留下称呼<br />再建立属于你的四轴档案</p></div>}
        <AccountTools birth={{ ...birth, place }} report={analysis} onRegisterName={name => setBirth(current => ({ ...current, callName: current.callName || name }))} onLogout={() => { generation.current++; setAnalysisLoading(false); setBirth({ callName: "", date: "", time: "", place: "", gender: "", calendar: "公历", focus: "", context: "", consent: false }); setRegion({ province: "", city: "", district: "" }); setChart(null); setAnalysis(""); setAnalysisError(""); setOpenExplanations({}); }} onRestore={saved => { generation.current++; setAnalysisLoading(false); setBirth(saved.birth); setManualPlace(true); setChart(saved.chart as DeterministicChartResult); setAnalysis(saved.report); }} />
        <label className="archive-primary-field"><span>怎么称呼你 <small>称呼就是这份档案的识别代号</small></span><input value={birth.callName} onChange={(event) => update("callName", event.target.value)} placeholder="C07" autoComplete="nickname" /></label>
        <p className="archive-form-section-title">出生信息</p>
        <div className="archive-form-grid">
          <label><span>历法</span><select value={birth.calendar} onChange={(event) => update("calendar", event.target.value)}><option>公历</option><option>农历</option></select></label>
          <label><span>出生日期</span><input type="date" value={birth.date} onChange={(event) => update("date", event.target.value)} /></label>
          <label><span>出生时刻</span><input type="time" value={birth.time} onChange={(event) => update("time", event.target.value)} /></label>
          <label><span>性别 <small>用于大运顺逆</small></span><select value={birth.gender} onChange={(event) => update("gender", event.target.value)}><option value="">请选择</option><option>男</option><option>女</option></select></label>
          <fieldset className="archive-place archive-form-span">
            <legend>出生地</legend>
            {!manualPlace && <div className="archive-place-grid">
              <label><span>省 / 自治区 / 直辖市</span><select value={region.province} onChange={(event) => updateRegion("province", event.target.value)}><option value="">请选择省级地区</option>{provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
              <label><span>市 / 自治州</span><select value={region.city} disabled={!region.province} onChange={(event) => updateRegion("city", event.target.value)}><option value="">请选择市级地区</option>{cities.map((item) => <option key={item.code} value={item.code}>{item.name === "市辖区" ? "市辖区（直属）" : item.name}</option>)}</select></label>
              <label><span>县 / 区</span><select value={region.district} disabled={!region.city} onChange={(event) => updateRegion("district", event.target.value)}><option value="">请选择县或区</option>{districts.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
            </div>}
            {manualPlace && <label><span>手动填写出生地</span><input value={birth.place} onChange={(event) => update("place", event.target.value)} placeholder="填写省、市及县区或历史地名" /></label>}
            <button className="archive-place-toggle" type="button" onClick={() => { setManualPlace(!manualPlace); update("place", ""); }}>{manualPlace ? "返回省市区选择" : "港澳台、未收录地区或历史地名？手动填写"}</button>
            <small className="archive-place-note">当前按北京时间排盘；其他时区的出生资料暂不支持。</small>
          </fieldset>
          <label className="archive-form-span"><span>想先了解的主题 <small>可选</small></span><input value={birth.focus} onChange={(event) => update("focus", event.target.value)} placeholder="例如 事业 关系 迁移或当前阶段" /></label>
          <label className="archive-form-span"><span>现实处境与经历 <small>越具体 越能避免泛泛而谈</small></span><textarea rows={5} value={birth.context} onChange={(event) => update("context", event.target.value)} placeholder="可以写最近几年重要的工作、关系、迁移、财务或情绪经历，以及你现在最想核对的问题。登录并主动保存后，下次可以继续。" /></label>
        </div>
        <label className="archive-consent"><input type="checkbox" checked={birth.consent} onChange={(event) => update("consent", event.target.checked)} /><span>我同意使用本次出生信息生成档案<br />登录后生成的报告与讨论会保存到个人账户，仅用于个人档案及均均服务复核，可导出或删除，不用于研究或公开展示</span></label>
        <div className="archive-generate-row"><button className="button button-primary" type="button" onClick={generate} disabled={!ready}>生成我的基础档案</button>{!ready && <small>请留下称呼并补全出生信息与授权</small>}</div>
        {error && <p className="archive-error" role="alert">{error}</p>}
      </div>

      {chart && <div className="archive-result" aria-live="polite">
        <div className="archive-result-heading"><div><p className="eyebrow"><span /> {birth.callName.trim()}的四境档案</p><h3>{chart.status === "confirmed_single" ? "基础档案已生成" : "出生时间需要进一步核对"}</h3></div><span className="archive-status">{chart.status === "confirmed_single" ? "已生成" : "待核对"}</span></div>
        {chart.selectedVariant ? <>
          <div className="archive-pillars">{chart.selectedVariant.pillars.map((pillar) => <div key={pillar.position}><small>{pillar.position === "year" ? "年柱" : pillar.position === "month" ? "月柱" : pillar.position === "day" ? "日柱" : "时柱"}</small><strong>{pillar.name}</strong><span>{pillar.stemElement} {pillar.branchElement}</span></div>)}</div>
          <div className="archive-axis-grid">{axisCopy.map(([title, body]) => <article key={title}><span>{title}</span><p>{body}</p></article>)}</div>
          <p className="archive-boundary">日主是结构计算中的日干 不等于完整性格结论<br />具体年份 关系和现实问题 需要带着事实再做核验</p>
        </> : <p className="archive-boundary">当前存在多个候选命盘 网页不会替你强行选定其中一个<br />先核对出生时间 再决定是否深入</p>}
        <div className="archive-result-actions"><button type="button" onClick={copyResult}>{copied ? "已复制" : "复制基础档案"}</button><ScrollLink target="deeper">带着具体问题找均均</ScrollLink></div>
        <section className="archive-deeper" id="deeper">
          <div className="archive-deeper-heading"><div><p className="eyebrow"><span /> 深入阅读</p><h4>进一步解读</h4></div><span>{analysisLoading ? "生成中" : analysis ? "已生成" : "等待生成"}</span></div>
          {analysisLoading && <div className="archive-analysis-loading"><i />正在整理命盘结构与人生主题<br />请稍候</div>}
          {analysisError && <p className="archive-error">{analysisError}</p>}
          {analysis && <AnalysisDisplay report={analysis} openExplanations={openExplanations} setOpenExplanations={setOpenExplanations} />}
        </section>
      </div>}
    </section>
  );
}

function AnalysisDisplay({ report, openExplanations, setOpenExplanations }: { report: string; openExplanations: Record<string, boolean>; setOpenExplanations: (value: Record<string, boolean>) => void }) {
  const blocks = parseReport(report);
  const summary = blocks.find((block) => block.title === "总脉络");
  const axes = blocks.filter((block) => axisExplanations[block.title]);
  const supporting = blocks.filter((block) => block !== summary && !axisExplanations[block.title]);
  const [activeAxis, setActiveAxis] = useState(0);
  const activeBlock = axes[activeAxis] ?? axes[0];

  function toggle(title: string) {
    setOpenExplanations({ ...openExplanations, [title]: !openExplanations[title] });
  }

  return <div className="archive-analysis-layout">
    {summary && <article className="analysis-summary"><div className="analysis-kicker">先看这一条主线</div><h5>{summary.title}</h5><p>{summary.body}</p></article>}
    {axes.length > 0 && <>
      <div className="analysis-axis-intro"><span>四境阅览台</span><p>点击左侧印记切换阅读视角。先看正式分析，再打开白话译注；四个方向共同组成一份人生档案。</p></div>
      <div className="analysis-lens-shell">
        <aside className="analysis-lens-index"><div className="analysis-panel-label">四境分工</div><p>一份档案，四种观看方式</p>
          <nav className="analysis-lens-rail" aria-label="四境分析视角">
          {axes.map((block, index) => <button className={`analysis-lens-tab axis-${index + 1}${activeAxis === index ? " is-active" : ""}`} type="button" role="tab" aria-selected={activeAxis === index} key={block.title} onClick={() => setActiveAxis(index)}>
            <span className="analysis-lens-tab-index">0{index + 1}</span><span className="analysis-lens-tab-name">{block.title.split(" ")[0]}</span><small>{block.title.split(" ").slice(1).join(" ")}</small><i />
          </button>)}
          </nav>
          <div className="analysis-index-note">点击一境，中央档案会切换；右侧译注同步更新。</div>
        </aside>
        {activeBlock && <article className={`analysis-lens-stage axis-${activeAxis + 1}`} key={activeBlock.title} role="tabpanel">
          <div className="analysis-lens-stage-top"><span>当前视角 · {String(activeAxis + 1).padStart(2, "0")}</span><em>{activeBlock.title.split(" ").slice(1).join(" ")}</em></div>
          <div className="analysis-lens-title"><b>{activeBlock.title.split(" ")[0]}</b><h5>{activeBlock.title.split(" ").slice(1).join(" ")}</h5></div>
          <div className="analysis-lens-rule" />
          <div className="analysis-lens-label">原文解读</div>
          <p className="analysis-official">{activeBlock.body}</p>
          <button className={`analysis-explain-button${openExplanations[activeBlock.title] ? " is-open" : ""}`} type="button" aria-expanded={Boolean(openExplanations[activeBlock.title])} onClick={() => toggle(activeBlock.title)}>
            <span><b>{openExplanations[activeBlock.title] ? "收起译注" : "打开白话译注"}</b><small>{openExplanations[activeBlock.title] ? "回到正式分析" : "把这一轴翻译成日常语言"}</small></span><strong>{openExplanations[activeBlock.title] ? "↑" : "↓"}</strong>
          </button>
          {openExplanations[activeBlock.title] && <div className="analysis-explanation"><span>白话译注</span>{axisExplanations[activeBlock.title]}</div>}
        </article>}
        {activeBlock && <aside className="analysis-lens-context"><div className="analysis-panel-label">当前轴档案</div><div className="analysis-context-seal">{activeBlock.title.slice(0, 1)}</div><h5>{activeBlock.title}</h5><span className="analysis-context-source">依据 · {axisMeta[activeBlock.title]?.source}</span><div className="analysis-context-rule" /><small>它主要回答</small><p>{axisMeta[activeBlock.title]?.question}</p><div className="analysis-context-translate"><span>白话译注</span><p>{axisExplanations[activeBlock.title]}</p></div><small>关联阅读</small><b className="analysis-context-links">{axisMeta[activeBlock.title]?.links}</b></aside>}
      </div>
    </>}
    {supporting.length > 0 && <div className="analysis-supporting"><div className="analysis-supporting-heading"><span>落回现实</span><p>这些部分把四轴分析放回工作、关系、阶段和具体核验。</p></div><div className="analysis-supporting-grid">{supporting.map((block) => <article key={block.title}><h5>{block.title}</h5><p>{block.body}</p></article>)}</div></div>}
  </div>;
}
