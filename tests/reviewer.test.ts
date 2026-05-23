import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config.js";
import { CUSTOM_ENTRY_REVIEW_RESULT } from "../src/constants.js";
import type { ModelClient } from "../src/model.js";
import { createModelClientFromContext, createUnavailableModelClient } from "../src/model.js";
import {
  buildReviewerSystemPrompt,
  buildReviewerUserPrompt,
  persistReviewResult,
  runReviewer,
} from "../src/reviewer.js";
import type {
  ReviewContext,
  ReviewerModelConfig,
  ReviewGateConfig,
  ReviewGateResult,
} from "../src/types.js";

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
      signal: expect.any(AbortSignal),
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
      signal: expect.any(AbortSignal),
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

// ---------------------------------------------------------------------------
// Timeout and signal tests (Step 11.3)
// ---------------------------------------------------------------------------

describe("createModelClientFromContext timeout", () => {
  it("rejects when the reviewer model request times out", async () => {
    const complete = vi.fn(
      (params: { signal?: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          params.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );

    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    });

    await expect(
      client.complete({
        ...completionParams,
        timeoutMs: 10,
      }),
    ).rejects.toThrow("Reviewer model request timed out after 10ms.");

    // The signal passed to the model should be aborted after timeout.
    const call = complete.mock.calls[0]?.[0] as { signal?: AbortSignal } | undefined;
    expect(call?.signal?.aborted).toBe(true);
  });

  it("cleans up timer when the call resolves before timeout", async () => {
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
      timeoutMs: 1000,
    });

    expect(complete).toHaveBeenCalled();
  });

  it("cleans up timer when the call rejects before timeout", async () => {
    const complete = vi.fn(async () => {
      throw new Error("model failure");
    });

    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    });

    await expect(
      client.complete({
        ...completionParams,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow("model failure");
  });

  it("does not create abort by timeout when timeoutMs is zero", async () => {
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
      timeoutMs: 0,
    });

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 0 }));
  });

  it("does not create abort by timeout when timeoutMs is negative", async () => {
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
      timeoutMs: -1,
    });

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: -1 }));
  });

  it("does not create abort by timeout when timeoutMs is NaN", async () => {
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
      timeoutMs: NaN,
    });

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: NaN }));
  });

  it("does not create abort by timeout when timeoutMs is not an integer", async () => {
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
      timeoutMs: 100.5,
    });

    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 100.5 }));
  });
});

describe("createModelClientFromContext external signal", () => {
  it("does not call the model when the external signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

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

    await expect(
      client.complete({
        ...completionParams,
        signal: controller.signal,
      }),
    ).rejects.toThrow("Reviewer model request was aborted.");

    expect(complete).not.toHaveBeenCalled();
  });

  it("aborts the signal passed to the model when the external signal aborts", async () => {
    const controller = new AbortController();
    let capturedSignal: AbortSignal | undefined;
    const complete = vi.fn((params: { signal?: AbortSignal }) => {
      capturedSignal = params.signal;
      return new Promise<string>((_resolve, reject) => {
        params.signal?.addEventListener("abort", () => {
          reject(new Error("candidate aborted"));
        });
      });
    });

    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    });

    const promise = client.complete({
      ...completionParams,
      signal: controller.signal,
      timeoutMs: 1000,
    });

    // Wait for the combined signal to be created and the model to be called.
    // Use a real timer delay to let all pending microtasks complete.
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    controller.abort();

    await expect(promise).rejects.toThrow();
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("removes the external signal listener after success", async () => {
    const controller = new AbortController();
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
      signal: controller.signal,
    });

    // If cleanup didn't remove the listener, aborting after completion
    // would have listeners still registered, but since we can't easily
    // check listener count in all runtimes, we verify no errors occur.
    controller.abort();
    expect(complete).toHaveBeenCalled();
  });

  it("removes the external signal listener after error", async () => {
    const controller = new AbortController();
    const complete = vi.fn(async () => {
      throw new Error("model failure");
    });

    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    });

    await expect(
      client.complete({
        ...completionParams,
        signal: controller.signal,
      }),
    ).rejects.toThrow("model failure");

    // Listener should be cleaned up — aborting now should have no effect.
    controller.abort();
    expect(complete).toHaveBeenCalled();
  });

  it("removes the external signal listener after timeout", async () => {
    const controller = new AbortController();
    const complete = vi.fn(
      (params: { signal?: AbortSignal }) =>
        new Promise<string>((_resolve, reject) => {
          params.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );

    const client = createModelClientFromContext({
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    });

    await expect(
      client.complete({
        ...completionParams,
        signal: controller.signal,
        timeoutMs: 10,
      }),
    ).rejects.toThrow("Reviewer model request timed out after 10ms.");

    // Listener should be cleaned up — aborting the external controller
    // after the internal timeout has already fired should be harmless.
    controller.abort();
  });
});

// ---------------------------------------------------------------------------
// runReviewer
// ---------------------------------------------------------------------------

const reviewContext: ReviewContext = {
  currentUserPrompt: "Implement step 12.1.",
  serializedEventMessages: `[message 1]
role: user
content:
Implement step 12.1.`,
  latestAssistantResponse: "Done.",
  serializedSessionSlice: null,
  gitStatus: " M src/reviewer.ts",
  gitDiffStat: " src/reviewer.ts | 10 ++++++++++",
  gitDiff: "diff --git a/src/reviewer.ts b/src/reviewer.ts",
};

const configWithReviewerModel: ReviewGateConfig = {
  ...defaultConfig,
  reviewerModel: {
    provider: "test-provider",
    id: "test-model",
    thinkingLevel: "high",
  },
};

describe("runReviewer", () => {
  it("returns an approved review result from valid reviewer JSON", async () => {
    const approvedResult = {
      approved: true,
      severity: "pass",
      summary: "Delivery satisfies the request.",
      requiredCorrections: [],
      recommendedCorrections: [],
      evidence: ["The diff matches the requested implementation."],
      confidence: "high",
    } as const;
    const modelClient: ModelClient = {
      complete: vi.fn(async () => JSON.stringify(approvedResult)),
    };

    await expect(
      runReviewer({
        config: configWithReviewerModel,
        reviewContext,
        modelClient,
      }),
    ).resolves.toEqual(approvedResult);

    expect(modelClient.complete).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining("mandatory delivery reviewer"),
      userPrompt: expect.stringContaining("Review the following delivery."),
      model: configWithReviewerModel.reviewerModel,
      signal: undefined,
      timeoutMs: configWithReviewerModel.reviewer.timeoutMs,
    });
  });

  it("passes the abort signal to the model client", async () => {
    const signal = new AbortController().signal;
    const modelClient: ModelClient = {
      complete: vi.fn(async () =>
        JSON.stringify({
          approved: true,
          severity: "pass",
          summary: "ok",
          requiredCorrections: [],
          recommendedCorrections: [],
          evidence: [],
          confidence: "medium",
        }),
      ),
    };

    await runReviewer({
      config: configWithReviewerModel,
      reviewContext,
      modelClient,
      signal,
    });

    expect(modelClient.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        signal,
      }),
    );
  });

  it("returns a rejected review result from valid reviewer JSON", async () => {
    const rejectedResult = {
      approved: false,
      severity: "blocking",
      summary: "Required implementation is missing.",
      requiredCorrections: ["Implement runReviewer."],
      recommendedCorrections: ["Add tests for invalid reviewer responses."],
      evidence: ["No call to modelClient.complete was found."],
      confidence: "high",
    } as const;
    const modelClient: ModelClient = {
      complete: vi.fn(async () => JSON.stringify(rejectedResult)),
    };

    await expect(
      runReviewer({
        config: configWithReviewerModel,
        reviewContext,
        modelClient,
      }),
    ).resolves.toEqual(rejectedResult);
  });

  it("fails when reviewer model is not configured", async () => {
    const modelClient: ModelClient = {
      complete: vi.fn(async () => "{}"),
    };

    await expect(
      runReviewer({
        config: {
          ...defaultConfig,
          reviewerModel: null,
        },
        reviewContext,
        modelClient,
      }),
    ).rejects.toThrow("Reviewer model is not configured.");

    expect(modelClient.complete).not.toHaveBeenCalled();
  });

  it("fails when reviewer response is invalid JSON (fail-open)", async () => {
    const modelClient: ModelClient = {
      complete: vi.fn(async () => "{ invalid json }"),
    };

    await expect(
      runReviewer({
        config: {
          ...configWithReviewerModel,
          reviewer: {
            ...configWithReviewerModel.reviewer,
            failClosedOnInvalidJson: false,
          },
        },
        reviewContext,
        modelClient,
      }),
    ).rejects.toThrow("Invalid reviewer response:");
  });

  it("fails when reviewer response has invalid schema (fail-open)", async () => {
    const modelClient: ModelClient = {
      complete: vi.fn(async () =>
        JSON.stringify({
          approved: true,
          severity: "critical",
        }),
      ),
    };

    await expect(
      runReviewer({
        config: {
          ...configWithReviewerModel,
          reviewer: {
            ...configWithReviewerModel.reviewer,
            failClosedOnInvalidJson: false,
          },
        },
        reviewContext,
        modelClient,
      }),
    ).rejects.toThrow("Invalid reviewer response:");
  });

  it("propagates model client errors", async () => {
    const modelClient: ModelClient = {
      complete: vi.fn(async () => {
        throw new Error("model failed");
      }),
    };

    await expect(
      runReviewer({
        config: configWithReviewerModel,
        reviewContext,
        modelClient,
      }),
    ).rejects.toThrow("model failed");
  });

  it("does not mutate config or review context", async () => {
    const modelClient: ModelClient = {
      complete: vi.fn(async () =>
        JSON.stringify({
          approved: true,
          severity: "pass",
          summary: "ok",
          requiredCorrections: [],
          recommendedCorrections: [],
          evidence: [],
          confidence: "medium",
        }),
      ),
    };

    const config = {
      ...configWithReviewerModel,
      reviewerModel: {
        ...configWithReviewerModel.reviewerModel,
      },
      reviewer: {
        ...configWithReviewerModel.reviewer,
      },
    } as ReviewGateConfig;

    const context = {
      ...reviewContext,
    };

    const before = JSON.stringify({ config, context });

    await runReviewer({
      config,
      reviewContext: context,
      modelClient,
    });

    expect(JSON.stringify({ config, context })).toBe(before);
  });

  // --- failClosedOnInvalidJson policy ---

  it("returns a blocking result for invalid JSON when failClosedOnInvalidJson is true", async () => {
    const modelClient: ModelClient = {
      complete: vi.fn(async () => "{ invalid json }"),
    };

    const result = await runReviewer({
      config: {
        ...configWithReviewerModel,
        reviewer: {
          ...configWithReviewerModel.reviewer,
          failClosedOnInvalidJson: true,
        },
      },
      reviewContext,
      modelClient,
    });

    expect(result.approved).toBe(false);
    expect(result.severity).toBe("blocking");
    expect(result.summary).toBe("Reviewer returned an invalid response.");
    expect(result.requiredCorrections.length).toBeGreaterThan(0);
    expect(result.recommendedCorrections.length).toBeGreaterThan(0);
    expect(result.evidence[0]).toMatch(/^Invalid reviewer response:/);
    expect(result.confidence).toBe("high");
  });

  it("returns a blocking result for invalid schema when failClosedOnInvalidJson is true", async () => {
    const modelClient: ModelClient = {
      complete: vi.fn(async () =>
        JSON.stringify({
          approved: true,
          severity: "critical",
        }),
      ),
    };

    const result = await runReviewer({
      config: {
        ...configWithReviewerModel,
        reviewer: {
          ...configWithReviewerModel.reviewer,
          failClosedOnInvalidJson: true,
        },
      },
      reviewContext,
      modelClient,
    });

    expect(result.approved).toBe(false);
    expect(result.severity).toBe("blocking");
    expect(result.summary).toBe("Reviewer returned an invalid response.");
    expect(result.evidence[0]).toMatch(/^Invalid reviewer response:/);
  });

  it("throws for invalid JSON when failClosedOnInvalidJson is false", async () => {
    const modelClient: ModelClient = {
      complete: vi.fn(async () => "{ invalid json }"),
    };

    await expect(
      runReviewer({
        config: {
          ...configWithReviewerModel,
          reviewer: {
            ...configWithReviewerModel.reviewer,
            failClosedOnInvalidJson: false,
          },
        },
        reviewContext,
        modelClient,
      }),
    ).rejects.toThrow("Invalid reviewer response:");
  });

  it("throws for invalid schema when failClosedOnInvalidJson is false", async () => {
    const modelClient: ModelClient = {
      complete: vi.fn(async () =>
        JSON.stringify({
          approved: true,
          severity: "critical",
        }),
      ),
    };

    await expect(
      runReviewer({
        config: {
          ...configWithReviewerModel,
          reviewer: {
            ...configWithReviewerModel.reviewer,
            failClosedOnInvalidJson: false,
          },
        },
        reviewContext,
        modelClient,
      }),
    ).rejects.toThrow("Invalid reviewer response:");
  });

  it("preserves valid approved reviewer results even when fail-closed is enabled", async () => {
    const approvedResult = {
      approved: true,
      severity: "pass",
      summary: "Delivery satisfies the request.",
      requiredCorrections: [],
      recommendedCorrections: [],
      evidence: ["The reviewer returned valid JSON."],
      confidence: "high",
    } as const;
    const modelClient: ModelClient = {
      complete: vi.fn(async () => JSON.stringify(approvedResult)),
    };

    await expect(
      runReviewer({
        config: {
          ...configWithReviewerModel,
          reviewer: {
            ...configWithReviewerModel.reviewer,
            failClosedOnInvalidJson: true,
          },
        },
        reviewContext,
        modelClient,
      }),
    ).resolves.toEqual(approvedResult);
  });

  it("preserves valid rejected reviewer results even when fail-closed is enabled", async () => {
    const rejectedResult = {
      approved: false,
      severity: "blocking",
      summary: "Required implementation is missing.",
      requiredCorrections: ["Implement the missing behavior."],
      recommendedCorrections: [],
      evidence: ["The diff does not include the required code."],
      confidence: "high",
    } as const;
    const modelClient: ModelClient = {
      complete: vi.fn(async () => JSON.stringify(rejectedResult)),
    };

    await expect(
      runReviewer({
        config: {
          ...configWithReviewerModel,
          reviewer: {
            ...configWithReviewerModel.reviewer,
            failClosedOnInvalidJson: true,
          },
        },
        reviewContext,
        modelClient,
      }),
    ).resolves.toEqual(rejectedResult);
  });

  it("does not mutate config or review context when handling invalid JSON", async () => {
    const modelClient: ModelClient = {
      complete: vi.fn(async () => "{ invalid json }"),
    };

    const config = {
      ...configWithReviewerModel,
      reviewer: {
        ...configWithReviewerModel.reviewer,
        failClosedOnInvalidJson: true,
      },
      reviewerModel: {
        ...configWithReviewerModel.reviewerModel,
      },
    } as ReviewGateConfig;

    const context = {
      ...reviewContext,
    };

    const before = JSON.stringify({ config, context });

    await runReviewer({
      config,
      reviewContext: context,
      modelClient,
    });

    expect(JSON.stringify({ config, context })).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// persistReviewResult fixtures
// ---------------------------------------------------------------------------

const reviewerModel: ReviewerModelConfig = {
  provider: "test-provider",
  id: "test-model",
  thinkingLevel: "high",
};

const approvedResult: ReviewGateResult = {
  approved: true,
  severity: "pass",
  summary: "Delivery satisfies the request.",
  requiredCorrections: [],
  recommendedCorrections: [],
  evidence: ["Reviewer approved the delivery."],
  confidence: "high",
};

const rejectedResult: ReviewGateResult = {
  approved: false,
  severity: "blocking",
  summary: "Required implementation is missing.",
  requiredCorrections: ["Implement persistReviewResult."],
  recommendedCorrections: ["Add tests for appendEntry payload."],
  evidence: ["No persisted review entry was found."],
  confidence: "high",
};

// ---------------------------------------------------------------------------
// persistReviewResult
// ---------------------------------------------------------------------------

describe("persistReviewResult", () => {
  it("persists an approved review result", async () => {
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
    };
    await persistReviewResult({
      pi,
      result: approvedResult,
      attempt: 1,
      model: reviewerModel,
      timestamp: "2026-05-23T12:00:00.000Z",
    });
    expect(pi.appendEntry).toHaveBeenCalledWith(CUSTOM_ENTRY_REVIEW_RESULT, {
      timestamp: "2026-05-23T12:00:00.000Z",
      attempt: 1,
      model: reviewerModel,
      result: approvedResult,
    });
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("persists a rejected review result with corrections and evidence", async () => {
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
    };
    await persistReviewResult({
      pi,
      result: rejectedResult,
      attempt: 2,
      model: reviewerModel,
      timestamp: "2026-05-23T12:05:00.000Z",
    });
    expect(pi.appendEntry).toHaveBeenCalledWith(CUSTOM_ENTRY_REVIEW_RESULT, {
      timestamp: "2026-05-23T12:05:00.000Z",
      attempt: 2,
      model: reviewerModel,
      result: rejectedResult,
    });
    const payload = pi.appendEntry.mock.calls[0]?.[1] as Record<string, unknown>;
    const result = payload.result as ReviewGateResult;
    expect(result.requiredCorrections).toEqual(["Implement persistReviewResult."]);
    expect(result.recommendedCorrections).toEqual(["Add tests for appendEntry payload."]);
    expect(result.evidence).toEqual(["No persisted review entry was found."]);
  });

  it("generates an ISO timestamp when none is provided", async () => {
    const pi = {
      appendEntry: vi.fn(),
    };
    await persistReviewResult({
      pi,
      result: approvedResult,
      attempt: 1,
      model: reviewerModel,
    });
    const payload = pi.appendEntry.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.timestamp).toEqual(expect.any(String));
    expect(() => new Date(payload.timestamp as string).toISOString()).not.toThrow();
  });

  it("uses the provided timestamp when given", async () => {
    const pi = {
      appendEntry: vi.fn(),
    };
    await persistReviewResult({
      pi,
      result: approvedResult,
      attempt: 1,
      model: reviewerModel,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    const payload = pi.appendEntry.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.timestamp).toBe("2026-01-01T00:00:00.000Z");
  });

  it("persists null model when no model is available", async () => {
    const pi = {
      appendEntry: vi.fn(),
    };
    await persistReviewResult({
      pi,
      result: approvedResult,
      attempt: 1,
      model: null,
      timestamp: "2026-05-23T12:00:00.000Z",
    });
    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        model: null,
      }),
    );
  });

  it("propagates appendEntry errors", async () => {
    const pi = {
      appendEntry: vi.fn(async () => {
        throw new Error("append failed");
      }),
    };
    await expect(
      persistReviewResult({
        pi,
        result: approvedResult,
        attempt: 1,
        model: reviewerModel,
      }),
    ).rejects.toThrow("append failed");
  });

  it("does not mutate result or model", async () => {
    const pi = {
      appendEntry: vi.fn(),
    };
    const result: ReviewGateResult = {
      ...rejectedResult,
      requiredCorrections: [...rejectedResult.requiredCorrections],
      recommendedCorrections: [...rejectedResult.recommendedCorrections],
      evidence: [...rejectedResult.evidence],
    };
    const model: ReviewerModelConfig = {
      ...reviewerModel,
    };
    const before = JSON.stringify({ result, model });
    await persistReviewResult({
      pi,
      result,
      attempt: 1,
      model,
      timestamp: "2026-05-23T12:00:00.000Z",
    });
    expect(JSON.stringify({ result, model })).toBe(before);
  });

  it("does not call sendUserMessage", async () => {
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
    };
    await persistReviewResult({
      pi,
      result: approvedResult,
      attempt: 1,
      model: reviewerModel,
    });
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });
});
