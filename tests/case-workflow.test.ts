import assert from "node:assert/strict";
import test from "node:test";

import { calculateDeterministicChart, type ChartInput } from "../domain/chart/index.ts";
import {
  addLifeEvent,
  attachChart,
  buildBlindGenerationContext,
  completeConsultation,
  completeVerification,
  confirmProvisionalChart,
  createCaseWorkflow,
  failBlindReadingGeneration,
  lockBlindReading,
  lockCandidateQuestionSet,
  pauseConsultation,
  prepareConsultation,
  recordBlindVerification,
  recordCandidateVerification,
  replaceChart,
  resolveCandidateWithFacts,
  resumeConsultation,
  reviseLifeEvent,
  startBlindReadingGeneration,
  startConsultation,
  startVerification,
  tombstoneLifeEvent,
  WorkflowError,
  type BlindReadingItem,
  type CandidateQuestion,
  type CaseWorkflowSnapshot,
} from "../domain/workflow/index.ts";

const TIME = {
  created: "2026-08-04T08:00:00+08:00",
  chart: "2026-08-04T08:01:00+08:00",
  review: "2026-08-04T08:02:00+08:00",
  questions: "2026-08-04T08:03:00+08:00",
  candidateFacts: "2026-08-04T08:04:00+08:00",
  resolved: "2026-08-04T08:05:00+08:00",
  generate: "2026-08-04T08:06:00+08:00",
  lock: "2026-08-04T08:07:00+08:00",
  event: "2026-08-04T08:08:00+08:00",
  verify: "2026-08-04T08:09:00+08:00",
  complete: "2026-08-04T08:10:00+08:00",
  consultation: "2026-08-04T08:11:00+08:00",
};

function chartInput(
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

function confirmedChart() {
  return calculateDeterministicChart(
    chartInput({ year: 1983, month: 2, day: 15 }, { hour: 20, minute: 0, second: 0 }),
  );
}

function provisionalChart() {
  return calculateDeterministicChart(
    chartInput({ year: 2005, month: 12, day: 23 }, { hour: 8, minute: 37, second: 0 }),
  );
}

function multiChart(hours = 0) {
  const earliestHour = hours === 0 ? 22 : 0;
  const latestHour = hours === 0 ? 23 : 23;
  return calculateDeterministicChart(
    chartInput(
      { year: 1988, month: 2, day: 15 },
      { hour: hours === 0 ? 23 : 12, minute: 0, second: 0 },
      {
        source: { timeSource: "S1", timePrecision: "P1", calendarConfirmed: true },
        uncertainty: {
          earliest: {
            year: 1988,
            month: 2,
            day: 15,
            hour: earliestHour,
            minute: hours === 0 ? 50 : 0,
            second: 0,
          },
          latest: {
            year: 1988,
            month: 2,
            day: 15,
            hour: latestHour,
            minute: hours === 0 ? 10 : 59,
            second: 0,
          },
        },
      },
    ),
  );
}

function attach(
  chart = confirmedChart(),
  caseMode: "prospective" | "retrospective" = "prospective",
): CaseWorkflowSnapshot {
  const created = createCaseWorkflow({ workflowId: "WF-SYNTH-001", caseMode, createdAt: TIME.created });
  return attachChart(created, {
    expectedRevision: created.revision,
    idempotencyKey: "attach-1",
    cycleId: "CYCLE-001",
    chartId: "CHART-001",
    chart,
    attachedAt: TIME.chart,
  });
}

const RULE = {
  id: "ZP001",
  status: "formal" as const,
  sourcePath: "人生命格/outputs/读书工程/04_判断规则库/格局派/ZP001_用神专求月令.md",
};

function blindItem(itemId = "BRI-001"): BlindReadingItem {
  return {
    itemId,
    statement: "合成判断：在指定时间窗内某结构张力可能进入可观察领域。",
    domain: "synthetic-domain",
    timeRange: "synthetic-window",
    confidence: "medium",
    supportingChartFields: ["month-pillar", "day-pillar"],
    ruleReferences: [RULE],
    refutationCondition: "该时间窗内无对应事实且记录充分。",
    alternativeExplanation: "现实环境、教育路径或主动选择可能更直接。",
  };
}

function generateAndLock(
  input: CaseWorkflowSnapshot,
  items: ReadonlyArray<BlindReadingItem> = [blindItem()],
): CaseWorkflowSnapshot {
  const generating = startBlindReadingGeneration(input, {
    expectedRevision: input.revision,
    idempotencyKey: `generate-${input.revision}`,
    generationId: `GEN-${input.revision}`,
    startedAt: TIME.generate,
  });
  return lockBlindReading(generating, {
    expectedRevision: generating.revision,
    idempotencyKey: `lock-${generating.revision}`,
    blindReadingId: `BR-${generating.revision}`,
    generationId: `GEN-${input.revision}`,
    items,
    modelVersion: "synthetic-model-v1",
    promptVersion: "blind-prompt-v1",
    createdAt: TIME.generate,
    lockedAt: TIME.lock,
  });
}

function candidateQuestion(
  questionId: string,
  signature: string,
): CandidateQuestion {
  return {
    questionId,
    targetVariantSignature: signature,
    differenceFields: ["hour-pillar"],
    prompt: `${questionId} 的合成互斥问题，允许无变化或未知。`,
    timeRange: "synthetic-window",
    observableDomain: "synthetic-domain",
    supports: "出现可核对的指定事实。",
    refutes: "记录充分且明确没有该事实。",
    alternativeExplanation: "环境或主动选择。",
    ruleReferences: [{ id: "MPJ009", status: "candidate", sourcePath: "synthetic-source" }],
  };
}

function lockCandidateQuestions(input: CaseWorkflowSnapshot): CaseWorkflowSnapshot {
  const signatures = input.cycles[0].chart.variants.map((variant) => variant.signature);
  return lockCandidateQuestionSet(input, {
    expectedRevision: input.revision,
    idempotencyKey: "questions-1",
    questionSetId: "QS-001",
    questions: [
      candidateQuestion("Q-1", signatures[0]),
      candidateQuestion("Q-2", signatures[0]),
      candidateQuestion("Q-3", signatures[1]),
      candidateQuestion("Q-4", signatures[1]),
    ],
    lockedAt: TIME.questions,
  });
}

function candidateFact(
  input: CaseWorkflowSnapshot,
  verificationId: string,
  questionId: string,
  result: "match" | "conflict" | "unknown",
  evidenceGrade: "A" | "B" = "A",
): CaseWorkflowSnapshot {
  return recordCandidateVerification(input, {
    expectedRevision: input.revision,
    idempotencyKey: `candidate-${verificationId}`,
    verificationId,
    questionSetId: "QS-001",
    questionId,
    result,
    evidenceGrade,
    userStatement: `SECRET-CANDIDATE-FACT-${verificationId}`,
    backgroundVariables: ["synthetic-background"],
    reviewerId: "OPERATOR-001",
    recordedAt: TIME.candidateFacts,
  });
}

test("confirmed_single 直接进入 chart_confirmed，盲断上下文只含命盘子集", () => {
  const workflow = attach();
  assert.equal(workflow.state, "chart_confirmed");
  const context = buildBlindGenerationContext(workflow);
  assert.equal(context.selectedVariant.signature, confirmedChart().selectedVariant?.signature);
  assert.equal("normalizedInput" in context, false);
  assert.equal("lifeEvents" in context, false);
  assert.equal("candidateVerifications" in context, false);
});

test("provisional_single 必须先做非人生事实的人工复核", () => {
  const workflow = attach(provisionalChart());
  assert.equal(workflow.state, "chart_review_required");
  assert.throws(
    () =>
      startBlindReadingGeneration(workflow, {
        expectedRevision: workflow.revision,
        idempotencyKey: "illegal-generation",
        generationId: "GEN-X",
        startedAt: TIME.generate,
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "INVALID_STATE",
  );
  const reviewed = confirmProvisionalChart(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "review-1",
    reviewerId: "OPERATOR-001",
    basis: "boundary_review",
    reason: "已复核钟表来源和边界距离，不使用人生事实。",
    reviewedAt: TIME.review,
  });
  assert.equal(reviewed.state, "chart_confirmed");
  assert.equal(reviewed.cycles[0].resolutionMode, "operator_confirmed_without_life_events");
});

test("命令重试幂等，旧修订号和幂等键换载荷均被拒绝", () => {
  const initial = createCaseWorkflow({
    workflowId: "WF-IDEMPOTENT",
    caseMode: "prospective",
    createdAt: TIME.created,
  });
  const command = {
    expectedRevision: 0,
    idempotencyKey: "attach-idempotent",
    cycleId: "CYCLE-001",
    chartId: "CHART-001",
    chart: confirmedChart(),
    attachedAt: TIME.chart,
  };
  const once = attachChart(initial, command);
  assert.equal(attachChart(once, command), once);
  assert.throws(
    () =>
      attachChart(initial, {
        ...command,
        idempotencyKey: "stale-new-key",
        expectedRevision: 99,
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "STALE_REVISION",
  );
  assert.throws(
    () => replaceChart(once, { ...command, reason: "different", replacedAt: TIME.review }),
    (error: unknown) => error instanceof WorkflowError && error.code === "IDEMPOTENCY_KEY_REUSED",
  );
});

test("multi_candidate 必须锁定问题并达到支持+竞争冲突门槛", () => {
  let workflow = lockCandidateQuestions(attach(multiChart()));
  workflow = candidateFact(workflow, "CV-1", "Q-1", "match", "A");
  workflow = candidateFact(workflow, "CV-2", "Q-2", "match", "B");
  workflow = candidateFact(workflow, "CV-3", "Q-3", "conflict", "A");
  const signatures = workflow.cycles[0].chart.variants.map((variant) => variant.signature);
  const resolved = resolveCandidateWithFacts(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "resolve-1",
    selectedVariantSignature: signatures[0],
    supportingVerificationIds: ["CV-1", "CV-2"],
    conflictingVerificationIds: ["CV-3"],
    reviewerId: "OPERATOR-001",
    reason: "两条独立支持且竞争候选出现明确冲突。",
    resolvedAt: TIME.resolved,
  });
  assert.equal(resolved.state, "chart_confirmed");
  assert.equal(resolved.cycles[0].resolutionMode, "fact_assisted_chart_resolution");
  assert.deepEqual(resolved.prospectiveEligibility, {
    status: "not_eligible",
    reasons: ["fact_assisted_chart_resolution"],
  });
  assert.equal(resolved.cycles[0].chart.selectedVariant, null);
  assert.equal(buildBlindGenerationContext(resolved).selectedVariant.signature, signatures[0]);
});

test("候选证据不足时不得为了交付感强行选盘", () => {
  let workflow = lockCandidateQuestions(attach(multiChart()));
  workflow = candidateFact(workflow, "CV-1", "Q-1", "match", "A");
  const signature = workflow.cycles[0].chart.variants[0].signature;
  assert.throws(
    () =>
      resolveCandidateWithFacts(workflow, {
        expectedRevision: workflow.revision,
        idempotencyKey: "resolve-insufficient",
        selectedVariantSignature: signature,
        supportingVerificationIds: ["CV-1"],
        conflictingVerificationIds: [],
        reviewerId: "OPERATOR-001",
        reason: "insufficient",
        resolvedAt: TIME.resolved,
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "EVIDENCE_INSUFFICIENT",
  );
});

test("候选超过三个时转人工补来源，不生成长问卷", () => {
  const workflow = attach(multiChart(24));
  assert.ok(workflow.cycles[0].chart.variants.length > 3);
  assert.throws(
    () =>
      lockCandidateQuestionSet(workflow, {
        expectedRevision: workflow.revision,
        idempotencyKey: "too-many-variants",
        questionSetId: "QS-X",
        questions: [],
        lockedAt: TIME.questions,
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "MANUAL_REVIEW_REQUIRED",
  );
});

test("LifeEvent 在盲断锁定前不得进入", () => {
  const workflow = attach();
  assert.throws(
    () =>
      addLifeEvent(workflow, {
        expectedRevision: workflow.revision,
        idempotencyKey: "early-event",
        eventId: "EVENT-001",
        event: {
          domain: "synthetic-domain",
          summary: "SECRET-EARLY-EVENT",
          userWords: "SECRET-EARLY-EVENT",
          certainty: "confirmed",
          sensitivity: "ordinary",
          backgroundVariables: [],
          createdAt: TIME.event,
        },
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "INVALID_STATE",
  );
});

test("盲断生成失败可重试，不会产生半锁定正文", () => {
  const workflow = attach();
  const generating = startBlindReadingGeneration(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "generate-fail",
    generationId: "GEN-FAIL",
    startedAt: TIME.generate,
  });
  const failed = failBlindReadingGeneration(generating, {
    expectedRevision: generating.revision,
    idempotencyKey: "fail-1",
    generationId: "GEN-FAIL",
    errorCode: "MODEL_TIMEOUT",
    failedAt: TIME.lock,
  });
  assert.equal(failed.state, "blind_reading_failed");
  assert.equal(failed.cycles[0].blindReadings.length, 0);
  const retry = startBlindReadingGeneration(failed, {
    expectedRevision: failed.revision,
    idempotencyKey: "generate-retry",
    generationId: "GEN-RETRY",
    startedAt: TIME.event,
  });
  assert.equal(retry.state, "blind_reading_generating");
  assert.equal(retry.cycles[0].blindGenerationAttempts.length, 2);
});

test("锁定盲断必须有双条件、规则、反证和替代解释", () => {
  const workflow = attach();
  const generating = startBlindReadingGeneration(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "generate-low-quality",
    generationId: "GEN-LOW",
    startedAt: TIME.generate,
  });
  const invalid = { ...blindItem(), supportingChartFields: ["day-pillar"] };
  assert.throws(
    () =>
      lockBlindReading(generating, {
        expectedRevision: generating.revision,
        idempotencyKey: "lock-low-quality",
        blindReadingId: "BR-LOW",
        generationId: "GEN-LOW",
        items: [invalid],
        modelVersion: "synthetic-model-v1",
        promptVersion: "blind-prompt-v1",
        createdAt: TIME.generate,
        lockedAt: TIME.lock,
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "INVALID_COMMAND",
  );
});

test("干净盲断锁定后才获得前瞻资格，并且结果深冻结", () => {
  const locked = generateAndLock(attach());
  assert.deepEqual(locked.prospectiveEligibility, { status: "eligible", reasons: [] });
  assert.equal(locked.cycles[0].blindReadings[0].prospectiveEligibility.status, "eligible");
  assert.equal(Object.isFrozen(locked), true);
  assert.equal(Object.isFrozen(locked.cycles[0].blindReadings[0].items), true);
  assert.throws(() => {
    (locked.cycles[0].blindReadings[0].items[0] as { statement: string }).statement = "tampered";
  }, TypeError);
});

test("事实辅助选盘的回答永不进入盲断上下文", () => {
  let workflow = lockCandidateQuestions(attach(multiChart()));
  workflow = candidateFact(workflow, "CV-1", "Q-1", "match", "A");
  workflow = candidateFact(workflow, "CV-2", "Q-2", "match", "B");
  workflow = candidateFact(workflow, "CV-3", "Q-3", "conflict", "A");
  const signature = workflow.cycles[0].chart.variants[0].signature;
  workflow = resolveCandidateWithFacts(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "resolve-context-firewall",
    selectedVariantSignature: signature,
    supportingVerificationIds: ["CV-1", "CV-2"],
    conflictingVerificationIds: ["CV-3"],
    reviewerId: "OPERATOR-001",
    reason: "synthetic resolution",
    resolvedAt: TIME.resolved,
  });
  const serialized = JSON.stringify(buildBlindGenerationContext(workflow));
  assert.doesNotMatch(serialized, /SECRET-CANDIDATE-FACT/);
  assert.doesNotMatch(serialized, /candidateVerifications/);
  const locked = generateAndLock(workflow);
  assert.equal(locked.prospectiveEligibility.status, "not_eligible");
  assert.deepEqual(locked.prospectiveEligibility.reasons, ["fact_assisted_chart_resolution"]);
});

test("LifeEvent 修改追加版本，删除留墓碑而不覆盖历史", () => {
  let workflow = generateAndLock(attach());
  workflow = addLifeEvent(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "event-add",
    eventId: "EVENT-001",
    event: {
      occurredFrom: "2020",
      domain: "synthetic-domain",
      summary: "合成事实第一版",
      userWords: "合成用户原话第一版",
      certainty: "approximate",
      sensitivity: "ordinary",
      backgroundVariables: ["synthetic-background"],
      createdAt: TIME.event,
    },
  });
  workflow = reviseLifeEvent(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "event-revise",
    eventId: "EVENT-001",
    event: {
      occurredFrom: "2020-06",
      domain: "synthetic-domain",
      summary: "合成事实第二版",
      userWords: "合成用户原话第二版",
      certainty: "confirmed",
      sensitivity: "ordinary",
      backgroundVariables: ["synthetic-background"],
      createdAt: TIME.verify,
    },
  });
  workflow = tombstoneLifeEvent(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "event-delete",
    eventId: "EVENT-001",
    reason: "user_requested_deletion",
    deletedAt: TIME.complete,
  });
  const event = workflow.cycles[0].lifeEvents[0];
  assert.equal(event.versions.length, 2);
  assert.equal(event.versions[0].summary, "合成事实第一版");
  assert.equal(event.versions[1].summary, "合成事实第二版");
  assert.equal(event.tombstone?.reason, "user_requested_deletion");
});

test("核验必须覆盖每个盲断条目，unknown 不需伪造 LifeEvent", () => {
  let workflow = generateAndLock(attach(), [blindItem("BRI-1"), blindItem("BRI-2")]);
  workflow = startVerification(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "verify-start",
    startedAt: TIME.verify,
  });
  workflow = recordBlindVerification(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "verify-unknown",
    verificationId: "VER-1",
    itemId: "BRI-1",
    lifeEventId: null,
    result: "unknown",
    reason: "用户不记得。",
    conflict: "无法判断。",
    alternativeExplanation: "待补记录。",
    userFeedback: "不记得。",
    evidenceGrade: "C",
    reviewerId: "OPERATOR-001",
    createdAt: TIME.complete,
  });
  assert.throws(
    () =>
      completeVerification(workflow, {
        expectedRevision: workflow.revision,
        idempotencyKey: "verify-too-early",
        completedAt: TIME.consultation,
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "EVIDENCE_INSUFFICIENT",
  );
  workflow = recordBlindVerification(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "verify-unknown-2",
    verificationId: "VER-2",
    itemId: "BRI-2",
    lifeEventId: null,
    result: "unknown",
    reason: "用户不愿回答。",
    conflict: "无法判断。",
    alternativeExplanation: "保留未知。",
    userFeedback: "不愿回答。",
    evidenceGrade: "C",
    reviewerId: "OPERATOR-001",
    createdAt: TIME.complete,
  });
  workflow = completeVerification(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "verify-complete",
    completedAt: TIME.consultation,
  });
  assert.equal(workflow.state, "verification_completed");
});

test("回顾性案例的核验永不计入前瞻分数", () => {
  let workflow = generateAndLock(attach(confirmedChart(), "retrospective"));
  workflow = startVerification(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "retro-verify-start",
    startedAt: TIME.verify,
  });
  workflow = recordBlindVerification(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "retro-verify",
    verificationId: "VER-RETRO",
    itemId: "BRI-001",
    lifeEventId: null,
    result: "unknown",
    reason: "retrospective fixture",
    conflict: "unknown",
    alternativeExplanation: "unknown",
    userFeedback: "synthetic",
    evidenceGrade: "C",
    reviewerId: "OPERATOR-001",
    createdAt: TIME.complete,
  });
  assert.equal(workflow.prospectiveEligibility.status, "not_eligible");
  assert.equal(workflow.cycles[0].verifications[0].scoringEligibility, "not_counted");
});

test("修改出生信息建新周期，旧命盘和锁定盲断仍可审计", () => {
  const locked = generateAndLock(attach());
  const replaced = replaceChart(locked, {
    expectedRevision: locked.revision,
    idempotencyKey: "replace-chart",
    cycleId: "CYCLE-002",
    chartId: "CHART-002",
    chart: provisionalChart(),
    reason: "用户提供了新的出生时间记录。",
    replacedAt: TIME.consultation,
  });
  assert.equal(replaced.cycles.length, 2);
  assert.equal(replaced.cycles[0].blindReadings.length, 1);
  assert.equal(replaced.cycles[0].invalidatedAt, TIME.consultation);
  assert.equal(replaced.activeCycleId, "CYCLE-002");
  assert.equal(replaced.state, "chart_review_required");
});

test("会诊只能在核验完成后开始，中断后恢复同一任务", () => {
  let workflow = generateAndLock(attach());
  workflow = startVerification(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "consult-verify-start",
    startedAt: TIME.verify,
  });
  workflow = recordBlindVerification(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "consult-verify-unknown",
    verificationId: "VER-CONSULT",
    itemId: "BRI-001",
    lifeEventId: null,
    result: "unknown",
    reason: "synthetic unknown",
    conflict: "unknown",
    alternativeExplanation: "unknown",
    userFeedback: "synthetic",
    evidenceGrade: "C",
    reviewerId: "OPERATOR-001",
    createdAt: TIME.complete,
  });
  workflow = completeVerification(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "consult-verify-complete",
    completedAt: TIME.consultation,
  });
  workflow = prepareConsultation(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "consult-ready",
    preparedAt: "2026-08-04T08:12:00+08:00",
  });
  workflow = startConsultation(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "consult-start",
    consultationId: "CONSULT-001",
    taskType: "synthetic-task",
    objective: "合成会诊任务",
    startedAt: "2026-08-04T08:13:00+08:00",
  });
  workflow = pauseConsultation(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "consult-pause",
    consultationId: "CONSULT-001",
    pausedAt: "2026-08-04T08:14:00+08:00",
  });
  workflow = resumeConsultation(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "consult-resume",
    consultationId: "CONSULT-001",
    resumedAt: "2026-08-04T08:15:00+08:00",
  });
  workflow = completeConsultation(workflow, {
    expectedRevision: workflow.revision,
    idempotencyKey: "consult-complete",
    consultationId: "CONSULT-001",
    completedAt: "2026-08-04T08:16:00+08:00",
  });
  assert.equal(workflow.state, "consultation_completed");
  assert.equal(workflow.cycles[0].consultation?.consultationId, "CONSULT-001");
  assert.equal(workflow.cycles[0].consultation?.resumeCount, 1);
});

test("运行时拒绝类型系统之外的枚举值、小数修订号和倒序时间", () => {
  assert.throws(
    () =>
      createCaseWorkflow({
        workflowId: "WF-INVALID-MODE",
        caseMode: "legacy" as never,
        createdAt: TIME.created,
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "INVALID_COMMAND",
  );

  const initial = createCaseWorkflow({
    workflowId: "WF-RUNTIME-GUARDS",
    caseMode: "prospective",
    createdAt: TIME.created,
  });
  assert.throws(
    () =>
      attachChart(initial, {
        expectedRevision: 0.5,
        idempotencyKey: "fractional-revision",
        cycleId: "CYCLE-X",
        chartId: "CHART-X",
        chart: confirmedChart(),
        attachedAt: TIME.chart,
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "INVALID_COMMAND",
  );
  assert.throws(
    () =>
      attachChart(initial, {
        expectedRevision: initial.revision,
        idempotencyKey: "reverse-time",
        cycleId: "CYCLE-X",
        chartId: "CHART-X",
        chart: confirmedChart(),
        attachedAt: "2026-08-04T07:59:00+08:00",
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "INVALID_COMMAND",
  );
});

test("候选盘核验在运行时也只接受受控结果", () => {
  const workflow = lockCandidateQuestions(attach(multiChart()));
  assert.throws(
    () =>
      recordCandidateVerification(workflow, {
        expectedRevision: workflow.revision,
        idempotencyKey: "invalid-candidate-result",
        verificationId: "CV-INVALID",
        questionSetId: "QS-001",
        questionId: "Q-1",
        result: "yes" as never,
        evidenceGrade: "A",
        userStatement: "synthetic invalid payload",
        backgroundVariables: [],
        reviewerId: "OPERATOR-001",
        recordedAt: TIME.candidateFacts,
      }),
    (error: unknown) => error instanceof WorkflowError && error.code === "INVALID_COMMAND",
  );
});
