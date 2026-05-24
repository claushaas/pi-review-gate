import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config.js";
import { CUSTOM_ENTRY_REVIEW_SKIPPED } from "../src/constants.js";
import extensionFactory from "../src/index.js";
import type { ReviewGateAgentEndAPI } from "../src/reviewer.js";
import { handleAgentEnd } from "../src/reviewer.js";
import { createRuntimeState } from "../src/state.js";
import type { RuntimeState } from "../src/types.js";

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
