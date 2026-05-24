import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  CORRECTION_REQUEST_MARKER,
  CUSTOM_ENTRY_FINAL_FAILURE,
  CUSTOM_ENTRY_REVIEW_RESULT,
  CUSTOM_ENTRY_REVIEW_SKIPPED,
} from "../src/constants.js";
import extensionFactory from "../src/index.js";
import type { ReviewGateAgentEndAPI } from "../src/reviewer.js";
import { getWarningMessage, handleAgentEnd } from "../src/reviewer.js";
import { createRuntimeState } from "../src/state.js";
import type { ReviewGateConfig, ReviewGateResult, RuntimeState } from "../src/types.js";

// ---------------------------------------------------------------------------
// Entrypoint smoke test (preserved)
// ---------------------------------------------------------------------------

describe("pi-review-gate entrypoint", () => {
  it("exports a default extension factory", () => {
    expect(typeof extensionFactory).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// handleAgentEnd early returns
// ---------------------------------------------------------------------------

describe("handleAgentEnd early returns", () => {
  // -- fixture helpers --

  function createFreshState(): RuntimeState {
    return createRuntimeState();
  }

  function createTestPi() {
    return {
      appendEntry: vi.fn() as ReviewGateAgentEndAPI["appendEntry"],
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
  }

  const defaultEvent = {
    messages: [
      { role: "user", content: "Implement step 15.1." },
      { role: "assistant", content: "Done." },
    ],
  };

  // -- enabled: false --

  it("returns early when review gate is disabled", async () => {
    const state = createFreshState();
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: { messages: [{ role: "user", content: "prompt" }] },
      loadConfig: async () => ({ ...defaultConfig, enabled: false }),
    });

    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(pi.exec).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  it("does not mutate cycle state when disabled", async () => {
    const state = createFreshState();
    state.correctionCycle = 5;
    state.lastOriginalUserPromptHash = "existing-hash";
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => ({ ...defaultConfig, enabled: false }),
    });

    expect(state.correctionCycle).toBe(5);
    expect(state.lastOriginalUserPromptHash).toBe("existing-hash");
    expect(state.activeReview).toBe(false);
  });

  // -- activeReview: true --

  it("returns early when a review is already active", async () => {
    const state = createFreshState();
    state.activeReview = true;
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: { messages: [{ role: "user", content: "prompt" }] },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(pi.exec).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(true);
  });

  it("preserves state when a review is already active", async () => {
    const state = createFreshState();
    state.activeReview = true;
    state.correctionCycle = 3;
    state.lastOriginalUserPromptHash = "some-hash";
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(state.correctionCycle).toBe(3);
    expect(state.lastOriginalUserPromptHash).toBe("some-hash");
    expect(pi.appendEntry).not.toHaveBeenCalled();
  });

  // -- event.messages edge cases --

  it("handles event.messages undefined defensively", async () => {
    const state = createFreshState();
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: { messages: undefined },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(pi.appendEntry).toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  it("handles event.messages null defensively", async () => {
    const state = createFreshState();
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: { messages: null as unknown as unknown[] },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(pi.appendEntry).toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  it("handles event.messages not an array defensively", async () => {
    const state = createFreshState();
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: { messages: "not-an-array" as unknown as unknown[] },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(pi.appendEntry).toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  it("handles event.messages as empty array", async () => {
    const state = createFreshState();
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: { messages: [] },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(pi.appendEntry).toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  // -- cycle state: real user prompt --

  it("resets correction cycle for a real user prompt", async () => {
    const state = createFreshState();
    state.correctionCycle = 2;
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: { messages: [{ role: "user", content: "New real prompt" }] },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(state.correctionCycle).toBe(0);
    expect(state.lastOriginalUserPromptHash).toEqual(expect.any(String));
    expect(state.lastOriginalUserPromptHash).not.toBe("");
  });

  it("preserves hash for identical real prompts across calls", async () => {
    const state1 = createFreshState();
    const pi1 = createTestPi();

    await handleAgentEnd({
      pi: pi1,
      state: state1,
      event: { messages: [{ role: "user", content: "Same prompt" }] },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    const hash1 = state1.lastOriginalUserPromptHash;

    const state2 = createFreshState();
    const pi2 = createTestPi();

    await handleAgentEnd({
      pi: pi2,
      state: state2,
      event: { messages: [{ role: "user", content: "Same prompt" }] },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(state2.lastOriginalUserPromptHash).toBe(hash1);
  });

  // -- cycle state: injected correction prompt --

  it("increments correction cycle for an injected prompt", async () => {
    const state = createFreshState();
    state.correctionCycle = 1;
    state.lastOriginalUserPromptHash = "some-hash";
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [
          {
            role: "user",
            content: "[pi-review-gate:correction-request] Please fix the implementation.",
          },
        ],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(state.correctionCycle).toBe(2);
    expect(state.lastOriginalUserPromptHash).toBe("some-hash");
  });

  // -- reviewerModel: null --

  it("persists skip when reviewer model is not configured", async () => {
    const state = createFreshState();
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Implement step 15.1." }],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_SKIPPED,
      expect.objectContaining({
        reason: "Reviewer model is not configured.",
        model: null,
      }),
    );
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(pi.exec).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  it("includes a valid ISO timestamp in skip payload", async () => {
    const state = createFreshState();
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: { messages: [{ role: "user", content: "prompt" }] },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    const calls = vi.mocked(pi.appendEntry).mock.calls;
    const payload = calls[0]?.[1] as Record<string, unknown>;
    expect(payload.timestamp).toEqual(expect.any(String));
    expect(() => new Date(payload.timestamp as string).toISOString()).not.toThrow();
  });

  // -- skip: double-check no heavy work --

  it("does not call sendUserMessage during skip", async () => {
    const state = createFreshState();
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not call exec during skip", async () => {
    const state = createFreshState();
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(pi.exec).not.toHaveBeenCalled();
  });

  // -- appendEntry failure during skip --

  it("releases activeReview when skip persistence fails", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(async () => {
        throw new Error("append failed");
      }) as ReviewGateAgentEndAPI["appendEntry"],
      exec: vi.fn(),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: { messages: [{ role: "user", content: "prompt" }] },
        loadConfig: async () => ({
          ...defaultConfig,
          enabled: true,
          reviewerModel: null,
        }),
      }),
    ).rejects.toThrow("append failed");

    expect(state.activeReview).toBe(false);
  });

  it("propagates appendEntry error while releasing activeReview", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(async () => {
        throw new Error("persistence error");
      }) as ReviewGateAgentEndAPI["appendEntry"],
      exec: vi.fn(),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: defaultEvent,
        loadConfig: async () => ({
          ...defaultConfig,
          enabled: true,
          reviewerModel: null,
        }),
      }),
    ).rejects.toThrow("persistence error");

    expect(state.activeReview).toBe(false);
  });

  // -- config.loadConfig called --

  it("calls loadConfig exactly once", async () => {
    const state = createFreshState();
    const pi = createTestPi();
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      enabled: false,
    }));

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig,
    });

    expect(loadConfig).toHaveBeenCalledTimes(1);
  });

  // -- beginReview guard --

  it("calls beginReview when config is enabled and no active review", async () => {
    const state = createFreshState();
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(pi.appendEntry).toHaveBeenCalled();
  });

  it("does not call beginReview when already active", async () => {
    const state = createFreshState();
    state.activeReview = true;
    const pi = createTestPi();

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: null,
      }),
    });

    expect(state.activeReview).toBe(true);
    expect(pi.appendEntry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 15.2 — Approved review orchestration
// ---------------------------------------------------------------------------

describe("handleAgentEnd approved review orchestration", () => {
  // -- fixture helpers --

  function createFreshState(): RuntimeState {
    return createRuntimeState();
  }

  const configWithReviewerModel: ReviewGateConfig = {
    ...defaultConfig,
    enabled: true,
    reviewerModel: {
      provider: "test-provider",
      id: "test-model",
      thinkingLevel: "high",
    },
  };

  function createGitPi() {
    return {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async (command: string, args: string[]) => {
        const joinedArgs = args.join(" ");
        if (command !== "git") {
          throw new Error(`Unexpected command: ${command}`);
        }
        if (joinedArgs === "status --short") {
          return { stdout: " M src/reviewer.ts\n" };
        }
        if (joinedArgs === "diff --stat") {
          return { stdout: " src/reviewer.ts | 10 ++++++++++\n" };
        }
        if (joinedArgs === "diff") {
          return {
            stdout: "diff --git a/src/reviewer.ts b/src/reviewer.ts\n",
          };
        }
        throw new Error(`Unexpected git args: ${joinedArgs}`);
      }),
    };
  }

  function createApprovingModelRegistry() {
    return {
      find: vi.fn(async (_provider?: string, _id?: string) => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () =>
          JSON.stringify({
            approved: true,
            severity: "pass",
            summary: "Delivery satisfies the request.",
            requiredCorrections: [],
            recommendedCorrections: [],
            evidence: ["Reviewer approved the delivery."],
            confidence: "high",
          }),
        ),
      })),
    };
  }

  function createRejectingModelRegistry() {
    return {
      find: vi.fn(async (_provider?: string, _id?: string) => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () =>
          JSON.stringify({
            approved: false,
            severity: "blocking",
            summary: "Required implementation is missing.",
            requiredCorrections: ["Fix the missing behavior."],
            recommendedCorrections: [],
            evidence: ["The diff does not include the required change."],
            confidence: "high",
          }),
        ),
      })),
    };
  }

  const defaultEvent = {
    messages: [
      { role: "user", content: "Implement step 15.2." },
      { role: "assistant", content: "Done." },
    ],
  };

  // ---- approved ----

  it("collects git, runs reviewer, persists approved result, and sends no follow-up", async () => {
    const state = createFreshState();
    const pi = createGitPi();
    const complete = vi.fn(async () =>
      JSON.stringify({
        approved: true,
        severity: "pass",
        summary: "Delivery satisfies the request.",
        requiredCorrections: [],
        recommendedCorrections: [],
        evidence: ["Reviewer approved the delivery."],
        confidence: "high",
      }),
    );
    const modelRegistry = {
      find: vi.fn(async () => ({
        provider: "test-provider",
        id: "test-model",
        complete,
      })),
    };

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => configWithReviewerModel,
      context: { modelRegistry },
    });

    expect(pi.exec).toHaveBeenCalledWith("git", ["status", "--short"], expect.any(Object));
    expect(pi.exec).toHaveBeenCalledWith("git", ["diff", "--stat"], expect.any(Object));
    expect(pi.exec).toHaveBeenCalledWith("git", ["diff"], expect.any(Object));

    expect(modelRegistry.find).toHaveBeenCalledWith("test-provider", "test-model");

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining("mandatory delivery reviewer"),
        userPrompt: expect.stringContaining("Review the following delivery."),
        timeoutMs: expect.any(Number),
        thinkingLevel: "high",
      }),
    );

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        attempt: 0,
        model: {
          provider: "test-provider",
          id: "test-model",
          thinkingLevel: "high",
        },
        result: expect.objectContaining({
          approved: true,
          severity: "pass",
        }),
      }),
    );

    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  // ---- branch / session ----

  it("uses session branch when available", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const getBranch = vi.fn(async () => [
      {
        type: "message",
        message: { role: "user", content: "Original branch prompt" },
      },
    ]);
    const modelRegistry = createApprovingModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Current prompt" }],
      },
      loadConfig: async () => configWithReviewerModel,
      context: {
        sessionManager: { getBranch },
        modelRegistry,
      },
    });

    expect(getBranch).toHaveBeenCalled();
    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({ approved: true }),
      }),
    );
    expect(state.activeReview).toBe(false);
  });

  it("does not throw when sessionManager is absent", async () => {
    const state = createFreshState();
    const pi = createGitPi();
    const modelRegistry = createApprovingModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => configWithReviewerModel,
      context: { modelRegistry },
    });

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({ approved: true }),
      }),
    );
  });

  it("treats non-array getBranch result as absent", async () => {
    const state = createFreshState();
    const pi = createGitPi();
    const getBranch = vi.fn(async () => "not-an-array") as unknown as () => unknown[];
    const modelRegistry = createApprovingModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => configWithReviewerModel,
      context: {
        sessionManager: { getBranch },
        modelRegistry,
      },
    });

    expect(getBranch).toHaveBeenCalled();
    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({ approved: true }),
      }),
    );
  });

  // ---- rejected (no follow-up yet) ----

  it("persists rejected result without follow-up in warn mode", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const modelRegistry = createRejectingModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Prompt" }],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        mode: "warn",
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
        },
      }),
      context: { modelRegistry },
    });

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: false,
          severity: "blocking",
        }),
      }),
    );

    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  // ---- error release ----

  it("releases activeReview when git collection fails", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => {
        throw new Error("git failed");
      }),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...defaultConfig,
          enabled: true,
          reviewerModel: {
            provider: "test-provider",
            id: "test-model",
          },
        }),
        context: {
          modelRegistry: { find: vi.fn() },
        },
      }),
    ).rejects.toThrow("git failed");

    expect(state.activeReview).toBe(false);
  });

  it("releases activeReview when model/reviewer fails", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const modelRegistry = {
      find: vi.fn(async () => {
        throw new Error("model not found");
      }),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...defaultConfig,
          enabled: true,
          reviewerModel: {
            provider: "test-provider",
            id: "test-model",
          },
        }),
        context: { modelRegistry },
      }),
    ).rejects.toThrow("model not found");

    expect(state.activeReview).toBe(false);
  });

  it("releases activeReview when result persistence fails", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(async () => {
        throw new Error("append failed");
      }),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const modelRegistry = createApprovingModelRegistry();

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...defaultConfig,
          enabled: true,
          reviewerModel: {
            provider: "test-provider",
            id: "test-model",
          },
        }),
        context: { modelRegistry },
      }),
    ).rejects.toThrow("append failed");

    expect(state.activeReview).toBe(false);
  });

  it("releases activeReview when sessionManager.getBranch throws", async () => {
    const state = createFreshState();
    const pi = createGitPi();
    const modelRegistry = createApprovingModelRegistry();

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: defaultEvent,
        loadConfig: async () => configWithReviewerModel,
        context: {
          sessionManager: {
            getBranch: vi.fn(async () => {
              throw new Error("branch failed");
            }) as unknown as () => unknown[],
          },
          modelRegistry,
        },
      }),
    ).rejects.toThrow("branch failed");

    expect(state.activeReview).toBe(false);
  });

  // ---- attempt tracking ----

  it("persists attempt from state.correctionCycle", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const modelRegistry = createApprovingModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => configWithReviewerModel,
      context: { modelRegistry },
    });

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        attempt: 0,
        result: expect.objectContaining({ approved: true }),
      }),
    );
  });

  it("does not call sendUserMessage for approved review", async () => {
    const state = createFreshState();
    const pi = createGitPi();
    const modelRegistry = createApprovingModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: defaultEvent,
      loadConfig: async () => configWithReviewerModel,
      context: { modelRegistry },
    });

    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not call sendUserMessage for rejected review in warn mode", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const modelRegistry = createRejectingModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Prompt" }],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        mode: "warn",
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
        },
      }),
      context: { modelRegistry },
    });

    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 15.3 — Block rejection orchestration with follow-up
// ---------------------------------------------------------------------------

describe("handleAgentEnd block rejection with follow-up", () => {
  function createFreshState(): RuntimeState {
    return createRuntimeState();
  }

  const rejectedReviewResult = {
    approved: false,
    severity: "blocking",
    summary: "Required implementation is missing.",
    requiredCorrections: ["Implement the missing behavior."],
    recommendedCorrections: ["Add tests for the rejected path."],
    evidence: ["The diff does not include the required implementation."],
    confidence: "high",
  } as const;

  function createGitPiMock() {
    return {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async (command: string, args: string[]) => {
        const joinedArgs = args.join(" ");
        if (command !== "git") {
          throw new Error(`Unexpected command: ${command}`);
        }
        if (joinedArgs === "status --short") {
          return { stdout: " M src/reviewer.ts\n" };
        }
        if (joinedArgs === "diff --stat") {
          return { stdout: " src/reviewer.ts | 10 ++++++++++\n" };
        }
        if (joinedArgs === "diff") {
          return {
            stdout: "diff --git a/src/reviewer.ts b/src/reviewer.ts\n",
          };
        }
        throw new Error(`Unexpected git args: ${joinedArgs}`);
      }),
    };
  }

  function createRejectedModelRegistry() {
    const complete = vi.fn(async () => JSON.stringify(rejectedReviewResult));
    return {
      complete,
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    };
  }

  const blockConfig: ReviewGateConfig = {
    ...defaultConfig,
    enabled: true,
    mode: "block",
    maxCorrectionCycles: 2,
    reviewerModel: {
      provider: "test-provider",
      id: "test-model",
      thinkingLevel: "high",
    },
  };

  // ---- block mode rejection within limit ----

  it("persists rejected result and sends mandatory follow-up in block mode", async () => {
    const state = createFreshState();
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [
          { role: "user", content: "Implement step 15.3." },
          { role: "assistant", content: "Done." },
        ],
      },
      loadConfig: async () => blockConfig,
      context: { modelRegistry },
    });

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: false,
          severity: "blocking",
        }),
      }),
    );

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    const [message, options] = pi.sendUserMessage.mock.calls[0];
    expect(message.startsWith(CORRECTION_REQUEST_MARKER)).toBe(true);
    expect(message).toContain("# Mandatory Review Corrections");
    expect(message).toContain("Implement the missing behavior.");
    expect(message).toContain("The diff does not include the required implementation.");
    expect(options).toEqual({ deliverAs: "followUp" });
    expect(state.activeReview).toBe(false);
  });

  it("does not increment correctionCycle manually after sending follow-up", async () => {
    const state = createFreshState();
    state.correctionCycle = 0;
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Prompt" }],
      },
      loadConfig: async () => blockConfig,
      context: { modelRegistry },
    });

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(state.correctionCycle).toBe(0);
    expect(state.activeReview).toBe(false);
  });

  it("throws when sendUserMessage is unavailable in block mode with cycles available", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
      // sendUserMessage intentionally absent
    };
    const { modelRegistry } = createRejectedModelRegistry();

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => blockConfig,
        context: { modelRegistry },
      }),
    ).rejects.toThrow("Pi sendUserMessage API is not available.");

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: false,
        }),
      }),
    );
    expect(state.activeReview).toBe(false);
  });

  it("does not send follow-up when correction cycle limit is already reached", async () => {
    const state = createFreshState();
    state.correctionCycle = 1;
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [
          {
            role: "user",
            content: `${CORRECTION_REQUEST_MARKER}\n# Mandatory Review Corrections\nPlease fix.`,
          },
        ],
      },
      loadConfig: async () => blockConfig,
      context: { modelRegistry },
    });

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: false,
        }),
      }),
    );
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_FINAL_FAILURE,
      expect.objectContaining({
        reason: "Maximum correction cycles exceeded.",
      }),
    );
    expect(state.activeReview).toBe(false);
  });

  it("does not send follow-up for rejected result in warn mode in this step", async () => {
    const state = createFreshState();
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Prompt" }],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        mode: "warn",
        maxCorrectionCycles: 2,
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
        },
      }),
      context: { modelRegistry },
    });

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: false,
        }),
      }),
    );
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Step 15.4 — Warn rejection orchestration
// ---------------------------------------------------------------------------

describe("handleAgentEnd warn rejection orchestration", () => {
  function createFreshState(): RuntimeState {
    return createRuntimeState();
  }

  const rejectedReviewResult: ReviewGateResult = {
    approved: false,
    severity: "major",
    summary: "Delivery has issues but warn mode should not block.",
    requiredCorrections: ["Fix the missing behavior."],
    recommendedCorrections: ["Add tests for the warn path."],
    evidence: ["The diff does not include the required implementation."],
    confidence: "high",
  };

  function createGitPiMock() {
    return {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async (command: string, args: string[]) => {
        const joinedArgs = args.join(" ");
        if (command !== "git") {
          throw new Error(`Unexpected command: ${command}`);
        }
        if (joinedArgs === "status --short") {
          return { stdout: " M src/reviewer.ts\n" };
        }
        if (joinedArgs === "diff --stat") {
          return { stdout: " src/reviewer.ts | 10 ++++++++++\n" };
        }
        if (joinedArgs === "diff") {
          return {
            stdout: "diff --git a/src/reviewer.ts b/src/reviewer.ts\n",
          };
        }
        throw new Error(`Unexpected git args: ${joinedArgs}`);
      }),
    };
  }

  function createRejectedModelRegistry(result: ReviewGateResult = rejectedReviewResult) {
    const complete = vi.fn(async () => JSON.stringify(result));
    return {
      complete,
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    };
  }

  // ---- rejected in warn mode: persistence + no follow-up ----

  it("persists rejected result without sending follow-up in warn mode", async () => {
    const state = createFreshState();
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Implement step 15.4." }],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        mode: "warn",
        maxCorrectionCycles: 2,
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
          thinkingLevel: "high",
        },
        ui: {
          ...defaultConfig.ui,
          notifyOnFail: false,
        },
      }),
      context: {
        modelRegistry,
      },
    });

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: false,
          severity: "major",
          requiredCorrections: ["Fix the missing behavior."],
          recommendedCorrections: ["Add tests for the warn path."],
          evidence: ["The diff does not include the required implementation."],
        }),
      }),
    );
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.correctionCycle).toBe(0);
    expect(state.activeReview).toBe(false);
  });

  // ---- optional notification when ui is available and enabled ----

  it("notifies warning when ui notify is available and notifyOnFail is enabled", async () => {
    const state = createFreshState();
    const pi = createGitPiMock();
    const ui = {
      notify: vi.fn(),
    };
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Prompt" }],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        mode: "warn",
        maxCorrectionCycles: 2,
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
        },
        ui: {
          ...defaultConfig.ui,
          notifyOnFail: true,
        },
      }),
      context: {
        modelRegistry,
        ui,
      },
    });

    expect(ui.notify).toHaveBeenCalledWith({
      title: "Review gate warning",
      message: "Delivery has issues but warn mode should not block.",
      severity: "warning",
    });
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  // ---- graceful when ui notify absent ----

  it("does not fail when ui notify is unavailable in warn mode", async () => {
    const state = createFreshState();
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...defaultConfig,
          enabled: true,
          mode: "warn",
          maxCorrectionCycles: 2,
          reviewerModel: {
            provider: "test-provider",
            id: "test-model",
          },
          ui: {
            ...defaultConfig.ui,
            notifyOnFail: true,
          },
        }),
        context: {
          modelRegistry,
        },
      }),
    ).resolves.toBeUndefined();

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: false,
        }),
      }),
    );
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  // ---- empty summary fallback ----

  it("uses a fallback warning message when reviewer summary is empty", () => {
    const resultWithEmptySummary: ReviewGateResult = {
      ...rejectedReviewResult,
      summary: "",
    };

    expect(getWarningMessage(resultWithEmptySummary)).toBe("Review was not approved.");
  });

  it("uses reviewer summary when non-empty", () => {
    expect(getWarningMessage(rejectedReviewResult)).toBe(
      "Delivery has issues but warn mode should not block.",
    );
  });

  // ---- no final failure even at cycle limit ----

  it("does not create final failure in warn mode even when correction cycle limit is reached", async () => {
    const state = createFreshState();
    state.correctionCycle = 2;
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Prompt" }],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        mode: "warn",
        maxCorrectionCycles: 2,
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
        },
      }),
      context: {
        modelRegistry,
      },
    });

    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: false,
        }),
      }),
    );
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalledWith(CUSTOM_ENTRY_FINAL_FAILURE, expect.anything());
    expect(state.activeReview).toBe(false);
  });

  // ---- block mode preserved ----

  it("preserves block mode follow-up behavior", async () => {
    const state = createFreshState();
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Prompt" }],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        mode: "block",
        maxCorrectionCycles: 2,
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
        },
      }),
      context: {
        modelRegistry,
      },
    });

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    const [message, options] = pi.sendUserMessage.mock.calls[0];
    expect(message.startsWith(CORRECTION_REQUEST_MARKER)).toBe(true);
    expect(options).toEqual({ deliverAs: "followUp" });
  });
});

// ---------------------------------------------------------------------------
// Step 15.5 — Maximum correction cycles final failure
// ---------------------------------------------------------------------------

describe("handleAgentEnd maximum correction cycles", () => {
  function createFreshState(): RuntimeState {
    return createRuntimeState();
  }

  const rejectedReviewResult = {
    approved: false,
    severity: "blocking",
    summary: "Required implementation is still missing.",
    requiredCorrections: ["Implement the missing behavior."],
    recommendedCorrections: ["Add tests for the correction path."],
    evidence: ["The diff still does not include the required implementation."],
    confidence: "high",
  } as const;

  function createGitPiMock() {
    return {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async (command: string, args: string[]) => {
        const joinedArgs = args.join(" ");
        if (command !== "git") {
          throw new Error(`Unexpected command: ${command}`);
        }
        if (joinedArgs === "status --short") {
          return { stdout: " M src/reviewer.ts\n" };
        }
        if (joinedArgs === "diff --stat") {
          return { stdout: " src/reviewer.ts | 10 ++++++++++\n" };
        }
        if (joinedArgs === "diff") {
          return {
            stdout: "diff --git a/src/reviewer.ts b/src/reviewer.ts\n",
          };
        }
        throw new Error(`Unexpected git args: ${joinedArgs}`);
      }),
    };
  }

  function createRejectedModelRegistry() {
    const complete = vi.fn(async () => JSON.stringify(rejectedReviewResult));
    return {
      complete,
      modelRegistry: {
        find: vi.fn(async () => ({
          provider: "test-provider",
          id: "test-model",
          complete,
        })),
      },
    };
  }

  const blockConfig: ReviewGateConfig = {
    ...defaultConfig,
    enabled: true,
    mode: "block",
    maxCorrectionCycles: 2,
    reviewerModel: {
      provider: "test-provider",
      id: "test-model",
      thinkingLevel: "high",
    },
    ui: {
      ...defaultConfig.ui,
      notifyOnFail: true,
    },
  };

  // ---- final failure persistence at cycle limit ----

  it("persists final failure and sends no follow-up when block cycle limit is reached", async () => {
    const state = createFreshState();
    state.correctionCycle = 1;
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [
          {
            role: "user",
            content: `${CORRECTION_REQUEST_MARKER}\n# Mandatory Review Corrections\nPlease fix.`,
          },
        ],
      },
      loadConfig: async () => blockConfig,
      context: { modelRegistry },
    });

    // Result is persisted
    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: false,
          severity: "blocking",
        }),
      }),
    );

    // Final failure is persisted with correct payload
    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_FINAL_FAILURE,
      expect.objectContaining({
        attempt: 2,
        maxCorrectionCycles: 2,
        model: {
          provider: "test-provider",
          id: "test-model",
          thinkingLevel: "high",
        },
        reason: "Maximum correction cycles exceeded.",
        result: expect.objectContaining({
          approved: false,
          severity: "blocking",
          requiredCorrections: ["Implement the missing behavior."],
          recommendedCorrections: ["Add tests for the correction path."],
          evidence: ["The diff still does not include the required implementation."],
        }),
      }),
    );

    // No follow-up is sent
    expect(pi.sendUserMessage).not.toHaveBeenCalled();

    // Active review is released
    expect(state.activeReview).toBe(false);
  });

  // ---- block follow-up preserved within limit ----

  it("preserves block follow-up behavior when cycles are still available", async () => {
    const state = createFreshState();
    state.correctionCycle = 1;
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Prompt" }],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        mode: "block",
        maxCorrectionCycles: 2,
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
        },
      }),
      context: { modelRegistry },
    });

    // Follow-up is sent
    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    const [message, options] = pi.sendUserMessage.mock.calls[0];
    expect(message.startsWith(CORRECTION_REQUEST_MARKER)).toBe(true);
    expect(options).toEqual({ deliverAs: "followUp" });

    // No final failure is created
    expect(pi.appendEntry).not.toHaveBeenCalledWith(CUSTOM_ENTRY_FINAL_FAILURE, expect.anything());

    expect(state.activeReview).toBe(false);
  });

  // ---- warn mode does not create final failure ----

  it("does not create final failure in warn mode even when cycle limit is reached", async () => {
    const state = createFreshState();
    state.correctionCycle = 2;
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [{ role: "user", content: "Prompt" }],
      },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        mode: "warn",
        maxCorrectionCycles: 2,
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
        },
        ui: {
          ...defaultConfig.ui,
          notifyOnFail: false,
        },
      }),
      context: {
        modelRegistry,
      },
    });

    // Result is persisted
    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: false,
        }),
      }),
    );

    // No follow-up
    expect(pi.sendUserMessage).not.toHaveBeenCalled();

    // No final failure
    expect(pi.appendEntry).not.toHaveBeenCalledWith(CUSTOM_ENTRY_FINAL_FAILURE, expect.anything());

    expect(state.activeReview).toBe(false);
  });

  // ---- optional notification when ui is available ----

  it("optionally notifies final failure when ui notify is available and enabled", async () => {
    const state = createFreshState();
    state.correctionCycle = 1;
    const pi = createGitPiMock();
    const ui = {
      notify: vi.fn(),
    };
    const { modelRegistry } = createRejectedModelRegistry();

    await handleAgentEnd({
      pi,
      state,
      event: {
        messages: [
          {
            role: "user",
            content: `${CORRECTION_REQUEST_MARKER}\n# Mandatory Review Corrections\nPlease fix.`,
          },
        ],
      },
      loadConfig: async () => blockConfig,
      context: {
        modelRegistry,
        ui,
      },
    });

    // Notification is called with correct params
    expect(ui.notify).toHaveBeenCalledWith({
      title: "Review gate stopped",
      message: "Maximum correction cycles exceeded.",
      severity: "error",
    });

    // No follow-up
    expect(pi.sendUserMessage).not.toHaveBeenCalled();

    expect(state.activeReview).toBe(false);
  });

  // ---- graceful when ui notify absent ----

  it("does not fail when ui notify is unavailable for final failure", async () => {
    const state = createFreshState();
    state.correctionCycle = 1;
    const pi = createGitPiMock();
    const { modelRegistry } = createRejectedModelRegistry();

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [
            {
              role: "user",
              content: `${CORRECTION_REQUEST_MARKER}\n# Mandatory Review Corrections\nPlease fix.`,
            },
          ],
        },
        loadConfig: async () => blockConfig,
        context: {
          modelRegistry,
        },
      }),
    ).resolves.toBeUndefined();

    // Final failure is still persisted
    expect(pi.appendEntry).toHaveBeenCalledWith(CUSTOM_ENTRY_FINAL_FAILURE, expect.anything());

    // No follow-up
    expect(pi.sendUserMessage).not.toHaveBeenCalled();

    expect(state.activeReview).toBe(false);
  });

  // ---- error propagation when final failure persistence fails ----

  it("releases activeReview when final failure persistence fails", async () => {
    const state = createFreshState();
    state.correctionCycle = 1;
    const pi = {
      ...createGitPiMock(),
      appendEntry: vi
        .fn()
        .mockResolvedValueOnce(undefined) // result persistence succeeds
        .mockRejectedValueOnce(new Error("final failure append failed")), // final failure fails
    };
    const { modelRegistry } = createRejectedModelRegistry();

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [
            {
              role: "user",
              content: `${CORRECTION_REQUEST_MARKER}\n# Mandatory Review Corrections\nPlease fix.`,
            },
          ],
        },
        loadConfig: async () => ({
          ...defaultConfig,
          enabled: true,
          mode: "block",
          maxCorrectionCycles: 2,
          reviewerModel: {
            provider: "test-provider",
            id: "test-model",
          },
        }),
        context: {
          modelRegistry,
        },
      }),
    ).rejects.toThrow("final failure append failed");

    // Result was persisted before the failure
    expect(pi.appendEntry).toHaveBeenCalledWith(CUSTOM_ENTRY_REVIEW_RESULT, expect.anything());

    // Active review is released even on error
    expect(state.activeReview).toBe(false);
  });

  // ---- notification failure does not prevent releasing activeReview ----

  it("releases activeReview when notification throws during final failure", async () => {
    const state = createFreshState();
    state.correctionCycle = 1;
    const pi = createGitPiMock();
    const ui = {
      notify: vi.fn(async () => {
        throw new Error("notification failed");
      }),
    };
    const { modelRegistry } = createRejectedModelRegistry();

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [
            {
              role: "user",
              content: `${CORRECTION_REQUEST_MARKER}\n# Mandatory Review Corrections\nPlease fix.`,
            },
          ],
        },
        loadConfig: async () => blockConfig,
        context: {
          modelRegistry,
          ui,
        },
      }),
    ).rejects.toThrow("notification failed");

    // Final failure was persisted
    expect(pi.appendEntry).toHaveBeenCalledWith(CUSTOM_ENTRY_FINAL_FAILURE, expect.anything());

    // No follow-up
    expect(pi.sendUserMessage).not.toHaveBeenCalled();

    // Active review is released
    expect(state.activeReview).toBe(false);
  });
});
