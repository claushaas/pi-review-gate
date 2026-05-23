import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { CORRECTION_REQUEST_MARKER } from "../src/constants.js";
import {
  buildReviewContext,
  collectSessionSliceSinceLastRealUserMessage,
  extractCurrentUserPrompt,
  extractLatestAssistantResponse,
} from "../src/context.js";

// ---------------------------------------------------------------------------
// extractCurrentUserPrompt
// ---------------------------------------------------------------------------

describe("extractCurrentUserPrompt", () => {
  it("extracts the first user message text (string content)", () => {
    expect(
      extractCurrentUserPrompt([
        { role: "assistant", content: "previous" },
        { role: "user", content: "implement step 8.1" },
        { role: "user", content: "second user message" },
      ]),
    ).toBe("implement step 8.1");
  });

  it("supports array content through getMessageText", () => {
    expect(
      extractCurrentUserPrompt([
        {
          role: "user",
          content: [
            { type: "text", text: "hello" },
            { type: "image", source: { type: "base64", data: "..." } },
            { type: "text", text: "world" },
          ],
        },
      ]),
    ).toBe("hello\nworld");
  });

  it("returns an empty string when no user message exists", () => {
    expect(extractCurrentUserPrompt([{ role: "assistant", content: "done" }])).toBe("");
  });

  it("returns an empty string when user message has no extractable text", () => {
    expect(extractCurrentUserPrompt([{ role: "user", content: [] }])).toBe("");
  });

  it("ignores assistant messages before the first user", () => {
    expect(
      extractCurrentUserPrompt([
        { role: "assistant", content: "first assistant" },
        { role: "user", content: "the prompt" },
      ]),
    ).toBe("the prompt");
  });

  it("does not throw for malformed messages", () => {
    expect(() =>
      extractCurrentUserPrompt([null, 42, "hello", undefined, { role: "user" }]),
    ).not.toThrow();
  });

  it("returns empty string for malformed array", () => {
    expect(extractCurrentUserPrompt([null, 42, "hello", undefined, { role: "user" }])).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(extractCurrentUserPrompt([])).toBe("");
  });

  it("does not mutate the messages array", () => {
    const messages = [{ role: "user", content: "hello" }];
    const before = JSON.stringify(messages);
    extractCurrentUserPrompt(messages);
    expect(JSON.stringify(messages)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// extractLatestAssistantResponse
// ---------------------------------------------------------------------------

describe("extractLatestAssistantResponse", () => {
  it("extracts the latest assistant message text (string content)", () => {
    expect(
      extractLatestAssistantResponse([
        { role: "assistant", content: "first" },
        { role: "user", content: "prompt" },
        { role: "assistant", content: "final" },
      ]),
    ).toBe("final");
  });

  it("supports array content through getMessageText", () => {
    expect(
      extractLatestAssistantResponse([
        {
          role: "assistant",
          content: [
            { type: "text", text: "line one" },
            { type: "text", text: "line two" },
          ],
        },
      ]),
    ).toBe("line one\nline two");
  });

  it("returns null when no assistant message exists", () => {
    expect(extractLatestAssistantResponse([{ role: "user", content: "prompt" }])).toBeNull();
  });

  it("returns empty string when the last assistant has no extractable text", () => {
    expect(
      extractLatestAssistantResponse([
        { role: "assistant", content: "first" },
        { role: "assistant", content: [] },
      ]),
    ).toBe("");
  });

  it("ignores user messages after an assistant when finding the last assistant", () => {
    expect(
      extractLatestAssistantResponse([
        { role: "assistant", content: "done" },
        { role: "user", content: "follow-up prompt" },
      ]),
    ).toBe("done");
  });

  it("does not throw for malformed messages", () => {
    expect(() => extractLatestAssistantResponse([null, 42, "hello", undefined])).not.toThrow();
  });

  it("returns null for malformed array with no assistant", () => {
    expect(extractLatestAssistantResponse([null, 42, "hello", undefined])).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(extractLatestAssistantResponse([])).toBeNull();
  });

  it("does not mutate the messages array", () => {
    const messages = [{ role: "assistant", content: "done" }];
    const before = JSON.stringify(messages);
    extractLatestAssistantResponse(messages);
    expect(JSON.stringify(messages)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// collectSessionSliceSinceLastRealUserMessage
// ---------------------------------------------------------------------------

describe("collectSessionSliceSinceLastRealUserMessage", () => {
  it("returns an empty slice for an empty branch", () => {
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch: [],
        maxEntries: 40,
      }),
    ).toEqual([]);
  });

  it("returns an empty slice when no user message entry exists", () => {
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch: [{ type: "message", message: { role: "assistant", content: "answer" } }],
        maxEntries: 40,
      }),
    ).toEqual([]);
  });

  it("returns the slice from the latest real user message", () => {
    const branch = [
      { type: "message", message: { role: "user", content: "first" } },
      { type: "message", message: { role: "assistant", content: "first answer" } },
      { type: "message", message: { role: "user", content: "second" } },
      { type: "message", message: { role: "assistant", content: "second answer" } },
    ];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: 40,
      }),
    ).toEqual(branch.slice(2));
  });

  it("uses the last real user message when there are multiple", () => {
    const branch = [
      { type: "message", message: { role: "user", content: "first" } },
      { type: "message", message: { role: "assistant", content: "a" } },
      { type: "message", message: { role: "user", content: "second" } },
      { type: "message", message: { role: "user", content: "third" } },
      { type: "message", message: { role: "assistant", content: "b" } },
    ];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: 40,
      }),
    ).toEqual(branch.slice(3));
  });

  it("ignores review-gate injected user messages when finding the start", () => {
    const branch = [
      { type: "message", message: { role: "user", content: "real prompt" } },
      { type: "message", message: { role: "assistant", content: "answer" } },
      {
        type: "message",
        message: {
          role: "user",
          content: `${CORRECTION_REQUEST_MARKER}\nMandatory review failed.`,
        },
      },
      { type: "message", message: { role: "assistant", content: "correction" } },
    ];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: 40,
      }),
    ).toEqual(branch);
  });

  it("does not let injected prompt redefine the slice start", () => {
    const branch = [
      { type: "message", message: { role: "user", content: "real prompt" } },
      { type: "message", message: { role: "assistant", content: "answer" } },
      {
        type: "message",
        message: {
          role: "user",
          content: `${CORRECTION_REQUEST_MARKER}\nfix this`,
        },
      },
      { type: "message", message: { role: "assistant", content: "correction" } },
      {
        type: "message",
        message: {
          role: "user",
          content: `${CORRECTION_REQUEST_MARKER}\nagain`,
        },
      },
      { type: "message", message: { role: "assistant", content: "correction 2" } },
    ];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: 40,
      }),
    ).toEqual(branch);
  });

  it("accepts nested entry.message.role format", () => {
    const branch = [
      {
        type: "message",
        message: { role: "user", content: "nested format" },
      },
      {
        type: "message",
        message: { role: "assistant", content: "response" },
      },
    ];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: 40,
      }),
    ).toEqual(branch);
  });

  it("accepts fallback flat entry.role format", () => {
    const branch = [
      { type: "message", role: "user", content: "flat format" },
      { type: "message", role: "assistant", content: "response" },
    ];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: 40,
      }),
    ).toEqual(branch);
  });

  it("returns an empty slice when maxEntries <= 0", () => {
    const branch = [{ type: "message", message: { role: "user", content: "real" } }];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: 0,
      }),
    ).toEqual([]);
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: -1,
      }),
    ).toEqual([]);
  });

  it("returns an empty slice when maxEntries is not an integer", () => {
    const branch = [{ type: "message", message: { role: "user", content: "real" } }];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: 1.5,
      }),
    ).toEqual([]);
  });

  it("returns an empty slice when maxEntries is not finite", () => {
    const branch = [{ type: "message", message: { role: "user", content: "real" } }];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: Number.POSITIVE_INFINITY,
      }),
    ).toEqual([]);
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: Number.NaN,
      }),
    ).toEqual([]);
  });

  it("limits the slice to the latest maxEntries items", () => {
    const branch = [
      { type: "message", message: { role: "user", content: "real prompt" } },
      { type: "message", message: { role: "assistant", content: "a" } },
      { type: "custom", customType: "x" },
      { type: "message", message: { role: "assistant", content: "b" } },
    ];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: 2,
      }),
    ).toEqual(branch.slice(2));
  });

  it("limits when slice from real user exceeds maxEntries", () => {
    const branch = [
      { type: "message", message: { role: "user", content: "real" } },
      { type: "message", message: { role: "assistant", content: "a" } },
      { type: "message", message: { role: "assistant", content: "b" } },
      { type: "message", message: { role: "assistant", content: "c" } },
      { type: "message", message: { role: "assistant", content: "d" } },
    ];
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch,
        maxEntries: 3,
      }),
    ).toEqual(branch.slice(2));
  });

  it("does not mutate the branch", () => {
    const branch = [
      { type: "message", message: { role: "user", content: "real prompt" } },
      { type: "message", message: { role: "assistant", content: "answer" } },
    ];
    const before = JSON.stringify(branch);
    collectSessionSliceSinceLastRealUserMessage({
      branch,
      maxEntries: 40,
    });
    expect(JSON.stringify(branch)).toBe(before);
  });

  it("does not throw for malformed entries", () => {
    expect(() =>
      collectSessionSliceSinceLastRealUserMessage({
        branch: [null, 42, "hello", undefined, {}, { type: 123 }],
        maxEntries: 40,
      }),
    ).not.toThrow();
  });

  it("returns empty slice for malformed entries without a real user", () => {
    expect(
      collectSessionSliceSinceLastRealUserMessage({
        branch: [null, 42, "hello", undefined, {}, { type: 123 }],
        maxEntries: 40,
      }),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildReviewContext
// ---------------------------------------------------------------------------

describe("buildReviewContext", () => {
  const gitContext = {
    status: " M src/context.ts",
    diffStat: " src/context.ts | 10 ++++++++++",
    diff: "diff --git a/src/context.ts b/src/context.ts",
  };

  it("builds review context from event messages and git context", () => {
    const eventMessages = [
      { role: "user", content: "implement step 8.3" },
      { role: "assistant", content: "done" },
    ];

    const context = buildReviewContext({
      eventMessages,
      config: defaultConfig,
      gitContext,
    });

    expect(context.currentUserPrompt).toBe("implement step 8.3");
    expect(context.latestAssistantResponse).toBe("done");
    expect(context.serializedEventMessages).toContain("[message 1]");
    expect(context.serializedEventMessages).toContain("role: user");
    expect(context.gitStatus).toBe(gitContext.status);
    expect(context.gitDiffStat).toBe(gitContext.diffStat);
    expect(context.gitDiff).toBe(gitContext.diff);
  });

  it("omits serialized event messages when disabled", () => {
    const config = {
      ...defaultConfig,
      context: {
        ...defaultConfig.context,
        includeEventMessages: false,
      },
    };

    const context = buildReviewContext({
      eventMessages: [{ role: "user", content: "prompt" }],
      config,
      gitContext: { status: null, diffStat: null, diff: null },
    });

    expect(context.serializedEventMessages).toBe("");
  });

  it("includes session slice when enabled and branch is provided", () => {
    const branch = [
      { type: "message", message: { role: "user", content: "real prompt" } },
      { type: "message", message: { role: "assistant", content: "answer" } },
    ];

    const context = buildReviewContext({
      eventMessages: [{ role: "user", content: "current prompt" }],
      branch,
      config: defaultConfig,
      gitContext: { status: null, diffStat: null, diff: null },
    });

    expect(context.serializedSessionSlice).toContain("[entry 1]");
    expect(context.serializedSessionSlice).toContain("real prompt");
  });

  it("uses serializedSessionSlice null when includeSessionSlice is false", () => {
    const config = {
      ...defaultConfig,
      context: {
        ...defaultConfig.context,
        includeSessionSlice: false,
      },
    };

    const branch = [{ type: "message", message: { role: "user", content: "real prompt" } }];

    const context = buildReviewContext({
      eventMessages: [{ role: "user", content: "current prompt" }],
      branch,
      config,
      gitContext: { status: null, diffStat: null, diff: null },
    });

    expect(context.serializedSessionSlice).toBeNull();
  });

  it("uses serializedSessionSlice null when branch is not provided", () => {
    const context = buildReviewContext({
      eventMessages: [{ role: "user", content: "current prompt" }],
      config: defaultConfig,
      gitContext: { status: null, diffStat: null, diff: null },
    });

    expect(context.serializedSessionSlice).toBeNull();
  });

  it("uses serializedSessionSlice null when branch has no real user message", () => {
    const branch = [{ type: "message", message: { role: "assistant", content: "answer" } }];

    const context = buildReviewContext({
      eventMessages: [{ role: "user", content: "current prompt" }],
      branch,
      config: defaultConfig,
      gitContext: { status: null, diffStat: null, diff: null },
    });

    expect(context.serializedSessionSlice).toBeNull();
  });

  it("respects maxSessionEntries", () => {
    const config = {
      ...defaultConfig,
      context: {
        ...defaultConfig.context,
        includeSessionSlice: true,
        maxSessionEntries: 2,
      },
    };

    const branch = [
      { type: "message", message: { role: "user", content: "real prompt" } },
      { type: "message", message: { role: "assistant", content: "a" } },
      { type: "custom", customType: "x" },
      { type: "message", message: { role: "assistant", content: "b" } },
    ];

    const context = buildReviewContext({
      eventMessages: [{ role: "user", content: "current prompt" }],
      branch,
      config,
      gitContext: { status: null, diffStat: null, diff: null },
    });

    // Should contain only the last 2 entries
    expect(context.serializedSessionSlice).toContain("[entry 1]");
    expect(context.serializedSessionSlice).toContain("[entry 2]");
    expect(context.serializedSessionSlice).not.toContain("[entry 3]");
  });

  it("does not let injected prompts define the session slice start", () => {
    const branch = [
      { type: "message", message: { role: "user", content: "real prompt" } },
      { type: "message", message: { role: "assistant", content: "answer" } },
      {
        type: "message",
        message: {
          role: "user",
          content: `${CORRECTION_REQUEST_MARKER}\nMandatory review failed.`,
        },
      },
      { type: "message", message: { role: "assistant", content: "correction" } },
    ];

    const context = buildReviewContext({
      eventMessages: [{ role: "user", content: "current prompt" }],
      branch,
      config: defaultConfig,
      gitContext: { status: null, diffStat: null, diff: null },
    });

    expect(context.serializedSessionSlice).toContain("real prompt");
    expect(context.serializedSessionSlice).toContain("correction");
  });

  it("copies gitStatus, gitDiffStat, and gitDiff from gitContext", () => {
    const context = buildReviewContext({
      eventMessages: [{ role: "user", content: "prompt" }],
      config: defaultConfig,
      gitContext,
    });

    expect(context.gitStatus).toBe(gitContext.status);
    expect(context.gitDiffStat).toBe(gitContext.diffStat);
    expect(context.gitDiff).toBe(gitContext.diff);
  });

  it("copies gitUnavailableReason when present", () => {
    const context = buildReviewContext({
      eventMessages: [{ role: "user", content: "prompt" }],
      config: defaultConfig,
      gitContext: {
        status: null,
        diffStat: null,
        diff: null,
        unavailableReason: "Git context unavailable: current directory is not a git repository.",
      },
    });

    expect(context.gitStatus).toBeNull();
    expect(context.gitDiffStat).toBeNull();
    expect(context.gitDiff).toBeNull();
    expect(context.gitUnavailableReason).toBe(
      "Git context unavailable: current directory is not a git repository.",
    );
  });

  it("accepts Git unavailable with all fields null", () => {
    const context = buildReviewContext({
      eventMessages: [{ role: "user", content: "prompt" }],
      config: defaultConfig,
      gitContext: {
        status: null,
        diffStat: null,
        diff: null,
      },
    });

    expect(context.gitStatus).toBeNull();
    expect(context.gitDiffStat).toBeNull();
    expect(context.gitDiff).toBeNull();
    expect(context.gitUnavailableReason).toBeUndefined();
  });

  it("does not mutate eventMessages", () => {
    const eventMessages = [
      { role: "user", content: "prompt" },
      { role: "assistant", content: "done" },
    ];
    const before = JSON.stringify(eventMessages);

    buildReviewContext({
      eventMessages,
      config: defaultConfig,
      gitContext: { status: null, diffStat: null, diff: null },
    });

    expect(JSON.stringify(eventMessages)).toBe(before);
  });

  it("does not mutate branch", () => {
    const branch = [{ type: "message", message: { role: "user", content: "branch prompt" } }];
    const before = JSON.stringify(branch);

    buildReviewContext({
      eventMessages: [{ role: "user", content: "prompt" }],
      branch,
      config: defaultConfig,
      gitContext: { status: null, diffStat: null, diff: null },
    });

    expect(JSON.stringify(branch)).toBe(before);
  });

  it("does not mutate config", () => {
    const config: typeof defaultConfig = JSON.parse(JSON.stringify(defaultConfig));
    const before = JSON.stringify(config);

    buildReviewContext({
      eventMessages: [{ role: "user", content: "prompt" }],
      config,
      gitContext: { status: null, diffStat: null, diff: null },
    });

    expect(JSON.stringify(config)).toBe(before);
  });

  it("does not mutate gitContext", () => {
    const ctx = {
      status: " M file.ts",
      diffStat: "file.ts | 1 +",
      diff: "diff",
      unavailableReason: undefined as string | undefined,
    };
    const before = JSON.stringify(ctx);

    buildReviewContext({
      eventMessages: [{ role: "user", content: "prompt" }],
      config: defaultConfig,
      gitContext: ctx,
    });

    expect(JSON.stringify(ctx)).toBe(before);
  });
});
