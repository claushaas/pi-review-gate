import type { RuntimeState } from "./types.js";

export function createRuntimeState(): RuntimeState {
  return {
    activeReview: false,
    correctionCycle: 0,
    lastOriginalUserPromptHash: null,
    lastReviewResult: null,
  };
}
