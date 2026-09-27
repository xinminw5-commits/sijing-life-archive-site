"use client";

import { useState } from "react";
import { calculateDeterministicChart, ChartCalculationError, type DeterministicChartResult } from "../../domain/chart/index.ts";

const axisCopy = [
  ["结构境 观其序", "先辨一局之主次 组合与承载 不以一词概括一生"],
  ["时序境 察其时", "再察四时寒暖燥湿 明其所宜 亦明其所待"],
  ["气机境 通其气", "看力量从何而来 向何处去 辨其流转与阻滞"],
  ["人生境 验其应", "最后落回岁运与真实人生 于经历之中逐一求证"],
] as const;

export function PilotIntake({ compact = false }: { compact?: boolean }) {
  const [birth, setBirth] = useState({ callName: "", date: "", time: "", place: "", gender: "", calendar: "公历", focus: "", consent: false });
  const [chart, setChart] = useState<DeterministicChartResult | null>(null);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [copied, setCopied] = useState(false);

  const ready = Boolean(birth.callName.trim() && birth.date && birth.time && birth.place.trim() && birth.gender && birth.consent);

  function update(key: keyof typeof birth, value: string | boolean) {
    setBirth((current) => ({ ...current, [key]: value }));
    setChart(null); setError(""); setAnalysis(""); setAnalysisError("");
  }

  async function requestAnalysis(result: DeterministicChartResult) {
    setAnalysisLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birth: { callName: birth.callName.trim(), date: birth.date, time: birth.time, place: birth.place.trim(), gender: birth.gender, focus: birth.focus.trim() || "整体人生结构" },
          chart: result,
        }),
      });
      const payload = (await response.json()) as { report?: string; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error || "补充说明暂时无法生成");
      setAnalysis(payload.report);
    } catch (requestError) {
      setAnalysisError(requestError instanceof Error ? requestError.message : "补充说明暂时无法生成");
    } finally {
      setAnalysisLoading(false);
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
        gender: birth.gender === "女" ? "woman" : "man", birthPlace: { city: birth.place.trim() },
        source: { timeSource: "S1", timePrecision: "P2", calendarConfirmed: true },
      });
      setChart(result); setError(""); void requestAnalysis(result);
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
      `出生资料 ${birth.date} ${birth.time} ${birth.place}`,
      variant ? `四柱 ${variant.pillars.map((pillar) => pillar.name).join(" ")}` : "命盘状态 存在多个候选结果 需要核对出生时间",
      variant ? `日主 ${variant.pillars.find((pillar) => pillar.position === "day")?.stem || "待确认"}` : "",
      "说明 这是按固定历法口径生成的基础档案 不是已经完成现实核验的确定性结论",
    ].filter(Boolean).join("\n");
  }

  async function copyResult() {
    try { await navigator.clipboard.writeText(summary()); setCopied(true); window.setTimeout(() => setCopied(false), 2200); } catch { setCopied(false); }
  }

  function clear() {
    setBirth({ callName: "", date: "", time: "", place: "", gender: "", calendar: "公历", focus: "", consent: false });
    setChart(null); setError(""); setAnalysis(""); setAnalysisError("");
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
        <label className="archive-primary-field"><span>怎么称呼你 <small>称呼就是这份档案的识别代号</small></span><input value={birth.callName} onChange={(event) => update("callName", event.target.value)} placeholder="例如 均均" autoComplete="nickname" /></label>
        <p className="archive-form-section-title">出生信息</p>
        <div className="archive-form-grid">
          <label><span>历法</span><select value={birth.calendar} onChange={(event) => update("calendar", event.target.value)}><option>公历</option><option>农历</option></select></label>
          <label><span>出生地 <small>城市或区县即可</small></span><input value={birth.place} onChange={(event) => update("place", event.target.value)} placeholder="例如 上海" /></label>
          <label><span>出生日期</span><input type="date" value={birth.date} onChange={(event) => update("date", event.target.value)} /></label>
          <label><span>出生时刻</span><input type="time" value={birth.time} onChange={(event) => update("time", event.target.value)} /></label>
          <label><span>性别 <small>用于大运顺逆</small></span><select value={birth.gender} onChange={(event) => update("gender", event.target.value)}><option value="">请选择</option><option>男</option><option>女</option></select></label>
          <label className="archive-form-span"><span>想先了解的主题 <small>可选</small></span><input value={birth.focus} onChange={(event) => update("focus", event.target.value)} placeholder="例如 事业 关系 迁移或当前阶段" /></label>
        </div>
        <label className="archive-consent"><input type="checkbox" checked={birth.consent} onChange={(event) => update("consent", event.target.checked)} /><span>我同意使用本次出生信息生成档案<br />本站不作长期留存</span></label>
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
        <div className="archive-result-actions"><button type="button" onClick={copyResult}>{copied ? "已复制" : "复制基础档案"}</button><a href="#deeper">带着具体问题找均均</a></div>
        <section className="archive-deeper" id="deeper"><div className="archive-deeper-heading"><h4>进一步解读</h4><span>{analysisLoading ? "生成中" : analysis ? "已生成" : "等待生成"}</span></div>{analysisLoading && <p>正在整理命盘结构与人生主题<br />请稍候</p>}{analysisError && <p className="archive-error">{analysisError}</p>}{analysis && <div className="archive-analysis-text">{analysis}</div>}</section>
      </div>}
    </section>
  );
}
