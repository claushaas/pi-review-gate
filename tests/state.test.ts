import { describe, expect, it } from "vitest";
import { createRuntimeState } from "../src/state.js";

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
