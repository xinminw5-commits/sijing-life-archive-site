import type { ConversationMessage } from "../../lib/consultation";
export function ConversationAnswer({ message }: { message: ConversationMessage }) {
  const r = message.reading;
  return <article className="conversation-answer">
    <p className="account-question">{message.question}</p>
    {r ? <div className="conversation-reading">
      <section><h4>先回答你</h4><p>{r.directAnswer}</p></section>
      <section><h4>结合你的资料</h4><p>{r.reasoning}</p></section>
      <section className="conversation-plain"><h4>白话解读</h4><p>{r.plainLanguage}</p></section>
      <section className="conversation-example"><h4>情境示例</h4><small>合成示例，帮助理解；不是真实客户案例或本人经历。</small><p>{r.example.scenario}</p><p>{r.example.limit}</p></section>
      <section><h4>接下来可以做</h4><ul>{r.nextSteps.map((step, i) => <li key={i}>{step}</li>)}</ul><p>{r.verification}</p></section>
      <details><summary>本条解读的参考依据</summary><p>{r.sources.map(s => `${s.book} · ${s.id} ${s.title}`).join("；")}</p><small>规则用于条件分析，现实判断仍需你的经历核验。</small></details>
    </div> : <p className="account-answer">{message.answer}</p>}
    {message.savedAt && <small className="conversation-saved">已保存 · {new Date(message.savedAt).toLocaleString("zh-CN")}</small>}
  </article>;
}
