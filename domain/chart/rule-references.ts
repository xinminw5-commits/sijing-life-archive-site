import type { RuleReference } from "./types.ts";

/**
 * 这里只存可追溯的规则引用，不复制知识库正文，也不负责下命理结论。
 */
export const CHART_RULE_REFERENCES: ReadonlyArray<RuleReference> = Object.freeze([
  Object.freeze({
    id: "ZP001",
    title: "用神专求月令",
    sourcePath: "人生命格/outputs/读书工程/04_判断规则库/格局派/ZP001_用神专求月令.md",
    status: "formal",
    appliesWhen: ["格局派结构判断进入月令取用层"],
    exclusions: ["不可仅凭月令名称跳过透藏、根气和成败条件"],
    realityValidation: "unvalidated",
  } satisfies RuleReference),
  Object.freeze({
    id: "QT001",
    title: "十干十二月取用",
    sourcePath: "人生命格/outputs/读书工程/04_判断规则库/调候派/QT001_十干十二月取用.md",
    status: "formal",
    appliesWhen: ["调候轴需根据日干与月令定位候选用神"],
    exclusions: ["不可脱离原局存在性、力量和结构承载直接套用"],
    realityValidation: "unvalidated",
  } satisfies RuleReference),
  Object.freeze({
    id: "DT001",
    title: "旺衰真机",
    sourcePath: "人生命格/outputs/读书工程/04_判断规则库/旺衰派/DT001_旺衰真机.md",
    status: "formal",
    appliesWhen: ["根气、月令、透干与制化共同进入旺衰评估"],
    exclusions: ["不可把单一五行数量等同于真实旺衰"],
    realityValidation: "unvalidated",
  } satisfies RuleReference),
]);
