export type ReviewGateMode = "warn" | "block";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ReviewerModelConfig = {
  provider: string;
  id: string;
  thinkingLevel?: ThinkingLevel;
};

export type ReviewContextStrategy = "current_run" | "since_last_user";

export type ReviewContextConfig = {
  strategy: ReviewContextStrategy;
  includeEventMessages: boolean;
  includeSessionSlice: boolean;
  maxSessionEntries: number;
};

export type GitContextConfig = {
  enabled: boolean;
  includeStatus: boolean;
  includeDiffStat: boolean;
  includeDiff: boolean;
  maxDiffChars: number;
  maxStatusChars: number;
  maxDiffStatChars: number;
};

export type ReviewerRuntimeConfig = {
  requireJson: boolean;
  failClosedOnInvalidJson: boolean;
  timeoutMs: number;
};

export type ReviewGateUiConfig = {
  notifyOnPass: boolean;
  notifyOnFail: boolean;
  showReviewerSummary: boolean;
};

export type ReviewGateConfig = {
  enabled: boolean;
  mode: ReviewGateMode;
  reviewerModel: ReviewerModelConfig | null;
  maxCorrectionCycles: number;
  context: ReviewContextConfig;
  git: GitContextConfig;
  reviewer: ReviewerRuntimeConfig;
  ui: ReviewGateUiConfig;
};

export type ReviewSeverity = "pass" | "minor" | "major" | "blocking";

export type ReviewConfidence = "low" | "medium" | "high";

export type ReviewGateResult = {
  approved: boolean;
  severity: ReviewSeverity;
  summary: string;
  requiredCorrections: string[];
  recommendedCorrections: string[];
  evidence: string[];
  confidence: ReviewConfidence;
};

export type GitContext = {
  status: string | null;
  diffStat: string | null;
  diff: string | null;
  unavailableReason?: string;
};

export type ReviewContext = {
  currentUserPrompt: string;
  serializedEventMessages: string;
  latestAssistantResponse: string | null;
  serializedSessionSlice: string | null;
  gitStatus: string | null;
  gitDiffStat: string | null;
  gitDiff: string | null;
  gitUnavailableReason?: string;
};

export type RuntimeState = {
  activeReview: boolean;
  correctionCycle: number;
  lastOriginalUserPromptHash: string | null;
  lastReviewResult: ReviewGateResult | null;
};
