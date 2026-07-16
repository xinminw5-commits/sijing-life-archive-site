"use client";

import { useState } from "react";

const topics = {
  stage: {
    label: "当前阶段",
    question: "我想理解最近几年反复出现的主题，以及现在处于什么阶段。",
    list: ["出生日期、时间与地点", "最近 3 年最重要的 2—3 件事实", "你现在最难判断的一项选择"],
  },
  career: {
    label: "职业方向",
    question: "我想梳理职业路径、身份变化与下一阶段的承载方式。",
    list: ["重要升学、入职、离职或转行年份", "当前行业、角色与现实限制", "你正在比较的方向或机会"],
  },
  relation: {
    label: "关系议题",
    question: "我想理解关系中的互动结构、阶段变化与自己的选择边界。",
    list: ["重要关系开始或变化的大致年份", "当前关系状态与已发生事实", "只提供你愿意谈的内容，不必交出第三方隐私"],
  },
  annual: {
    label: "年度复盘",
    question: "我想把今年发生的事放回长期档案，看看哪些判断需要保留或修正。",
    list: ["今年已经发生的关键事件", "与去年相比最明显的变化", "接下来最需要观察的一个现实领域"],
  },
} as const;

type Topic = keyof typeof topics;

export function ConsultationStarter() {
  const [topic, setTopic] = useState<Topic>("stage");
  const [copied, setCopied] = useState(false);
  const selected = topics[topic];

  async function copyChecklist() {
    const text = [
      `咨询主题：${selected.label}`,
      `我想问：${selected.question}`,
      "准备资料：",
      ...selected.list.map((item, index) => `${index + 1}. ${item}`),
      "备注：不确定的内容会标记“待确认”，没有发生的内容会明确写“无明显变化”。",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="starter-card">
      <div className="starter-head">
        <span>01</span>
        <div>
          <small>选择一个主题</small>
          <h3>这次，你最想理解什么？</h3>
        </div>
      </div>
      <div className="topic-tabs" role="tablist" aria-label="咨询主题">
        {(Object.keys(topics) as Topic[]).map((key) => (
          <button
            type="button"
            role="tab"
            aria-selected={topic === key}
            className={topic === key ? "active" : ""}
            key={key}
            onClick={() => { setTopic(key); setCopied(false); }}
          >
            {topics[key].label}
          </button>
        ))}
      </div>
      <div className="starter-result" role="tabpanel" aria-live="polite">
        <span className="result-label">你的问题可以这样开始</span>
        <blockquote>“{selected.question}”</blockquote>
        <h4>最小准备清单</h4>
        <ol>
          {selected.list.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </div>
      <button className="copy-button" type="button" onClick={copyChecklist}>
        {copied ? "已复制咨询清单 ✓" : "复制我的咨询清单"}
      </button>
      <p className="local-note">此处不会填写或上传出生资料，只帮你准备一次清晰的咨询。</p>
    </div>
  );
}
