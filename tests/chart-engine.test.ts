import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateDeterministicChart,
  ChartCalculationError,
  type ChartInput,
} from "../domain/chart/index.ts";

function baseInput(
  date: ChartInput["date"],
  time: ChartInput["time"],
  overrides: Partial<ChartInput> = {},
): ChartInput {
  return {
    calendar: "gregorian",
    date,
    time,
    timeZone: "Asia/Shanghai",
    clockStandard: "china_standard_time",
    calculationTimeBasis: "china_standard_time",
    dayBoundary: "zi_hour_starts_next_day",
    gender: "woman",
    source: { timeSource: "S3", timePrecision: "P3", calendarConfirmed: true },
    ...overrides,
  };
}

test("官方上游四柱样例保持一致，但近时辰边界不误标确认盘", () => {
  const result = calculateDeterministicChart(
    baseInput({ year: 2005, month: 12, day: 23 }, { hour: 8, minute: 37, second: 0 }),
  );
  assert.equal(result.variants[0].signature, "乙酉 戊子 辛巳 壬辰");
  assert.equal(result.status, "provisional_single");
  assert.equal(result.boundary.risk, "R1");
  assert.equal(result.engine.libraryVersion, "1.5.2");
});

test("23:00 默认口径同时切换日柱和时柱", () => {
  const before = calculateDeterministicChart(
    baseInput({ year: 1988, month: 2, day: 15 }, { hour: 22, minute: 59, second: 59 }),
  );
  const after = calculateDeterministicChart(
    baseInput({ year: 1988, month: 2, day: 15 }, { hour: 23, minute: 0, second: 0 }),
  );
  assert.equal(before.variants[0].signature, "戊辰 甲寅 庚子 丁亥");
  assert.equal(after.variants[0].signature, "戊辰 甲寅 辛丑 戊子");
  assert.equal(after.engine.dayBoundaryProvider, "tyme4ts-default-sect1");
});

test("2024 立春精确秒边界前后切换年月柱", () => {
  const before = calculateDeterministicChart(
    baseInput({ year: 2024, month: 2, day: 4 }, { hour: 16, minute: 27, second: 6 }),
  );
  const after = calculateDeterministicChart(
    baseInput({ year: 2024, month: 2, day: 4 }, { hour: 16, minute: 27, second: 8 }),
  );
  assert.equal(before.variants[0].signature, "癸卯 乙丑 戊戌 庚申");
  assert.equal(after.variants[0].signature, "甲辰 丙寅 戊戌 庚申");
  assert.equal(before.boundary.nearest[0].name, "立春");
  assert.equal(before.boundary.nearest[0].distanceSeconds, 1);
});

test("农历日期显式转公历，不依赖模型心算", () => {
  const result = calculateDeterministicChart(
    baseInput(
      { year: 2023, month: 1, day: 1 },
      { hour: 13, minute: 0, second: 0 },
      { calendar: "chinese_lunar" },
    ),
  );
  assert.deepEqual(result.normalizedInput.originalLocalTime, {
    year: 2023,
    month: 1,
    day: 22,
    hour: 13,
    minute: 0,
    second: 0,
  });
  assert.match(result.variants[0].lunarDate, /正月初一/);
});

test("1986–1991 钟表夏令时会归一为中国标准时", () => {
  const civil = calculateDeterministicChart(
    baseInput(
      { year: 1990, month: 7, day: 1 },
      { hour: 8, minute: 0, second: 0 },
      { clockStandard: "civil_time" },
    ),
  );
  const standard = calculateDeterministicChart(
    baseInput({ year: 1990, month: 7, day: 1 }, { hour: 7, minute: 0, second: 0 }),
  );
  assert.equal(civil.normalizedInput.dstAdjustmentMinutes, -60);
  assert.equal(civil.normalizedInput.appliedUtcOffsetMinutes, 540);
  assert.deepEqual(civil.normalizedInput.chinaStandardTime, standard.normalizedInput.chinaStandardTime);
  assert.equal(civil.variants[0].signature, standard.variants[0].signature);
});

test("夏令时启动缺口直接拒绝，不自动纠正", () => {
  assert.throws(
    () =>
      calculateDeterministicChart(
        baseInput(
          { year: 1990, month: 4, day: 15 },
          { hour: 2, minute: 30, second: 0 },
          { clockStandard: "civil_time" },
        ),
      ),
    (error: unknown) =>
      error instanceof ChartCalculationError && error.code === "NONEXISTENT_CIVIL_TIME",
  );
});

test("夏令时结束重复时段必须给出 UTC 偏移", () => {
  const ambiguous = baseInput(
    { year: 1990, month: 9, day: 16 },
    { hour: 1, minute: 30, second: 0 },
    { clockStandard: "civil_time" },
  );
  assert.throws(
    () => calculateDeterministicChart(ambiguous),
    (error: unknown) =>
      error instanceof ChartCalculationError && error.code === "AMBIGUOUS_CIVIL_TIME",
  );
  const daylight = calculateDeterministicChart({ ...ambiguous, utcOffsetMinutes: 540 });
  const standard = calculateDeterministicChart({ ...ambiguous, utcOffsetMinutes: 480 });
  assert.equal(daylight.normalizedInput.chinaStandardTime.hour, 0);
  assert.equal(standard.normalizedInput.chinaStandardTime.hour, 1);
  assert.notEqual(daylight.variants[0].signature, standard.variants[0].signature);
});

test("不确定区间跨过 23:00 时返回多候选，不自动选盘", () => {
  const result = calculateDeterministicChart(
    baseInput(
      { year: 1988, month: 2, day: 15 },
      { hour: 23, minute: 0, second: 0 },
      {
        source: { timeSource: "S1", timePrecision: "P1", calendarConfirmed: true },
        uncertainty: {
          earliest: { year: 1988, month: 2, day: 15, hour: 22, minute: 50, second: 0 },
          latest: { year: 1988, month: 2, day: 15, hour: 23, minute: 10, second: 0 },
        },
      },
    ),
  );
  assert.equal(result.status, "multi_candidate");
  assert.equal(result.boundary.risk, "R2");
  assert.equal(result.selectedVariant, null);
  assert.equal(result.variants.length, 2);
});

test("官方上游起运样例使用默认 provider 并正确取结束时刻", () => {
  const result = calculateDeterministicChart(
    baseInput({ year: 1983, month: 2, day: 15 }, { hour: 20, minute: 0, second: 0 }),
  );
  assert.equal(result.variants[0].signature, "癸亥 甲寅 甲戌 甲戌");
  assert.equal(result.variants[0].childLimit.startTime, "1989-05-04T18:24:00+08:00");
  assert.deepEqual(result.variants[0].childLimit.decadeFortunes[0], {
    index: 1,
    name: "乙卯",
    startAge: 7,
    endAge: 16,
    startYear: "己巳年",
    endYear: "戊寅年",
  });
  assert.equal(result.status, "confirmed_single");
});

test("真太阳时未实现时显式拒绝，不伪装精确排盘", () => {
  const input = baseInput(
    { year: 2000, month: 1, day: 1 },
    { hour: 12, minute: 0, second: 0 },
  );
  assert.throws(
    () =>
      calculateDeterministicChart({
        ...input,
        calculationTimeBasis: "true_solar_time",
      }),
    (error: unknown) =>
      error instanceof ChartCalculationError && error.code === "UNSUPPORTED_TIME_BASIS",
  );
});

test("同输入完全可重现，返回结果在运行时不可变", () => {
  const input = baseInput(
    { year: 1983, month: 2, day: 15 },
    { hour: 20, minute: 0, second: 0 },
  );
  const first = calculateDeterministicChart(input);
  const second = calculateDeterministicChart(input);
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.variants), true);
  assert.equal(Object.isFrozen(first.variants[0].pillars[0]), true);
});
