import { describe, expect, it, vi } from "vitest";
import { registerCommands } from "../src/commands.js";
import { defaultConfig } from "../src/config.js";
import {
  COMMAND_REVIEW_GATE,
  COMMAND_REVIEW_GATE_MODEL,
  COMMAND_REVIEW_GATE_OFF,
  COMMAND_REVIEW_GATE_ON,
  COMMAND_REVIEW_GATE_STATUS,
  CORRECTION_REQUEST_MARKER,
  CUSTOM_ENTRY_FINAL_FAILURE,
  CUSTOM_ENTRY_REVIEW_RESULT,
  CUSTOM_ENTRY_REVIEW_SKIPPED,
  REVIEW_ERROR_ENTRY_TYPE,
} from "../src/constants.js";
import extensionFactory from "../src/index.js";
import type { ModelRegistryAPI } from "../src/model.js";
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

  it("continues review and releases activeReview when git exec throws an unexpected error", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => {
        throw new Error("git failed");
      }),
    };
    const complete = vi.fn(async () =>
      JSON.stringify({
        approved: true,
        severity: "pass",
        summary: "ok",
        requiredCorrections: [],
        recommendedCorrections: [],
        evidence: [],
        confidence: "medium",
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
      event: { messages: [{ role: "user", content: "Prompt" }] },
      loadConfig: async () => ({
        ...defaultConfig,
        enabled: true,
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
        },
      }),
      context: { modelRegistry },
    });

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Git context unavailable: git failed"),
      }),
    );
    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: true,
        }),
      }),
    );
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  it("persists error and propagates when model/reviewer fails in block mode", async () => {
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

    expect(pi.appendEntry).toHaveBeenCalledWith(
      REVIEW_ERROR_ENTRY_TYPE,
      expect.objectContaining({
        phase: "reviewer",
        attempt: 0,
        error: expect.objectContaining({
          message: "model not found",
        }),
      }),
    );
    expect(pi.appendEntry).not.toHaveBeenCalledWith(CUSTOM_ENTRY_REVIEW_RESULT, expect.anything());
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
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
// Step 17.1 — Git unavailable context handling
// ---------------------------------------------------------------------------

describe("handleAgentEnd with unavailable git context", () => {
  function createFreshState(): RuntimeState {
    return createRuntimeState();
  }

  const configWithReviewerModel: ReviewGateConfig = {
    ...defaultConfig,
    enabled: true,
    reviewerModel: {
      provider: "test-provider",
      id: "test-model",
    },
  };

  it("continues review and persists approved result in a non-git directory", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => {
        throw {
          stderr: "fatal: not a git repository (or any of the parent directories): .git",
        };
      }),
    };
    const complete = vi.fn(async () =>
      JSON.stringify({
        approved: true,
        severity: "pass",
        summary: "Delivery satisfies the request.",
        requiredCorrections: [],
        recommendedCorrections: [],
        evidence: ["Review completed even without Git context."],
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
      event: {
        messages: [
          { role: "user", content: "Implement step 17.1." },
          { role: "assistant", content: "Done." },
        ],
      },
      loadConfig: async () => configWithReviewerModel,
      context: { modelRegistry },
    });

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Git context unavailable: not a git repository."),
      }),
    );
    expect(pi.appendEntry).toHaveBeenCalledWith(
      CUSTOM_ENTRY_REVIEW_RESULT,
      expect.objectContaining({
        result: expect.objectContaining({
          approved: true,
        }),
      }),
    );
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  it("continues review with an unexpected git error represented in context", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => {
        throw {
          stderr: "permission denied",
        };
      }),
    };
    const complete = vi.fn(async () =>
      JSON.stringify({
        approved: true,
        severity: "pass",
        summary: "ok",
        requiredCorrections: [],
        recommendedCorrections: [],
        evidence: [],
        confidence: "medium",
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
      event: {
        messages: [{ role: "user", content: "Prompt" }],
      },
      loadConfig: async () => configWithReviewerModel,
      context: { modelRegistry },
    });

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining("Git context unavailable: permission denied"),
      }),
    );
    expect(state.activeReview).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Step 17.2 — Model failure and timeout handling
// ---------------------------------------------------------------------------

describe("handleAgentEnd model failure handling", () => {
  function createFreshState(): RuntimeState {
    return createRuntimeState();
  }

  const configWithReviewerModel: ReviewGateConfig = {
    ...defaultConfig,
    enabled: true,
    reviewerModel: {
      provider: "test-provider",
      id: "test-model",
    },
  };

  // -- model failure in block mode --

  it("persists and propagates model failure in block mode", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const modelRegistry = {
      find: vi.fn(async () => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () => {
          throw new Error("model failed");
        }),
      })),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...configWithReviewerModel,
          mode: "block",
        }),
        context: { modelRegistry },
      }),
    ).rejects.toThrow("model failed");

    expect(pi.appendEntry).toHaveBeenCalledWith(
      REVIEW_ERROR_ENTRY_TYPE,
      expect.objectContaining({
        phase: "reviewer",
        attempt: 0,
        model: {
          provider: "test-provider",
          id: "test-model",
        },
        error: {
          name: "Error",
          message: "model failed",
        },
      }),
    );
    expect(pi.appendEntry).not.toHaveBeenCalledWith(CUSTOM_ENTRY_REVIEW_RESULT, expect.anything());
    expect(pi.appendEntry).not.toHaveBeenCalledWith(CUSTOM_ENTRY_FINAL_FAILURE, expect.anything());
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  // -- timeout in block mode --

  it("persists timeout as review error and propagates in block mode", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const modelRegistry = {
      find: vi.fn(async () => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () => {
          throw new Error("Reviewer model request timed out after 10ms.");
        }),
      })),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...configWithReviewerModel,
          mode: "block",
          reviewer: {
            ...configWithReviewerModel.reviewer,
            timeoutMs: 10,
          },
        }),
        context: { modelRegistry },
      }),
    ).rejects.toThrow("Reviewer model request timed out after 10ms.");

    expect(pi.appendEntry).toHaveBeenCalledWith(
      REVIEW_ERROR_ENTRY_TYPE,
      expect.objectContaining({
        error: expect.objectContaining({
          message: "Reviewer model request timed out after 10ms.",
        }),
      }),
    );
    expect(pi.appendEntry).not.toHaveBeenCalledWith(CUSTOM_ENTRY_REVIEW_RESULT, expect.anything());
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  // -- abort in block mode --

  it("persists abort as review error and propagates in block mode", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const modelRegistry = {
      find: vi.fn(async () => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () => {
          throw new Error("Reviewer model request was aborted.");
        }),
      })),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...configWithReviewerModel,
          mode: "block",
        }),
        context: { modelRegistry },
      }),
    ).rejects.toThrow("Reviewer model request was aborted.");

    expect(pi.appendEntry).toHaveBeenCalledWith(
      REVIEW_ERROR_ENTRY_TYPE,
      expect.objectContaining({
        error: expect.objectContaining({
          message: "Reviewer model request was aborted.",
        }),
      }),
    );
    expect(pi.appendEntry).not.toHaveBeenCalledWith(CUSTOM_ENTRY_REVIEW_RESULT, expect.anything());
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  // -- model failure in warn mode --

  it("persists model failure without throwing in warn mode", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const modelRegistry = {
      find: vi.fn(async () => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () => {
          throw new Error("model failed");
        }),
      })),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...configWithReviewerModel,
          mode: "warn",
        }),
        context: { modelRegistry },
      }),
    ).resolves.toBeUndefined();

    expect(pi.appendEntry).toHaveBeenCalledWith(
      REVIEW_ERROR_ENTRY_TYPE,
      expect.objectContaining({
        error: expect.objectContaining({
          message: "model failed",
        }),
      }),
    );
    expect(pi.appendEntry).not.toHaveBeenCalledWith(CUSTOM_ENTRY_REVIEW_RESULT, expect.anything());
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(state.activeReview).toBe(false);
  });

  // -- notification --

  it("notifies model failure when ui notify is available in block mode", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const ui = {
      notify: vi.fn(),
    };
    const modelRegistry = {
      find: vi.fn(async () => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () => {
          throw new Error("model failed");
        }),
      })),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...configWithReviewerModel,
          mode: "block",
        }),
        context: { modelRegistry, ui },
      }),
    ).rejects.toThrow("model failed");

    expect(ui.notify).toHaveBeenCalledWith({
      title: "Review gate failed",
      message: "model failed",
      severity: "error",
    });
    expect(state.activeReview).toBe(false);
  });

  it("notifies model failure when ui notify is available in warn mode", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const ui = {
      notify: vi.fn(),
    };
    const modelRegistry = {
      find: vi.fn(async () => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () => {
          throw new Error("model failed");
        }),
      })),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...configWithReviewerModel,
          mode: "warn",
        }),
        context: { modelRegistry, ui },
      }),
    ).resolves.toBeUndefined();

    expect(ui.notify).toHaveBeenCalledWith({
      title: "Review gate failed",
      message: "model failed",
      severity: "warning",
    });
    expect(state.activeReview).toBe(false);
  });

  it("does not break when ui notify is unavailable", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const modelRegistry = {
      find: vi.fn(async () => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () => {
          throw new Error("model failed");
        }),
      })),
    };

    // No ui in context — should not throw because ui is absent.
    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...configWithReviewerModel,
          mode: "warn",
        }),
        context: { modelRegistry },
      }),
    ).resolves.toBeUndefined();

    expect(pi.appendEntry).toHaveBeenCalledWith(REVIEW_ERROR_ENTRY_TYPE, expect.anything());
    expect(state.activeReview).toBe(false);
  });

  it("does not fail when ui notify throws in warn mode", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const ui = {
      notify: vi.fn(async () => {
        throw new Error("notify failed");
      }),
    };
    const modelRegistry = {
      find: vi.fn(async () => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () => {
          throw new Error("model failed");
        }),
      })),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...configWithReviewerModel,
          mode: "warn",
        }),
        context: { modelRegistry, ui },
      }),
    ).resolves.toBeUndefined();

    expect(ui.notify).toHaveBeenCalled();
    expect(pi.appendEntry).toHaveBeenCalledWith(REVIEW_ERROR_ENTRY_TYPE, expect.anything());
    expect(state.activeReview).toBe(false);
  });

  it("still propagates the original model error when ui notify throws in block mode", async () => {
    const state = createFreshState();
    const pi = {
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const ui = {
      notify: vi.fn(async () => {
        throw new Error("notify failed");
      }),
    };
    const modelRegistry = {
      find: vi.fn(async () => ({
        provider: "test-provider",
        id: "test-model",
        complete: vi.fn(async () => {
          throw new Error("model failed");
        }),
      })),
    };

    await expect(
      handleAgentEnd({
        pi,
        state,
        event: {
          messages: [{ role: "user", content: "Prompt" }],
        },
        loadConfig: async () => ({
          ...configWithReviewerModel,
          mode: "block",
        }),
        context: { modelRegistry, ui },
      }),
    ).rejects.toThrow("model failed");

    expect(ui.notify).toHaveBeenCalled();
    expect(pi.appendEntry).toHaveBeenCalledWith(REVIEW_ERROR_ENTRY_TYPE, expect.anything());
    expect(state.activeReview).toBe(false);
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

// ---------------------------------------------------------------------------
// Step 16.1 — registerCommands
// ---------------------------------------------------------------------------

describe("registerCommands", () => {
  it("registers all review gate commands with registerCommand", () => {
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    registerCommands({ pi, loadConfig, saveConfig });

    expect(pi.registerCommand).toHaveBeenCalledTimes(5);

    const commandNames = pi.registerCommand.mock.calls.map((call) => call[0]);
    expect(commandNames).toEqual([
      COMMAND_REVIEW_GATE,
      COMMAND_REVIEW_GATE_STATUS,
      COMMAND_REVIEW_GATE_MODEL,
      COMMAND_REVIEW_GATE_ON,
      COMMAND_REVIEW_GATE_OFF,
    ]);

    for (const call of pi.registerCommand.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          description: expect.any(String),
          handler: expect.any(Function),
        }),
      );
    }

    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
    expect(pi.exec).not.toHaveBeenCalled();
    // loadConfig/saveConfig are injected but not invoked by registration
    expect(loadConfig).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("registers commands using command fallback", () => {
    const pi = {
      command: vi.fn(),
    };
    registerCommands({ pi, loadConfig: vi.fn(), saveConfig: vi.fn() });

    expect(pi.command).toHaveBeenCalledTimes(5);
    expect(pi.command.mock.calls[0][0]).toBe(COMMAND_REVIEW_GATE);
  });

  it("registers commands using commands.register fallback", () => {
    const pi = {
      commands: {
        register: vi.fn(),
      },
    };
    registerCommands({ pi, loadConfig: vi.fn(), saveConfig: vi.fn() });

    expect(pi.commands.register).toHaveBeenCalledTimes(5);
    expect(pi.commands.register.mock.calls[0][0]).toBe(COMMAND_REVIEW_GATE);
  });

  it("throws when no command registration API is available", () => {
    expect(() =>
      registerCommands({
        pi: {},
        loadConfig: vi.fn(),
        saveConfig: vi.fn(),
      }),
    ).toThrow("Pi command registration API is not available.");
  });

  it("renders the main review gate menu by default", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const pi = {
      registerCommand: vi.fn(),
    };
    registerCommands({ pi, loadConfig, saveConfig: vi.fn() });

    const handlersByCommand = new Map(
      pi.registerCommand.mock.calls.map(([name, options]) => [name, options.handler]),
    );

    const output = await Promise.resolve(handlersByCommand.get(COMMAND_REVIEW_GATE)?.());
    expect(output).toContain("# Review Gate");
  });
});

// ---------------------------------------------------------------------------
// Step 16.1 — Entrypoint command registration
// ---------------------------------------------------------------------------

describe("extension entrypoint command registration", () => {
  it("registers review gate commands and agent_end hook during initialization", async () => {
    const pi = {
      registerCommand: vi.fn(),
      on: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };

    await extensionFactory(pi as unknown as Parameters<typeof extensionFactory>[0]);

    expect(pi.registerCommand).toHaveBeenCalledTimes(5);
    expect(pi.on).toHaveBeenCalledWith("agent_end", expect.any(Function));
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("does not call Git or model during initialization", async () => {
    const pi = {
      registerCommand: vi.fn(),
      on: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };

    await extensionFactory(pi as unknown as Parameters<typeof extensionFactory>[0]);

    // exec should not be called (no git commands)
    expect(pi.exec).not.toHaveBeenCalled();
    // appendEntry should not be called (no review triggering)
    expect(pi.appendEntry).not.toHaveBeenCalled();
    // sendUserMessage should not be called
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Helper utilities for command tests (Step 16.2)
// ---------------------------------------------------------------------------

function getHandlers(
  registerCommand: ReturnType<typeof vi.fn>,
): Map<string, (input?: unknown) => unknown> {
  return new Map(registerCommand.mock.calls.map(([name, options]) => [name, options.handler]));
}

async function runHandler(
  handler: ((input?: unknown) => unknown) | undefined,
  input?: unknown,
): Promise<unknown> {
  if (!handler) {
    throw new Error("Missing command handler.");
  }
  return await Promise.resolve(handler(input));
}

// ---------------------------------------------------------------------------
// Step 16.2 — /review-gate-status
// ---------------------------------------------------------------------------

describe("review gate status command", () => {
  it("shows review gate status with no configured model", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      enabled: true,
      mode: "block" as const,
      reviewerModel: null,
    }));
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_STATUS));
    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(saveConfig).not.toHaveBeenCalled();
    expect(output).toContain("# Review Gate Status");
    expect(output).toContain("Enabled: true");
    expect(output).toContain("Mode: block");
    expect(output).toContain("Reviewer model: [not configured]");
    expect(output).toContain("Max correction cycles:");
    expect(output).toContain("## Context");
    expect(output).toContain("## Git");
    expect(output).toContain("## Reviewer");
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("shows configured reviewer model in status", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
      },
    }));
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_STATUS));
    expect(output).toContain("Reviewer model: test-provider/test-model");
  });

  it("shows configured reviewer model and thinking level in status", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
        thinkingLevel: "high" as const,
      },
    }));
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_STATUS));
    expect(output).toContain("Reviewer model: test-provider/test-model (thinking: high)");
  });

  it("shows disabled status correctly", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      enabled: false,
      mode: "warn" as const,
    }));
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_STATUS));
    expect(output).toContain("Enabled: false");
    expect(output).toContain("Mode: warn");
  });

  it("does not call saveConfig", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE_STATUS));
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("does not call exec, appendEntry, or sendUserMessage", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE_STATUS));
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 16.2 — /review-gate-on
// ---------------------------------------------------------------------------

describe("review gate on command", () => {
  it("enables the review gate and preserves the rest of the config", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      enabled: false,
      mode: "warn",
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_ON));
    expect(output).toBe("Review gate enabled.");
    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(saveConfig).toHaveBeenCalledTimes(1);
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      enabled: true,
    });
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("preserves non-enabled fields when enabling", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      enabled: false,
      mode: "block",
      maxCorrectionCycles: 5,
      reviewerModel: {
        provider: "openrouter",
        id: "deepseek/deepseek-v3.2",
        thinkingLevel: "high",
      },
      context: {
        ...defaultConfig.context,
        includeEventMessages: false,
        maxSessionEntries: 20,
      },
      git: {
        ...defaultConfig.git,
        enabled: false,
      },
      reviewer: {
        ...defaultConfig.reviewer,
        requireJson: false,
        timeoutMs: 30000,
      },
      ui: {
        ...defaultConfig.ui,
        notifyOnPass: false,
        notifyOnFail: false,
        showReviewerSummary: false,
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE_ON));
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      enabled: true,
    });
  });

  it("calls loadConfig before saveConfig", async () => {
    const loadCallOrder: string[] = [];
    const loadConfig = vi.fn(async () => {
      loadCallOrder.push("load");
      return defaultConfig;
    });
    const saveConfig = vi.fn(async () => {
      loadCallOrder.push("save");
    });
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE_ON));
    expect(loadCallOrder).toEqual(["load", "save"]);
  });
});

// ---------------------------------------------------------------------------
// Step 16.2 — /review-gate-off
// ---------------------------------------------------------------------------

describe("review gate off command", () => {
  it("disables the review gate and preserves the rest of the config", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      enabled: true,
      mode: "block",
      maxCorrectionCycles: 5,
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_OFF));
    expect(output).toBe("Review gate disabled.");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      enabled: false,
    });
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("preserves non-enabled fields when disabling", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      enabled: true,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
        thinkingLevel: "low" as const,
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE_OFF));
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      enabled: false,
    });
  });

  it("calls loadConfig and saveConfig exactly once each", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE_OFF));
    expect(loadConfig).toHaveBeenCalledTimes(1);
    expect(saveConfig).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Step 16.2 — Placeholder preservation
// ---------------------------------------------------------------------------

describe("placeholder commands preservation", () => {
  it("/review-gate shows the menu when called without arguments", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE));
    expect(output).toContain("# Review Gate");
    expect(output).toContain("Status:");
  });

  it("/review-gate-model returns model registry unavailable when no context", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await expect(runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL))).resolves.toBe(
      "Model registry is not available.",
    );
  });

  it("/review-gate-model does not call loadConfig or saveConfig", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL));
    expect(loadConfig).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 16.2 — Entrypoint injection
// ---------------------------------------------------------------------------

describe("extension entrypoint injection", () => {
  it("injects loadConfig and saveConfig into registerCommands", async () => {
    const pi = {
      registerCommand: vi.fn(),
      on: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };

    await extensionFactory(pi as unknown as Parameters<typeof extensionFactory>[0]);

    expect(pi.registerCommand).toHaveBeenCalledTimes(5);
    expect(pi.on).toHaveBeenCalledWith("agent_end", expect.any(Function));
  });

  it("does not call Git, model, appendEntry, or sendUserMessage during initialization", async () => {
    const pi = {
      registerCommand: vi.fn(),
      on: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };

    await extensionFactory(pi as unknown as Parameters<typeof extensionFactory>[0]);

    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 16.3 — /review-gate-model listing
// ---------------------------------------------------------------------------

describe("review gate model command — listing", () => {
  it("returns model registry unavailable when no context", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL));
    expect(output).toBe("Model registry is not available.");
    expect(loadConfig).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("returns listing not supported when registry has no getModels", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    const modelRegistry: ModelRegistryAPI = {};
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
      context: { modelRegistry },
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL));
    expect(output).toBe("Model registry does not support listing models.");
  });

  it("returns no models when list is empty", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    const modelRegistry: ModelRegistryAPI = {
      getModels: vi.fn(async () => []),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
      context: { modelRegistry },
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL));
    expect(output).toBe("No models available in registry.");
  });

  it("lists available reviewer models", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    const modelRegistry: ModelRegistryAPI = {
      getModels: vi.fn(async () => [
        {
          provider: "test-provider",
          id: "test-model",
          name: "Test Model",
        },
        {
          provider: "openrouter",
          id: "deepseek/deepseek-v3.2",
          name: "DeepSeek V3.2",
        },
      ]),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
      context: { modelRegistry },
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL));
    expect(output).toContain("# Available Reviewer Models");
    expect(output).toContain("/review-gate-model <provider>/<id> [thinkingLevel]");
    expect(output).toContain("1. test-provider/test-model — Test Model");
    expect(output).toContain("2. openrouter/deepseek/deepseek-v3.2 — DeepSeek V3.2");
    expect(loadConfig).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("lists models without names when name is absent", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    const modelRegistry: ModelRegistryAPI = {
      getModels: vi.fn(async () => [{ provider: "p1", id: "m1" }]),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
      context: { modelRegistry },
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL));
    expect(output).toContain("1. p1/m1");
    expect(output).not.toContain(" — ");
  });
});

// ---------------------------------------------------------------------------
// Step 16.3 — /review-gate-model selection
// ---------------------------------------------------------------------------

describe("review gate model command — selection", () => {
  it("sets reviewer model manually when registry is unavailable", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      reviewerModel: null,
      mode: "warn",
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(
      handlers.get(COMMAND_REVIEW_GATE_MODEL),
      "test-provider/test-model",
    );
    expect(output).toBe("Reviewer model set to test-provider/test-model.");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
      },
    });
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("sets reviewer model with thinking level", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      reviewerModel: null,
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(
      handlers.get(COMMAND_REVIEW_GATE_MODEL),
      "test-provider/test-model high",
    );
    expect(output).toBe("Reviewer model set to test-provider/test-model (thinking: high).");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
        thinkingLevel: "high",
      },
    });
  });

  it("sets reviewer model with off thinking level", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(
      handlers.get(COMMAND_REVIEW_GATE_MODEL),
      "test-provider/test-model off",
    );
    expect(output).toBe("Reviewer model set to test-provider/test-model (thinking: off).");
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewerModel: {
          provider: "test-provider",
          id: "test-model",
          thinkingLevel: "off",
        },
      }),
    );
  });

  it("parses provider/id correctly when id contains slashes", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(
      handlers.get(COMMAND_REVIEW_GATE_MODEL),
      "openrouter/deepseek/deepseek-v3.2",
    );
    expect(output).toBe("Reviewer model set to openrouter/deepseek/deepseek-v3.2.");
    expect(saveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewerModel: {
          provider: "openrouter",
          id: "deepseek/deepseek-v3.2",
        },
      }),
    );
  });

  it("parses model from object-style input", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL), {
      args: "test-provider/test-model",
    });
    expect(output).toBe("Reviewer model set to test-provider/test-model.");
  });

  it("parses model from object with input key", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL), {
      input: "test-provider/test-model minimal",
    });
    expect(output).toBe("Reviewer model set to test-provider/test-model (thinking: minimal).");
  });

  it("rejects invalid reviewer model specs", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    const handler = handlers.get(COMMAND_REVIEW_GATE_MODEL);
    for (const input of ["openrouter", "/openrouter", "openrouter/", "/"]) {
      await expect(runHandler(handler, input)).resolves.toBe(
        "Invalid reviewer model. Use /review-gate-model <provider>/<id> [thinkingLevel].",
      );
    }
    expect(loadConfig).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("rejects invalid thinking level", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    await expect(
      runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL), "test-provider/test-model extreme"),
    ).resolves.toBe(
      "Invalid thinking level. Expected one of: off, minimal, low, medium, high, xhigh.",
    );
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("does not save config when thinking level is invalid", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL), "test-provider/test-model invalid");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("saves config preserving all other fields", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      enabled: false,
      mode: "warn",
      maxCorrectionCycles: 5,
      reviewerModel: null,
      context: {
        ...defaultConfig.context,
        includeEventMessages: false,
        maxSessionEntries: 20,
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL), "test-provider/test-model");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Step 16.3 — /review-gate-model registry validation
// ---------------------------------------------------------------------------

describe("review gate model command — registry validation", () => {
  it("validates reviewer model using registry find when available", async () => {
    const currentConfig = {
      ...defaultConfig,
      reviewerModel: null,
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const modelRegistry: ModelRegistryAPI = {
      find: vi.fn(async (provider: string, id: string) => ({
        provider,
        id,
      })),
      getModels: vi.fn(),
    };
    const pi = {
      registerCommand: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
      context: {
        modelRegistry,
      },
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(
      handlers.get(COMMAND_REVIEW_GATE_MODEL),
      "test-provider/test-model",
    );
    expect(modelRegistry.find).toHaveBeenCalledWith("test-provider", "test-model");
    expect(modelRegistry.getModels).not.toHaveBeenCalled();
    expect(output).toBe("Reviewer model set to test-provider/test-model.");
    expect(saveConfig).toHaveBeenCalled();
  });

  it("does not save config when registry find returns null", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const modelRegistry: ModelRegistryAPI = {
      find: vi.fn(async () => null),
    };
    const pi = {
      registerCommand: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
      context: {
        modelRegistry,
      },
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(
      handlers.get(COMMAND_REVIEW_GATE_MODEL),
      "missing-provider/missing-model",
    );
    expect(output).toBe("Reviewer model not found: missing-provider/missing-model");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("uses getModels fallback when find is unavailable", async () => {
    const currentConfig = {
      ...defaultConfig,
      reviewerModel: null,
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const modelRegistry: ModelRegistryAPI = {
      getModels: vi.fn(async () => [{ provider: "test-provider", id: "test-model" }]),
    };
    const pi = { registerCommand: vi.fn() };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
      context: { modelRegistry },
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(
      handlers.get(COMMAND_REVIEW_GATE_MODEL),
      "test-provider/test-model",
    );
    expect(output).toBe("Reviewer model set to test-provider/test-model.");
    expect(saveConfig).toHaveBeenCalled();
  });

  it("does not save config when getModels cannot find the model", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const modelRegistry: ModelRegistryAPI = {
      getModels: vi.fn(async () => [{ provider: "other", id: "other-model" }]),
    };
    const pi = { registerCommand: vi.fn() };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
      context: { modelRegistry },
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(
      handlers.get(COMMAND_REVIEW_GATE_MODEL),
      "missing-provider/missing-model",
    );
    expect(output).toBe("Reviewer model not found: missing-provider/missing-model");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("allows manual configuration when registry has neither find nor getModels", async () => {
    const currentConfig = {
      ...defaultConfig,
      reviewerModel: null,
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const modelRegistry: ModelRegistryAPI = {};
    const pi = { registerCommand: vi.fn() };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
      context: { modelRegistry },
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(
      handlers.get(COMMAND_REVIEW_GATE_MODEL),
      "test-provider/test-model",
    );
    expect(output).toBe("Reviewer model set to test-provider/test-model.");
    expect(saveConfig).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 16.3 — Preserve other commands
// ---------------------------------------------------------------------------

describe("command preservation after model implementation", () => {
  it("/review-gate shows menu after model implementation", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE));
    expect(output).toContain("# Review Gate");
    expect(output).toContain("/review-gate model");
  });

  it("/review-gate-status works", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_STATUS));
    expect(output).toContain("# Review Gate Status");
  });

  it("/review-gate-on works", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      enabled: false,
    }));
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_ON));
    expect(output).toBe("Review gate enabled.");
  });

  it("/review-gate-off works", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_OFF));
    expect(output).toBe("Review gate disabled.");
  });
});

// ---------------------------------------------------------------------------
// Step 16.3 — Entrypoint with modelRegistry pass-through
// ---------------------------------------------------------------------------

describe("extension entrypoint with model registry", () => {
  it("registers all 5 commands and agent_end hook", async () => {
    const pi = {
      registerCommand: vi.fn(),
      on: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };

    await extensionFactory(pi as unknown as Parameters<typeof extensionFactory>[0]);

    expect(pi.registerCommand).toHaveBeenCalledTimes(5);
    expect(pi.on).toHaveBeenCalledWith("agent_end", expect.any(Function));
  });

  it("does not call Git, model, appendEntry, or sendUserMessage during init", async () => {
    const pi = {
      registerCommand: vi.fn(),
      on: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };

    await extensionFactory(pi as unknown as Parameters<typeof extensionFactory>[0]);

    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 16.4 — /review-gate menu
// ---------------------------------------------------------------------------

describe("review gate menu command", () => {
  it("renders the main review gate menu", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      enabled: true,
      mode: "block" as const,
      maxCorrectionCycles: 2,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
        thinkingLevel: "high" as const,
      },
      git: {
        ...defaultConfig.git,
        includeDiff: true,
      },
      context: {
        ...defaultConfig.context,
        includeSessionSlice: false,
      },
    }));
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({
      pi,
      loadConfig,
      saveConfig,
    });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE));
    expect(output).toContain("# Review Gate");
    expect(output).toContain("Status: enabled");
    expect(output).toContain("Mode: block");
    expect(output).toContain("Reviewer model: test-provider/test-model (thinking: high)");
    expect(output).toContain("Max correction cycles: 2");
    expect(output).toContain("Git diff: enabled");
    expect(output).toContain("Session context: disabled");
    expect(output).toContain("/review-gate status");
    expect(output).toContain("/review-gate on");
    expect(output).toContain("/review-gate off");
    expect(output).toContain("/review-gate model");
    expect(output).toContain("/review-gate thinking <thinkingLevel>");
    expect(output).toContain("/review-gate max-cycles <number>");
    expect(output).toContain("/review-gate toggle-git-diff");
    expect(output).toContain("/review-gate toggle-session-context");
    expect(output).toContain("/review-gate manual");
    expect(saveConfig).not.toHaveBeenCalled();
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("shows disabled status and mode correctly", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      enabled: false,
      mode: "warn" as const,
      reviewerModel: null,
      git: {
        ...defaultConfig.git,
        includeDiff: false,
      },
      context: {
        ...defaultConfig.context,
        includeSessionSlice: true,
      },
    }));
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE));
    expect(output).toContain("Status: disabled");
    expect(output).toContain("Mode: warn");
    expect(output).toContain("Reviewer model: [not configured]");
    expect(output).toContain("Git diff: disabled");
    expect(output).toContain("Session context: enabled");
  });

  it("shows reviewer model without thinking level", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
      },
    }));
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE));
    expect(output).toContain("Reviewer model: test-provider/test-model");
    expect(output).not.toContain("(thinking:");
  });
});

// ---------------------------------------------------------------------------
// Step 16.4 — /review-gate aliases
// ---------------------------------------------------------------------------

describe("review gate menu aliases", () => {
  it("routes status alias through /review-gate", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "status");
    expect(output).toContain("# Review Gate Status");
    expect(loadConfig).toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("routes on alias through /review-gate", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      enabled: false,
    }));
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "on");
    expect(output).toBe("Review gate enabled.");
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
  });

  it("routes off alias through /review-gate", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      enabled: true,
    }));
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "off");
    expect(output).toBe("Review gate disabled.");
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("routes model alias for listing through /review-gate", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    const modelRegistry: ModelRegistryAPI = {
      getModels: vi.fn(async () => [
        { provider: "test-provider", id: "test-model", name: "Test Model" },
      ]),
    };
    registerCommands({ pi, loadConfig, saveConfig, context: { modelRegistry } });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "model");
    expect(output).toContain("# Available Reviewer Models");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("routes model alias for selection through /review-gate", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      reviewerModel: null,
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(
      handlers.get(COMMAND_REVIEW_GATE),
      "model test-provider/test-model high",
    );
    expect(output).toBe("Reviewer model set to test-provider/test-model (thinking: high).");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
        thinkingLevel: "high",
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Step 16.4 — /review-gate thinking
// ---------------------------------------------------------------------------

describe("review gate thinking subcommand", () => {
  it("sets reviewer thinking level for an existing model", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "thinking high");
    expect(output).toBe("Reviewer thinking level set to high.");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
        thinkingLevel: "high",
      },
    });
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("preserves provider and id when setting thinking level", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
        thinkingLevel: "low" as const,
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "thinking medium");
    expect(output).toBe("Reviewer thinking level set to medium.");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
        thinkingLevel: "medium",
      },
    });
  });

  it("does not set thinking level when reviewer model is missing", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      reviewerModel: null,
    }));
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "thinking high");
    expect(output).toBe("Reviewer model is not configured.");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("rejects invalid thinking level", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "thinking extreme");
    expect(output).toBe(
      "Invalid thinking level. Expected one of: off, minimal, low, medium, high, xhigh.",
    );
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("allows all valid thinking levels", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      reviewerModel: {
        provider: "test-provider",
        id: "test-model",
      },
    };
    const validLevels = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
    for (const level of validLevels) {
      const loadConfig = vi.fn(async () => currentConfig);
      const saveConfig = vi.fn();
      const pi = { registerCommand: vi.fn() };
      registerCommands({ pi, loadConfig, saveConfig });
      const handlers = getHandlers(pi.registerCommand);
      const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), `thinking ${level}`);
      expect(output).toBe(`Reviewer thinking level set to ${level}.`);
    }
  });
});

// ---------------------------------------------------------------------------
// Step 16.4 — /review-gate max-cycles
// ---------------------------------------------------------------------------

describe("review gate max-cycles subcommand", () => {
  it("sets max correction cycles", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      maxCorrectionCycles: 2,
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "max-cycles 5");
    expect(output).toBe("Max correction cycles set to 5.");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      maxCorrectionCycles: 5,
    });
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("preserves other config fields when setting max cycles", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      maxCorrectionCycles: 2,
      mode: "warn",
      enabled: false,
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE), "max-cycles 3");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      maxCorrectionCycles: 3,
    });
  });

  it("rejects max-cycles value 0", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "max-cycles 0");
    expect(output).toBe("Invalid max correction cycles. Expected a positive integer.");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("rejects max-cycles value -1", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "max-cycles -1");
    expect(output).toBe("Invalid max correction cycles. Expected a positive integer.");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("rejects max-cycles value 1.5", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "max-cycles 1.5");
    expect(output).toBe("Invalid max correction cycles. Expected a positive integer.");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("rejects max-cycles value abc", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "max-cycles abc");
    expect(output).toBe("Invalid max correction cycles. Expected a positive integer.");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("rejects all invalid max-cycles values without saving config", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const handler = handlers.get(COMMAND_REVIEW_GATE);
    for (const input of ["max-cycles 0", "max-cycles -1", "max-cycles 1.5", "max-cycles abc"]) {
      await expect(runHandler(handler, input)).resolves.toBe(
        "Invalid max correction cycles. Expected a positive integer.",
      );
    }
    expect(saveConfig).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 16.4 — /review-gate toggles
// ---------------------------------------------------------------------------

describe("review gate toggle subcommands", () => {
  it("toggles git diff collection from disabled to enabled", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      git: {
        ...defaultConfig.git,
        includeDiff: false,
        includeStatus: true,
        includeDiffStat: false,
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "toggle-git-diff");
    expect(output).toBe("Git diff collection enabled.");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      git: {
        ...currentConfig.git,
        includeDiff: true,
      },
    });
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("toggles git diff collection from enabled to disabled", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      git: {
        ...defaultConfig.git,
        includeDiff: true,
        includeStatus: true,
        includeDiffStat: false,
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "toggle-git-diff");
    expect(output).toBe("Git diff collection disabled.");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      git: {
        ...currentConfig.git,
        includeDiff: false,
      },
    });
  });

  it("preserves other git fields when toggling diff", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      git: {
        ...defaultConfig.git,
        enabled: false,
        includeDiff: false,
        includeStatus: true,
        includeDiffStat: true,
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE), "toggle-git-diff");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      git: {
        enabled: false,
        includeDiff: true,
        includeStatus: true,
        includeDiffStat: true,
        maxDiffChars: currentConfig.git.maxDiffChars,
        maxStatusChars: currentConfig.git.maxStatusChars,
        maxDiffStatChars: currentConfig.git.maxDiffStatChars,
      },
    });
  });

  it("toggles session context from enabled to disabled", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      context: {
        ...defaultConfig.context,
        includeSessionSlice: true,
        includeEventMessages: false,
        maxSessionEntries: 20,
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "toggle-session-context");
    expect(output).toBe("Session context disabled.");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      context: {
        ...currentConfig.context,
        includeSessionSlice: false,
      },
    });
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("toggles session context from disabled to enabled", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      context: {
        ...defaultConfig.context,
        includeSessionSlice: false,
        includeEventMessages: true,
        maxSessionEntries: 10,
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "toggle-session-context");
    expect(output).toBe("Session context enabled.");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      context: {
        ...currentConfig.context,
        includeSessionSlice: true,
      },
    });
  });

  it("preserves other context fields when toggling session context", async () => {
    const currentConfig: ReviewGateConfig = {
      ...defaultConfig,
      context: {
        strategy: "since_last_user" as const,
        includeEventMessages: false,
        includeSessionSlice: true,
        maxSessionEntries: 20,
      },
    };
    const loadConfig = vi.fn(async () => currentConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE), "toggle-session-context");
    expect(saveConfig).toHaveBeenCalledWith({
      ...currentConfig,
      context: {
        strategy: "since_last_user",
        includeEventMessages: false,
        includeSessionSlice: false,
        maxSessionEntries: 20,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// Step 16.4 — /review-gate manual placeholder
// ---------------------------------------------------------------------------

describe("review gate manual placeholder", () => {
  it("returns placeholder for manual review", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = {
      registerCommand: vi.fn(),
      exec: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
    };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "manual");
    expect(output).toBe("Manual review is not implemented yet.");
    expect(loadConfig).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
    expect(pi.exec).not.toHaveBeenCalled();
    expect(pi.appendEntry).not.toHaveBeenCalled();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 16.4 — /review-gate unknown subcommand
// ---------------------------------------------------------------------------

describe("review gate unknown subcommand", () => {
  it("returns clear message for unknown subcommand", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), "unknown");
    expect(output).toBe("Unknown review gate command. Run /review-gate to see available commands.");
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("does not call loadConfig or saveConfig for unknown subcommand", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    await runHandler(handlers.get(COMMAND_REVIEW_GATE), "foo");
    expect(loadConfig).not.toHaveBeenCalled();
    expect(saveConfig).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Step 16.4 — direct command preservation
// ---------------------------------------------------------------------------

describe("review gate direct command preservation", () => {
  it("preserves /review-gate-status", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    expect(handlers.has(COMMAND_REVIEW_GATE_STATUS)).toBe(true);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_STATUS));
    expect(output).toContain("# Review Gate Status");
  });

  it("preserves /review-gate-on", async () => {
    const loadConfig = vi.fn(async () => ({ ...defaultConfig, enabled: false }));
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    expect(handlers.has(COMMAND_REVIEW_GATE_ON)).toBe(true);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_ON));
    expect(output).toBe("Review gate enabled.");
  });

  it("preserves /review-gate-off", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    expect(handlers.has(COMMAND_REVIEW_GATE_OFF)).toBe(true);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_OFF));
    expect(output).toBe("Review gate disabled.");
  });

  it("preserves /review-gate-model", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    expect(handlers.has(COMMAND_REVIEW_GATE_MODEL)).toBe(true);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE_MODEL));
    expect(output).toBe("Model registry is not available.");
  });

  it("registers all 5 commands", async () => {
    const pi = {
      registerCommand: vi.fn(),
      on: vi.fn(),
      appendEntry: vi.fn(),
      sendUserMessage: vi.fn(),
      exec: vi.fn(),
    };
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    registerCommands({ pi, loadConfig, saveConfig });

    expect(pi.registerCommand).toHaveBeenCalledTimes(5);
    const commandNames = pi.registerCommand.mock.calls.map((call) => call[0]);
    expect(commandNames).toEqual([
      COMMAND_REVIEW_GATE,
      COMMAND_REVIEW_GATE_STATUS,
      COMMAND_REVIEW_GATE_MODEL,
      COMMAND_REVIEW_GATE_ON,
      COMMAND_REVIEW_GATE_OFF,
    ]);
  });

  it("demonstrates on and off aliases save correct config", async () => {
    const loadConfig = vi.fn(async () => ({
      ...defaultConfig,
      enabled: false,
    }));
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);

    await runHandler(handlers.get(COMMAND_REVIEW_GATE), "on");
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));

    await runHandler(handlers.get(COMMAND_REVIEW_GATE), "off");
    expect(saveConfig).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });
});

// ---------------------------------------------------------------------------
// Step 16.4 — /review-gate object-style input
// ---------------------------------------------------------------------------

describe("review gate object-style input", () => {
  it("parses subcommand from object with args key", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), {
      args: "status",
    });
    expect(output).toContain("# Review Gate Status");
  });

  it("parses subcommand from object with input key", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), {
      input: "manual",
    });
    expect(output).toBe("Manual review is not implemented yet.");
  });

  it("parses subcommand from object with text key", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), {
      text: "on",
    });
    expect(output).toBe("Review gate enabled.");
  });

  it("shows menu when object has no recognized keys", async () => {
    const loadConfig = vi.fn(async () => defaultConfig);
    const saveConfig = vi.fn();
    const pi = { registerCommand: vi.fn() };
    registerCommands({ pi, loadConfig, saveConfig });
    const handlers = getHandlers(pi.registerCommand);
    const output = await runHandler(handlers.get(COMMAND_REVIEW_GATE), {
      foo: "bar",
    });
    expect(output).toContain("# Review Gate");
  });
});
