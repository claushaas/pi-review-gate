export type RuntimeState = {
  activeReview: boolean;
  correctionCycle: number;
  lastOriginalUserPromptHash: string | null;
  lastReviewResult: unknown | null;
};

export function createRuntimeState(): RuntimeState {
  return {
    activeReview: false,
    correctionCycle: 0,
    lastOriginalUserPromptHash: null,
    lastReviewResult: null,
  };
}
