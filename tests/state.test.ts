import { describe, expect, it } from "vitest";
import { CORRECTION_REQUEST_MARKER } from "../src/constants.js";
import {
  beginReview,
  createRuntimeState,
  endReview,
  isReviewActive,
  isReviewGateInjectedText,
  updateCycleState,
  withActiveReviewGuard,
} from "../src/state.js";
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

describe("active review helpers", () => {
  describe("isReviewActive", () => {
    it("returns false in the initial state", () => {
      const state = createRuntimeState();
      expect(isReviewActive(state)).toBe(false);
    });

    it("returns true when state.activeReview is true", () => {
      const state = createRuntimeState();
      state.activeReview = true;
      expect(isReviewActive(state)).toBe(true);
    });

    it("does not mutate the state", () => {
      const state = createRuntimeState();
      state.activeReview = true;
      expect(state.correctionCycle).toBe(0);
      expect(state.lastOriginalUserPromptHash).toBeNull();
      expect(state.lastReviewResult).toBeNull();
      isReviewActive(state);
      expect(state.activeReview).toBe(true);
      expect(state.correctionCycle).toBe(0);
      expect(state.lastOriginalUserPromptHash).toBeNull();
      expect(state.lastReviewResult).toBeNull();
    });
  });

  describe("beginReview", () => {
    it("returns true and sets activeReview to true when no review is active", () => {
      const state = createRuntimeState();
      expect(beginReview(state)).toBe(true);
      expect(state.activeReview).toBe(true);
    });

    it("returns false and keeps activeReview true when review is already active", () => {
      const state = createRuntimeState();
      state.activeReview = true;
      expect(beginReview(state)).toBe(false);
      expect(state.activeReview).toBe(true);
    });

    it("does not alter correctionCycle", () => {
      const state = createRuntimeState();
      state.correctionCycle = 3;
      beginReview(state);
      expect(state.correctionCycle).toBe(3);
    });

    it("does not alter lastOriginalUserPromptHash", () => {
      const state = createRuntimeState();
      state.lastOriginalUserPromptHash = "abc123";
      beginReview(state);
      expect(state.lastOriginalUserPromptHash).toBe("abc123");
    });

    it("does not alter lastReviewResult", () => {
      const state = createRuntimeState();
      state.lastReviewResult = {
        approved: false,
        severity: "major" as const,
        summary: "test",
        requiredCorrections: [],
        recommendedCorrections: [],
        evidence: [],
        confidence: "high" as const,
      };
      beginReview(state);
      expect(state.lastReviewResult).toEqual({
        approved: false,
        severity: "major",
        summary: "test",
        requiredCorrections: [],
        recommendedCorrections: [],
        evidence: [],
        confidence: "high",
      });
    });
  });

  describe("endReview", () => {
    it("sets activeReview to false", () => {
      const state = createRuntimeState();
      state.activeReview = true;
      endReview(state);
      expect(state.activeReview).toBe(false);
    });

    it("is idempotent when activeReview is already false", () => {
      const state = createRuntimeState();
      endReview(state);
      expect(state.activeReview).toBe(false);
      endReview(state);
      expect(state.activeReview).toBe(false);
    });

    it("does not alter correctionCycle", () => {
      const state = createRuntimeState();
      state.correctionCycle = 5;
      state.activeReview = true;
      endReview(state);
      expect(state.correctionCycle).toBe(5);
    });

    it("does not alter lastOriginalUserPromptHash", () => {
      const state = createRuntimeState();
      state.lastOriginalUserPromptHash = "xyz789";
      state.activeReview = true;
      endReview(state);
      expect(state.lastOriginalUserPromptHash).toBe("xyz789");
    });

    it("does not alter lastReviewResult", () => {
      const state = createRuntimeState();
      state.lastReviewResult = {
        approved: true,
        severity: "pass" as const,
        summary: "all clear",
        requiredCorrections: [],
        recommendedCorrections: [],
        evidence: [],
        confidence: "high" as const,
      };
      state.activeReview = true;
      endReview(state);
      expect(state.lastReviewResult).toEqual({
        approved: true,
        severity: "pass",
        summary: "all clear",
        requiredCorrections: [],
        recommendedCorrections: [],
        evidence: [],
        confidence: "high",
      });
    });
  });

  describe("withActiveReviewGuard", () => {
    it("executes callback when no review is active", () => {
      const state = createRuntimeState();
      let called = false;
      withActiveReviewGuard(state, () => {
        called = true;
      });
      expect(called).toBe(true);
    });

    it("returns the callback value", () => {
      const state = createRuntimeState();
      const result = withActiveReviewGuard(state, () => "done");
      expect(result).toBe("done");
    });

    it("sets activeReview to true during callback execution", () => {
      const state = createRuntimeState();
      withActiveReviewGuard(state, () => {
        expect(state.activeReview).toBe(true);
      });
    });

    it("releases activeReview after callback completes", () => {
      const state = createRuntimeState();
      withActiveReviewGuard(state, () => {
        /* no-op */
      });
      expect(state.activeReview).toBe(false);
    });

    it("returns null when review is already active", () => {
      const state = createRuntimeState();
      state.activeReview = true;
      const result = withActiveReviewGuard(state, () => "should not run");
      expect(result).toBeNull();
    });

    it("does not execute callback when review is already active", () => {
      const state = createRuntimeState();
      state.activeReview = true;
      let called = false;
      withActiveReviewGuard(state, () => {
        called = true;
      });
      expect(called).toBe(false);
    });

    it("releases activeReview even when callback throws", () => {
      const state = createRuntimeState();
      expect(() =>
        withActiveReviewGuard(state, () => {
          throw new Error("boom");
        }),
      ).toThrow("boom");
      expect(state.activeReview).toBe(false);
    });

    it("propagates the error from callback", () => {
      const state = createRuntimeState();
      const error = new Error("callback failure");
      expect(() =>
        withActiveReviewGuard(state, () => {
          throw error;
        }),
      ).toThrow(error);
    });
  });
});
