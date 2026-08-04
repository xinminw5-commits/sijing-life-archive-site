export type SupportedTimeZone = "Asia/Shanghai";
export type CalendarSystem = "gregorian" | "chinese_lunar";
export type ClockStandard = "civil_time" | "china_standard_time";
export type CalculationTimeBasis = "china_standard_time" | "true_solar_time";
export type DayBoundaryConvention = "zi_hour_starts_next_day";
export type GenderCode = "woman" | "man";
export type TimeSourceLevel = "S0" | "S1" | "S2" | "S3";
export type TimePrecisionLevel = "P0" | "P1" | "P2" | "P3";
export type BoundaryRiskLevel = "R0" | "R1" | "R2";

export interface LocalDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface BirthDateInput {
  year: number;
  month: number;
  day: number;
  /** 仅农历输入有效。 */
  leapMonth?: boolean;
}

export interface BirthTimeInput {
  hour: number;
  minute: number;
  second?: number;
}

export interface TimeUncertaintyRange {
  /** 与主输入相同的时区和钟表口径。 */
  earliest: LocalDateTime;
  latest: LocalDateTime;
}

export interface BirthPlaceInput {
  country?: string;
  region?: string;
  city?: string;
  longitude?: number;
  latitude?: number;
}

export interface ChartInput {
  calendar: CalendarSystem;
  date: BirthDateInput;
  time: BirthTimeInput;
  timeZone: SupportedTimeZone;
  /**
   * civil_time 表示当时钟表时间，会按固定版本的中国夏令时规则归一。
   * china_standard_time 表示已经是 UTC+08:00，不再转换。
   */
  clockStandard: ClockStandard;
  /** 仅夏令时结束的重复时段用于解歧。 */
  utcOffsetMinutes?: 480 | 540;
  calculationTimeBasis: CalculationTimeBasis;
  dayBoundary: DayBoundaryConvention;
  gender: GenderCode;
  birthPlace?: BirthPlaceInput;
  source: {
    timeSource: TimeSourceLevel;
    timePrecision: TimePrecisionLevel;
    calendarConfirmed: boolean;
  };
  uncertainty?: TimeUncertaintyRange;
  confirmedAt?: string;
}

export interface NormalizedChartInput {
  calendar: CalendarSystem;
  originalLocalTime: LocalDateTime;
  chinaStandardTime: LocalDateTime;
  timeZone: SupportedTimeZone;
  clockStandard: ClockStandard;
  appliedUtcOffsetMinutes: 480 | 540;
  dstAdjustmentMinutes: 0 | -60;
  calculationTimeBasis: "china_standard_time";
  dayBoundary: DayBoundaryConvention;
  gender: GenderCode;
  source: ChartInput["source"];
  uncertaintyChinaStandardTime?: {
    earliest: LocalDateTime;
    latest: LocalDateTime;
  };
}

export type PillarPosition = "year" | "month" | "day" | "hour";

export interface HiddenStemResult {
  stem: string;
  type: string;
  tenGod: string;
  element: string;
}

export interface PillarResult {
  position: PillarPosition;
  name: string;
  stem: string;
  branch: string;
  stemElement: string;
  branchElement: string;
  tenGod: string;
  hiddenStems: ReadonlyArray<HiddenStemResult>;
}

export interface DecadeFortuneResult {
  index: number;
  name: string;
  startAge: number;
  endAge: number;
  startYear: string;
  endYear: string;
}

export interface ChildLimitResult {
  provider: "tyme4ts-default";
  direction: "forward" | "backward";
  startTime: string;
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  decadeFortunes: ReadonlyArray<DecadeFortuneResult>;
}

export interface BoundaryPoint {
  kind: "hour_branch" | "zi_day_boundary" | "jie" | "li_chun";
  name: string;
  time: string;
  distanceSeconds: number;
}

export interface BoundaryReport {
  risk: BoundaryRiskLevel;
  nearest: ReadonlyArray<BoundaryPoint>;
  reasons: ReadonlyArray<string>;
}

export interface ChartVariant {
  signature: string;
  validFrom: string;
  validThrough: string;
  representativeTime: string;
  lunarDate: string;
  pillars: ReadonlyArray<PillarResult>;
  childLimit: ChildLimitResult;
}

export interface RuleReference {
  id: "ZP001" | "QT001" | "DT001";
  title: string;
  sourcePath: string;
  status: "formal";
  appliesWhen: ReadonlyArray<string>;
  exclusions: ReadonlyArray<string>;
  realityValidation: "unvalidated";
}

export interface DeterministicChartResult {
  schemaVersion: "chart.v0";
  engine: {
    adapter: "junjun-chart-core";
    adapterVersion: "0.1.0";
    library: "tyme4ts";
    libraryVersion: "1.5.2";
    timezoneRules: "iana-tzdb-2025c-prc-subset";
    dayBoundaryProvider: "tyme4ts-default-sect1";
    childLimitProvider: "tyme4ts-default";
  };
  status: "confirmed_single" | "provisional_single" | "multi_candidate";
  normalizedInput: NormalizedChartInput;
  selectedVariant: ChartVariant | null;
  variants: ReadonlyArray<ChartVariant>;
  boundary: BoundaryReport;
  ruleReferences: ReadonlyArray<RuleReference>;
  warnings: ReadonlyArray<string>;
}

export type ChartErrorCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_TIME_ZONE"
  | "UNSUPPORTED_TIME_BASIS"
  | "UNSUPPORTED_YEAR"
  | "NONEXISTENT_CIVIL_TIME"
  | "AMBIGUOUS_CIVIL_TIME"
  | "INVALID_UNCERTAINTY_RANGE"
  | "UNCERTAINTY_RANGE_TOO_WIDE";

export class ChartCalculationError extends Error {
  public readonly code: ChartErrorCode;
  public readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: ChartErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "ChartCalculationError";
    this.code = code;
    this.details = details;
  }
}
