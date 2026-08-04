import { ChartCalculationError, type LocalDateTime } from "./types.ts";

const MIN_SUPPORTED_YEAR = 1970;
const MAX_SUPPORTED_YEAR = 2100;

interface DstPeriod {
  startDay: number;
  startMonth: number;
  endDay: number;
  endMonth: number;
}

export interface ChinaTimeNormalization {
  chinaStandardTime: LocalDateTime;
  appliedUtcOffsetMinutes: 480 | 540;
  dstAdjustmentMinutes: 0 | -60;
}

function sundayOnOrAfter(year: number, month: number, minimumDay: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, minimumDay)).getUTCDay();
  return minimumDay + ((7 - weekday) % 7);
}

/** IANA tzdb 2025c 中 PRC 1986–1991 夏令时规则的最小子集。 */
function getDstPeriod(year: number): DstPeriod | null {
  if (year === 1986) {
    return { startMonth: 5, startDay: 4, endMonth: 9, endDay: 14 };
  }
  if (year >= 1987 && year <= 1991) {
    return {
      startMonth: 4,
      startDay: sundayOnOrAfter(year, 4, 11),
      endMonth: 9,
      endDay: sundayOnOrAfter(year, 9, 11),
    };
  }
  return null;
}

function parts(value: LocalDateTime): number[] {
  return [value.year, value.month, value.day, value.hour, value.minute, value.second];
}

function compareParts(a: number[], b: number[]): number {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function localDateTimeToEpochSeconds(value: LocalDateTime): number {
  return Math.trunc(
    Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second) / 1000,
  );
}

export function epochSecondsToLocalDateTime(seconds: number): LocalDateTime {
  const date = new Date(seconds * 1000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  };
}

export function validateLocalDateTime(value: LocalDateTime): void {
  const fields = Object.values(value);
  if (!fields.every(Number.isInteger)) {
    throw new ChartCalculationError("INVALID_INPUT", "日期时间必须全部为整数。", { value });
  }
  if (value.year < MIN_SUPPORTED_YEAR || value.year > MAX_SUPPORTED_YEAR) {
    throw new ChartCalculationError(
      "UNSUPPORTED_YEAR",
      `v0 仅支持 ${MIN_SUPPORTED_YEAR}–${MAX_SUPPORTED_YEAR} 年。`,
      { year: value.year },
    );
  }
  const epoch = localDateTimeToEpochSeconds(value);
  const roundTrip = epochSecondsToLocalDateTime(epoch);
  if (compareParts(parts(value), parts(roundTrip)) !== 0) {
    throw new ChartCalculationError("INVALID_INPUT", "日期或时间不存在。", { value });
  }
}

function sameDay(value: LocalDateTime, month: number, day: number): boolean {
  return value.month === month && value.day === day;
}

function resolveCivilOffset(
  value: LocalDateTime,
  assertedOffset?: 480 | 540,
): 480 | 540 {
  const period = getDstPeriod(value.year);
  if (!period) {
    if (assertedOffset === 540) {
      throw new ChartCalculationError("INVALID_INPUT", "该日期不在 v0 支持的中国夏令时期间。", {
        value,
        assertedOffset,
      });
    }
    return 480;
  }

  if (sameDay(value, period.startMonth, period.startDay) && value.hour === 2) {
    throw new ChartCalculationError(
      "NONEXISTENT_CIVIL_TIME",
      "该钟表时间落在中国夏令时启动的 02:00–02:59 缺口内。",
      { value },
    );
  }

  if (sameDay(value, period.endMonth, period.endDay) && value.hour === 1) {
    if (assertedOffset === undefined) {
      throw new ChartCalculationError(
        "AMBIGUOUS_CIVIL_TIME",
        "该钟表时间在夏令时结束时出现两次，必须提供 UTC+08:00 或 UTC+09:00 解歧。",
        { value, acceptedOffsets: [480, 540] },
      );
    }
    return assertedOffset;
  }

  const current = parts(value);
  const dstStartsAfterGap = [value.year, period.startMonth, period.startDay, 3, 0, 0];
  const dstEndsAtFold = [value.year, period.endMonth, period.endDay, 1, 0, 0];
  const isDst =
    compareParts(current, dstStartsAfterGap) >= 0 && compareParts(current, dstEndsAtFold) < 0;
  const expectedOffset: 480 | 540 = isDst ? 540 : 480;
  if (assertedOffset !== undefined && assertedOffset !== expectedOffset) {
    throw new ChartCalculationError("INVALID_INPUT", "提供的 UTC 偏移与固定版本的当日规则不符。", {
      value,
      assertedOffset,
      expectedOffset,
    });
  }
  return expectedOffset;
}

export function normalizeChinaTime(
  value: LocalDateTime,
  clockStandard: "civil_time" | "china_standard_time",
  assertedOffset?: 480 | 540,
): ChinaTimeNormalization {
  validateLocalDateTime(value);
  if (clockStandard === "china_standard_time") {
    if (assertedOffset !== undefined && assertedOffset !== 480) {
      throw new ChartCalculationError(
        "INVALID_INPUT",
        "china_standard_time 口径已经是 UTC+08:00，不能再指定 UTC+09:00。",
        { assertedOffset },
      );
    }
    return {
      chinaStandardTime: { ...value },
      appliedUtcOffsetMinutes: 480,
      dstAdjustmentMinutes: 0,
    };
  }

  const offset = resolveCivilOffset(value, assertedOffset);
  const adjustment: 0 | -60 = offset === 540 ? -60 : 0;
  const chinaStandardTime = epochSecondsToLocalDateTime(
    localDateTimeToEpochSeconds(value) + adjustment * 60,
  );
  return {
    chinaStandardTime,
    appliedUtcOffsetMinutes: offset,
    dstAdjustmentMinutes: adjustment,
  };
}

export function formatChinaStandardTime(value: LocalDateTime): string {
  const pad = (number: number): string => String(number).padStart(2, "0");
  return `${value.year}-${pad(value.month)}-${pad(value.day)}T${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}+08:00`;
}
