import { describe, expect, it } from "vitest";
import { CORRECTION_REQUEST_MARKER } from "../src/constants.js";
import { createRuntimeState, isReviewGateInjectedText } from "../src/state.js";

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
