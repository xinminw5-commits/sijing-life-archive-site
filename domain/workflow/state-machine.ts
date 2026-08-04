import type { DeterministicChartResult } from "../chart/index.ts";

import {
  WorkflowError,
  type BlindGenerationContext,
  type BlindReadingItem,
  type CandidateQuestion,
  type CaseWorkflowSnapshot,
  type ChartCycle,
  type CommandMeta,
  type EvidenceGrade,
  type LifeEventVersion,
  type ProspectiveEligibility,
  type ReviewBasis,
  type VerificationResult,
  type WorkflowState,
} from "./types.ts";
import {
  assertChronological,
  assertNonEmpty,
  assertOneOf,
  assertTimestamp,
  deepFreeze,
  executeCommand,
  stableDigest,
  uniqueStrings,
} from "./utils.ts";

type WithMeta<T> = T & CommandMeta;

function splitMeta<T extends CommandMeta>(command: T): [CommandMeta, Omit<T, keyof CommandMeta>] {
  const { expectedRevision, idempotencyKey, ...payload } = command;
  return [{ expectedRevision, idempotencyKey }, payload];
}

function activeCycle(snapshot: CaseWorkflowSnapshot): ChartCycle {
  const cycle = snapshot.cycles.find((candidate) => candidate.cycleId === snapshot.activeCycleId);
  if (!cycle) throw new WorkflowError("NOT_FOUND", "当前工作流没有活跃命盘周期。");
  return cycle;
}

function mutableArray<T>(value: ReadonlyArray<T>): T[] {
  return value as T[];
}

function setState(snapshot: CaseWorkflowSnapshot, state: WorkflowState): void {
  (snapshot as { state: WorkflowState }).state = state;
  (activeCycle(snapshot) as { phase: WorkflowState }).phase = state;
}

function assertState(snapshot: CaseWorkflowSnapshot, ...allowed: WorkflowState[]): void {
  if (!allowed.includes(snapshot.state)) {
    throw new WorkflowError("INVALID_STATE", `当前状态 ${snapshot.state} 不允许此操作。`, {
      state: snapshot.state,
      allowed,
    });
  }
}

function assertUniqueId(existing: ReadonlyArray<string>, value: string, field: string): void {
  assertNonEmpty(value, field);
  if (existing.includes(value)) {
    throw new WorkflowError("INVALID_COMMAND", `${field} 已存在。`, { field, value });
  }
}

function validateChartContract(chart: DeterministicChartResult): void {
  if (chart.schemaVersion !== "chart.v0") {
    throw new WorkflowError("CHART_CONTRACT_VIOLATION", "只能绑定 chart.v0。");
  }
  assertOneOf(
    chart.status,
    ["confirmed_single", "provisional_single", "multi_candidate"] as const,
    "chart.status",
  );
  if (
    (chart.status === "confirmed_single" || chart.status === "provisional_single") &&
    (chart.variants.length !== 1 || chart.selectedVariant === null)
  ) {
    throw new WorkflowError(
      "CHART_CONTRACT_VIOLATION",
      "单盘状态必须只有一个候选且 selectedVariant 非空。",
    );
  }
  if (
    chart.status === "multi_candidate" &&
    (chart.variants.length < 2 || chart.selectedVariant !== null)
  ) {
    throw new WorkflowError(
      "CHART_CONTRACT_VIOLATION",
      "multi_candidate 必须有至少两个候选且 selectedVariant 为空。",
    );
  }
  const signatures = chart.variants.map((variant) => variant.signature);
  uniqueStrings(signatures, "chart.variants.signature");
}

function stateForChart(chart: DeterministicChartResult): WorkflowState {
  if (chart.status === "confirmed_single") return "chart_confirmed";
  if (chart.status === "provisional_single") return "chart_review_required";
  return "chart_disambiguation_required";
}

function pendingEligibility(caseMode: "prospective" | "retrospective"): ProspectiveEligibility {
  if (caseMode === "retrospective") {
    return { status: "not_eligible", reasons: ["case_marked_retrospective"] };
  }
  return { status: "pending_lock", reasons: ["blind_reading_not_locked"] };
}

function eligibilityBeforeLock(snapshot: CaseWorkflowSnapshot): ProspectiveEligibility {
  const cycle = activeCycle(snapshot);
  if (snapshot.caseMode === "retrospective") {
    return { status: "not_eligible", reasons: ["case_marked_retrospective"] };
  }
  if (cycle.resolutionMode === "fact_assisted_chart_resolution") {
    return { status: "not_eligible", reasons: ["fact_assisted_chart_resolution"] };
  }
  if (cycle.lifeEvents.length > 0) {
    return { status: "not_eligible", reasons: ["life_event_existed_before_blind_lock"] };
  }
  return { status: "pending_lock", reasons: ["blind_reading_not_locked"] };
}

function eligibilityAtLock(snapshot: CaseWorkflowSnapshot): ProspectiveEligibility {
  const before = eligibilityBeforeLock(snapshot);
  if (before.status === "not_eligible") return before;
  return { status: "eligible", reasons: [] };
}

function newCycle(
  cycleId: string,
  chartId: string,
  chart: DeterministicChartResult,
  createdAt: string,
): ChartCycle {
  validateChartContract(chart);
  const phase = stateForChart(chart);
  return {
    cycleId,
    chartId,
    chart: structuredClone(chart),
    phase,
    resolutionMode: chart.status === "confirmed_single" ? "engine_confirmed" : null,
    resolvedVariantSignature:
      chart.status === "confirmed_single" ? chart.selectedVariant?.signature ?? null : null,
    chartReview: null,
    candidateQuestionSets: [],
    candidateVerifications: [],
    candidateResolution: null,
    blindGenerationAttempts: [],
    blindReadings: [],
    lifeEvents: [],
    verifications: [],
    consultation: null,
    createdAt,
  };
}

export function createCaseWorkflow(input: {
  workflowId: string;
  caseMode: "prospective" | "retrospective";
  createdAt: string;
}): CaseWorkflowSnapshot {
  assertNonEmpty(input.workflowId, "workflowId");
  assertTimestamp(input.createdAt, "createdAt");
  assertOneOf(input.caseMode, ["prospective", "retrospective"] as const, "caseMode");
  return deepFreeze({
    schemaVersion: "case-workflow.v0",
    workflowId: input.workflowId,
    caseMode: input.caseMode,
    state: "draft_chart",
    revision: 0,
    activeCycleId: null,
    cycles: [],
    prospectiveEligibility: pendingEligibility(input.caseMode),
    commandReceipts: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  });
}

export function attachChart(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    cycleId: string;
    chartId: string;
    chart: DeterministicChartResult;
    attachedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(snapshot, meta, "attach_chart", payload, payload.attachedAt, (draft) => {
    assertState(draft, "draft_chart");
    if (draft.activeCycleId !== null || draft.cycles.length > 0) {
      throw new WorkflowError("INVALID_STATE", "初次绑定只能用于空工作流。");
    }
    assertUniqueId(draft.cycles.map((cycle) => cycle.cycleId), payload.cycleId, "cycleId");
    assertUniqueId(draft.cycles.map((cycle) => cycle.chartId), payload.chartId, "chartId");
    assertTimestamp(payload.attachedAt, "attachedAt");
    const cycle = newCycle(payload.cycleId, payload.chartId, payload.chart, payload.attachedAt);
    mutableArray(draft.cycles).push(cycle);
    (draft as { activeCycleId: string }).activeCycleId = cycle.cycleId;
    setState(draft, cycle.phase);
    (draft as { prospectiveEligibility: ProspectiveEligibility }).prospectiveEligibility =
      pendingEligibility(draft.caseMode);
  });
}

export function replaceChart(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    cycleId: string;
    chartId: string;
    chart: DeterministicChartResult;
    reason: string;
    replacedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(snapshot, meta, "replace_chart", payload, payload.replacedAt, (draft) => {
    assertNonEmpty(payload.reason, "reason");
    assertTimestamp(payload.replacedAt, "replacedAt");
    const previous = activeCycle(draft);
    (previous as { invalidatedAt: string }).invalidatedAt = payload.replacedAt;
    (previous as { invalidationReason: string }).invalidationReason = payload.reason;
    assertUniqueId(draft.cycles.map((cycle) => cycle.cycleId), payload.cycleId, "cycleId");
    assertUniqueId(draft.cycles.map((cycle) => cycle.chartId), payload.chartId, "chartId");
    const cycle = newCycle(payload.cycleId, payload.chartId, payload.chart, payload.replacedAt);
    mutableArray(draft.cycles).push(cycle);
    (draft as { activeCycleId: string }).activeCycleId = cycle.cycleId;
    setState(draft, cycle.phase);
    (draft as { prospectiveEligibility: ProspectiveEligibility }).prospectiveEligibility =
      pendingEligibility(draft.caseMode);
  });
}

export function confirmProvisionalChart(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    reviewerId: string;
    basis: ReviewBasis;
    reason: string;
    reviewedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "confirm_provisional_chart",
    payload,
    payload.reviewedAt,
    (draft) => {
      assertState(draft, "chart_review_required");
      assertNonEmpty(payload.reviewerId, "reviewerId");
      assertNonEmpty(payload.reason, "reason");
      assertTimestamp(payload.reviewedAt, "reviewedAt");
      assertOneOf(
        payload.basis,
        ["source_evidence", "calendar_review", "boundary_review"] as const,
        "basis",
      );
      const cycle = activeCycle(draft);
      if (cycle.chart.status !== "provisional_single" || cycle.chart.selectedVariant === null) {
        throw new WorkflowError("CHART_CONTRACT_VIOLATION", "只能复核 provisional_single。");
      }
      if (cycle.candidateVerifications.length > 0 || cycle.lifeEvents.length > 0) {
        throw new WorkflowError(
          "CONTEXT_ISOLATION_VIOLATION",
          "人工单盘确认不得使用候选核验回答或人生事实。",
        );
      }
      (cycle as { chartReview: ChartCycle["chartReview"] }).chartReview = { ...payload };
      (cycle as { resolutionMode: ChartCycle["resolutionMode"] }).resolutionMode =
        "operator_confirmed_without_life_events";
      (cycle as { resolvedVariantSignature: string }).resolvedVariantSignature =
        cycle.chart.selectedVariant.signature;
      setState(draft, "chart_confirmed");
    },
  );
}

function validateQuestion(question: CandidateQuestion, signatures: Set<string>): void {
  assertNonEmpty(question.questionId, "questionId");
  assertNonEmpty(question.targetVariantSignature, "targetVariantSignature");
  if (!signatures.has(question.targetVariantSignature)) {
    throw new WorkflowError("QUESTION_SET_INVALID", "问题引用了不存在的候选签名。", {
      questionId: question.questionId,
    });
  }
  for (const [field, value] of [
    ["prompt", question.prompt],
    ["timeRange", question.timeRange],
    ["observableDomain", question.observableDomain],
    ["supports", question.supports],
    ["refutes", question.refutes],
    ["alternativeExplanation", question.alternativeExplanation],
  ]) {
    assertNonEmpty(value, field);
  }
  if (question.differenceFields.length === 0 || question.ruleReferences.length === 0) {
    throw new WorkflowError(
      "QUESTION_SET_INVALID",
      "每个候选问题必须包含差异字段和规则引用。",
      { questionId: question.questionId },
    );
  }
  for (const reference of question.ruleReferences) {
    assertNonEmpty(reference.id, "ruleReference.id");
    assertNonEmpty(reference.sourcePath, "ruleReference.sourcePath");
    assertOneOf(
      reference.status,
      ["formal", "candidate", "risk_symbol"] as const,
      "ruleReference.status",
    );
  }
}

export function lockCandidateQuestionSet(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    questionSetId: string;
    questions: ReadonlyArray<CandidateQuestion>;
    lockedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "lock_candidate_question_set",
    payload,
    payload.lockedAt,
    (draft) => {
      assertState(draft, "chart_disambiguation_required");
      assertTimestamp(payload.lockedAt, "lockedAt");
      const cycle = activeCycle(draft);
      const signatures = cycle.chart.variants.map((variant) => variant.signature);
      if (signatures.length > 3) {
        throw new WorkflowError(
          "MANUAL_REVIEW_REQUIRED",
          "v0.1 候选超过三个，必须先人工补充时间来源。",
        );
      }
      if (cycle.candidateVerifications.length > 0) {
        throw new WorkflowError(
          "QUESTION_SET_LOCKED",
          "已经收到候选核验回答，不得再更换问题集。",
        );
      }
      assertUniqueId(
        cycle.candidateQuestionSets.map((set) => set.questionSetId),
        payload.questionSetId,
        "questionSetId",
      );
      if (payload.questions.length < 3 || payload.questions.length > 6) {
        throw new WorkflowError("QUESTION_SET_INVALID", "整组候选问题必须在 3–6 个之间。");
      }
      uniqueStrings(payload.questions.map((question) => question.questionId), "questionId");
      const signatureSet = new Set(signatures);
      for (const question of payload.questions) validateQuestion(question, signatureSet);
      for (const signature of signatures) {
        const count = payload.questions.filter(
          (question) => question.targetVariantSignature === signature,
        ).length;
        if (count < 2 || count > 4) {
          throw new WorkflowError(
            "QUESTION_SET_INVALID",
            "每个候选必须登记 2–4 个高区分问题。",
            { signature, count },
          );
        }
      }
      const version = cycle.candidateQuestionSets.length + 1;
      const content = { version, questions: payload.questions };
      mutableArray(cycle.candidateQuestionSets).push({
        questionSetId: payload.questionSetId,
        version,
        questions: structuredClone(payload.questions),
        lockedAt: payload.lockedAt,
        contentDigest: stableDigest(content),
      });
    },
  );
}

export function recordCandidateVerification(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    verificationId: string;
    questionSetId: string;
    questionId: string;
    result: VerificationResult;
    evidenceGrade: EvidenceGrade;
    userStatement: string;
    backgroundVariables: ReadonlyArray<string>;
    reviewerId: string;
    recordedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "record_candidate_verification",
    payload,
    payload.recordedAt,
    (draft) => {
      assertState(draft, "chart_disambiguation_required");
      assertTimestamp(payload.recordedAt, "recordedAt");
      assertNonEmpty(payload.userStatement, "userStatement");
      assertNonEmpty(payload.reviewerId, "reviewerId");
      assertOneOf(payload.result, ["match", "partial", "conflict", "unknown"] as const, "result");
      assertOneOf(payload.evidenceGrade, ["A", "B", "C"] as const, "evidenceGrade");
      const cycle = activeCycle(draft);
      assertUniqueId(
        cycle.candidateVerifications.map((item) => item.verificationId),
        payload.verificationId,
        "verificationId",
      );
      const questionSet = cycle.candidateQuestionSets.find(
        (set) => set.questionSetId === payload.questionSetId,
      );
      if (!questionSet) throw new WorkflowError("NOT_FOUND", "候选问题集不存在。");
      if (questionSet !== cycle.candidateQuestionSets.at(-1)) {
        throw new WorkflowError("QUESTION_SET_LOCKED", "只能回答当前最新锁定问题集。");
      }
      const question = questionSet.questions.find((item) => item.questionId === payload.questionId);
      if (!question) throw new WorkflowError("NOT_FOUND", "候选问题不存在。");
      mutableArray(cycle.candidateVerifications).push({
        ...payload,
        targetVariantSignature: question.targetVariantSignature,
      });
    },
  );
}

export function resolveCandidateWithFacts(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    selectedVariantSignature: string;
    supportingVerificationIds: ReadonlyArray<string>;
    conflictingVerificationIds: ReadonlyArray<string>;
    reviewerId: string;
    reason: string;
    resolvedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "resolve_candidate_with_facts",
    payload,
    payload.resolvedAt,
    (draft) => {
      assertState(draft, "chart_disambiguation_required");
      assertTimestamp(payload.resolvedAt, "resolvedAt");
      assertNonEmpty(payload.reviewerId, "reviewerId");
      assertNonEmpty(payload.reason, "reason");
      uniqueStrings(payload.supportingVerificationIds, "supportingVerificationIds");
      uniqueStrings(payload.conflictingVerificationIds, "conflictingVerificationIds");
      const cycle = activeCycle(draft);
      const signatures = cycle.chart.variants.map((variant) => variant.signature);
      if (!signatures.includes(payload.selectedVariantSignature)) {
        throw new WorkflowError("NOT_FOUND", "选中的候选签名不存在。");
      }
      const byId = new Map(
        cycle.candidateVerifications.map((verification) => [
          verification.verificationId,
          verification,
        ]),
      );
      const supports = payload.supportingVerificationIds.map((id) => byId.get(id));
      if (
        supports.length < 2 ||
        supports.some(
          (item) =>
            !item ||
            item.targetVariantSignature !== payload.selectedVariantSignature ||
            item.result !== "match" ||
            !["A", "B"].includes(item.evidenceGrade),
        ) ||
        new Set(supports.map((item) => item?.questionId)).size < 2
      ) {
        throw new WorkflowError(
          "EVIDENCE_INSUFFICIENT",
          "选中候选至少需要两条独立的 A/B 级 match。",
        );
      }
      const conflicts = payload.conflictingVerificationIds.map((id) => byId.get(id));
      const competitors = signatures.filter(
        (signature) => signature !== payload.selectedVariantSignature,
      );
      for (const competitor of competitors) {
        if (
          !conflicts.some(
            (item) =>
              item?.targetVariantSignature === competitor &&
              item.result === "conflict" &&
              ["A", "B"].includes(item.evidenceGrade),
          )
        ) {
          throw new WorkflowError(
            "EVIDENCE_INSUFFICIENT",
            "每个竞争候选至少需要一条 A/B 级 conflict。",
            { competitor },
          );
        }
      }
      for (const verification of [...supports, ...conflicts]) {
        if (verification) {
          assertChronological(verification.recordedAt, payload.resolvedAt, "candidateResolution");
        }
      }
      (cycle as { candidateResolution: ChartCycle["candidateResolution"] }).candidateResolution = {
        ...payload,
        mode: "fact_assisted_chart_resolution",
      };
      (cycle as { resolutionMode: ChartCycle["resolutionMode"] }).resolutionMode =
        "fact_assisted_chart_resolution";
      (cycle as { resolvedVariantSignature: string }).resolvedVariantSignature =
        payload.selectedVariantSignature;
      (draft as { prospectiveEligibility: ProspectiveEligibility }).prospectiveEligibility = {
        status: "not_eligible",
        reasons: ["fact_assisted_chart_resolution"],
      };
      setState(draft, "chart_confirmed");
    },
  );
}

function selectedVariant(cycle: ChartCycle) {
  const signature = cycle.resolvedVariantSignature;
  if (!signature) {
    throw new WorkflowError("CHART_CONTRACT_VIOLATION", "当前周期没有已确认候选。");
  }
  const variant = cycle.chart.variants.find((candidate) => candidate.signature === signature);
  if (!variant) {
    throw new WorkflowError("CHART_CONTRACT_VIOLATION", "已确认候选不在命盘快照中。");
  }
  return variant;
}

export function buildBlindGenerationContext(
  snapshot: CaseWorkflowSnapshot,
): BlindGenerationContext {
  const cycle = activeCycle(snapshot);
  if (!cycle.resolutionMode || cycle.invalidatedAt) {
    throw new WorkflowError(
      "CONTEXT_ISOLATION_VIOLATION",
      "只能为当前有效且已确认的命盘构建盲断上下文。",
    );
  }
  if (
    ![
      "chart_confirmed",
      "blind_reading_generating",
      "blind_reading_failed",
      "blind_reading_locked",
      "archive_collecting",
      "verification_in_progress",
      "verification_completed",
      "consultation_ready",
      "consultation_in_progress",
      "consultation_paused",
      "consultation_completed",
    ].includes(snapshot.state)
  ) {
    throw new WorkflowError("INVALID_STATE", "当前状态不允许构建盲断上下文。");
  }
  return deepFreeze({
    schemaVersion: "blind-context.v0",
    workflowId: snapshot.workflowId,
    cycleId: cycle.cycleId,
    chartId: cycle.chartId,
    chartSchemaVersion: cycle.chart.schemaVersion,
    engine: structuredClone(cycle.chart.engine),
    selectedVariant: structuredClone(selectedVariant(cycle)),
    ruleReferences: structuredClone(cycle.chart.ruleReferences),
    prospectiveEligibility:
      snapshot.prospectiveEligibility.status === "eligible"
        ? structuredClone(snapshot.prospectiveEligibility)
        : eligibilityBeforeLock(snapshot),
  });
}

export function startBlindReadingGeneration(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    generationId: string;
    startedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "start_blind_reading_generation",
    payload,
    payload.startedAt,
    (draft) => {
      assertState(draft, "chart_confirmed", "blind_reading_failed");
      assertTimestamp(payload.startedAt, "startedAt");
      const cycle = activeCycle(draft);
      assertUniqueId(
        cycle.blindGenerationAttempts.map((attempt) => attempt.generationId),
        payload.generationId,
        "generationId",
      );
      const context = buildBlindGenerationContext(draft);
      mutableArray(cycle.blindGenerationAttempts).push({
        generationId: payload.generationId,
        attempt: cycle.blindGenerationAttempts.length + 1,
        contextDigest: stableDigest(context),
        status: "running",
        startedAt: payload.startedAt,
      });
      setState(draft, "blind_reading_generating");
    },
  );
}

function runningAttempt(cycle: ChartCycle, generationId: string) {
  const attempt = cycle.blindGenerationAttempts.find(
    (candidate) => candidate.generationId === generationId,
  );
  if (!attempt || attempt.status !== "running") {
    throw new WorkflowError("NOT_FOUND", "运行中的盲断生成尝试不存在。");
  }
  return attempt;
}

export function failBlindReadingGeneration(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    generationId: string;
    errorCode: string;
    failedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "fail_blind_reading_generation",
    payload,
    payload.failedAt,
    (draft) => {
      assertState(draft, "blind_reading_generating");
      assertTimestamp(payload.failedAt, "failedAt");
      assertNonEmpty(payload.errorCode, "errorCode");
    const attempt = runningAttempt(activeCycle(draft), payload.generationId);
      assertChronological(attempt.startedAt, payload.failedAt, "generationFailure");
      (attempt as { status: "failed" }).status = "failed";
      (attempt as { finishedAt: string }).finishedAt = payload.failedAt;
      (attempt as { errorCode: string }).errorCode = payload.errorCode;
      setState(draft, "blind_reading_failed");
    },
  );
}

function validateBlindItems(items: ReadonlyArray<BlindReadingItem>): void {
  if (items.length === 0) throw new WorkflowError("INVALID_COMMAND", "盲断至少需要一个条目。");
  uniqueStrings(items.map((item) => item.itemId), "blindReading.itemId");
    for (const item of items) {
    for (const [field, value] of [
      ["itemId", item.itemId],
      ["statement", item.statement],
      ["domain", item.domain],
      ["timeRange", item.timeRange],
      ["refutationCondition", item.refutationCondition],
      ["alternativeExplanation", item.alternativeExplanation],
    ]) {
      assertNonEmpty(value, field);
    }
    if (item.supportingChartFields.length < 2 || item.ruleReferences.length === 0) {
      throw new WorkflowError(
        "INVALID_COMMAND",
        "每个盲断条目至少需要两个盘面条件和一条规则引用。",
        { itemId: item.itemId },
      );
    }
    assertOneOf(item.confidence, ["low", "medium", "high"] as const, "confidence");
    for (const reference of item.ruleReferences) {
      assertOneOf(
        reference.status,
        ["formal", "candidate", "risk_symbol"] as const,
        "ruleReference.status",
      );
      assertNonEmpty(reference.id, "ruleReference.id");
      assertNonEmpty(reference.sourcePath, "ruleReference.sourcePath");
    }
  }
}

export function lockBlindReading(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    blindReadingId: string;
    generationId: string;
    items: ReadonlyArray<BlindReadingItem>;
    modelVersion: string;
    promptVersion: string;
    createdAt: string;
    lockedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(snapshot, meta, "lock_blind_reading", payload, payload.lockedAt, (draft) => {
    assertState(draft, "blind_reading_generating");
    assertTimestamp(payload.createdAt, "createdAt");
    assertTimestamp(payload.lockedAt, "lockedAt");
    assertNonEmpty(payload.modelVersion, "modelVersion");
    assertNonEmpty(payload.promptVersion, "promptVersion");
    validateBlindItems(payload.items);
    const cycle = activeCycle(draft);
    if (cycle.lifeEvents.length > 0) {
      throw new WorkflowError(
        "CONTEXT_ISOLATION_VIOLATION",
        "LifeEvent 已经进入，不得再把本次生成标成事前盲断。",
      );
    }
    assertUniqueId(
      cycle.blindReadings.map((reading) => reading.blindReadingId),
      payload.blindReadingId,
      "blindReadingId",
    );
    const attempt = runningAttempt(cycle, payload.generationId);
    assertChronological(attempt.startedAt, payload.createdAt, "blindReadingCreation");
    assertChronological(payload.createdAt, payload.lockedAt, "blindReadingLock");
    const currentContextDigest = stableDigest(buildBlindGenerationContext(draft));
    if (currentContextDigest !== attempt.contextDigest) {
      throw new WorkflowError(
        "CONTEXT_ISOLATION_VIOLATION",
        "命盘上下文在生成期间已变更，不得锁定旧结果。",
      );
    }
    const prospectiveEligibility = eligibilityAtLock(draft);
    const version = cycle.blindReadings.length + 1;
    const content = {
      version,
      chartId: cycle.chartId,
      items: payload.items,
      modelVersion: payload.modelVersion,
      promptVersion: payload.promptVersion,
      contextDigest: attempt.contextDigest,
    };
    mutableArray(cycle.blindReadings).push({
      blindReadingId: payload.blindReadingId,
      version,
      generationId: payload.generationId,
      chartId: cycle.chartId,
      items: structuredClone(payload.items),
      modelVersion: payload.modelVersion,
      promptVersion: payload.promptVersion,
      contextDigest: attempt.contextDigest,
      contentDigest: stableDigest(content),
      createdAt: payload.createdAt,
      lockedAt: payload.lockedAt,
      prospectiveEligibility,
    });
    (attempt as { status: "locked" }).status = "locked";
    (attempt as { finishedAt: string }).finishedAt = payload.lockedAt;
    (draft as { prospectiveEligibility: ProspectiveEligibility }).prospectiveEligibility =
      prospectiveEligibility;
    setState(draft, "blind_reading_locked");
  });
}

function validateLifeEventVersion(value: Omit<LifeEventVersion, "version">): void {
  for (const [field, text] of [
    ["domain", value.domain],
    ["summary", value.summary],
    ["userWords", value.userWords],
  ]) {
    assertNonEmpty(text, field);
  }
  assertTimestamp(value.createdAt, "createdAt");
  assertOneOf(value.certainty, ["confirmed", "approximate", "unknown"] as const, "certainty");
  assertOneOf(
    value.sensitivity,
    ["ordinary", "sensitive", "highly_sensitive"] as const,
    "sensitivity",
  );
  if (value.occurredFrom !== undefined) assertNonEmpty(value.occurredFrom, "occurredFrom");
  if (value.occurredThrough !== undefined) assertNonEmpty(value.occurredThrough, "occurredThrough");
}

function assertLifeEventCollectionState(snapshot: CaseWorkflowSnapshot): void {
  assertState(
    snapshot,
    "blind_reading_locked",
    "archive_collecting",
    "verification_in_progress",
  );
}

export function addLifeEvent(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    eventId: string;
    event: Omit<LifeEventVersion, "version">;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "add_life_event",
    payload,
    payload.event.createdAt,
    (draft) => {
      assertLifeEventCollectionState(draft);
      validateLifeEventVersion(payload.event);
      const cycle = activeCycle(draft);
      assertUniqueId(cycle.lifeEvents.map((event) => event.eventId), payload.eventId, "eventId");
      mutableArray(cycle.lifeEvents).push({
        eventId: payload.eventId,
        versions: [{ ...structuredClone(payload.event), version: 1 }],
      });
      if (draft.state === "blind_reading_locked") setState(draft, "archive_collecting");
    },
  );
}

export function reviseLifeEvent(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    eventId: string;
    event: Omit<LifeEventVersion, "version">;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "revise_life_event",
    payload,
    payload.event.createdAt,
    (draft) => {
      assertLifeEventCollectionState(draft);
      validateLifeEventVersion(payload.event);
      const record = activeCycle(draft).lifeEvents.find((event) => event.eventId === payload.eventId);
      if (!record) throw new WorkflowError("NOT_FOUND", "LifeEvent 不存在。");
      if (record.tombstone) {
        throw new WorkflowError("LOCKED_CONTENT_IMMUTABLE", "已删除的 LifeEvent 不得继续修改。");
      }
      const previous = record.versions.at(-1);
      if (previous) assertChronological(previous.createdAt, payload.event.createdAt, "lifeEventRevision");
      mutableArray(record.versions).push({
        ...structuredClone(payload.event),
        version: record.versions.length + 1,
      });
    },
  );
}

export function tombstoneLifeEvent(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    eventId: string;
    reason: string;
    deletedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "tombstone_life_event",
    payload,
    payload.deletedAt,
    (draft) => {
      assertLifeEventCollectionState(draft);
      assertNonEmpty(payload.reason, "reason");
      assertTimestamp(payload.deletedAt, "deletedAt");
      const record = activeCycle(draft).lifeEvents.find((event) => event.eventId === payload.eventId);
      if (!record) throw new WorkflowError("NOT_FOUND", "LifeEvent 不存在。");
      if (record.tombstone) {
        throw new WorkflowError("LOCKED_CONTENT_IMMUTABLE", "LifeEvent 已经删除。");
      }
      const latest = record.versions.at(-1);
      if (latest) assertChronological(latest.createdAt, payload.deletedAt, "lifeEventDeletion");
      (record as { tombstone: { reason: string; deletedAt: string } }).tombstone = {
        reason: payload.reason,
        deletedAt: payload.deletedAt,
      };
    },
  );
}

function latestBlindReading(cycle: ChartCycle) {
  const reading = cycle.blindReadings.at(-1);
  if (!reading) throw new WorkflowError("NOT_FOUND", "当前周期没有已锁定盲断。");
  return reading;
}

export function startVerification(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    startedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "start_verification",
    payload,
    payload.startedAt,
    (draft) => {
      assertState(draft, "blind_reading_locked", "archive_collecting");
      assertTimestamp(payload.startedAt, "startedAt");
      latestBlindReading(activeCycle(draft));
      setState(draft, "verification_in_progress");
    },
  );
}

export function recordBlindVerification(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    verificationId: string;
    itemId: string;
    lifeEventId: string | null;
    result: VerificationResult;
    reason: string;
    conflict: string;
    alternativeExplanation: string;
    userFeedback: string;
    evidenceGrade: EvidenceGrade;
    reviewerId: string;
    createdAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "record_blind_verification",
    payload,
    payload.createdAt,
    (draft) => {
      assertState(draft, "verification_in_progress");
      assertTimestamp(payload.createdAt, "createdAt");
      assertOneOf(payload.result, ["match", "partial", "conflict", "unknown"] as const, "result");
      assertOneOf(payload.evidenceGrade, ["A", "B", "C"] as const, "evidenceGrade");
      for (const [field, text] of [
        ["reason", payload.reason],
        ["alternativeExplanation", payload.alternativeExplanation],
        ["userFeedback", payload.userFeedback],
        ["reviewerId", payload.reviewerId],
      ]) {
        assertNonEmpty(text, field);
      }
      const cycle = activeCycle(draft);
      assertUniqueId(
        cycle.verifications.map((item) => item.verificationId),
        payload.verificationId,
        "verificationId",
      );
      const reading = latestBlindReading(cycle);
      if (!reading.items.some((item) => item.itemId === payload.itemId)) {
        throw new WorkflowError("NOT_FOUND", "盲断条目不存在。");
      }
      if (payload.result !== "unknown" && payload.lifeEventId === null) {
        throw new WorkflowError(
          "INVALID_COMMAND",
          "match / partial / conflict 必须引用一条 LifeEvent；没有事实时只能记 unknown。",
        );
      }
      if (payload.lifeEventId !== null) {
        const event = cycle.lifeEvents.find((candidate) => candidate.eventId === payload.lifeEventId);
        if (!event) throw new WorkflowError("NOT_FOUND", "核验引用的 LifeEvent 不存在。");
      }
      const retrospective =
        draft.caseMode === "retrospective" || reading.prospectiveEligibility.status !== "eligible";
      mutableArray(cycle.verifications).push({
        ...payload,
        blindReadingId: reading.blindReadingId,
        retrospective,
        scoringEligibility: retrospective ? "not_counted" : "countable",
      });
    },
  );
}

export function completeVerification(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    completedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "complete_verification",
    payload,
    payload.completedAt,
    (draft) => {
      assertState(draft, "verification_in_progress");
      assertTimestamp(payload.completedAt, "completedAt");
      const cycle = activeCycle(draft);
      const reading = latestBlindReading(cycle);
      const covered = new Set(
        cycle.verifications
          .filter((verification) => verification.blindReadingId === reading.blindReadingId)
          .map((verification) => verification.itemId),
      );
      const missing = reading.items
        .map((item) => item.itemId)
        .filter((itemId) => !covered.has(itemId));
      if (missing.length > 0) {
        throw new WorkflowError(
          "EVIDENCE_INSUFFICIENT",
          "完成核验前，每个盲断条目至少要有一条结果，可以是 unknown。",
          { missing },
        );
      }
      setState(draft, "verification_completed");
    },
  );
}

export function prepareConsultation(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    preparedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "prepare_consultation",
    payload,
    payload.preparedAt,
    (draft) => {
      assertState(draft, "verification_completed");
      assertTimestamp(payload.preparedAt, "preparedAt");
      setState(draft, "consultation_ready");
    },
  );
}

export function startConsultation(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    consultationId: string;
    taskType: string;
    objective: string;
    startedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(snapshot, meta, "start_consultation", payload, payload.startedAt, (draft) => {
    assertState(draft, "consultation_ready");
    assertTimestamp(payload.startedAt, "startedAt");
    assertNonEmpty(payload.consultationId, "consultationId");
    assertNonEmpty(payload.taskType, "taskType");
    assertNonEmpty(payload.objective, "objective");
    const cycle = activeCycle(draft);
    if (cycle.consultation) {
      throw new WorkflowError("INVALID_STATE", "当前周期已有会诊任务。");
    }
    (cycle as { consultation: NonNullable<ChartCycle["consultation"]> }).consultation = {
      consultationId: payload.consultationId,
      taskType: payload.taskType,
      objective: payload.objective,
      status: "in_progress",
      startedAt: payload.startedAt,
      resumeCount: 0,
    };
    setState(draft, "consultation_in_progress");
  });
}

export function pauseConsultation(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    consultationId: string;
    pausedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(snapshot, meta, "pause_consultation", payload, payload.pausedAt, (draft) => {
    assertState(draft, "consultation_in_progress");
    assertTimestamp(payload.pausedAt, "pausedAt");
    const consultation = activeCycle(draft).consultation;
    if (!consultation || consultation.consultationId !== payload.consultationId) {
      throw new WorkflowError("NOT_FOUND", "会诊任务不存在。");
    }
    (consultation as { status: "paused" }).status = "paused";
    (consultation as { pausedAt: string }).pausedAt = payload.pausedAt;
    setState(draft, "consultation_paused");
  });
}

export function resumeConsultation(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    consultationId: string;
    resumedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(snapshot, meta, "resume_consultation", payload, payload.resumedAt, (draft) => {
    assertState(draft, "consultation_paused");
    assertTimestamp(payload.resumedAt, "resumedAt");
    const consultation = activeCycle(draft).consultation;
    if (!consultation || consultation.consultationId !== payload.consultationId) {
      throw new WorkflowError("NOT_FOUND", "会诊任务不存在。");
    }
    (consultation as { status: "in_progress" }).status = "in_progress";
    (consultation as { resumedAt: string }).resumedAt = payload.resumedAt;
    (consultation as { resumeCount: number }).resumeCount += 1;
    setState(draft, "consultation_in_progress");
  });
}

export function completeConsultation(
  snapshot: CaseWorkflowSnapshot,
  command: WithMeta<{
    consultationId: string;
    completedAt: string;
  }>,
): CaseWorkflowSnapshot {
  const [meta, payload] = splitMeta(command);
  return executeCommand(
    snapshot,
    meta,
    "complete_consultation",
    payload,
    payload.completedAt,
    (draft) => {
      assertState(draft, "consultation_in_progress");
      assertTimestamp(payload.completedAt, "completedAt");
      const consultation = activeCycle(draft).consultation;
      if (!consultation || consultation.consultationId !== payload.consultationId) {
        throw new WorkflowError("NOT_FOUND", "会诊任务不存在。");
      }
      (consultation as { status: "completed" }).status = "completed";
      (consultation as { completedAt: string }).completedAt = payload.completedAt;
      setState(draft, "consultation_completed");
    },
  );
}
