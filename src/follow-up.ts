import { CORRECTION_REQUEST_MARKER } from "./constants.js";
import type { ReviewGateResult } from "./types.js";

function textOrEmptyMarker(value: string): string {
  return value.trim().length > 0 ? value : "[empty]";
}

function renderNumberedList(items: string[]): string {
  if (items.length === 0) {
    return "[none]";
  }
  return items
    .map((item, index) => {
      const text = item.trim().length > 0 ? item : "[empty item]";
      return `${index + 1}. ${text}`;
    })
    .join("\n");
}

export function buildCorrectionFollowUp(result: ReviewGateResult): string {
  return `${CORRECTION_REQUEST_MARKER}
# Mandatory Review Corrections
The previous delivery was not approved by the review gate.
## Review Summary
${textOrEmptyMarker(result.summary)}
## Severity
${result.severity}
## Required Corrections
${renderNumberedList(result.requiredCorrections)}
## Recommended Corrections
${renderNumberedList(result.recommendedCorrections)}
## Evidence
${renderNumberedList(result.evidence)}
## Instructions
You must correct the delivery according to the required corrections above.
Do not ignore this message.
Do not treat this as a new unrelated user request.
Keep the scope limited to the corrections required by the review.
After applying corrections, provide a concise summary of what changed and which validations were run.`;
}
