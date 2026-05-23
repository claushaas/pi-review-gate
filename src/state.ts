import { CORRECTION_REQUEST_MARKER } from "./constants.js";
import type { RuntimeState } from "./types.js";

export function createRuntimeState(): RuntimeState {
  return {
    activeReview: false,
    correctionCycle: 0,
    lastOriginalUserPromptHash: null,
    lastReviewResult: null,
  };
}

export function isReviewGateInjectedText(text: string | null | undefined): boolean {
  return text?.includes(CORRECTION_REQUEST_MARKER) ?? false;
}
