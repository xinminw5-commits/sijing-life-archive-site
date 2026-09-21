import { NextResponse } from "next/server";

type AnalysisRequest = {
  birth: {
    date: string;
    time: string;
    place: string;
    gender: string;
    focus: string;
  };
  chart: unknown;
};

function extractOutputText(payload: { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> }) {
  if (payload.output_text) return payload.output_text;
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((item) => item.text ?? "")
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: Request) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DeepSeek 分析服务尚未配置，请稍后再试。" }, { status: 503 });
  }

  let body: AnalysisRequest;
  try {
    body = (await request.json()) as AnalysisRequest;
  } catch {
    return NextResponse.json({ error: "提交内容无法读取。" }, { status: 400 });
  }

  if (!body?.birth?.date || !body.birth.time || !body.birth.place || !body.chart) {
    return NextResponse.json({ error: "出生资料不完整，暂时无法生成报告。" }, { status: 400 });
  }

  const prompt = `
你是“四镜人生档案”的中文解释助手。请根据下面已经由固定排盘引擎计算出的结构，写一份普通人能看懂的“整体人生档案初稿”。

写作要求：
1. 不要只复述四柱；要把结构翻译成日常语言，解释一个人可能怎样思考、行动、承压、做选择和与人相处。
2. 必须分成以下小标题：整体底色、优势与可用能力、容易卡住的地方、事业与财务、关系与边界、阶段节奏、当前建议、需要现实验证的部分。
3. 每个部分写 2—4 段，具体、克制、有条件，不要用“注定”“一定”“百分之百”“必然发财/离婚/生病”等确定性断语。
4. 明确区分“结构提示”和“现实事实”：没有用户经历作为证据时，只能写可能性和验证问题，不能假装已经知道对方的人生。
5. 不做医疗、法律、投资、死亡、灾祸等高风险结论；遇到这些主题只提醒寻求现实专业帮助。
6. 语气像一个认真、直接、愿意被事实推翻的分析者，不要提到 API、模型、提示词或内部技术。
7. 最后给出 3 个用户可以继续追问的具体问题。

出生资料：
${JSON.stringify(body.birth, null, 2)}

排盘结构：
${JSON.stringify(body.chart, null, 2)}
`;

  const response = await fetch("https://api.deepseek.com/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
      input: prompt,
      temperature: 0.35,
      max_output_tokens: 2600,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "暂时无法生成报告，请稍后重试。" }, { status: 502 });
  }

  const payload = (await response.json()) as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  const report = extractOutputText(payload);
  if (!report) return NextResponse.json({ error: "报告暂时没有生成，请稍后重试。" }, { status: 502 });

  return NextResponse.json({ report });
}
