import { describe, expect, it } from "vitest";
import { CORRECTION_REQUEST_MARKER } from "../src/constants.js";
import { buildCorrectionFollowUp } from "../src/follow-up.js";
import type { ReviewGateResult } from "../src/types.js";

const rejectedResult: ReviewGateResult = {
  approved: false,
  severity: "blocking",
  summary: "Required implementation is missing.",
  requiredCorrections: [
    "Implement buildCorrectionFollowUp.",
    "Add unit tests for the follow-up template.",
  ],
  recommendedCorrections: ["Keep the function pure and deterministic."],
  evidence: [
    "src/follow-up.ts is still a placeholder.",
    "tests/follow-up.test.ts does not cover the template.",
  ],
  confidence: "high",
};

describe("buildCorrectionFollowUp", () => {
  it("returns a deterministic non-empty follow-up", () => {
    const first = buildCorrectionFollowUp(rejectedResult);
    const second = buildCorrectionFollowUp(rejectedResult);
    expect(first.length).toBeGreaterThan(0);
    expect(first).toBe(second);
  });

  it("starts with the required correction request marker", () => {
    const followUp = buildCorrectionFollowUp(rejectedResult);
    expect(followUp.startsWith(CORRECTION_REQUEST_MARKER)).toBe(true);
    expect(followUp.split("\n")[0]).toBe(CORRECTION_REQUEST_MARKER);
  });

  it("includes the required sections", () => {
    const followUp = buildCorrectionFollowUp(rejectedResult);
    expect(followUp).toContain("# Mandatory Review Corrections");
    expect(followUp).toContain("## Review Summary");
    expect(followUp).toContain("## Severity");
    expect(followUp).toContain("## Required Corrections");
    expect(followUp).toContain("## Recommended Corrections");
    expect(followUp).toContain("## Evidence");
    expect(followUp).toContain("## Instructions");
  });

  it("includes review summary, severity, corrections, and evidence", () => {
    const followUp = buildCorrectionFollowUp(rejectedResult);
    expect(followUp).toContain("Required implementation is missing.");
    expect(followUp).toContain("blocking");
    expect(followUp).toContain("1. Implement buildCorrectionFollowUp.");
    expect(followUp).toContain("2. Add unit tests for the follow-up template.");
    expect(followUp).toContain("1. Keep the function pure and deterministic.");
    expect(followUp).toContain("1. src/follow-up.ts is still a placeholder.");
    expect(followUp).toContain("2. tests/follow-up.test.ts does not cover the template.");
  });

  it("includes mandatory instructions for the agent", () => {
    const followUp = buildCorrectionFollowUp(rejectedResult);
    expect(followUp).toContain(
      "You must correct the delivery according to the required corrections above.",
    );
    expect(followUp).toContain("Do not ignore this message.");
    expect(followUp).toContain("Do not treat this as a new unrelated user request.");
    expect(followUp).toContain("Keep the scope limited to the corrections required by the review.");
    expect(followUp).toContain(
      "After applying corrections, provide a concise summary of what changed and which validations were run.",
    );
  });

  it("uses stable markers for empty values", () => {
    const followUp = buildCorrectionFollowUp({
      approved: false,
      severity: "major",
      summary: "",
      requiredCorrections: [],
      recommendedCorrections: [],
      evidence: [],
      confidence: "medium",
    });
    expect(followUp).toContain("[empty]");
    expect(followUp).toContain("[none]");
  });

  it("uses an explicit marker for empty list items", () => {
    const followUp = buildCorrectionFollowUp({
      approved: false,
      severity: "blocking",
      summary: "Invalid response.",
      requiredCorrections: [""],
      recommendedCorrections: ["   "],
      evidence: [""],
      confidence: "high",
    });
    expect(followUp).toContain("1. [empty item]");
  });

  it("does not mutate the review result", () => {
    const result = {
      ...rejectedResult,
      requiredCorrections: [...rejectedResult.requiredCorrections],
      recommendedCorrections: [...rejectedResult.recommendedCorrections],
      evidence: [...rejectedResult.evidence],
    };
    const before = JSON.stringify(result);
    buildCorrectionFollowUp(result);
    expect(JSON.stringify(result)).toBe(before);
  });

  it("does not contain runtime action calls", () => {
    const followUp = buildCorrectionFollowUp(rejectedResult);
    expect(followUp).not.toContain("sendUserMessage");
    expect(followUp).not.toContain("appendEntry");
    expect(followUp).not.toContain("agent_end");
  });
});
