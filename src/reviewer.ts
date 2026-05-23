import type { ReviewContext } from "./types.js";

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
