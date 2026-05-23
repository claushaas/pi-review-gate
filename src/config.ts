import {
  DEFAULT_MAX_CORRECTION_CYCLES,
  DEFAULT_MAX_DIFF_CHARS,
  DEFAULT_MAX_DIFF_STAT_CHARS,
  DEFAULT_MAX_SESSION_ENTRIES,
  DEFAULT_MAX_STATUS_CHARS,
  DEFAULT_REVIEWER_TIMEOUT_MS,
} from "./constants.js";
import type { ReviewGateConfig } from "./types.js";

export const defaultConfig: ReviewGateConfig = {
  enabled: true,
  mode: "block",
  reviewerModel: null,
  maxCorrectionCycles: DEFAULT_MAX_CORRECTION_CYCLES,
  context: {
    strategy: "current_run",
    includeEventMessages: true,
    includeSessionSlice: true,
    maxSessionEntries: DEFAULT_MAX_SESSION_ENTRIES,
  },
  git: {
    enabled: true,
    includeStatus: true,
    includeDiffStat: true,
    includeDiff: true,
    maxDiffChars: DEFAULT_MAX_DIFF_CHARS,
    maxStatusChars: DEFAULT_MAX_STATUS_CHARS,
    maxDiffStatChars: DEFAULT_MAX_DIFF_STAT_CHARS,
  },
  reviewer: {
    requireJson: true,
    failClosedOnInvalidJson: true,
    timeoutMs: DEFAULT_REVIEWER_TIMEOUT_MS,
  },
  ui: {
    notifyOnPass: true,
    notifyOnFail: true,
    showReviewerSummary: true,
  },
};
