import { CORRECTION_REQUEST_MARKER } from "./constants.js";
import type { RuntimeState } from "./types.js";
import { hashText } from "./utils.js";

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

export type CycleStateUpdate = {
  isCorrectionPrompt: boolean;
  correctionCycle: number;
  lastOriginalUserPromptHash: string | null;
};

export function updateCycleState(params: {
  state: RuntimeState;
  currentUserPrompt: string;
}): CycleStateUpdate {
  const { state, currentUserPrompt } = params;
  const isCorrectionPrompt = isReviewGateInjectedText(currentUserPrompt);
  if (isCorrectionPrompt) {
    state.correctionCycle += 1;
    return {
      isCorrectionPrompt: true,
      correctionCycle: state.correctionCycle,
      lastOriginalUserPromptHash: state.lastOriginalUserPromptHash,
    };
  }
  const promptHash = hashText(currentUserPrompt);
  state.correctionCycle = 0;
  state.lastOriginalUserPromptHash = promptHash;
  return {
    isCorrectionPrompt: false,
    correctionCycle: state.correctionCycle,
    lastOriginalUserPromptHash: state.lastOriginalUserPromptHash,
  };
}
