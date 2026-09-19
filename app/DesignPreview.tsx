"use client";

import { useState, type FormEvent } from "react";
import styles from "./DesignPreview.module.css";

type Direction = "archive" | "lab" | "modern";
type Topic = "career" | "relationship" | "year" | "self";

const directions: { id: Direction; number: string; name: string; note: string }[] = [
  { id: "archive", number: "01", name: "档案编辑部", note: "我的首选｜克制、有温度，最贴合“人生档案”" },
  { id: "lab", number: "02", name: "命盘研究室", note: "冷静、专业；像一张可核验的工作台" },
  { id: "modern", number: "03", name: "当代东方", note: "轻盈、清晰；更像面向大众的产品" },
];

const topics: { id: Topic; label: string }[] = [
  { id: "career", label: "职业方向" },
  { id: "relationship", label: "关系议题" },
  { id: "year", label: "年度复盘" },
  { id: "self", label: "认识自己" },
];

const prompts: Record<Topic, string> = {
  career: "我想梳理职业路径和下一阶段的选择。",
  relationship: "我想理解关系里的互动模式和自己的边界。",
  year: "我想复盘今年的变化，分清事实与事后解释。",
  self: "我想先看懂自己的优势、消耗点和行动方式。",
};

export function DesignPreview() {
  const [direction, setDirection] = useState<Direction>("archive");
  const [topic, setTopic] = useState<Topic>("career");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [question, setQuestion] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState(false);
  const current = directions.find((item) => item.id === direction)!;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setCopied(false);
  }

  function loadDemo() {
    setTopic("career");
    setBirthDate("1998-05-12");
    setBirthTime("14:30");
    setBirthPlace("样例城市");
    setQuestion("我适合什么工作方向？");
    setSubmitted(false);
  }

  async function copyDraft() {
    const draft = [
      "四镜人生档案｜体验草稿",
      "出生日期：" + (birthDate || "待补充"),
      "出生时间：" + (birthTime || "不确定 / 待补充"),
      "出生地点：" + (birthPlace || "待补充"),
      "关注主题：" + topics.find((item) => item.id === topic)?.label,
      "当前问题：" + (question || prompts[topic]),
      "说明：此体验只整理输入，不生成命理解读；资料未上传。",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className={styles.page + " " + styles["theme_" + direction]}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="#top" aria-label="四镜人生档案首页">
          <span className={styles.brandMark}>四</span>
          <span><strong>四镜人生档案</strong><small>FOUR-LENS ARCHIVE</small></span>
        </a>
        <div className={styles.topbarNote}><span className={styles.liveDot} /> 可先试填 · 无需登录</div>
      </header>

      <section className={styles.directionBar} aria-label="视觉方向预览">
        <div className={styles.directionIntro}>
          <span>视觉方案 · {current.number} / 03</span>
          <strong>先定气质，再继续扩展</strong>
        </div>
        <div className={styles.directionTabs} role="tablist" aria-label="选择视觉方向">
          {directions.map((item) => (
            <button
              className={styles.directionTab + (direction === item.id ? " " + styles.activeTab : "")}
              type="button"
              role="tab"
              aria-selected={direction === item.id}
              key={item.id}
              onClick={() => { setDirection(item.id); setSubmitted(false); }}
            >
              <span>{item.number}</span><b>{item.name}</b>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> 四轴会诊 · 先输入，再看懂</p>
          <h1>从一个问题开始，<br /><em>建立你的人生档案。</em></h1>
          <p className={styles.lead}>先核对出生信息，再把每条判断放回事实里验证。模糊处说不确定，不拿套话冒充结论。</p>
          <div className={styles.trustRow}>
            <span><b>01</b> 先收问题</span>
            <span><b>02</b> 再核出生信息</span>
            <span><b>03</b> 事实进场验证</span>
          </div>
          <div className={styles.selectedDirection}>
            <span>当前预览</span>
            <strong>{current.number} / {current.name}</strong>
            <small>{current.note}</small>
          </div>
        </div>

        <section className={styles.formCard} aria-labelledby="form-title">
          {!submitted ? (
            <form onSubmit={submit}>
              <div className={styles.formHeading}>
                <span className={styles.formIndex}>体验入口 <b>01</b></span>
                <h2 id="form-title">先建一张问题卡</h2>
                <p>出生日期、地点与可选时间，再加一句现在最想问的问题。</p>
              </div>
              <fieldset className={styles.topicField}>
                <legend>我最想先看</legend>
                <div className={styles.topicChoices}>
                  {topics.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={topic === item.id ? styles.topicActive : ""}
                      aria-pressed={topic === item.id}
                      onClick={() => setTopic(item.id)}
                    >{item.label}</button>
                  ))}
                </div>
              </fieldset>
              <div className={styles.fieldGrid}>
                <label>出生日期 <span>必填</span>
                  <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} required />
                </label>
                <label>出生时间 <span>不确定可留空</span>
                  <input type="time" value={birthTime} onChange={(event) => setBirthTime(event.target.value)} />
                </label>
              </div>
              <label className={styles.fullField}>出生地点 <span>城市即可</span>
                <input type="text" value={birthPlace} onChange={(event) => setBirthPlace(event.target.value)} placeholder="例如：北京朝阳" required />
              </label>
              <label className={styles.fullField}>你现在最想问什么？ <span>先写一句就够</span>
                <textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={prompts[topic]} rows={3} />
              </label>
              <button className={styles.submitButton} type="submit">生成我的体验卡 <span>→</span></button>
              <p className={styles.privacy}>⌑ 输入只在当前页面生成草稿，不会上传、保存或自动解读。</p>
              <button className={styles.demoButton} type="button" onClick={loadDemo}>不想填真实信息？用虚构样例试一遍</button>
            </form>
          ) : (
            <div className={styles.resultCard} aria-live="polite">
              <div className={styles.resultTop}><span>体验草稿已生成</span><b>本地 · 不上传</b></div>
              <h2>{topics.find((item) => item.id === topic)?.label}</h2>
              <p className={styles.resultQuestion}>“{question.trim() || prompts[topic]}”</p>
              <div className={styles.resultFacts}>
                <span>出生日期 <b>{birthDate}</b></span>
                <span>出生时间 <b>{birthTime || "待确认"}</b></span>
                <span>出生地点 <b>{birthPlace}</b></span>
              </div>
              <div className={styles.nextStep}>
                <strong>真实会诊的下一步</strong>
                <p>先核对出生信息和时间误差；再在不看人生经历的情况下写下判断；最后逐条核对事实，不只记录“命中”。</p>
              </div>
              <button className={styles.submitButton} type="button" onClick={copyDraft}>{copied ? "体验卡已复制 ✓" : "复制这张体验卡"}</button>
              <button className={styles.editButton} type="button" onClick={() => setSubmitted(false)}>返回修改资料</button>
            </div>
          )}
        </section>
      </section>

      <section className={styles.methodRail} aria-label="四轴方法简述">
        <div><span>结构</span><b>先找主次</b></div>
        <div><span>环境</span><b>放回条件</b></div>
        <div><span>气机</span><b>看路径与承载</b></div>
        <div><span>事件</span><b>逐条核事实</b></div>
        <p>当前体验只演示信息入口，不输出未经计算或核验的命理结论。</p>
      </section>

      <footer className={styles.footer}>
        <span>四镜人生档案</span>
        <span>先盲断 · 后核验 · 允许被推翻</span>
        <a href="/pilot">进入完整资料流程 ↗</a>
      </footer>
    </main>
  );
}
