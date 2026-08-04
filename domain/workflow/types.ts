import type {
  ChartVariant,
  DeterministicChartResult,
  RuleReference as ChartRuleReference,
} from "../chart/index.ts";

export type CaseMode = "prospective" | "retrospective";

export type WorkflowState =
  | "draft_chart"
  | "chart_review_required"
  | "chart_disambiguation_required"
  | "chart_confirmed"
  | "blind_reading_generating"
  | "blind_reading_failed"
  | "blind_reading_locked"
  | "archive_collecting"
  | "verification_in_progress"
  | "verification_completed"
  | "consultation_ready"
  | "consultation_in_progress"
  | "consultation_paused"
  | "consultation_completed";

export type VerificationResult = "match" | "partial" | "conflict" | "unknown";
export type EvidenceGrade = "A" | "B" | "C";
export type ReviewBasis = "source_evidence" | "calendar_review" | "boundary_review";
export type ChartResolutionMode =
  | "engine_confirmed"
  | "operator_confirmed_without_life_events"
  | "fact_assisted_chart_resolution";

export interface CommandMeta {
  expectedRevision: number;
  idempotencyKey: string;
}

export interface CommandReceipt {
  idempotencyKey: string;
  commandType: string;
  payloadDigest: string;
  resultingRevision: number;
}

export interface ProspectiveEligibility {
  status: "pending_lock" | "eligible" | "not_eligible";
  reasons: ReadonlyArray<string>;
}

export interface WorkflowRuleReference {
  id: string;
  status: "formal" | "candidate" | "risk_symbol";
  sourcePath: string;
}

export interface ChartReview {
  reviewerId: string;
  basis: ReviewBasis;
  reason: string;
  reviewedAt: string;
}

export interface CandidateQuestion {
  questionId: string;
  targetVariantSignature: string;
  differenceFields: ReadonlyArray<string>;
  prompt: string;
  timeRange: string;
  observableDomain: string;
  supports: string;
  refutes: string;
  alternativeExplanation: string;
  ruleReferences: ReadonlyArray<WorkflowRuleReference>;
}

export interface CandidateQuestionSet {
  questionSetId: string;
  version: number;
  questions: ReadonlyArray<CandidateQuestion>;
  lockedAt: string;
  contentDigest: string;
}

export interface CandidateVerification {
  verificationId: string;
  questionSetId: string;
  questionId: string;
  targetVariantSignature: string;
  result: VerificationResult;
  evidenceGrade: EvidenceGrade;
  userStatement: string;
  backgroundVariables: ReadonlyArray<string>;
  reviewerId: string;
  recordedAt: string;
}

export interface CandidateResolution {
  selectedVariantSignature: string;
  mode: "fact_assisted_chart_resolution";
  supportingVerificationIds: ReadonlyArray<string>;
  conflictingVerificationIds: ReadonlyArray<string>;
  reviewerId: string;
  reason: string;
  resolvedAt: string;
}

export interface BlindGenerationContext {
  schemaVersion: "blind-context.v0";
  workflowId: string;
  cycleId: string;
  chartId: string;
  chartSchemaVersion: "chart.v0";
  engine: DeterministicChartResult["engine"];
  selectedVariant: ChartVariant;
  ruleReferences: ReadonlyArray<ChartRuleReference>;
  prospectiveEligibility: ProspectiveEligibility;
}

export interface BlindReadingItem {
  itemId: string;
  statement: string;
  domain: string;
  timeRange: string;
  confidence: "low" | "medium" | "high";
  supportingChartFields: ReadonlyArray<string>;
  ruleReferences: ReadonlyArray<WorkflowRuleReference>;
  refutationCondition: string;
  alternativeExplanation: string;
}

export interface BlindGenerationAttempt {
  generationId: string;
  attempt: number;
  contextDigest: string;
  status: "running" | "failed" | "locked";
  startedAt: string;
  finishedAt?: string;
  errorCode?: string;
}

export interface BlindReadingVersion {
  blindReadingId: string;
  version: number;
  generationId: string;
  chartId: string;
  items: ReadonlyArray<BlindReadingItem>;
  modelVersion: string;
  promptVersion: string;
  contextDigest: string;
  contentDigest: string;
  createdAt: string;
  lockedAt: string;
  prospectiveEligibility: ProspectiveEligibility;
}

export interface LifeEventVersion {
  version: number;
  occurredFrom?: string;
  occurredThrough?: string;
  domain: string;
  summary: string;
  userWords: string;
  certainty: "confirmed" | "approximate" | "unknown";
  sensitivity: "ordinary" | "sensitive" | "highly_sensitive";
  backgroundVariables: ReadonlyArray<string>;
  createdAt: string;
}

export interface LifeEventRecord {
  eventId: string;
  versions: ReadonlyArray<LifeEventVersion>;
  tombstone?: {
    reason: string;
    deletedAt: string;
  };
}

export interface BlindVerification {
  verificationId: string;
  blindReadingId: string;
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
  retrospective: boolean;
  scoringEligibility: "countable" | "not_counted";
}

export interface ConsultationSession {
  consultationId: string;
  taskType: string;
  objective: string;
  status: "in_progress" | "paused" | "completed";
  startedAt: string;
  pausedAt?: string;
  resumedAt?: string;
  completedAt?: string;
  resumeCount: number;
}

export interface ChartCycle {
  cycleId: string;
  chartId: string;
  chart: DeterministicChartResult;
  phase: WorkflowState;
  resolutionMode: ChartResolutionMode | null;
  resolvedVariantSignature: string | null;
  chartReview: ChartReview | null;
  candidateQuestionSets: ReadonlyArray<CandidateQuestionSet>;
  candidateVerifications: ReadonlyArray<CandidateVerification>;
  candidateResolution: CandidateResolution | null;
  blindGenerationAttempts: ReadonlyArray<BlindGenerationAttempt>;
  blindReadings: ReadonlyArray<BlindReadingVersion>;
  lifeEvents: ReadonlyArray<LifeEventRecord>;
  verifications: ReadonlyArray<BlindVerification>;
  consultation: ConsultationSession | null;
  createdAt: string;
  invalidatedAt?: string;
  invalidationReason?: string;
}

export interface CaseWorkflowSnapshot {
  schemaVersion: "case-workflow.v0";
  workflowId: string;
  caseMode: CaseMode;
  state: WorkflowState;
  revision: number;
  activeCycleId: string | null;
  cycles: ReadonlyArray<ChartCycle>;
  prospectiveEligibility: ProspectiveEligibility;
  commandReceipts: ReadonlyArray<CommandReceipt>;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowErrorCode =
  | "INVALID_COMMAND"
  | "INVALID_STATE"
  | "STALE_REVISION"
  | "IDEMPOTENCY_KEY_REUSED"
  | "CHART_CONTRACT_VIOLATION"
  | "MANUAL_REVIEW_REQUIRED"
  | "QUESTION_SET_INVALID"
  | "QUESTION_SET_LOCKED"
  | "EVIDENCE_INSUFFICIENT"
  | "CONTEXT_ISOLATION_VIOLATION"
  | "LOCKED_CONTENT_IMMUTABLE"
  | "NOT_FOUND";

export class WorkflowError extends Error {
  public readonly code: WorkflowErrorCode;
  public readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: WorkflowErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
    this.details = details;
  }
}
