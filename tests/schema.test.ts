import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { validateConfig } from "../src/schema.js";

// ---------------------------------------------------------------------------
// Valid config
// ---------------------------------------------------------------------------

describe("validateConfig", () => {
  it("accepts defaultConfig", () => {
    expect(validateConfig(defaultConfig)).toEqual(defaultConfig);
  });

  // -----------------------------------------------------------------------
  // Top-level invalid
  // -----------------------------------------------------------------------

  it("rejects null", () => {
    expect(() => validateConfig(null)).toThrow("Invalid config");
  });

  it("rejects non-object (number)", () => {
    expect(() => validateConfig(42)).toThrow("Invalid config");
  });

  it("rejects non-object (string)", () => {
    expect(() => validateConfig("test")).toThrow("Invalid config");
  });

  it("rejects non-object (array)", () => {
    expect(() => validateConfig([])).toThrow("Invalid config");
  });

  it("rejects object without enabled", () => {
    const { enabled: _, ...rest } = defaultConfig;
    expect(() => validateConfig(rest)).toThrow("config.enabled");
  });

  it("rejects enabled not boolean", () => {
    expect(() => validateConfig({ ...defaultConfig, enabled: "yes" })).toThrow("config.enabled");
  });

  it("rejects invalid mode", () => {
    expect(() => validateConfig({ ...defaultConfig, mode: "invalid" })).toThrow("config.mode");
  });

  it("rejects mode not string", () => {
    expect(() => validateConfig({ ...defaultConfig, mode: 1 })).toThrow("config.mode");
  });

  it("rejects negative maxCorrectionCycles", () => {
    expect(() => validateConfig({ ...defaultConfig, maxCorrectionCycles: -1 })).toThrow(
      "config.maxCorrectionCycles",
    );
  });

  it("rejects non-integer maxCorrectionCycles", () => {
    expect(() => validateConfig({ ...defaultConfig, maxCorrectionCycles: 1.5 })).toThrow(
      "config.maxCorrectionCycles",
    );
  });

  it("rejects maxCorrectionCycles NaN", () => {
    expect(() => validateConfig({ ...defaultConfig, maxCorrectionCycles: NaN })).toThrow(
      "config.maxCorrectionCycles",
    );
  });

  it("rejects maxCorrectionCycles Infinity", () => {
    expect(() => validateConfig({ ...defaultConfig, maxCorrectionCycles: Infinity })).toThrow(
      "config.maxCorrectionCycles",
    );
  });

  // -----------------------------------------------------------------------
  // reviewerModel
  // -----------------------------------------------------------------------

  it("accepts reviewerModel: null", () => {
    expect(validateConfig({ ...defaultConfig, reviewerModel: null })).toMatchObject({
      reviewerModel: null,
    });
  });

  it("accepts valid reviewerModel with provider and id", () => {
    expect(
      validateConfig({
        ...defaultConfig,
        reviewerModel: { provider: "openai", id: "gpt-4o" },
      }),
    ).toMatchObject({
      reviewerModel: { provider: "openai", id: "gpt-4o" },
    });
  });

  it("accepts thinkingLevel: high", () => {
    expect(
      validateConfig({
        ...defaultConfig,
        reviewerModel: {
          provider: "openai",
          id: "gpt-4o",
          thinkingLevel: "high",
        },
      }),
    ).toMatchObject({
      reviewerModel: {
        provider: "openai",
        id: "gpt-4o",
        thinkingLevel: "high",
      },
    });
  });

  it("accepts thinkingLevel: off", () => {
    expect(
      validateConfig({
        ...defaultConfig,
        reviewerModel: {
          provider: "openai",
          id: "gpt-4o",
          thinkingLevel: "off",
        },
      }),
    ).toMatchObject({
      reviewerModel: {
        provider: "openai",
        id: "gpt-4o",
        thinkingLevel: "off",
      },
    });
  });

  it("accepts reviewerModel without thinkingLevel", () => {
    expect(
      validateConfig({
        ...defaultConfig,
        reviewerModel: { provider: "openai", id: "gpt-4o" },
      }),
    ).toBeDefined();
  });

  it("rejects empty provider", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        reviewerModel: { provider: "", id: "gpt-4o" },
      }),
    ).toThrow("config.reviewerModel.provider");
  });

  it("rejects empty id", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        reviewerModel: { provider: "openai", id: "" },
      }),
    ).toThrow("config.reviewerModel.id");
  });

  it("rejects invalid thinkingLevel", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        reviewerModel: {
          provider: "openai",
          id: "gpt-4o",
          thinkingLevel: "extreme",
        },
      }),
    ).toThrow("config.reviewerModel.thinkingLevel");
  });

  it("rejects reviewerModel not object", () => {
    expect(() => validateConfig({ ...defaultConfig, reviewerModel: "bad" })).toThrow(
      "config.reviewerModel",
    );
  });

  // -----------------------------------------------------------------------
  // context
  // -----------------------------------------------------------------------

  it("rejects invalid context strategy", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        context: { ...defaultConfig.context, strategy: "bad" },
      }),
    ).toThrow("config.context.strategy");
  });

  it("rejects context.includeEventMessages not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        context: { ...defaultConfig.context, includeEventMessages: "yes" },
      }),
    ).toThrow("config.context.includeEventMessages");
  });

  it("rejects context.includeSessionSlice not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        context: { ...defaultConfig.context, includeSessionSlice: "yes" },
      }),
    ).toThrow("config.context.includeSessionSlice");
  });

  it("rejects negative maxSessionEntries", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        context: { ...defaultConfig.context, maxSessionEntries: -1 },
      }),
    ).toThrow("config.context.maxSessionEntries");
  });

  it("rejects non-integer maxSessionEntries", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        context: { ...defaultConfig.context, maxSessionEntries: 1.5 },
      }),
    ).toThrow("config.context.maxSessionEntries");
  });

  it("rejects context not object", () => {
    expect(() => validateConfig({ ...defaultConfig, context: "bad" })).toThrow("config.context");
  });

  // -----------------------------------------------------------------------
  // git
  // -----------------------------------------------------------------------

  it("rejects git.enabled not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        git: { ...defaultConfig.git, enabled: "yes" },
      }),
    ).toThrow("config.git.enabled");
  });

  it("rejects git.includeStatus not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        git: { ...defaultConfig.git, includeStatus: "yes" },
      }),
    ).toThrow("config.git.includeStatus");
  });

  it("rejects git.includeDiffStat not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        git: { ...defaultConfig.git, includeDiffStat: "yes" },
      }),
    ).toThrow("config.git.includeDiffStat");
  });

  it("rejects git.includeDiff not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        git: { ...defaultConfig.git, includeDiff: "yes" },
      }),
    ).toThrow("config.git.includeDiff");
  });

  it("rejects negative maxDiffChars", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        git: { ...defaultConfig.git, maxDiffChars: -1 },
      }),
    ).toThrow("config.git.maxDiffChars");
  });

  it("rejects non-integer maxStatusChars", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        git: { ...defaultConfig.git, maxStatusChars: 1.5 },
      }),
    ).toThrow("config.git.maxStatusChars");
  });

  it("rejects invalid maxDiffStatChars", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        git: { ...defaultConfig.git, maxDiffStatChars: "big" },
      }),
    ).toThrow("config.git.maxDiffStatChars");
  });

  it("rejects git not object", () => {
    expect(() => validateConfig({ ...defaultConfig, git: "bad" })).toThrow("config.git");
  });

  // -----------------------------------------------------------------------
  // reviewer
  // -----------------------------------------------------------------------

  it("rejects reviewer.requireJson not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        reviewer: { ...defaultConfig.reviewer, requireJson: "yes" },
      }),
    ).toThrow("config.reviewer.requireJson");
  });

  it("rejects reviewer.failClosedOnInvalidJson not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        reviewer: { ...defaultConfig.reviewer, failClosedOnInvalidJson: "yes" },
      }),
    ).toThrow("config.reviewer.failClosedOnInvalidJson");
  });

  it("rejects timeoutMs <= 0", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        reviewer: { ...defaultConfig.reviewer, timeoutMs: 0 },
      }),
    ).toThrow("config.reviewer.timeoutMs");
  });

  it("rejects negative timeoutMs", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        reviewer: { ...defaultConfig.reviewer, timeoutMs: -100 },
      }),
    ).toThrow("config.reviewer.timeoutMs");
  });

  it("rejects non-integer timeoutMs", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        reviewer: { ...defaultConfig.reviewer, timeoutMs: 100.5 },
      }),
    ).toThrow("config.reviewer.timeoutMs");
  });

  it("rejects reviewer not object", () => {
    expect(() => validateConfig({ ...defaultConfig, reviewer: "bad" })).toThrow("config.reviewer");
  });

  // -----------------------------------------------------------------------
  // ui
  // -----------------------------------------------------------------------

  it("rejects ui.notifyOnPass not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        ui: { ...defaultConfig.ui, notifyOnPass: "yes" },
      }),
    ).toThrow("config.ui.notifyOnPass");
  });

  it("rejects ui.notifyOnFail not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        ui: { ...defaultConfig.ui, notifyOnFail: "yes" },
      }),
    ).toThrow("config.ui.notifyOnFail");
  });

  it("rejects ui.showReviewerSummary not boolean", () => {
    expect(() =>
      validateConfig({
        ...defaultConfig,
        ui: { ...defaultConfig.ui, showReviewerSummary: "yes" },
      }),
    ).toThrow("config.ui.showReviewerSummary");
  });

  it("rejects ui not object", () => {
    expect(() => validateConfig({ ...defaultConfig, ui: "bad" })).toThrow("config.ui");
  });
});
