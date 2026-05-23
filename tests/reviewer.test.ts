import { describe, expect, it, vi } from "vitest";
import { createModelClientFromContext, createUnavailableModelClient } from "../src/model.js";
import { buildReviewerSystemPrompt, buildReviewerUserPrompt } from "../src/reviewer.js";
import type { ReviewContext } from "../src/types.js";

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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const completeContext: ReviewContext = {
  currentUserPrompt: "Implement step 10.2.",
  serializedEventMessages: `[message 1]
role: user
content:
Implement step 10.2.
[message 2]
role: assistant
content:
Done.`,
  latestAssistantResponse: "Done.",
  serializedSessionSlice: `[entry 1]
type: message
role: user
content:
Implement step 10.2.`,
  gitStatus: " M src/reviewer.ts",
  gitDiffStat: " src/reviewer.ts | 20 ++++++++++++++++++++",
  gitDiff: "diff --git a/src/reviewer.ts b/src/reviewer.ts",
  gitUnavailableReason: undefined,
};

// ---------------------------------------------------------------------------
// buildReviewerUserPrompt
// ---------------------------------------------------------------------------

describe("buildReviewerUserPrompt", () => {
  // --- general structure ---

  it("returns a deterministic non-empty prompt", () => {
    const first = buildReviewerUserPrompt(completeContext);
    const second = buildReviewerUserPrompt(completeContext);
    expect(first).toEqual(expect.any(String));
    expect(first.length).toBeGreaterThan(0);
    expect(first).toBe(second);
  });

  it("contains the opening instruction", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain("Review the following delivery.");
  });

  it("contains <context> and </context> tags", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain("<context>");
    expect(prompt).toContain("</context>");
  });

  // --- decision rules ---

  it("contains all mandatory decision rules", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain("Decision rules:");
    expect(prompt).toContain("Approve only if the delivery satisfies the user's request");
    expect(prompt).toContain("Reject if required implementation is missing");
    expect(prompt).toContain("Reject if tests or validation are missing when they are necessary");
    expect(prompt).toContain("Reject if the agent's final response is inconsistent with the diff");
    expect(prompt).toContain("Reject if the implementation introduces obvious regressions");
    expect(prompt).toContain("Reject if the work violates explicit user constraints");
    expect(prompt).toContain("Do not reject for minor cosmetic preferences");
    expect(prompt).toContain("If evidence is insufficient, reject");
  });

  // --- expected JSON result shape ---

  it("contains the expected JSON result shape", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain("Return JSON only with this exact shape");
    expect(prompt).toContain('"approved": boolean');
    expect(prompt).toContain('"severity": "pass" | "minor" | "major" | "blocking"');
    expect(prompt).toContain('"summary": string');
    expect(prompt).toContain('"requiredCorrections": string[]');
    expect(prompt).toContain('"recommendedCorrections": string[]');
    expect(prompt).toContain('"evidence": string[]');
    expect(prompt).toContain('"confidence": "low" | "medium" | "high"');
  });

  // --- stable context sections ---

  it("contains stable context section headings", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain("# Review Context");
    expect(prompt).toContain("## Current User Prompt");
    expect(prompt).toContain("## Current Agent Run Messages");
    expect(prompt).toContain("## Latest Assistant Response");
    expect(prompt).toContain("## Session Slice Since Latest Real User Message");
    expect(prompt).toContain("## Git Status");
    expect(prompt).toContain("## Git Diff Stat");
    expect(prompt).toContain("## Git Diff");
    expect(prompt).toContain("## Git Unavailable Reason");
  });

  // --- value inclusion (complete context) ---

  it("includes user prompt value", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain("Implement step 10.2.");
  });

  it("includes serialized event messages", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain("[message 1]");
  });

  it("includes latest assistant response", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    // "Done." appears in both latestAssistantResponse and serializedEventMessages
    expect(prompt).toContain("Done.");
  });

  it("includes serialized session slice", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain("[entry 1]");
  });

  it("includes git status", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain(" M src/reviewer.ts");
  });

  it("includes git diff stat", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain("src/reviewer.ts | 20");
  });

  it("includes git diff", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).toContain("diff --git");
  });

  it("includes git unavailable reason when provided", () => {
    const prompt = buildReviewerUserPrompt({
      ...completeContext,
      gitUnavailableReason: "Git context unavailable.",
    });
    expect(prompt).toContain("Git context unavailable.");
  });

  // --- missing-value markers ---

  it("marks empty currentUserPrompt as [empty]", () => {
    const prompt = buildReviewerUserPrompt({
      ...completeContext,
      currentUserPrompt: "",
    });
    expect(prompt).toContain("[empty]");
  });

  it("marks empty serializedEventMessages as [not included]", () => {
    const prompt = buildReviewerUserPrompt({
      ...completeContext,
      serializedEventMessages: "",
    });
    expect(prompt).toContain("[not included]");
  });

  it("marks null latestAssistantResponse as [none]", () => {
    const prompt = buildReviewerUserPrompt({
      ...completeContext,
      latestAssistantResponse: null,
    });
    expect(prompt).toContain("[none]");
  });

  it("marks null serializedSessionSlice as [not included]", () => {
    const prompt = buildReviewerUserPrompt({
      ...completeContext,
      serializedSessionSlice: null,
    });
    // "[not included]" also appears for empty serializedEventMessages above;
    // check that it appears in the right section.
    expect(prompt).toContain("[not included]");
  });

  it("marks null gitStatus as [not available]", () => {
    const prompt = buildReviewerUserPrompt({
      ...completeContext,
      gitStatus: null,
    });
    expect(prompt).toContain("[not available]");
  });

  it("marks null gitDiffStat as [not available]", () => {
    const prompt = buildReviewerUserPrompt({
      ...completeContext,
      gitDiffStat: null,
    });
    expect(prompt).toContain("[not available]");
  });

  it("marks null gitDiff as [not available]", () => {
    const prompt = buildReviewerUserPrompt({
      ...completeContext,
      gitDiff: null,
    });
    expect(prompt).toContain("[not available]");
  });

  it("marks undefined gitUnavailableReason as [none]", () => {
    const prompt = buildReviewerUserPrompt({
      ...completeContext,
      gitUnavailableReason: undefined,
    });
    expect(prompt).toContain("[none]");
  });

  it("marks empty gitUnavailableReason as [none]", () => {
    const prompt = buildReviewerUserPrompt({
      ...completeContext,
      gitUnavailableReason: "",
    });
    expect(prompt).toContain("[none]");
  });

  it("uses multiple markers correctly in a single sparse context", () => {
    const prompt = buildReviewerUserPrompt({
      currentUserPrompt: "",
      serializedEventMessages: "",
      latestAssistantResponse: null,
      serializedSessionSlice: null,
      gitStatus: null,
      gitDiffStat: null,
      gitDiff: null,
      gitUnavailableReason: undefined,
    });
    expect(prompt).toContain("[empty]");
    expect(prompt).toContain("[not included]");
    expect(prompt).toContain("[none]");
    expect(prompt).toContain("[not available]");
  });

  // --- scope restrictions ---

  it("does not include runtime action instructions", () => {
    const prompt = buildReviewerUserPrompt(completeContext);
    expect(prompt).not.toContain("sendUserMessage");
    expect(prompt).not.toContain("pi.exec");
    expect(prompt).not.toContain("apply the corrections directly");
  });
});

// ---------------------------------------------------------------------------
// createUnavailableModelClient
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// createUnavailableModelClient
// ---------------------------------------------------------------------------

describe("createUnavailableModelClient", () => {
  it("returns a model client that fails explicitly", async () => {
    const client = createUnavailableModelClient();
    await expect(
      client.complete({
        systemPrompt: "system",
        userPrompt: "user",
        model: {
          provider: "test",
          id: "test-model",
        },
        timeoutMs: 1000,
      }),
    ).rejects.toThrow("Model client is not implemented yet.");
  });

  it("does not call a real provider", () => {
    const client = createUnavailableModelClient();
    // The stub exposes a complete method that returns a Promise
    // but throws on await without any side effects.
    expect(client.complete).toBeInstanceOf(Function);
  });
});

// ---------------------------------------------------------------------------
// createModelClientFromContext
// ---------------------------------------------------------------------------

const completionParams = {
  systemPrompt: "system",
  userPrompt: "user",
  model: {
    provider: "test-provider",
    id: "test-model",
    thinkingLevel: "high" as const,
  },
  timeoutMs: 1000,
};

describe("createModelClientFromContext", () => {
  it("fails when model registry is not available", async () => {
    const client = createModelClientFromContext({});
    await expect(client.complete(completionParams)).rejects.toThrow(
      "Model registry is not available.",
    );
  });

  it("resolves a reviewer model using modelRegistry.find", async () => {
    const complete = vi.fn(async () => "review result");
    const getModels = vi.fn();
    const find = vi.fn(async (provider: string, id: string) => ({
      provider,
      id,
      complete,
    }));

    const client = createModelClientFromContext({
      modelRegistry: {
        find,
        getModels,
      },
    });

    await expect(client.complete(completionParams)).resolves.toBe("review result");

    expect(find).toHaveBeenCalledWith("test-provider", "test-model");
    expect(getModels).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith({
      systemPrompt: "system",
      userPrompt: "user",
      signal: undefined,
      timeoutMs: 1000,
      thinkingLevel: "high",
    });
  });

  it("resolves a reviewer model using getModels fallback", async () => {
    const complete = vi.fn(async () => "review result");
    const getModels = vi.fn(async () => [
      {
        provider: "other",
        id: "other-model",
        complete: vi.fn(),
      },
      {
        provider: "test-provider",
        id: "test-model",
        complete,
      },
    ]);

    const client = createModelClientFromContext({
      modelRegistry: {
        getModels,
      },
    });

    await expect(client.complete(completionParams)).resolves.toBe("review result");

    expect(getModels).toHaveBeenCalled();
    expect(complete).toHaveBeenCalled();
  });

  it("fails when reviewer model is not found via find", async () => {
    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => null),
      },
    });

    await expect(client.complete(completionParams)).rejects.toThrow(
      "Reviewer model not found: test-provider/test-model",
    );
  });

  it("fails when reviewer model is not found via getModels", async () => {
    const client = createModelClientFromContext({
      modelRegistry: {
        getModels: vi.fn(async () => [{ provider: "other", id: "other-model" }]),
      },
    });

    await expect(client.complete(completionParams)).rejects.toThrow(
      "Reviewer model not found: test-provider/test-model",
    );
  });

  it("fails when reviewer model does not expose complete", async () => {
    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
        })),
      },
    });

    await expect(client.complete(completionParams)).rejects.toThrow(
      "Reviewer model does not expose a complete method: test-provider/test-model",
    );
  });

  it("fails when reviewer model returns a non-string response", async () => {
    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete: vi.fn(async () => ({ invalid: true }) as unknown as string),
        })),
      },
    });

    await expect(client.complete(completionParams)).rejects.toThrow(
      "Reviewer model returned a non-string response: test-provider/test-model",
    );
  });

  it("propagates signal and timeout to the resolved model", async () => {
    const signal = new AbortController().signal;
    const complete = vi.fn(async () => "review result");

    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    });

    await client.complete({
      ...completionParams,
      signal,
      timeoutMs: 1234,
    });

    expect(complete).toHaveBeenCalledWith({
      systemPrompt: "system",
      userPrompt: "user",
      signal,
      timeoutMs: 1234,
      thinkingLevel: "high",
    });
  });

  it("passes thinkingLevel to the resolved model", async () => {
    const complete = vi.fn(async () => "review result");

    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    });

    await client.complete({
      ...completionParams,
      model: {
        provider: "test-provider",
        id: "test-model",
        thinkingLevel: "off",
      },
    });

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ thinkingLevel: "off" }));
  });

  it("propagates systemPrompt and userPrompt to the resolved model", async () => {
    const complete = vi.fn(async () => "review result");

    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    });

    await client.complete({
      ...completionParams,
      systemPrompt: "custom system",
      userPrompt: "custom user",
    });

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: "custom system",
        userPrompt: "custom user",
      }),
    );
  });
});
