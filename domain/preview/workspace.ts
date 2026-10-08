export type Topic = "career" | "relationship" | "correction";
export type Message = { role: "user" | "assistant"; text: string };
export type Workspace = { account: "C07" | "C08"; messages: Message[]; answered: number; corrected: boolean };
export const FREE_ANSWERS = 3;
export const sampleProfiles = {
  C07: { name: "C07", date: "1992-06-15", time: "09:30", place: "浙江省 杭州市 西湖区", context: "示例经历：2024年从独立设计转向项目协作，正在考虑是否带团队。" },
  C08: { name: "C08", date: "1995-03-12", time: "14:20", place: "江苏省 南京市 鼓楼区", context: "示例经历：目前从事运营，希望先稳定工作节奏，再考虑转岗。" },
};
export function createWorkspace(account: Workspace["account"]): Workspace {
  return { account, messages: [], answered: 0, corrected: false };
}
export const prompts: Record<Topic, string> = {
  career: "结合我的经历，事业方向应该怎样核验？",
  relationship: "关系里的判断，怎样和现实交叉验证？",
  correction: "原来的判断不吻合：我并不喜欢独自工作，更喜欢团队协作。",
};
export function answerPreview(state: Workspace, topic: Topic, failed = false): Workspace {
  if (failed || state.answered >= FREE_ANSWERS) return state;
  const profile = sampleProfiles[state.account];
  const answer = topic === "career"
    ? `${profile.context} 先把“是否适合带团队”作为待核验命题：对照最近两个项目的职责、协作体验和结果。若团队工作让你更有动力，应保留这条事实，不能因为原先的性格标签就排除管理路线。示例资料没有正式命盘结论，因此这里仅展示核验方法。`
    : topic === "relationship"
      ? "先区分个人倾向和双方互动。用最近一次分歧核验：你表达了什么、对方如何回应、后来是否形成共识。不能只凭一方的出生资料推断另一方的想法，也不能把尚未发生的结果写成结论。这条问题和回答会留在示例对话记录中。"
      : "收到这条反证。将“更适合独自工作”标为不吻合，新增“更喜欢团队协作”的现实反馈，保留原记录用于比较。后续事业讨论以你补充的经历为依据；这条反馈仍需要具体项目验证，不会自动变成已经确认的命理规则。";
  return { ...state, answered: state.answered + 1, corrected: state.corrected || topic === "correction", messages: [...state.messages, { role: "user", text: prompts[topic] }, { role: "assistant", text: answer }] };
}
