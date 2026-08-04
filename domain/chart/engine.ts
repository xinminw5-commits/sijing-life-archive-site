import {
  ChildLimit,
  DefaultChildLimitProvider,
  DefaultEightCharProvider,
  Gender,
  HideHeavenStemType,
  LunarDay,
  LunarHour,
  SolarTerm,
  SolarTime,
  type EightChar,
  type SixtyCycle,
} from "tyme4ts";

import {
  epochSecondsToLocalDateTime,
  formatChinaStandardTime,
  localDateTimeToEpochSeconds,
  normalizeChinaTime,
  validateLocalDateTime,
} from "./china-civil-time.ts";
import { CHART_RULE_REFERENCES } from "./rule-references.ts";
import {
  ChartCalculationError,
  type BoundaryPoint,
  type BoundaryReport,
  type ChartInput,
  type ChartVariant,
  type DeterministicChartResult,
  type LocalDateTime,
  type NormalizedChartInput,
  type PillarPosition,
  type PillarResult,
} from "./types.ts";

const BOUNDARY_WARNING_SECONDS = 30 * 60;
const MAX_UNCERTAINTY_SECONDS = 24 * 60 * 60;
const SAMPLE_INTERVAL_SECONDS = 60;

LunarHour.provider = new DefaultEightCharProvider();
ChildLimit.provider = new DefaultChildLimitProvider();

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function assertRuntimeInput(input: ChartInput): void {
  if (!input || typeof input !== "object") {
    throw new ChartCalculationError("INVALID_INPUT", "排盘输入不存在。");
  }
  if (input.timeZone !== "Asia/Shanghai") {
    throw new ChartCalculationError(
      "UNSUPPORTED_TIME_ZONE",
      "v0 只支持 Asia/Shanghai；其他时区不做默认折算。",
      { timeZone: input.timeZone },
    );
  }
  if (input.calculationTimeBasis !== "china_standard_time") {
    throw new ChartCalculationError(
      "UNSUPPORTED_TIME_BASIS",
      "v0 不支持真太阳时；缺少经度、方程时和经独立校验的实现时不得伪装成精确值。",
      { calculationTimeBasis: input.calculationTimeBasis },
    );
  }
  if (input.dayBoundary !== "zi_hour_starts_next_day") {
    throw new ChartCalculationError(
      "INVALID_INPUT",
      "v0 只支持 23:00 起子时并进入次日日柱的口径。",
      { dayBoundary: input.dayBoundary },
    );
  }
  if (input.gender !== "woman" && input.gender !== "man") {
    throw new ChartCalculationError("INVALID_INPUT", "起运计算需要 woman 或 man 性别代码。");
  }
  if (!input.source || !["S0", "S1", "S2", "S3"].includes(input.source.timeSource)) {
    throw new ChartCalculationError("INVALID_INPUT", "缺少有效的时间来源等级。");
  }
  if (!["P0", "P1", "P2", "P3"].includes(input.source.timePrecision)) {
    throw new ChartCalculationError("INVALID_INPUT", "缺少有效的时间精度等级。");
  }
}

function gregorianLocalTime(input: ChartInput): LocalDateTime {
  const second = input.time.second ?? 0;
  if (input.calendar === "gregorian") {
    return { ...input.date, hour: input.time.hour, minute: input.time.minute, second };
  }
  if (input.calendar !== "chinese_lunar") {
    throw new ChartCalculationError("INVALID_INPUT", "仅支持 gregorian 或 chinese_lunar 日历类型。");
  }
  try {
    const signedMonth = input.date.leapMonth ? -input.date.month : input.date.month;
    const solarDay = LunarDay.fromYmd(input.date.year, signedMonth, input.date.day).getSolarDay();
    return {
      year: solarDay.getYear(),
      month: solarDay.getMonth(),
      day: solarDay.getDay(),
      hour: input.time.hour,
      minute: input.time.minute,
      second,
    };
  } catch (error) {
    throw new ChartCalculationError("INVALID_INPUT", "农历日期无效，闰月必须明确标记。", {
      date: input.date,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeInput(input: ChartInput): NormalizedChartInput {
  const originalLocalTime = gregorianLocalTime(input);
  const main = normalizeChinaTime(originalLocalTime, input.clockStandard, input.utcOffsetMinutes);
  const normalized: NormalizedChartInput = {
    calendar: input.calendar,
    originalLocalTime,
    chinaStandardTime: main.chinaStandardTime,
    timeZone: "Asia/Shanghai",
    clockStandard: input.clockStandard,
    appliedUtcOffsetMinutes: main.appliedUtcOffsetMinutes,
    dstAdjustmentMinutes: main.dstAdjustmentMinutes,
    calculationTimeBasis: "china_standard_time",
    dayBoundary: "zi_hour_starts_next_day",
    gender: input.gender,
    source: { ...input.source },
  };

  if (input.uncertainty) {
    const earliest = normalizeChinaTime(
      input.uncertainty.earliest,
      input.clockStandard,
      input.utcOffsetMinutes,
    ).chinaStandardTime;
    const latest = normalizeChinaTime(
      input.uncertainty.latest,
      input.clockStandard,
      input.utcOffsetMinutes,
    ).chinaStandardTime;
    const earliestSeconds = localDateTimeToEpochSeconds(earliest);
    const latestSeconds = localDateTimeToEpochSeconds(latest);
    const nominalSeconds = localDateTimeToEpochSeconds(main.chinaStandardTime);
    if (earliestSeconds > latestSeconds || nominalSeconds < earliestSeconds || nominalSeconds > latestSeconds) {
      throw new ChartCalculationError(
        "INVALID_UNCERTAINTY_RANGE",
        "不确定区间必须先早后晚，并且包含名义出生时间。",
        { earliest, latest, nominal: main.chinaStandardTime },
      );
    }
    if (latestSeconds - earliestSeconds > MAX_UNCERTAINTY_SECONDS) {
      throw new ChartCalculationError(
        "UNCERTAINTY_RANGE_TOO_WIDE",
        "v0 最多扫描 24 小时的时间不确定区间。",
        { seconds: latestSeconds - earliestSeconds },
      );
    }
    normalized.uncertaintyChinaStandardTime = { earliest, latest };
  }
  return normalized;
}

function toSolarTime(value: LocalDateTime): SolarTime {
  validateLocalDateTime(value);
  return SolarTime.fromYmdHms(
    value.year,
    value.month,
    value.day,
    value.hour,
    value.minute,
    value.second,
  );
}

function solarTimeToLocal(value: SolarTime): LocalDateTime {
  return {
    year: value.getYear(),
    month: value.getMonth(),
    day: value.getDay(),
    hour: value.getHour(),
    minute: value.getMinute(),
    second: value.getSecond(),
  };
}

function hiddenStemTypeName(type: HideHeavenStemType): string {
  if (type === HideHeavenStemType.MAIN) return "main";
  if (type === HideHeavenStemType.MIDDLE) return "middle";
  return "residual";
}

function buildPillar(
  position: PillarPosition,
  cycle: SixtyCycle,
  eightChar: EightChar,
): PillarResult {
  const stem = cycle.getHeavenStem();
  const branch = cycle.getEarthBranch();
  const dayStem = eightChar.getDay().getHeavenStem();
  return {
    position,
    name: cycle.getName(),
    stem: stem.getName(),
    branch: branch.getName(),
    stemElement: stem.getElement().getName(),
    branchElement: branch.getElement().getName(),
    tenGod: position === "day" ? "day_master" : dayStem.getTenStar(stem).getName(),
    hiddenStems: branch.getHideHeavenStems().map((hidden) => {
      const hiddenStem = hidden.getHeavenStem();
      return {
        stem: hiddenStem.getName(),
        type: hiddenStemTypeName(hidden.getType()),
        tenGod: dayStem.getTenStar(hiddenStem).getName(),
        element: hiddenStem.getElement().getName(),
      };
    }),
  };
}

function signatureAt(value: LocalDateTime): string {
  LunarHour.provider = new DefaultEightCharProvider();
  const eightChar = toSolarTime(value).getLunarHour().getEightChar();
  return [eightChar.getYear(), eightChar.getMonth(), eightChar.getDay(), eightChar.getHour()]
    .map(String)
    .join(" ");
}

function buildChildLimit(solarTime: SolarTime, gender: "woman" | "man") {
  ChildLimit.provider = new DefaultChildLimitProvider();
  const childLimit = ChildLimit.fromSolarTime(
    solarTime,
    gender === "woman" ? Gender.WOMAN : Gender.MAN,
  );
  let fortune = childLimit.getStartDecadeFortune();
  const decadeFortunes = [];
  for (let index = 0; index < 8; index += 1) {
    decadeFortunes.push({
      index: index + 1,
      name: fortune.getName(),
      startAge: fortune.getStartAge(),
      endAge: fortune.getEndAge(),
      startYear: fortune.getStartSixtyCycleYear().getName(),
      endYear: fortune.getEndSixtyCycleYear().getName(),
    });
    fortune = fortune.next(1);
  }
  return {
    provider: "tyme4ts-default" as const,
    direction: childLimit.isForward() ? ("forward" as const) : ("backward" as const),
    startTime: formatChinaStandardTime(solarTimeToLocal(childLimit.getEndTime())),
    years: childLimit.getYearCount(),
    months: childLimit.getMonthCount(),
    days: childLimit.getDayCount(),
    hours: childLimit.getHourCount(),
    minutes: childLimit.getMinuteCount(),
    decadeFortunes,
  };
}

function buildVariant(
  representative: LocalDateTime,
  validFrom: LocalDateTime,
  validThrough: LocalDateTime,
  gender: "woman" | "man",
): ChartVariant {
  const solarTime = toSolarTime(representative);
  LunarHour.provider = new DefaultEightCharProvider();
  const lunarHour = solarTime.getLunarHour();
  const eightChar = lunarHour.getEightChar();
  const pillars: PillarResult[] = [
    buildPillar("year", eightChar.getYear(), eightChar),
    buildPillar("month", eightChar.getMonth(), eightChar),
    buildPillar("day", eightChar.getDay(), eightChar),
    buildPillar("hour", eightChar.getHour(), eightChar),
  ];
  return {
    signature: pillars.map((pillar) => pillar.name).join(" "),
    validFrom: formatChinaStandardTime(validFrom),
    validThrough: formatChinaStandardTime(validThrough),
    representativeTime: formatChinaStandardTime(representative),
    lunarDate: lunarHour.getLunarDay().toString(),
    pillars,
    childLimit: buildChildLimit(solarTime, gender),
  };
}

function sampleTimes(normalized: NormalizedChartInput): LocalDateTime[] {
  const range = normalized.uncertaintyChinaStandardTime;
  if (!range) return [{ ...normalized.chinaStandardTime }];
  const start = localDateTimeToEpochSeconds(range.earliest);
  const end = localDateTimeToEpochSeconds(range.latest);
  const nominal = localDateTimeToEpochSeconds(normalized.chinaStandardTime);
  const seconds = new Set<number>([start, end, nominal]);
  for (let cursor = start; cursor <= end; cursor += SAMPLE_INTERVAL_SECONDS) seconds.add(cursor);
  return [...seconds].sort((a, b) => a - b).map(epochSecondsToLocalDateTime);
}

function buildVariants(normalized: NormalizedChartInput): ChartVariant[] {
  const nominalSeconds = localDateTimeToEpochSeconds(normalized.chinaStandardTime);
  const groups = new Map<
    string,
    { representative: LocalDateTime; validFrom: LocalDateTime; validThrough: LocalDateTime }
  >();
  for (const sample of sampleTimes(normalized)) {
    const signature = signatureAt(sample);
    const existing = groups.get(signature);
    if (existing) {
      existing.validThrough = sample;
      if (localDateTimeToEpochSeconds(sample) === nominalSeconds) existing.representative = sample;
    } else {
      groups.set(signature, { representative: sample, validFrom: sample, validThrough: sample });
    }
  }
  return [...groups.values()].map((group) =>
    buildVariant(
      group.representative,
      group.validFrom,
      group.validThrough,
      normalized.gender,
    ),
  );
}

function nearestHourBranchBoundary(value: LocalDateTime): BoundaryPoint {
  const current = localDateTimeToEpochSeconds(value);
  let nearest = Number.POSITIVE_INFINITY;
  for (let dayOffset = -1; dayOffset <= 1; dayOffset += 1) {
    const dayStart = Date.UTC(value.year, value.month - 1, value.day + dayOffset) / 1000;
    for (let hour = 1; hour <= 23; hour += 2) {
      const candidate = dayStart + hour * 3600;
      if (Math.abs(candidate - current) < Math.abs(nearest - current)) nearest = candidate;
    }
  }
  return {
    kind: "hour_branch",
    name: "时辰交界",
    time: formatChinaStandardTime(epochSecondsToLocalDateTime(nearest)),
    distanceSeconds: Math.abs(nearest - current),
  };
}

function nearestZiBoundary(value: LocalDateTime): BoundaryPoint {
  const current = localDateTimeToEpochSeconds(value);
  const candidates = [-1, 0, 1].map(
    (dayOffset) => Date.UTC(value.year, value.month - 1, value.day + dayOffset, 23) / 1000,
  );
  const nearest = candidates.sort(
    (a, b) => Math.abs(a - current) - Math.abs(b - current),
  )[0];
  return {
    kind: "zi_day_boundary",
    name: "23:00 换日",
    time: formatChinaStandardTime(epochSecondsToLocalDateTime(nearest)),
    distanceSeconds: Math.abs(nearest - current),
  };
}

function termPoint(kind: "jie" | "li_chun", term: SolarTerm, solar: SolarTime): BoundaryPoint {
  const termTime = term.getJulianDay().getSolarTime();
  return {
    kind,
    name: term.getName(),
    time: formatChinaStandardTime(solarTimeToLocal(termTime)),
    distanceSeconds: Math.abs(solar.subtract(termTime)),
  };
}

function adjacentJie(solar: SolarTime): [SolarTerm, SolarTerm] {
  let previous = solar.getTerm();
  while (!previous.isJie()) previous = previous.next(-1);
  let next = previous.next(1);
  while (!next.isJie()) next = next.next(1);
  return [previous, next];
}

function adjacentLiChun(solar: SolarTime): [SolarTerm, SolarTerm] {
  const year = solar.getYear();
  const candidates = [year - 1, year, year + 1].map((candidateYear) =>
    SolarTerm.fromName(candidateYear, "立春"),
  );
  const previous = candidates
    .filter((term) => solar.subtract(term.getJulianDay().getSolarTime()) >= 0)
    .sort(
      (a, b) =>
        solar.subtract(a.getJulianDay().getSolarTime()) -
        solar.subtract(b.getJulianDay().getSolarTime()),
    )[0];
  const next = candidates
    .filter((term) => solar.subtract(term.getJulianDay().getSolarTime()) < 0)
    .sort(
      (a, b) =>
        a.getJulianDay().getSolarTime().subtract(solar) -
        b.getJulianDay().getSolarTime().subtract(solar),
    )[0];
  return [previous, next];
}

function buildBoundaryReport(normalized: NormalizedChartInput, variantCount: number): BoundaryReport {
  const solar = toSolarTime(normalized.chinaStandardTime);
  const [previousJie, nextJie] = adjacentJie(solar);
  const [previousLiChun, nextLiChun] = adjacentLiChun(solar);
  const points = [
    nearestHourBranchBoundary(normalized.chinaStandardTime),
    nearestZiBoundary(normalized.chinaStandardTime),
    termPoint("jie", previousJie, solar),
    termPoint("jie", nextJie, solar),
    termPoint("li_chun", previousLiChun, solar),
    termPoint("li_chun", nextLiChun, solar),
  ].sort((a, b) => a.distanceSeconds - b.distanceSeconds);
  const reasons = points
    .filter((point) => point.distanceSeconds <= BOUNDARY_WARNING_SECONDS)
    .map((point) => `距${point.name}仅 ${point.distanceSeconds} 秒`);
  if (variantCount > 1) reasons.unshift("输入的不确定区间跨越了四柱边界");
  return {
    risk: variantCount > 1 ? "R2" : reasons.length > 0 ? "R1" : "R0",
    nearest: points,
    reasons,
  };
}

function buildWarnings(
  normalized: NormalizedChartInput,
  boundary: BoundaryReport,
  variantCount: number,
): string[] {
  const warnings = [
    "排盘结果仅证明与 tyme4ts@1.5.2 固定口径可重现，不等于所有历法与起运流派已独立验证。",
  ];
  if (normalized.dstAdjustmentMinutes === -60) {
    warnings.push("输入为历史夏令时钟表时间，已减去 60 分钟归一为中国标准时。");
  }
  if (boundary.risk === "R1") warnings.push("名义时间距关键边界较近，进入判断前应展示边界报告。");
  if (variantCount > 1) warnings.push("本次有多个候选命盘，在反证闭环完成前不得自动选中任何一个。");
  if (!normalized.source.calendarConfirmed) warnings.push("历法来源未确认，结果不能标为确认盘。");
  return warnings;
}

export function calculateDeterministicChart(input: ChartInput): DeterministicChartResult {
  assertRuntimeInput(input);
  const normalizedInput = normalizeInput(input);
  const variants = buildVariants(normalizedInput);
  const boundary = buildBoundaryReport(normalizedInput, variants.length);
  const canConfirm =
    variants.length === 1 &&
    boundary.risk === "R0" &&
    normalizedInput.source.calendarConfirmed &&
    ["S2", "S3"].includes(normalizedInput.source.timeSource) &&
    normalizedInput.source.timePrecision === "P3";
  const status = variants.length > 1 ? "multi_candidate" : canConfirm ? "confirmed_single" : "provisional_single";
  const result: DeterministicChartResult = {
    schemaVersion: "chart.v0",
    engine: {
      adapter: "junjun-chart-core",
      adapterVersion: "0.1.0",
      library: "tyme4ts",
      libraryVersion: "1.5.2",
      timezoneRules: "iana-tzdb-2025c-prc-subset",
      dayBoundaryProvider: "tyme4ts-default-sect1",
      childLimitProvider: "tyme4ts-default",
    },
    status,
    normalizedInput,
    selectedVariant: variants.length === 1 ? variants[0] : null,
    variants,
    boundary,
    ruleReferences: [...CHART_RULE_REFERENCES],
    warnings: buildWarnings(normalizedInput, boundary, variants.length),
  };
  return deepFreeze(result);
}
