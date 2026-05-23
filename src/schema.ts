import type {
  GitContextConfig,
  ReviewContextConfig,
  ReviewerModelConfig,
  ReviewerRuntimeConfig,
  ReviewGateConfig,
  ReviewGateResult,
  ReviewGateUiConfig,
} from "./types.js";

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${path}: expected boolean.`);
  }
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${path}: expected non-empty string.`);
  }
}

function assertStringArray(value: unknown, path: string): asserts value is string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${path}: expected string array.`);
  }
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "string" || (value[i] as string).trim().length === 0) {
      throw new Error(`Invalid ${path}: expected string array.`);
    }
  }
}

function assertNonNegativeInteger(value: unknown, path: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new Error(`Invalid ${path}: expected non-negative integer.`);
  }
}

function assertPositiveInteger(value: unknown, path: string): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new Error(`Invalid ${path}: expected positive integer.`);
  }
}

function assertStringUnion<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): asserts value is T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    const quoted = allowed.map((v) => `"${v}"`).join(" or ");
    throw new Error(`Invalid ${path}: expected ${quoted}.`);
  }
}

// ---------------------------------------------------------------------------
// Sub-validators
// ---------------------------------------------------------------------------

function validateReviewerModel(value: unknown, path: string): ReviewerModelConfig {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${path}: expected object.`);
  }
  assertNonEmptyString(value.provider, `${path}.provider`);
  assertNonEmptyString(value.id, `${path}.id`);
  if (value.thinkingLevel !== undefined) {
    assertStringUnion(
      value.thinkingLevel,
      ["off", "minimal", "low", "medium", "high", "xhigh"],
      `${path}.thinkingLevel`,
    );
  }
  return value as ReviewerModelConfig;
}

function validateContext(value: unknown, path: string): ReviewContextConfig {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${path}: expected object.`);
  }
  assertStringUnion(value.strategy, ["current_run", "since_last_user"], `${path}.strategy`);
  assertBoolean(value.includeEventMessages, `${path}.includeEventMessages`);
  assertBoolean(value.includeSessionSlice, `${path}.includeSessionSlice`);
  assertNonNegativeInteger(value.maxSessionEntries, `${path}.maxSessionEntries`);
  return value as ReviewContextConfig;
}

function validateGit(value: unknown, path: string): GitContextConfig {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${path}: expected object.`);
  }
  assertBoolean(value.enabled, `${path}.enabled`);
  assertBoolean(value.includeStatus, `${path}.includeStatus`);
  assertBoolean(value.includeDiffStat, `${path}.includeDiffStat`);
  assertBoolean(value.includeDiff, `${path}.includeDiff`);
  assertNonNegativeInteger(value.maxDiffChars, `${path}.maxDiffChars`);
  assertNonNegativeInteger(value.maxStatusChars, `${path}.maxStatusChars`);
  assertNonNegativeInteger(value.maxDiffStatChars, `${path}.maxDiffStatChars`);
  return value as GitContextConfig;
}

function validateReviewer(value: unknown, path: string): ReviewerRuntimeConfig {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${path}: expected object.`);
  }
  assertBoolean(value.requireJson, `${path}.requireJson`);
  assertBoolean(value.failClosedOnInvalidJson, `${path}.failClosedOnInvalidJson`);
  assertPositiveInteger(value.timeoutMs, `${path}.timeoutMs`);
  return value as ReviewerRuntimeConfig;
}

function validateUi(value: unknown, path: string): ReviewGateUiConfig {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${path}: expected object.`);
  }
  assertBoolean(value.notifyOnPass, `${path}.notifyOnPass`);
  assertBoolean(value.notifyOnFail, `${path}.notifyOnFail`);
  assertBoolean(value.showReviewerSummary, `${path}.showReviewerSummary`);
  return value as ReviewGateUiConfig;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates a review gate result object and returns it typed as
 * `ReviewGateResult`. Throws if any field is missing or invalid.
 *
 * This function validates structure only — it does not parse JSON,
 * extract JSON from textual responses, or interact with the model.
 */
export function parseReviewGateResult(value: unknown): ReviewGateResult {
  if (!isRecord(value) || Array.isArray(value)) {
    throw new Error("Invalid review result: expected object.");
  }

  assertBoolean(value.approved, "reviewResult.approved");
  assertStringUnion(
    value.severity,
    ["pass", "minor", "major", "blocking"],
    "reviewResult.severity",
  );
  assertNonEmptyString(value.summary, "reviewResult.summary");
  assertStringArray(value.requiredCorrections, "reviewResult.requiredCorrections");
  assertStringArray(value.recommendedCorrections, "reviewResult.recommendedCorrections");
  assertStringArray(value.evidence, "reviewResult.evidence");
  assertStringUnion(value.confidence, ["low", "medium", "high"], "reviewResult.confidence");

  if (!value.approved && (value.requiredCorrections as string[]).length === 0) {
    throw new Error(
      "Invalid reviewResult.requiredCorrections: expected at least one item when approved is false.",
    );
  }

  return value as ReviewGateResult;
}

/**
 * Validates a merged configuration object and returns it typed as
 * `ReviewGateConfig`. Throws if any field is missing or invalid.
 */
export function validateConfig(value: unknown): ReviewGateConfig {
  if (!isRecord(value)) {
    throw new Error("Invalid config: expected object.");
  }

  assertBoolean(value.enabled, "config.enabled");
  assertStringUnion(value.mode, ["warn", "block"], "config.mode");

  if (value.reviewerModel !== null) {
    validateReviewerModel(value.reviewerModel, "config.reviewerModel");
  }

  assertNonNegativeInteger(value.maxCorrectionCycles, "config.maxCorrectionCycles");

  validateContext(value.context, "config.context");
  validateGit(value.git, "config.git");
  validateReviewer(value.reviewer, "config.reviewer");
  validateUi(value.ui, "config.ui");

  return value as ReviewGateConfig;
}
