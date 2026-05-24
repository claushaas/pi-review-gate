export const EXTENSION_NAME = "pi-review-gate";
export const CONFIG_DIR_NAME = "pi-review-gate";
export const CONFIG_FILE_NAME = "config.json";

export const CORRECTION_REQUEST_MARKER = "[pi-review-gate:correction-request]";

export const COMMAND_REVIEW_GATE = "/review-gate";
export const COMMAND_REVIEW_GATE_STATUS = "/review-gate-status";
export const COMMAND_REVIEW_GATE_MODEL = "/review-gate-model";
export const COMMAND_REVIEW_GATE_ON = "/review-gate-on";
export const COMMAND_REVIEW_GATE_OFF = "/review-gate-off";

export const CUSTOM_ENTRY_REVIEW_RESULT = "pi-review-gate-result";
export const CUSTOM_ENTRY_REVIEW_SKIPPED = "pi-review-gate-skipped";
export const CUSTOM_ENTRY_FINAL_FAILURE = "pi-review-gate-final-failure";
export const REVIEW_ERROR_ENTRY_TYPE = "pi-review-gate-error";

export const DEFAULT_MAX_CORRECTION_CYCLES = 2;
export const DEFAULT_MAX_SESSION_ENTRIES = 40;
export const DEFAULT_MAX_DIFF_CHARS = 60_000;
export const DEFAULT_MAX_STATUS_CHARS = 12_000;
export const DEFAULT_MAX_DIFF_STAT_CHARS = 12_000;
export const DEFAULT_REVIEWER_TIMEOUT_MS = 120_000;

export const GIT_STATUS_TIMEOUT_MS = 10_000;
export const GIT_DIFF_STAT_TIMEOUT_MS = 10_000;
export const GIT_DIFF_TIMEOUT_MS = 30_000;

export const TRUNCATION_MARKER_PREFIX = "[TRUNCATED:";
