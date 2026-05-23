import { describe, expect, it } from "vitest";
import { buildReviewerSystemPrompt } from "../src/reviewer.js";

describe("buildReviewerSystemPrompt", () => {
  it("returns a deterministic non-empty prompt", () => {
    const first = buildReviewerSystemPrompt();
    const second = buildReviewerSystemPrompt();
    expect(first).toEqual(expect.any(String));
    expect(first.length).toBeGreaterThan(0);
    expect(first).toBe(second);
  });

  it("defines the reviewer role and scope", () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).toContain("mandatory delivery reviewer");
    expect(prompt).toContain("coding agent");
    expect(prompt).toContain("decide whether the agent's work can be considered complete");
    expect(prompt).toContain("You are not the implementation agent");
  });

  it("contains required rejection rules", () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).toContain("must not approve incomplete work");
    expect(prompt).toContain("final response claims changes");
    expect(prompt).toContain("not supported by the provided evidence");
    expect(prompt).toContain("tests or validation were required");
    expect(prompt).toContain("no evidence was provided");
  });

  it("focuses on the expected review evidence", () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).toContain("user's request");
    expect(prompt).toContain("actual delivery");
    expect(prompt).toContain("git diff");
    expect(prompt).toContain("validation evidence");
  });

  it("requires JSON-only output", () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("Do not include markdown");
    expect(prompt).toContain("Do not include prose outside JSON");
  });

  it("does not include runtime action instructions", () => {
    const prompt = buildReviewerSystemPrompt();
    expect(prompt).not.toContain("sendUserMessage");
    expect(prompt).not.toContain("pi.exec");
  });
});
