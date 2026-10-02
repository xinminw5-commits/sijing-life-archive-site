"use client";

import { useEffect, useState } from "react";

const signals = [
  { label: "观其序", detail: "先辨结构，看见一局真正的主次与承载。" },
  { label: "察其时", detail: "再察时序，理解环境如何放大或限制一个人。" },
  { label: "通其气", detail: "继续看气机，追踪力量从哪里来、向哪里去。" },
  { label: "验其应", detail: "最后回到人生，用真实经历逐一核对。" },
] as const;

export function HeroSignals() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActive((current) => (current + 1) % signals.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [paused]);

  const current = signals[active];

  return (
    <div
      className={`premium-signals${paused ? " is-paused" : ""}`}
      role="tablist"
      aria-label="四境分析流程"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div className="premium-signal-tabs">
        {signals.map((signal, index) => (
          <button
            key={signal.label}
            className={index === active ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-label={`${signal.label}：${signal.detail}`}
            onClick={() => setActive(index)}
          >
            <small>0{index + 1}</small>
            <span>{signal.label}</span>
            <i className="signal-progress" aria-hidden="true">
              {index === active && <b key={active} />}
            </i>
          </button>
        ))}
      </div>
      <p className="premium-signal-status" key={current.label}>
        <span className="signal-status-dot" aria-hidden="true" />
        <strong>{current.label}</strong>
        <span>{current.detail}</span>
      </p>
    </div>
  );
}
