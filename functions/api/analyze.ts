type AnalysisRequest = {
  birth: {
    callName: string;
    date: string;
    time: string;
    place: string;
    gender: string;
    focus: string;
    context: string;
  };
  chart: unknown;
};

function extractOutputText(payload: {
  output_text?: string;
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
}) {
  if (payload.output_text) return payload.output_text;
  return (payload.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" || item.type === undefined)
    .map((item) => item.text ?? "")
    .filter(Boolean)
    .join("\n");
}

function stripDisplayPunctuation(value: string) {
  return value.trim();
}

export async function onRequestPost({ request, env }: { request: Request; env: Record<string, string | undefined> }) {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "DeepSeek 分析服务尚未配置 请稍后再试" }, { status: 503 });
  }

  let body: AnalysisRequest;
  try {
    body = (await request.json()) as AnalysisRequest;
  } catch {
    return Response.json({ error: "提交内容无法读取" }, { status: 400 });
  }

  if (!body?.birth?.callName || !body.birth.date || !body.birth.time || !body.birth.place || !body.chart) {
    return Response.json({ error: "档案资料不完整 暂时无法生成报告" }, { status: 400 });
  }

  const prompt = `
你是“四境人生档案”的中文解释助手。请根据固定排盘引擎计算出的结构，以及用户主动提供的现实经历，写一份详细、连贯、可以回到现实核对的个人档案初稿。不要只给四个轴各说一句，也不要输出模板化性格标签。

写作要求：
1. 先写“总脉络”，把结构境、时序境、气机境、人生境串成一条主线，说明这个人的底层结构在什么环境中被放大或受限，力量如何流动，最后可能怎样落到工作、关系和阶段选择。
2. 必须使用以下小标题，并且每个标题写成有内容的段落：总脉络、结构境 观其序、时序境 察其时、气机境 通其气、人生境 验其应、事业与财务、关系与边界、当前阶段、现实核验清单、结语。
3. 四个轴不能互相割裂。每个轴至少解释命盘结构、现实可能表现、与其他轴的连接，以及一个可以被用户确认或推翻的问题。
4. 充分使用用户提供的现实经历进行对照，但明确标记哪些是用户事实，哪些只是命盘结构提示，哪些仍然未知。不要编造用户没有提供的经历。
5. 输出应当详细而不空泛，目标是 1800—3000 字中文。避免“你比较敏感”“你有领导力”这类脱离结构和事实的套话。
6. 不要用“注定”“一定”“百分之百”“必然发财/离婚/生病”等确定性断语。使用条件、范围和替代解释。
7. 不做医疗、法律、投资、死亡、灾祸等高风险结论；遇到这些主题只提醒寻求现实专业帮助。
8. 语气像一个认真、直接、愿意被事实推翻的分析者，不要提到 API、模型、提示词或内部技术。
9. 最后给出 3 个具体的继续追问方向，并列出 5 条现实核验问题。
10. 只输出最终报告正文。不得复述任务要求、输入资料、内部分析过程、推理草稿或“我们需要回答用户”等元话语。

出生资料：
${JSON.stringify(body.birth, null, 2)}

排盘结构：
${JSON.stringify(body.chart, null, 2)}

用户主动提供的现实处境与经历：
${body.birth.context || "用户尚未提供现实经历，只能做条件化结构分析，不得假装知道其人生。"}
`;

  let response: Response;
  try {
    response = await fetch("https://api.deepseek.com/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || "deepseek-flash",
        instructions: prompt,
        input: "请严格按照上述要求输出最终报告正文。",
        reasoning: { effort: "none" },
        temperature: 0.35,
        max_output_tokens: 4200,
      }),
    });
  } catch {
    return Response.json({ error: "分析服务连接超时 请稍后重试" }, { status: 502 });
  }

  if (!response.ok) {
    return Response.json({ error: "暂时无法生成报告 请稍后重试" }, { status: 502 });
  }

  let payload: {
    output_text?: string;
    output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return Response.json({ error: "分析服务返回格式异常 请稍后重试" }, { status: 502 });
  }
  const report = extractOutputText(payload);
  if (!report) return Response.json({ error: "报告暂时没有生成 请稍后重试" }, { status: 502 });

  return Response.json({ report: stripDisplayPunctuation(report) });
}
