import { describe, expect, it } from "vitest";
import { CORRECTION_REQUEST_MARKER } from "../src/constants.js";
import { createRuntimeState, isReviewGateInjectedText, updateCycleState } from "../src/state.js";
import { hashText } from "../src/utils.js";

describe("createRuntimeState", () => {
  it("returns the expected initial runtime state", () => {
    expect(createRuntimeState()).toEqual({
      activeReview: false,
      correctionCycle: 0,
      lastOriginalUserPromptHash: null,
      lastReviewResult: null,
    });
  });

  it("returns a new object on each call", () => {
    const first = createRuntimeState();
    const second = createRuntimeState();
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});

describe("isReviewGateInjectedText", () => {
  it("detects the official correction request marker", () => {
    expect(isReviewGateInjectedText(CORRECTION_REQUEST_MARKER)).toBe(true);
  });

  it("detects the marker at the start of text", () => {
    expect(
      isReviewGateInjectedText(`${CORRECTION_REQUEST_MARKER}
Mandatory review failed.`),
    ).toBe(true);
  });

  it("detects the marker after whitespace or preceding text", () => {
    expect(isReviewGateInjectedText(`  ${CORRECTION_REQUEST_MARKER}`)).toBe(true);
    expect(
      isReviewGateInjectedText(`Please fix:
${CORRECTION_REQUEST_MARKER}
Details here.`),
    ).toBe(true);
  });

  it("returns false for normal user text", () => {
    expect(isReviewGateInjectedText("please implement the next step")).toBe(false);
  });

  it("returns false for empty, null, and undefined values", () => {
    expect(isReviewGateInjectedText("")).toBe(false);
    expect(isReviewGateInjectedText("   ")).toBe(false);
    expect(isReviewGateInjectedText(null)).toBe(false);
    expect(isReviewGateInjectedText(undefined)).toBe(false);
  });

  it("does not accept the old marker variant", () => {
    expect(isReviewGateInjectedText("[review-gate:correction-request]")).toBe(false);
  });

  it("returns false for a partial marker", () => {
    expect(isReviewGateInjectedText("[pi-review-gate:correction")).toBe(false);
    expect(isReviewGateInjectedText("pi-review-gate:correction-request")).toBe(false);
  });
});

describe("hashText", () => {
  it("returns a deterministic hash", () => {
    expect(hashText("same prompt")).toBe(hashText("same prompt"));
  });

  it("returns different hashes for different text", () => {
    expect(hashText("prompt one")).not.toBe(hashText("prompt two"));
  });

  it("returns a non-empty string", () => {
    expect(hashText("hello")).not.toBe("");
  });

  it("does not throw for an empty string", () => {
    expect(() => hashText("")).not.toThrow();
    expect(hashText("")).not.toBe("");
  });
});

describe("updateCycleState", () => {
  it("resets the correction cycle for a real user prompt", () => {
    const state = createRuntimeState();
    state.correctionCycle = 2;
    const result = updateCycleState({
      state,
      currentUserPrompt: "implement the next step",
    });
    expect(result.isCorrectionPrompt).toBe(false);
    expect(result.correctionCycle).toBe(0);
    expect(state.correctionCycle).toBe(0);
    expect(state.lastOriginalUserPromptHash).toEqual(expect.any(String));
    expect(result.lastOriginalUserPromptHash).toEqual(expect.any(String));
  });

  it("updates lastOriginalUserPromptHash for a real prompt", () => {
    const state = createRuntimeState();
    const result = updateCycleState({
      state,
      currentUserPrompt: "some unique prompt",
    });
    expect(result.isCorrectionPrompt).toBe(false);
    expect(state.lastOriginalUserPromptHash).toEqual(expect.any(String));
    expect(result.lastOriginalUserPromptHash).toBe(state.lastOriginalUserPromptHash);
  });

  it("returns isCorrectionPrompt false for a real prompt", () => {
    const state = createRuntimeState();
    const result = updateCycleState({
      state,
      currentUserPrompt: "any real prompt",
    });
    expect(result.isCorrectionPrompt).toBe(false);
  });

  it("increments the correction cycle for an injected prompt", () => {
    const state = createRuntimeState();
    updateCycleState({
      state,
      currentUserPrompt: "implement the next step",
    });
    const originalHash = state.lastOriginalUserPromptHash;
    const result = updateCycleState({
      state,
      currentUserPrompt: `${CORRECTION_REQUEST_MARKER}
Mandatory review failed.`,
    });
    expect(result.isCorrectionPrompt).toBe(true);
    expect(result.correctionCycle).toBe(1);
    expect(state.correctionCycle).toBe(1);
    expect(state.lastOriginalUserPromptHash).toBe(originalHash);
    expect(result.lastOriginalUserPromptHash).toBe(originalHash);
  });

  it("preserves lastOriginalUserPromptHash for an injected prompt", () => {
    const state = createRuntimeState();
    updateCycleState({
      state,
      currentUserPrompt: "preserve this prompt",
    });
    const preservedHash = state.lastOriginalUserPromptHash;
    expect(preservedHash).toEqual(expect.any(String));
    const result = updateCycleState({
      state,
      currentUserPrompt: `${CORRECTION_REQUEST_MARKER}
fix these issues`,
    });
    expect(result.lastOriginalUserPromptHash).toBe(preservedHash);
    expect(state.lastOriginalUserPromptHash).toBe(preservedHash);
  });

  it("increments consecutive injected prompts to cycle 2", () => {
    const state = createRuntimeState();
    updateCycleState({
      state,
      currentUserPrompt: "real prompt",
    });
    updateCycleState({
      state,
      currentUserPrompt: CORRECTION_REQUEST_MARKER,
    });
    const result = updateCycleState({
      state,
      currentUserPrompt: CORRECTION_REQUEST_MARKER,
    });
    expect(result.correctionCycle).toBe(2);
    expect(state.correctionCycle).toBe(2);
    expect(result.isCorrectionPrompt).toBe(true);
  });

  it("resets the cycle when a new real prompt arrives after corrections", () => {
    const state = createRuntimeState();
    updateCycleState({
      state,
      currentUserPrompt: "first real prompt",
    });
    const firstHash = state.lastOriginalUserPromptHash;

    // Inject correction prompt
    updateCycleState({
      state,
      currentUserPrompt: CORRECTION_REQUEST_MARKER,
    });
    expect(state.correctionCycle).toBe(1);

    // New real prompt -> resets cycle and hash
    const result = updateCycleState({
      state,
      currentUserPrompt: "second real prompt",
    });
    expect(result.correctionCycle).toBe(0);
    expect(state.correctionCycle).toBe(0);
    expect(state.lastOriginalUserPromptHash).not.toBe(firstHash);
  });

  it("changes the hash when a new real prompt arrives after corrections", () => {
    const state = createRuntimeState();
    updateCycleState({
      state,
      currentUserPrompt: "original prompt",
    });
    const firstHash = state.lastOriginalUserPromptHash;

    updateCycleState({
      state,
      currentUserPrompt: CORRECTION_REQUEST_MARKER,
    });

    updateCycleState({
      state,
      currentUserPrompt: "different prompt",
    });
    expect(state.lastOriginalUserPromptHash).not.toBe(firstHash);
  });

  it("preserves lastOriginalUserPromptHash as null when injected without prior real prompt", () => {
    const state = createRuntimeState();
    expect(state.lastOriginalUserPromptHash).toBeNull();
    const result = updateCycleState({
      state,
      currentUserPrompt: `${CORRECTION_REQUEST_MARKER}
fix this`,
    });
    expect(result.isCorrectionPrompt).toBe(true);
    expect(result.correctionCycle).toBe(1);
    expect(result.lastOriginalUserPromptHash).toBeNull();
    expect(state.lastOriginalUserPromptHash).toBeNull();
  });

  it("mutates the provided state object", () => {
    const state = createRuntimeState();
    updateCycleState({
      state,
      currentUserPrompt: "prompt",
    });
    // State should be mutated, not replaced
    expect(state.correctionCycle).toBe(0);
  });
});
