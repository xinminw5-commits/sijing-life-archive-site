import {
  WorkflowError,
  type CaseWorkflowSnapshot,
  type CommandMeta,
} from "./types.ts";

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = canonical(child);
    }
    return result;
  }
  return value;
}

/**
 * 可重现的非密码学指纹，用于幂等和意外篡改检测。
 * 持久化层如需防恶意篡改，必须另加签名或密码学摘要。
 */
export function stableDigest(value: unknown): string {
  const text = JSON.stringify(canonical(value));
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

export function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new WorkflowError("INVALID_COMMAND", `${field} 不能为空。`, { field });
  }
}

export function assertTimestamp(value: string, field: string): void {
  assertNonEmpty(value, field);
  if (Number.isNaN(Date.parse(value))) {
    throw new WorkflowError("INVALID_COMMAND", `${field} 必须是可解析的时间。`, {
      field,
      value,
    });
  }
}

export function assertChronological(
  earlier: string,
  later: string,
  field: string,
): void {
  assertTimestamp(earlier, `${field}.earlier`);
  assertTimestamp(later, `${field}.later`);
  if (Date.parse(later) < Date.parse(earlier)) {
    throw new WorkflowError("INVALID_COMMAND", `${field} 的时间顺序颠倒。`, {
      earlier,
      later,
    });
  }
}

export function assertOneOf<T extends string>(
  value: string,
  allowed: ReadonlyArray<T>,
  field: string,
): asserts value is T {
  if (!allowed.includes(value as T)) {
    throw new WorkflowError("INVALID_COMMAND", `${field} 不在受控取值集中。`, {
      field,
      value,
      allowed,
    });
  }
}

export function uniqueStrings(values: ReadonlyArray<string>, field: string): void {
  if (new Set(values).size !== values.length) {
    throw new WorkflowError("INVALID_COMMAND", `${field} 中存在重复 ID。`, { field });
  }
}

export function executeCommand<P>(
  snapshot: CaseWorkflowSnapshot,
  meta: CommandMeta,
  commandType: string,
  payload: P,
  occurredAt: string,
  mutate: (draft: CaseWorkflowSnapshot) => void,
): CaseWorkflowSnapshot {
  assertNonEmpty(meta.idempotencyKey, "idempotencyKey");
  if (!Number.isInteger(meta.expectedRevision) || meta.expectedRevision < 0) {
    throw new WorkflowError("INVALID_COMMAND", "expectedRevision 必须是非负整数。");
  }
  assertTimestamp(occurredAt, "occurredAt");
  const payloadDigest = stableDigest({ commandType, payload });
  const existing = snapshot.commandReceipts.find(
    (receipt) => receipt.idempotencyKey === meta.idempotencyKey,
  );
  if (existing) {
    if (existing.commandType !== commandType || existing.payloadDigest !== payloadDigest) {
      throw new WorkflowError(
        "IDEMPOTENCY_KEY_REUSED",
        "同一幂等键已经用于不同命令或不同载荷。",
        { idempotencyKey: meta.idempotencyKey },
      );
    }
    return snapshot;
  }
  if (meta.expectedRevision !== snapshot.revision) {
    throw new WorkflowError("STALE_REVISION", "工作流修订号已变更，拒绝覆盖并发更新。", {
      expectedRevision: meta.expectedRevision,
      actualRevision: snapshot.revision,
    });
  }
  assertChronological(snapshot.updatedAt, occurredAt, "commandTimeline");

  const draft = structuredClone(snapshot) as CaseWorkflowSnapshot;
  mutate(draft);
  const resultingRevision = snapshot.revision + 1;
  (draft as { revision: number }).revision = resultingRevision;
  (draft as { updatedAt: string }).updatedAt = occurredAt;
  (draft.commandReceipts as Array<CaseWorkflowSnapshot["commandReceipts"][number]>).push({
    idempotencyKey: meta.idempotencyKey,
    commandType,
    payloadDigest,
    resultingRevision,
  });
  return deepFreeze(draft);
}
