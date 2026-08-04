import { PrivacyError } from "./types.ts";

export function clone<T>(value: T): T {
  return structuredClone(value) as T;
}

export function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child, seen);
    Object.freeze(value);
  }
  return value;
}

export function immutable<T>(value: T): T {
  return freeze(clone(value));
}

export function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PrivacyError("INVALID_INPUT", `${field} 不能为空。`);
  }
}

export function assertJsonValue(value: unknown, field: string): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let nodes = 0;
  while (stack.length > 0) {
    const item = stack.pop()!;
    const current = item.value;
    nodes += 1;
    if (nodes > 10_000 || item.depth > 64) {
      throw new PrivacyError("INVALID_INPUT", `${field} 超过安全结构上限。`);
    }
    if (
      current === null ||
      typeof current === "string" ||
      typeof current === "boolean"
    ) {
      continue;
    }
    if (typeof current === "number") {
      if (Number.isFinite(current)) continue;
      throw new PrivacyError("INVALID_INPUT", `${field} 只能包含有限数值。`);
    }
    if (typeof current !== "object") {
      throw new PrivacyError("INVALID_INPUT", `${field} 只能包含 JSON 值。`);
    }
    if (seen.has(current)) {
      throw new PrivacyError("INVALID_INPUT", `${field} 不能包含循环引用。`);
    }
    seen.add(current);
    if (!Array.isArray(current)) {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new PrivacyError("INVALID_INPUT", `${field} 只能包含普通对象或数组。`);
      }
    }
    for (const child of Object.values(current)) {
      stack.push({ value: child, depth: item.depth + 1 });
    }
  }
}

export function assertTimestamp(value: string, field: string): void {
  assertNonEmpty(value, field);
  if (Number.isNaN(Date.parse(value))) {
    throw new PrivacyError("INVALID_INPUT", `${field} 必须是可解析时间。`);
  }
}

export function assertChronological(earlier: string, later: string, field: string): void {
  assertTimestamp(earlier, `${field}.earlier`);
  assertTimestamp(later, `${field}.later`);
  if (Date.parse(later) < Date.parse(earlier)) {
    throw new PrivacyError("INVALID_INPUT", `${field} 时间顺序颠倒。`);
  }
}

export function assertOneOf<T extends string>(
  value: string,
  values: ReadonlyArray<T>,
  field: string,
): asserts value is T {
  if (!values.includes(value as T)) {
    throw new PrivacyError("INVALID_INPUT", `${field} 不在受控取值中。`);
  }
}

export function addDays(value: string, days: number): string {
  assertTimestamp(value, "date");
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function addMonths(value: string, months: number): string {
  assertTimestamp(value, "date");
  const date = new Date(value);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString();
}

export function isAtOrAfter(value: string, threshold: string): boolean {
  assertTimestamp(value, "value");
  assertTimestamp(threshold, "threshold");
  return Date.parse(value) >= Date.parse(threshold);
}
