import {
  CUSTOM_ENTRY_FINAL_FAILURE,
  CUSTOM_ENTRY_REVIEW_RESULT,
  CUSTOM_ENTRY_REVIEW_SKIPPED,
} from "./constants.js";
import type { ModelClient } from "./model.js";
import { safeParseReviewGateResult } from "./schema.js";
import type {
  ReviewContext,
  ReviewerModelConfig,
  ReviewGateConfig,
  ReviewGateResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Private helpers for building context sections with stable missing-value markers
// ---------------------------------------------------------------------------

/**
 * Returns the value if non-empty, otherwise returns the given marker.
 * Used for required string fields that may be empty.
 */
function nonEmptyTextOrMarker(value: string, marker: string): string {
  return value.length > 0 ? value : marker;
}

/**
 * Returns the value if non-null and non-empty, otherwise returns the given marker.
 * Used for nullable string fields.
 */
function nullableTextOrMarker(value: string | null, nullMarker: string): string {
  if (value === null) {
    return nullMarker;
  }
  return value.length > 0 ? value : "[empty]";
}

/**
 * Returns the value if defined and non-empty, otherwise returns the given marker.
 * Used for optional string fields (string | undefined).
 */
function optionalTextOrMarker(value: string | undefined, marker: string): string {
  if (value === undefined || value.length === 0) {
    return marker;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Private context section builder
// ---------------------------------------------------------------------------

/**
 * Builds the review context section inserted inside the `<context>` block.
 *
 * Every section is included deterministically; missing values are replaced
 * with stable markers so the model never sees an empty document.
 */
function buildReviewContextSection(context: ReviewContext): string {
  return `# Review Context
## Current User Prompt
${nonEmptyTextOrMarker(context.currentUserPrompt, "[empty]")}
## Current Agent Run Messages
${nonEmptyTextOrMarker(context.serializedEventMessages, "[not included]")}
## Latest Assistant Response
${nullableTextOrMarker(context.latestAssistantResponse, "[none]")}
## Session Slice Since Latest Real User Message
${nullableTextOrMarker(context.serializedSessionSlice, "[not included]")}
## Git Status
\`\`\`txt
${nullableTextOrMarker(context.gitStatus, "[not available]")}
\`\`\`
## Git Diff Stat
\`\`\`txt
${nullableTextOrMarker(context.gitDiffStat, "[not available]")}
\`\`\`
## Git Diff
\`\`\`diff
${nullableTextOrMarker(context.gitDiff, "[not available]")}
\`\`\`
## Git Unavailable Reason
${optionalTextOrMarker(context.gitUnavailableReason, "[none]")}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Builds the deterministic system prompt for the mandatory delivery reviewer.
 *
 * The prompt defines the reviewer's role as a gate that evaluates whether the
 * coding agent's work can be considered complete.  It constrains the output to
 * JSON only and forbids markdown or explanatory prose.
 */
export function buildReviewerSystemPrompt(): string {
  return `You are the mandatory delivery reviewer for a coding agent.
Your job is to decide whether the agent's work can be considered complete.
You are not the implementation agent.
You must not propose broad rewrites unless they are required for correctness.
You must not approve incomplete work.
You must not approve work when the final response claims changes that are not supported by the provided evidence.
You must not approve work when tests or validation were required but no evidence was provided.
You must focus on the user's request, the actual delivery, the git diff, and the validation evidence.
Return JSON only.
Do not include markdown.
Do not include prose outside JSON.`;
}

/**
 * Builds the deterministic user prompt for the mandatory delivery reviewer.
 *
 * The prompt contains decision rules, the expected JSON schema, and a
 * `<context>` block populated from the supplied {@link ReviewContext}.
 * Every context section is always included; missing values are represented
 * with stable markers.
 *
 * @param context - The pre-assembled review context (no I/O performed here).
 * @returns The full user prompt string.
 */
export function buildReviewerUserPrompt(context: ReviewContext): string {
  return `Review the following delivery.
Decision rules:
- Approve only if the delivery satisfies the user's request.
- Reject if required implementation is missing.
- Reject if tests or validation are missing when they are necessary.
- Reject if the agent's final response is inconsistent with the diff.
- Reject if the implementation introduces obvious regressions.
- Reject if the work violates explicit user constraints.
- Do not reject for minor cosmetic preferences unless they affect correctness, maintainability, or contract compliance.
- If evidence is insufficient, reject and list the missing evidence.
Return JSON only with this exact shape:
{
  "approved": boolean,
  "severity": "pass" | "minor" | "major" | "blocking",
  "summary": string,
  "requiredCorrections": string[],
  "recommendedCorrections": string[],
  "evidence": string[],
  "confidence": "low" | "medium" | "high"
}
<context>
${buildReviewContextSection(context)}
</context>`;
}

// ---------------------------------------------------------------------------
// runReviewer
// ---------------------------------------------------------------------------

/**
 * Runs the mandatory delivery reviewer, transforming a {@link ReviewContext}
 * into a validated {@link ReviewGateResult}.
 *
 * The function orchestrates the full review pipeline:
 * 1. Validates that a reviewer model is configured.
 * 2. Builds system and user prompts.
 * 3. Calls the model client.
 * 4. Parses and validates the raw response.
 *
 * @throws If the reviewer model is not configured.
 * @throws If the model response is invalid JSON or does not satisfy the
 *         {@link ReviewGateResult} schema.
 *
 * @param params.config - The resolved review gate configuration.
 * @param params.reviewContext - The pre-assembled review context.
 * @param params.modelClient - The model client used to invoke the reviewer.
 * @param params.signal - Optional `AbortSignal` to cancel the request.
 * @returns A fully validated `ReviewGateResult`.
 */
// ---------------------------------------------------------------------------
// Private helper: buildInvalidReviewerResponseResult
// ---------------------------------------------------------------------------

/**
 * Builds a blocking {@link ReviewGateResult} to use when the reviewer model
 * returns a response that cannot be parsed as a valid review result.
 *
 * This result never approves the delivery — it signals that the review
 * process itself failed and must be retried.
 */
function buildInvalidReviewerResponseResult(error: string): ReviewGateResult {
  return {
    approved: false,
    severity: "blocking",
    summary: "Reviewer returned an invalid response.",
    requiredCorrections: [
      "The reviewer response could not be parsed as a valid ReviewGateResult. Re-run the review after ensuring the reviewer model returns JSON only.",
    ],
    recommendedCorrections: ["Check the reviewer model configuration and prompt compliance."],
    evidence: [`Invalid reviewer response: ${error}`],
    confidence: "high",
  };
}

// ---------------------------------------------------------------------------
// runReviewer
// ---------------------------------------------------------------------------

export async function runReviewer(params: {
  config: ReviewGateConfig;
  reviewContext: ReviewContext;
  modelClient: ModelClient;
  signal?: AbortSignal;
}): Promise<ReviewGateResult> {
  const { config, reviewContext, modelClient, signal } = params;

  if (config.reviewerModel === null) {
    throw new Error("Reviewer model is not configured.");
  }

  const systemPrompt = buildReviewerSystemPrompt();
  const userPrompt = buildReviewerUserPrompt(reviewContext);

  const rawResponse = await modelClient.complete({
    systemPrompt,
    userPrompt,
    model: config.reviewerModel,
    signal,
    timeoutMs: config.reviewer.timeoutMs,
  });

  const parsed = safeParseReviewGateResult(rawResponse);

  if (!parsed.ok) {
    if (config.reviewer.failClosedOnInvalidJson) {
      return buildInvalidReviewerResponseResult(parsed.error);
    }
    throw new Error(`Invalid reviewer response: ${parsed.error}`);
  }

  return parsed.value;
}

// ---------------------------------------------------------------------------
// persistReviewResult
// ---------------------------------------------------------------------------

type ReviewGateAppendEntryAPI = {
  appendEntry(type: string, payload: unknown): Promise<void> | void;
};

/**
 * Persists a review result as a session entry via {@link ReviewGateAppendEntryAPI.appendEntry}.
 *
 * The payload includes the full result, the model that produced it (or
 * `null`), the correction attempt number, and a timestamp.
 *
 * The caller is responsible for providing the correct attempt number and
 * model — this function does not derive them from runtime state.
 *
 * @param params.pi     - The minimal Pi API exposing `appendEntry`.
 * @param params.result - The validated review result to persist.
 * @param params.attempt - The correction cycle attempt number (1-indexed).
 * @param params.model  - The reviewer model that produced the result, or `null`.
 * @param params.timestamp - Optional ISO-8601 timestamp; defaults to `new Date().toISOString()`.
 */
export async function persistReviewResult(params: {
  pi: ReviewGateAppendEntryAPI;
  result: ReviewGateResult;
  attempt: number;
  model: ReviewerModelConfig | null;
  timestamp?: string;
}): Promise<void> {
  const { pi, result, attempt, model, timestamp } = params;
  await pi.appendEntry(CUSTOM_ENTRY_REVIEW_RESULT, {
    timestamp: timestamp ?? new Date().toISOString(),
    attempt,
    model,
    result,
  });
}

// ---------------------------------------------------------------------------
// persistReviewSkipped
// ---------------------------------------------------------------------------

/**
 * Persists a skipped review entry when no reviewer model is configured.
 *
 * The payload includes the reason for skipping, the model that would have
 * been used (or `null`), and a timestamp.
 *
 * The caller is responsible for providing the reason and model — this
 * function does not derive them from configuration or runtime state.
 *
 * @param params.pi       - The minimal Pi API exposing `appendEntry`.
 * @param params.reason   - Why the review was skipped.
 * @param params.model    - The reviewer model that was configured (or `null`).
 * @param params.timestamp - Optional ISO-8601 timestamp; defaults to `new Date().toISOString()`.
 */
export async function persistReviewSkipped(params: {
  pi: ReviewGateAppendEntryAPI;
  reason: string;
  model: ReviewerModelConfig | null;
  timestamp?: string;
}): Promise<void> {
  const { pi, reason, model, timestamp } = params;
  await pi.appendEntry(CUSTOM_ENTRY_REVIEW_SKIPPED, {
    timestamp: timestamp ?? new Date().toISOString(),
    reason,
    model,
  });
}

// ---------------------------------------------------------------------------
// persistReviewFinalFailure
// ---------------------------------------------------------------------------

/**
 * Persists a final failure entry when the maximum correction cycle limit
 * has been exceeded.
 *
 * The payload includes the last review result, the attempt that triggered
 * the failure, the configured cycle limit, the model, a human-readable
 * reason, and a timestamp.
 *
 * The caller is responsible for determining when the limit has been
 * exceeded — this function only persists the entry.
 *
 * @param params.pi                  - The minimal Pi API exposing `appendEntry`.
 * @param params.result              - The last review result (preserved as-is).
 * @param params.attempt             - The correction cycle attempt number.
 * @param params.maxCorrectionCycles - The configured maximum correction cycles.
 * @param params.model               - The reviewer model that produced the result (or `null`).
 * @param params.reason              - Why the review is considered a final failure.
 * @param params.timestamp           - Optional ISO-8601 timestamp; defaults to `new Date().toISOString()`.
 */
export async function persistReviewFinalFailure(params: {
  pi: ReviewGateAppendEntryAPI;
  result: ReviewGateResult;
  attempt: number;
  maxCorrectionCycles: number;
  model: ReviewerModelConfig | null;
  reason: string;
  timestamp?: string;
}): Promise<void> {
  const { pi, result, attempt, maxCorrectionCycles, model, reason, timestamp } = params;
  await pi.appendEntry(CUSTOM_ENTRY_FINAL_FAILURE, {
    timestamp: timestamp ?? new Date().toISOString(),
    attempt,
    maxCorrectionCycles,
    model,
    reason,
    result,
  });
}
