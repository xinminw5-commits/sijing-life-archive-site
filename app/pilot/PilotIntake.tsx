"use client";

import { useMemo, useState } from "react";
import { calculateDeterministicChart, ChartCalculationError, type DeterministicChartResult } from "../../domain/chart/index.ts";

type IntakeStage = "birth" | "facts";

type Anchor = {
  period: string;
  domain: string;
  fact: string;
  certainty: string;
  evidence: string;
};

const emptyAnchor = (): Anchor => ({
  period: "",
  domain: "",
  fact: "",
  certainty: "",
  evidence: "",
});

function parseDate(value: string) {
  const match = value.trim().match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseTime(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::|点)(\d{0,2})?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function renderAnalysis(report: string) {
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;

  report.split(/\r?\n/).forEach((line) => {
    const match = line.trim().match(/^(?:#{1,4}\s*)?(?:\d+[、.)]\s*)?(整体底色|优势与可用能力|容易卡住的地方|事业与财务|关系与边界|阶段节奏|当前建议|需要现实验证的部分|继续追问)\s*[:：]?\s*(.*)$/);
    if (match) {
      current = { title: match[1], body: match[2] ? [match[2]] : [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    }
  });

  if (!sections.length) return <div className="pilot-analysis-plain">{report}</div>;
  return (
    <div className="pilot-report-grid">
      {sections.map((section) => (
        <article className="pilot-report-section" key={section.title}>
          <h3>{section.title}</h3>
          <div>{section.body.join("\n").trim()}</div>
        </article>
      ))}
    </div>
  );
}

export function PilotIntake() {
  const [stage, setStage] = useState<IntakeStage>("birth");
  const [copied, setCopied] = useState<"birth" | "facts" | null>(null);
  const [chartResult, setChartResult] = useState<DeterministicChartResult | null>(null);
  const [chartError, setChartError] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [factsPacket, setFactsPacket] = useState("");
  const [eligible, setEligible] = useState({
    adult: false,
    timeSource: false,
    followup: false,
  });
  const [birth, setBirth] = useState({
    alias: "",
    calendar: "公历",
    date: "",
    time: "",
    source: "S1｜父母或直接知情人稳定回忆",
    sourceNote: "",
    precision: "P2｜误差约30—120分钟",
    place: "",
    timezone: "中国标准时间（UTC+8）",
    genderMarker: "",
    familiarity: "完全不了解",
    knownContext: "",
    focus: "",
    serviceConsent: false,
    researchConsent: false,
    publicConsent: false,
  });
  const [lock, setLock] = useState({
    caseId: "",
    lockId: "",
    lockedAt: "",
    confirmed: false,
  });
  const [anchors, setAnchors] = useState<Anchor[]>([
    emptyAnchor(),
    emptyAnchor(),
    emptyAnchor(),
  ]);
  const [background, setBackground] = useState("");
  const [factsConsent, setFactsConsent] = useState(false);

  const eligibleReady = true;
  const birthReady =
    eligibleReady &&
    birth.date.trim() &&
    birth.time.trim() &&
    birth.calendar &&
    birth.place.trim() &&
    birth.genderMarker &&
    birth.serviceConsent;
  const lockReady =
    lock.caseId.trim() &&
    lock.lockId.trim() &&
    lock.lockedAt &&
    lock.confirmed;
  const completeAnchors = useMemo(
    () =>
      anchors.filter(
        (anchor) =>
          anchor.period.trim() &&
          anchor.domain &&
          anchor.fact.trim() &&
          anchor.certainty &&
          anchor.evidence,
      ),
    [anchors],
  );
  const factsReady = lockReady && completeAnchors.length >= 3 && factsConsent;

  function updateBirth<K extends keyof typeof birth>(key: K, value: (typeof birth)[K]) {
    setBirth((current) => ({ ...current, [key]: value }));
    setChartResult(null);
    setChartError("");
    setAnalysis("");
    setAnalysisError("");
  }

  function updateLock<K extends keyof typeof lock>(key: K, value: (typeof lock)[K]) {
    setLock((current) => ({ ...current, [key]: value }));
    setFactsPacket("");
  }

  function updateAnchor(index: number, key: keyof Anchor, value: string) {
    setAnchors((current) =>
      current.map((anchor, anchorIndex) =>
        anchorIndex === index ? { ...anchor, [key]: value } : anchor,
      ),
    );
    setFactsPacket("");
  }

  async function copyPacket(text: string, packet: "birth" | "facts") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(packet);
      window.setTimeout(() => setCopied(null), 2200);
    } catch {
      setCopied(null);
    }
  }

  function buildBirthPacket() {
    if (!birthReady) return;
    const date = parseDate(birth.date);
    const time = parseTime(birth.time);
    if (!date || !time) {
      setChartError("请把出生日期写成 1995-08-16，出生时间写成 14:35 或 14点30分。网站才能直接计算。");
      return;
    }
    if (birth.calendar === "不确定，需要核对") {
      setChartError("日历类型还不确定，暂时不能直接生成准确结果；请先确认是公历还是农历。");
      return;
    }
    if (birth.genderMarker === "暂不提供，先确认是否影响排盘") {
      setChartError("当前大运计算需要性别标记。你可以先选择男或女，之后仍可在页面里重新修改。");
      return;
    }
    try {
      const result = calculateDeterministicChart({
        calendar: birth.calendar === "公历" ? "gregorian" : "chinese_lunar",
        date,
        time,
        timeZone: "Asia/Shanghai",
        clockStandard: "china_standard_time",
        calculationTimeBasis: "china_standard_time",
        dayBoundary: "zi_hour_starts_next_day",
        gender: birth.genderMarker === "女" ? "woman" : "man",
        birthPlace: { city: birth.place.trim() },
        source: {
          timeSource: birth.source.slice(0, 2) as "S0" | "S1" | "S2" | "S3",
          timePrecision: birth.precision.slice(0, 2) as "P0" | "P1" | "P2" | "P3",
          calendarConfirmed: true,
        },
      });
      setChartResult(result);
      setChartError("");
      void requestAnalysis(result);
    } catch (error) {
      setChartResult(null);
      setChartError(error instanceof ChartCalculationError ? error.message : "这组出生资料暂时无法计算，请检查日期和时间格式。");
    }
  }

  async function requestAnalysis(result: DeterministicChartResult) {
    setAnalysis("");
    setAnalysisError("");
    setAnalysisLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birth: {
            date: birth.date.trim(),
            time: birth.time.trim(),
            place: birth.place.trim(),
            gender: birth.genderMarker,
            focus: birth.focus.trim() || "整体人生结构、事业、关系和当前阶段",
          },
          chart: result,
        }),
      });
      const payload = (await response.json()) as { report?: string; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error || "报告暂时无法生成。");
      setAnalysis(payload.report);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "报告暂时无法生成，请稍后重试。");
    } finally {
      setAnalysisLoading(false);
    }
  }

  function chartSummary() {
    if (!chartResult) return "";
    const variant = chartResult.selectedVariant;
    const lines = [
      "【四镜人生档案｜网页自动生成】",
      `出生资料：${birth.date.trim()} ${birth.time.trim()} · ${birth.place.trim()}`,
      `计算状态：${chartResult.status === "confirmed_single" ? "单一结果" : chartResult.status === "provisional_single" ? "暂定单一结果" : "存在多个候选结果，需要核对时间"}`,
    ];
    if (variant) {
      lines.push(`四柱：${variant.pillars.map((pillar) => pillar.name).join("｜")}`);
      lines.push(`日主：${variant.pillars.find((pillar) => pillar.position === "day")?.stem || "待确认"}`);
      lines.push("大运：" + variant.childLimit.decadeFortunes.map((fortune) => `${fortune.name}（${fortune.startAge}—${fortune.endAge}岁）`).join("、"));
    } else {
      lines.push("当前存在候选命盘，网页不会替你强行选定其中一个。");
    }
    lines.push("说明：这是网页按固定规则生成的结构化结果，不代表未经核验的确定性人生结论。");
    return lines.join("\n");
  }

  function buildFactsPacket() {
    if (!factsReady) return;
    const anchorText = completeAnchors.flatMap((anchor, index) => [
      "",
      `事实锚点 ${index + 1}`,
      `时间/区间：${anchor.period.trim()}`,
      `领域：${anchor.domain}`,
      `客观事实：${anchor.fact.trim()}`,
      `确定程度：${anchor.certainty}`,
      `证据情况：${anchor.evidence}`,
    ]);
    const packet = [
      "【公开体验｜第二阶段事实资料包】",
      "表单版本：pilot-v0",
      `案例编号：${lock.caseId.trim()}`,
      `盲断锁定编号：${lock.lockId.trim()}`,
      `锁定时间：${lock.lockedAt}`,
      "事实进入顺序确认：已在填写事实前收到锁定编号",
      ...anchorText,
      "",
      `必要背景变量：${background.trim() || "无补充"}`,
      "",
      "核验要求：每条判断必须允许匹配、部分、冲突或未知；不得用本资料包覆盖已经锁定的正文。",
    ].join("\n");
    setFactsPacket(packet);
  }

  function clearAll() {
    setEligible({ adult: false, timeSource: false, followup: false });
    setBirth({
      alias: "",
      calendar: "公历",
      date: "",
      time: "",
      source: "S1｜父母或直接知情人稳定回忆",
      sourceNote: "",
      precision: "P2｜误差约30—120分钟",
      place: "",
      timezone: "中国标准时间（UTC+8）",
      genderMarker: "",
      familiarity: "完全不了解",
      knownContext: "",
      focus: "",
      serviceConsent: false,
      researchConsent: false,
      publicConsent: false,
    });
    setLock({ caseId: "", lockId: "", lockedAt: "", confirmed: false });
    setAnchors([emptyAnchor(), emptyAnchor(), emptyAnchor()]);
    setBackground("");
    setFactsConsent(false);
    setFactsPacket("");
    setChartResult(null);
    setChartError("");
    setAnalysis("");
    setAnalysisError("");
    setCopied(null);
  }

  return (
    <section className="pilot-workbench" aria-labelledby="pilot-form-title">
      <div className="pilot-workbench-head">
        <div>
          <p className="eyebrow"><span /> 自助档案生成</p>
          <h2 id="pilot-form-title">填写出生资料，网页直接生成你的整体档案。</h2>
        </div>
        <button className="pilot-clear" type="button" onClick={clearAll}>
          清空本页资料
        </button>
      </div>

      <div className="pilot-handoff" aria-label="获得初步判断的四个步骤">
        <div className="pilot-handoff-head">
          <span>如何获得初步判断</span>
          <p><b>本页会在当前浏览器直接计算。</b>你先看网页生成的完整结构，只有出现具体疑问时再来找均均。</p>
        </div>
        <ol>
          <li><span>01</span><b>填写出生资料</b><small>先完成日期、时间、地点和必要边界。</small></li>
          <li><span>02</span><b>网页自动计算</b><small>直接生成四柱、日主和大运结构。</small></li>
          <li><span>03</span><b>查看整体档案</b><small>结果先留在你的当前浏览器里。</small></li>
          <li><span>04</span><b>有问题再问均均</b><small>不用每个人都先发送整份资料。</small></li>
        </ol>
      </div>

      <div className="pilot-stage-tabs" role="tablist" aria-label="内测资料阶段">
        <button
          type="button"
          role="tab"
          aria-selected={stage === "birth"}
          className={stage === "birth" ? "active" : ""}
          onClick={() => setStage("birth")}
        >
          <span>第一阶段</span>
          出生资料
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={stage === "facts"}
          className={stage === "facts" ? "active" : ""}
          onClick={() => setStage("facts")}
        >
          <span>高级研究</span>
          可选核验
        </button>
      </div>

      {stage === "birth" ? (
        <div className="pilot-panel" role="tabpanel">
          <div className="pilot-panel-intro">
            <span className="pilot-index">A</span>
            <div>
              <h3>开始填写</h3>
              <p>普通用户只需要填写出生日期、时间、地点和性别；网页会自动生成完整报告。</p>
            </div>
          </div>
          <div className="pilot-check-grid pilot-research-gate">
            <label>
              <input
                type="checkbox"
                checked={eligible.adult}
                onChange={(event) =>
                  setEligible((current) => ({ ...current, adult: event.target.checked }))
                }
              />
              <span><b>我已年满18周岁</b>未成年人不进入首批封闭样本。</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={eligible.timeSource}
                onChange={(event) =>
                  setEligible((current) => ({ ...current, timeSource: event.target.checked }))
                }
              />
              <span><b>我能说明时间来源</b>不知道精确分钟也可以，但不能把猜测写成确认。</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={eligible.followup}
                onChange={(event) =>
                  setEligible((current) => ({ ...current, followup: event.target.checked }))
                }
              />
              <span><b>我愿意完成后续核验</b>包括冲突、未知和一次延迟回访。</span>
            </label>
          </div>

          <div className="pilot-panel-intro">
            <span className="pilot-index">B</span>
            <div>
              <h3>出生信息</h3>
              <p>只收排盘和边界核对所需的最小信息，不收详细地址与联系方式。</p>
            </div>
          </div>
          <div className="pilot-form-grid">
            <label>
              <span>自定代号 <small>可选，不写真名</small></span>
              <input
                value={birth.alias}
                onChange={(event) => updateBirth("alias", event.target.value)}
                placeholder="例如：木桥、P07"
              />
            </label>
            <label>
              <span>日历类型 *</span>
              <select
                value={birth.calendar}
                onChange={(event) => updateBirth("calendar", event.target.value)}
              >
                <option value="">请选择</option>
                <option>公历</option>
                <option>农历</option>
                <option>不确定，需要核对</option>
              </select>
            </label>
            <label>
              <span>出生日期 *</span>
              <input
                type="date"
                value={birth.date}
                onChange={(event) => updateBirth("date", event.target.value)}
                aria-label="出生日期"
              />
            </label>
            <label>
              <span>出生时间 *</span>
              <input
                type="time"
                value={birth.time}
                onChange={(event) => updateBirth("time", event.target.value)}
                aria-label="出生时间"
              />
            </label>
            <label className="pilot-advanced-field">
              <span>时间来源 *</span>
              <select
                value={birth.source}
                onChange={(event) => updateBirth("source", event.target.value)}
              >
                <option value="">请选择</option>
                <option>S3｜原始医院记录或出生证明</option>
                <option>S2｜当年书面记录或清晰照片</option>
                <option>S1｜父母或直接知情人稳定回忆</option>
                <option>S0｜来源不明或后期推测</option>
              </select>
            </label>
            <label className="pilot-advanced-field">
              <span>时间精度 *</span>
              <select
                value={birth.precision}
                onChange={(event) => updateBirth("precision", event.target.value)}
              >
                <option value="">请选择</option>
                <option>P3｜精确到分钟，误差小于30分钟</option>
                <option>P2｜误差约30—120分钟</option>
                <option>P1｜只知道一个较宽时段</option>
                <option>P0｜完全不知道</option>
              </select>
            </label>
            <label className="pilot-span-two pilot-advanced-field">
              <span>来源补充 <small>可选</small></span>
              <input
                value={birth.sourceNote}
                onChange={(event) => updateBirth("sourceNote", event.target.value)}
                placeholder="例如：出生证照片；母亲长期记忆为下午两点左右"
              />
            </label>
            <label>
              <span>出生城市或区县 *</span>
              <input
                value={birth.place}
                onChange={(event) => updateBirth("place", event.target.value)}
                placeholder="不填写医院、街道或门牌"
              />
            </label>
            <label className="pilot-advanced-field">
              <span>时区或历史时制 *</span>
              <select
                value={birth.timezone}
                onChange={(event) => updateBirth("timezone", event.target.value)}
              >
                <option>中国标准时间（UTC+8）</option>
                <option>海外出生，需要人工核对</option>
                <option>历史时制或夏令时不确定</option>
              </select>
            </label>
            <label>
              <span>分析所需性别标记 *</span>
              <select
                value={birth.genderMarker}
                onChange={(event) => updateBirth("genderMarker", event.target.value)}
              >
                <option value="">请选择</option>
                <option>男</option>
                <option>女</option>
                <option>暂不提供，先确认是否影响排盘</option>
              </select>
            </label>
            <label className="pilot-advanced-field">
              <span>分析者了解你的经历吗？ *</span>
              <select
                value={birth.familiarity}
                onChange={(event) => updateBirth("familiarity", event.target.value)}
              >
                <option value="">请选择</option>
                <option>完全不了解</option>
                <option>只知道少量公开背景</option>
                <option>比较熟悉我的经历</option>
              </select>
            </label>
            <label className="pilot-span-two pilot-advanced-field">
              <span>已知上下文边界 <small>只写分析者已经知道什么，不写答案</small></span>
              <textarea
                value={birth.knownContext}
                onChange={(event) => updateBirth("knownContext", event.target.value)}
                placeholder="例如：只知道我的行业，不知道具体年份与经历。完全不了解可留空。"
                rows={3}
              />
            </label>
            <label className="pilot-span-two pilot-advanced-field">
              <span>你最想了解什么？ <small>可选，不写也会生成整体报告</small></span>
              <textarea
                value={birth.focus}
                onChange={(event) => updateBirth("focus", event.target.value)}
                placeholder="例如：我想了解自己的性格底色、事业方向、关系模式和现在最重要的课题。"
                rows={3}
              />
            </label>
          </div>

          <div className="pilot-panel-intro">
            <span className="pilot-index">C</span>
            <div>
              <h3>生成报告</h3>
              <p>只需同意将本次出生资料发送给 DeepSeek 生成报告，网站不建立长期个人档案。</p>
            </div>
          </div>
          <div className="pilot-consents">
            <label>
              <input
                type="checkbox"
                checked={birth.serviceConsent}
                onChange={(event) => updateBirth("serviceConsent", event.target.checked)}
              />
              <span><b>本次报告所需处理 *</b>同意将出生资料发送给 DeepSeek，仅用于生成本次报告；网站不建立长期个人档案。</span>
            </label>
            <label className="pilot-advanced-field">
              <input
                type="checkbox"
                checked={birth.researchConsent}
                onChange={(event) => updateBirth("researchConsent", event.target.checked)}
              />
              <span><b>匿名内部研究（可选）</b>同意去标识化后用于规则复核；不同意不影响服务。</span>
            </label>
            <label className="pilot-advanced-field">
              <input
                type="checkbox"
                checked={birth.publicConsent}
                onChange={(event) => updateBirth("publicConsent", event.target.checked)}
              />
              <span><b>公开案例展示（可选）</b>同意另行审核后公开；本次勾选不替代发布前再次确认。</span>
            </label>
          </div>

          <div className="pilot-generate">
            <button type="button" onClick={buildBirthPacket} disabled={!birthReady}>
              生成我的人生档案
            </button>
            {!birthReady && <p>请先完成资格确认、必填信息和本次服务授权。</p>}
          </div>
          {chartError && <div className="pilot-error" role="alert">{chartError}</div>}
          {chartResult && (
            <div className="pilot-profile" aria-live="polite">
              <div>
                <span>你的整体人生档案已生成</span>
                <small>出生资料仅发送给 DeepSeek 生成本次报告，网站不保存个人档案。</small>
              </div>
              <div className="pilot-profile-status">
                <b>{chartResult.status === "confirmed_single" ? "单一命盘结果" : chartResult.status === "provisional_single" ? "暂定命盘结果" : "多个候选结果"}</b>
                <span>{chartResult.warnings[0] || "当前资料已按固定规则完成计算。"}</span>
              </div>
              {chartResult.selectedVariant ? (
                <>
                  <div className="pilot-pillars" aria-label="四柱结果">
                    {chartResult.selectedVariant.pillars.map((pillar) => (
                      <div key={pillar.position}>
                        <small>{pillar.position === "year" ? "年柱" : pillar.position === "month" ? "月柱" : pillar.position === "day" ? "日柱" : "时柱"}</small>
                        <strong>{pillar.name}</strong>
                        <span>{pillar.stemElement} · {pillar.branchElement}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pilot-profile-grid">
                    <section><span>日主</span><b>{chartResult.selectedVariant.pillars.find((pillar) => pillar.position === "day")?.stem}</b><p>这是结构计算中的日干，不等于完整性格结论。</p></section>
                    <section><span>起运</span><b>{chartResult.selectedVariant.childLimit.startTime}</b><p>{chartResult.selectedVariant.childLimit.direction === "forward" ? "顺行" : "逆行"} · {chartResult.selectedVariant.childLimit.years}岁{chartResult.selectedVariant.childLimit.months}个月左右</p></section>
                    <section><span>大运结构</span><b>{chartResult.selectedVariant.childLimit.decadeFortunes.length}步</b><p>{chartResult.selectedVariant.childLimit.decadeFortunes.slice(0, 4).map((fortune) => `${fortune.name} ${fortune.startAge}—${fortune.endAge}岁`).join(" · ")}</p></section>
                  </div>
                </>
              ) : (
                <div className="pilot-next-action"><b>网页发现时间边界，需要先核对</b><p>当前存在多个候选命盘，系统不会替你强行选一个。你可以先检查出生时间，再决定是否带着这个问题来问均均。</p></div>
              )}
              <section className="pilot-analysis" aria-label="AI 自动断盘报告">
                <div className="pilot-analysis-head"><b>通俗版整体断盘</b><span>{analysisLoading ? "正在生成报告…" : analysis ? "已生成" : "等待生成"}</span></div>
                {analysisLoading && <p className="pilot-analysis-loading">正在把排盘结构翻译成普通人能看懂的语言，请稍候。</p>}
                {analysisError && <p className="pilot-error">{analysisError} 如果你刚发布新版，可能还需要管理员配置分析服务。</p>}
                {analysis && <div className="pilot-analysis-body">{renderAnalysis(analysis)}</div>}
              </section>
              <div className="pilot-next-action">
                <b>现在不需要把整份资料发给均均</b>
                <p>先保存或复制网页结果。只有你对某个结构、某段大运或现实问题有具体疑问时，再带着问题来问均均。</p>
              </div>
              <button type="button" onClick={() => copyPacket(chartSummary(), "birth")}>
                {copied === "birth" ? "人生档案已复制 ✓" : "复制网页生成的完整档案"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="pilot-panel" role="tabpanel">
          <div className="pilot-lock-banner">
            <div>
              <span>第二阶段尚未开始</span>
              <p>案例编号、盲断锁定编号和锁定时间都由均均在完成初步判断后提供。没有收到这三项，不需要在本页继续填写。</p>
            </div>
            <button type="button" onClick={() => setStage("birth")}>返回第一阶段</button>
          </div>
          <div className="pilot-panel-intro">
            <span className="pilot-index">A</span>
            <div>
              <h3>锁定凭证</h3>
              <p>它用于证明人生事实是在首轮判断完成之后进入的。</p>
            </div>
          </div>
          <div className="pilot-form-grid">
            <label>
              <span>案例编号 *</span>
              <input
                value={lock.caseId}
                onChange={(event) => updateLock("caseId", event.target.value)}
                placeholder="PILOT-2026-001"
              />
            </label>
            <label>
              <span>盲断锁定编号 *</span>
              <input
                value={lock.lockId}
                onChange={(event) => updateLock("lockId", event.target.value)}
                placeholder="由分析者提供"
              />
            </label>
            <label className="pilot-span-two">
              <span>锁定时间 *</span>
              <input
                type="datetime-local"
                value={lock.lockedAt}
                onChange={(event) => updateLock("lockedAt", event.target.value)}
              />
            </label>
          </div>
          <label className="pilot-lock-confirm">
            <input
              type="checkbox"
              checked={lock.confirmed}
              onChange={(event) => updateLock("confirmed", event.target.checked)}
            />
            <span>我确认：上述锁定信息在我填写下面的人生事实之前已经由分析者提供。</span>
          </label>

          {!lockReady && (
            <div className="pilot-anchors-locked" role="status">
              <b>客观事实锚点暂未开放</b>
              <p>第二阶段核验功能仍保留给需要参与研究的人。普通用户不需要先走这一步，直接查看网页生成的整体档案即可。</p>
            </div>
          )}

          <fieldset className="pilot-anchors" disabled={!lockReady}>
            <legend>
              <span className="pilot-index">B</span>
              <span><b>客观事实锚点（第二阶段）</b><small>至少三条；没有明显变化也可以如实填写。</small></span>
            </legend>
            {anchors.map((anchor, index) => (
              <article key={index}>
                <div className="pilot-anchor-head">
                  <h4>事实锚点 {index + 1}</h4>
                  {anchors.length > 3 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAnchors((current) =>
                          current.filter((_, anchorIndex) => anchorIndex !== index),
                        )
                      }
                    >
                      移除
                    </button>
                  )}
                </div>
                <div className="pilot-form-grid">
                  <label>
                    <span>时间或区间 *</span>
                    <input
                      value={anchor.period}
                      onChange={(event) => updateAnchor(index, "period", event.target.value)}
                      placeholder="例如 2019年9月—2020年6月"
                    />
                  </label>
                  <label>
                    <span>领域 *</span>
                    <select
                      value={anchor.domain}
                      onChange={(event) => updateAnchor(index, "domain", event.target.value)}
                    >
                      <option value="">请选择</option>
                      <option>家庭</option>
                      <option>学业</option>
                      <option>工作</option>
                      <option>关系</option>
                      <option>迁移</option>
                      <option>财务</option>
                      <option>健康</option>
                      <option>其他</option>
                    </select>
                  </label>
                  <label className="pilot-span-two">
                    <span>只写可观察事实 *</span>
                    <textarea
                      value={anchor.fact}
                      onChange={(event) => updateAnchor(index, "fact", event.target.value)}
                      placeholder="例如：从A城市迁往B城市并更换工作。不要先写“因为命里怎样”。"
                      rows={3}
                    />
                  </label>
                  <label>
                    <span>确定程度 *</span>
                    <select
                      value={anchor.certainty}
                      onChange={(event) => updateAnchor(index, "certainty", event.target.value)}
                    >
                      <option value="">请选择</option>
                      <option>时间和事实都清楚</option>
                      <option>事实清楚，时间约略</option>
                      <option>只有模糊回忆</option>
                    </select>
                  </label>
                  <label>
                    <span>证据情况 *</span>
                    <select
                      value={anchor.evidence}
                      onChange={(event) => updateAnchor(index, "evidence", event.target.value)}
                    >
                      <option value="">请选择</option>
                      <option>本人可明确确认</option>
                      <option>有履历、文件或记录</option>
                      <option>有多人一致记录</option>
                      <option>暂时无法提供</option>
                    </select>
                  </label>
                </div>
              </article>
            ))}
            {anchors.length < 5 && (
              <button
                className="pilot-add-anchor"
                type="button"
                onClick={() => setAnchors((current) => [...current, emptyAnchor()])}
              >
                ＋ 增加一条事实锚点
              </button>
            )}
          </fieldset>

          <label className="pilot-background">
            <span>必要背景变量 <small>可选，不写命理解释</small></span>
            <textarea
              value={background}
              onChange={(event) => {
                setBackground(event.target.value);
                setFactsPacket("");
              }}
              placeholder="例如：当时所在城市、家庭责任或行业大环境。第三方请匿名。"
              rows={3}
              disabled={!lockReady}
            />
          </label>

          <label className="pilot-lock-confirm">
            <input
              type="checkbox"
              checked={factsConsent}
              onChange={(event) => {
                setFactsConsent(event.target.checked);
                setFactsPacket("");
              }}
              disabled={!lockReady}
            />
            <span>我自愿提交以上事实用于本次核验，并已删除不必要的第三方姓名和联系方式。</span>
          </label>

          <div className="pilot-generate">
            <button type="button" onClick={buildFactsPacket} disabled={!factsReady}>
              生成第二阶段事实包
            </button>
            {!lockReady && <p>请先填写并确认锁定凭证。</p>}
            {lockReady && completeAnchors.length < 3 && <p>请完整填写至少三条事实锚点。</p>}
          </div>
          {factsPacket && (
            <div className="pilot-packet">
              <div>
                <span>第二阶段事实包已生成</span>
                <small>事实只能用于核验，不能覆盖此前锁定的判断。</small>
              </div>
              <textarea readOnly value={factsPacket} rows={20} aria-label="第二阶段事实资料包" />
              <button type="button" onClick={() => copyPacket(factsPacket, "facts")}>
                {copied === "facts" ? "已复制 ✓" : "复制第二阶段事实包"}
              </button>
            </div>
          )}
        </div>
      )}

      <p className="pilot-local-note">
        出生资料仅用于本次排盘和 DeepSeek 报告生成，不建立长期个人档案。网页生成结果只保留在当前浏览器；有具体问题时，再带着问题来找均均。
      </p>
    </section>
  );
}
