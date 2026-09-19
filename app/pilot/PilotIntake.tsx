"use client";

import { useMemo, useState } from "react";

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

export function PilotIntake() {
  const [stage, setStage] = useState<IntakeStage>("birth");
  const [copied, setCopied] = useState<"birth" | "facts" | null>(null);
  const [birthPacket, setBirthPacket] = useState("");
  const [factsPacket, setFactsPacket] = useState("");
  const [eligible, setEligible] = useState({
    adult: false,
    timeSource: false,
    followup: false,
  });
  const [birth, setBirth] = useState({
    alias: "",
    calendar: "",
    date: "",
    time: "",
    source: "",
    sourceNote: "",
    precision: "",
    place: "",
    timezone: "中国标准时间（UTC+8）",
    genderMarker: "",
    familiarity: "",
    knownContext: "",
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

  const eligibleReady = eligible.adult && eligible.timeSource && eligible.followup;
  const birthReady =
    eligibleReady &&
    birth.date.trim() &&
    birth.time.trim() &&
    birth.calendar &&
    birth.source &&
    birth.precision &&
    birth.place.trim() &&
    birth.genderMarker &&
    birth.familiarity &&
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
    setBirthPacket("");
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
    const track =
      birth.familiarity === "完全不了解"
        ? "前瞻样本候选"
        : "需要人工评估信息污染；可能转为回顾性样本";
    const packet = [
      "【公开体验｜第一阶段出生资料包】",
      "表单版本：pilot-v0",
      "重要声明：本资料包不含人生经历；尚未形成盲断结论。",
      "",
      `自定代号：${birth.alias.trim() || "未填写"}`,
      `日历类型：${birth.calendar}`,
      `出生日期：${birth.date.trim()}`,
      `出生时间：${birth.time.trim()}`,
      `时间来源：${birth.source}`,
      `来源补充：${birth.sourceNote.trim() || "无"}`,
      `时间精度：${birth.precision}`,
      `出生城市/区县：${birth.place.trim()}`,
      `时区/时制：${birth.timezone}`,
      `分析所需性别标记：${birth.genderMarker}`,
      `分析者对经历的了解程度：${birth.familiarity}`,
      `已知上下文边界：${birth.knownContext.trim() || "未补充"}`,
      `样本轨道建议：${track}`,
      "",
      "【授权】",
      `完成本次内测所需处理：${birth.serviceConsent ? "同意" : "不同意"}`,
      `去标识化后用于内部规则研究：${birth.researchConsent ? "同意" : "不同意"}`,
      `用于公开案例展示：${birth.publicConsent ? "同意" : "不同意"}`,
      "",
      "下一步：由分析者核对时间来源、精度和边界；在收到任何人生事实前完成并锁定盲断。",
    ].join("\n");
    setBirthPacket(packet);
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
      calendar: "",
      date: "",
      time: "",
      source: "",
      sourceNote: "",
      precision: "",
      place: "",
      timezone: "中国标准时间（UTC+8）",
      genderMarker: "",
      familiarity: "",
      knownContext: "",
      serviceConsent: false,
      researchConsent: false,
      publicConsent: false,
    });
    setLock({ caseId: "", lockId: "", lockedAt: "", confirmed: false });
    setAnchors([emptyAnchor(), emptyAnchor(), emptyAnchor()]);
    setBackground("");
    setFactsConsent(false);
    setBirthPacket("");
    setFactsPacket("");
    setCopied(null);
  }

  return (
    <section className="pilot-workbench" aria-labelledby="pilot-form-title">
      <div className="pilot-workbench-head">
        <div>
          <p className="eyebrow"><span /> 两阶段资料台</p>
          <h2 id="pilot-form-title">先生成资料包，再由均均完成人工初判。</h2>
        </div>
        <button className="pilot-clear" type="button" onClick={clearAll}>
          清空本页资料
        </button>
      </div>

      <div className="pilot-handoff" aria-label="获得初步判断的四个步骤">
        <div className="pilot-handoff-head">
          <span>如何获得初步判断</span>
          <p><b>本页不会自动提交，也不会自动分析。</b>填写完成只是把资料整理成一份可复制的文字包。</p>
        </div>
        <ol>
          <li><span>01</span><b>填写出生资料</b><small>第一阶段不填写人生经历。</small></li>
          <li><span>02</span><b>生成并复制</b><small>点击生成后，复制完整资料包。</small></li>
          <li><span>03</span><b>私下发给均均</b><small>通过微信或双方约定的私密渠道发送。</small></li>
          <li><span>04</span><b>收到人工初判</b><small>均均会同时给出第二阶段锁定凭证。</small></li>
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
          <span>第二阶段</span>
          收到初步判断后
        </button>
      </div>

      {stage === "birth" ? (
        <div className="pilot-panel" role="tabpanel">
          <div className="pilot-panel-intro">
            <span className="pilot-index">A</span>
            <div>
              <h3>资格确认</h3>
              <p>这一阶段禁止填写家庭、学业、工作、关系和迁移经历。</p>
            </div>
          </div>
          <div className="pilot-check-grid">
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
                value={birth.date}
                onChange={(event) => updateBirth("date", event.target.value)}
                placeholder="按所选日历填写，如 1995-08-16"
              />
            </label>
            <label>
              <span>出生时间 *</span>
              <input
                value={birth.time}
                onChange={(event) => updateBirth("time", event.target.value)}
                placeholder="如 14:35；不知道分钟可写约14点"
              />
            </label>
            <label>
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
            <label>
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
            <label className="pilot-span-two">
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
            <label>
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
            <label>
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
            <label className="pilot-span-two">
              <span>已知上下文边界 <small>只写分析者已经知道什么，不写答案</small></span>
              <textarea
                value={birth.knownContext}
                onChange={(event) => updateBirth("knownContext", event.target.value)}
                placeholder="例如：只知道我的行业，不知道具体年份与经历。完全不了解可留空。"
                rows={3}
              />
            </label>
          </div>

          <div className="pilot-panel-intro">
            <span className="pilot-index">C</span>
            <div>
              <h3>分开授权</h3>
              <p>研究与公开展示默认关闭，也不能作为参加基础内测的交换条件。</p>
            </div>
          </div>
          <div className="pilot-consents">
            <label>
              <input
                type="checkbox"
                checked={birth.serviceConsent}
                onChange={(event) => updateBirth("serviceConsent", event.target.checked)}
              />
              <span><b>本次内测所需处理 *</b>同意均均为本次排盘、盲断、核验和回访处理上述资料。</span>
            </label>
            <label>
              <input
                type="checkbox"
                checked={birth.researchConsent}
                onChange={(event) => updateBirth("researchConsent", event.target.checked)}
              />
              <span><b>匿名内部研究（可选）</b>同意去标识化后用于规则复核；不同意不影响服务。</span>
            </label>
            <label>
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
              生成第一阶段资料包
            </button>
            {!birthReady && <p>请先完成资格确认、必填信息和本次服务授权。</p>}
          </div>
          {birthPacket && (
            <div className="pilot-packet">
              <div>
                <span>第一阶段资料包已生成</span>
                <small>资料目前仍只在你的浏览器里，网站没有收到。</small>
              </div>
              <textarea readOnly value={birthPacket} rows={18} aria-label="第一阶段资料包" />
              <div className="pilot-next-action">
                <b>现在还差一步：把资料包发给均均</b>
                <p>先点击复制，再通过微信或双方约定的私密渠道发送。发送后由均均人工排盘并回复初步判断；页面本身不会自动出现反馈。</p>
              </div>
              <button type="button" onClick={() => copyPacket(birthPacket, "birth")}>
                {copied === "birth" ? "已复制，请私下发给均均 ✓" : "复制资料包，下一步发给均均"}
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
              <p>先把第一阶段资料包发给均均。收到人工初判和三项锁定凭证后，填写上方凭证并确认，这里的输入框才会开放。</p>
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
        本页没有提交接口，不把填写内容发送给网站服务器，也不会在刷新后恢复。复制资料包后，请通过与均均约定的私密渠道传递。
      </p>
    </section>
  );
}
