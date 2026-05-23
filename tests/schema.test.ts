import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";
import { parseReviewGateResult, validateConfig } from "../src/schema.js";

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

// ---------------------------------------------------------------------------
// parseReviewGateResult
// ---------------------------------------------------------------------------

const validApprovedResult = {
  approved: true,
  severity: "pass",
  summary: "Delivery satisfies the request.",
  requiredCorrections: [],
  recommendedCorrections: [],
  evidence: ["Diff matches final response."],
  confidence: "high",
} as const;

const validRejectedResult = {
  approved: false,
  severity: "blocking",
  summary: "Missing error handling.",
  requiredCorrections: ["Add try/catch around the async call."],
  recommendedCorrections: ["Consider using a Result type."],
  evidence: ["Line 42 has unhandled promise rejection."],
  confidence: "high",
} as const;

describe("parseReviewGateResult", () => {
  // -----------------------------------------------------------------------
  // Valid results
  // -----------------------------------------------------------------------

  it("accepts a valid approved result", () => {
    expect(parseReviewGateResult(validApprovedResult)).toEqual(validApprovedResult);
  });

  it("accepts a valid rejected result with at least one required correction", () => {
    expect(parseReviewGateResult(validRejectedResult)).toEqual(validRejectedResult);
  });

  it("accepts requiredCorrections: [] when approved === true", () => {
    expect(
      parseReviewGateResult({ ...validApprovedResult, requiredCorrections: [] }),
    ).toBeDefined();
  });

  it("accepts recommendedCorrections: []", () => {
    expect(
      parseReviewGateResult({ ...validApprovedResult, recommendedCorrections: [] }),
    ).toBeDefined();
  });

  it("accepts evidence: []", () => {
    expect(parseReviewGateResult({ ...validApprovedResult, evidence: [] })).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Top-level invalid
  // -----------------------------------------------------------------------

  it("rejects null", () => {
    expect(() => parseReviewGateResult(null)).toThrow("Invalid review result");
  });

  it("rejects array", () => {
    expect(() => parseReviewGateResult([])).toThrow("Invalid review result");
  });

  it("rejects string", () => {
    expect(() => parseReviewGateResult("nope")).toThrow("Invalid review result");
  });

  it("rejects empty object", () => {
    expect(() => parseReviewGateResult({})).toThrow("reviewResult");
  });

  // -----------------------------------------------------------------------
  // approved
  // -----------------------------------------------------------------------

  it("rejects missing approved", () => {
    const { approved: _, ...rest } = validApprovedResult;
    expect(() => parseReviewGateResult(rest)).toThrow("reviewResult.approved");
  });

  it("rejects approved string", () => {
    expect(() => parseReviewGateResult({ ...validApprovedResult, approved: "true" })).toThrow(
      "reviewResult.approved",
    );
  });

  it("accepts approved: true", () => {
    expect(parseReviewGateResult({ ...validApprovedResult, approved: true })).toBeDefined();
  });

  it("accepts approved: false", () => {
    expect(
      parseReviewGateResult({
        ...validRejectedResult,
        approved: false,
      }),
    ).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // severity
  // -----------------------------------------------------------------------

  it.each(["pass", "minor", "major", "blocking"] as const)("accepts severity: %s", (severity) => {
    expect(parseReviewGateResult({ ...validApprovedResult, severity })).toBeDefined();
  });

  it("rejects invalid severity", () => {
    expect(() => parseReviewGateResult({ ...validApprovedResult, severity: "critical" })).toThrow(
      "reviewResult.severity",
    );
  });

  it("rejects missing severity", () => {
    const { severity: _, ...rest } = validApprovedResult;
    expect(() => parseReviewGateResult(rest)).toThrow("reviewResult.severity");
  });

  // -----------------------------------------------------------------------
  // summary
  // -----------------------------------------------------------------------

  it("rejects missing summary", () => {
    const { summary: _, ...rest } = validApprovedResult;
    expect(() => parseReviewGateResult(rest)).toThrow("reviewResult.summary");
  });

  it("rejects non-string summary", () => {
    expect(() => parseReviewGateResult({ ...validApprovedResult, summary: 42 })).toThrow(
      "reviewResult.summary",
    );
  });

  it("rejects empty summary", () => {
    expect(() => parseReviewGateResult({ ...validApprovedResult, summary: "" })).toThrow(
      "reviewResult.summary",
    );
  });

  it("rejects whitespace-only summary", () => {
    expect(() => parseReviewGateResult({ ...validApprovedResult, summary: "   " })).toThrow(
      "reviewResult.summary",
    );
  });

  it("accepts non-empty summary", () => {
    expect(
      parseReviewGateResult({
        ...validApprovedResult,
        summary: "All good.",
      }),
    ).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // requiredCorrections
  // -----------------------------------------------------------------------

  it("rejects missing requiredCorrections", () => {
    const { requiredCorrections: _, ...rest } = validApprovedResult;
    expect(() => parseReviewGateResult(rest)).toThrow("reviewResult.requiredCorrections");
  });

  it("rejects non-array requiredCorrections", () => {
    expect(() =>
      parseReviewGateResult({
        ...validApprovedResult,
        requiredCorrections: "fix it",
      }),
    ).toThrow("reviewResult.requiredCorrections");
  });

  it("rejects non-string item in requiredCorrections", () => {
    expect(() =>
      parseReviewGateResult({
        ...validApprovedResult,
        requiredCorrections: [42],
      }),
    ).toThrow("reviewResult.requiredCorrections");
  });

  it("rejects empty string item in requiredCorrections", () => {
    expect(() =>
      parseReviewGateResult({
        ...validApprovedResult,
        requiredCorrections: [""],
      }),
    ).toThrow("reviewResult.requiredCorrections");
  });

  it("rejects empty array when approved === false", () => {
    expect(() =>
      parseReviewGateResult({
        ...validApprovedResult,
        approved: false,
        severity: "blocking",
        requiredCorrections: [],
      }),
    ).toThrow("reviewResult.requiredCorrections");
  });

  it("accepts empty array when approved === true", () => {
    expect(
      parseReviewGateResult({
        ...validApprovedResult,
        approved: true,
        requiredCorrections: [],
      }),
    ).toBeDefined();
  });

  it("accepts array with non-empty strings when approved === false", () => {
    expect(
      parseReviewGateResult({
        ...validRejectedResult,
        requiredCorrections: ["Fix line 10."],
      }),
    ).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // recommendedCorrections
  // -----------------------------------------------------------------------

  it("rejects missing recommendedCorrections", () => {
    const { recommendedCorrections: _, ...rest } = validApprovedResult;
    expect(() => parseReviewGateResult(rest)).toThrow("reviewResult.recommendedCorrections");
  });

  it("rejects non-array recommendedCorrections", () => {
    expect(() =>
      parseReviewGateResult({
        ...validApprovedResult,
        recommendedCorrections: "maybe",
      }),
    ).toThrow("reviewResult.recommendedCorrections");
  });

  it("rejects non-string item in recommendedCorrections", () => {
    expect(() =>
      parseReviewGateResult({
        ...validApprovedResult,
        recommendedCorrections: [42],
      }),
    ).toThrow("reviewResult.recommendedCorrections");
  });

  it("rejects empty string item in recommendedCorrections", () => {
    expect(() =>
      parseReviewGateResult({
        ...validApprovedResult,
        recommendedCorrections: [""],
      }),
    ).toThrow("reviewResult.recommendedCorrections");
  });

  it("accepts empty array", () => {
    expect(
      parseReviewGateResult({
        ...validApprovedResult,
        recommendedCorrections: [],
      }),
    ).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // evidence
  // -----------------------------------------------------------------------

  it("rejects missing evidence", () => {
    const { evidence: _, ...rest } = validApprovedResult;
    expect(() => parseReviewGateResult(rest)).toThrow("reviewResult.evidence");
  });

  it("rejects non-array evidence", () => {
    expect(() => parseReviewGateResult({ ...validApprovedResult, evidence: "stuff" })).toThrow(
      "reviewResult.evidence",
    );
  });

  it("rejects non-string item in evidence", () => {
    expect(() => parseReviewGateResult({ ...validApprovedResult, evidence: [42] })).toThrow(
      "reviewResult.evidence",
    );
  });

  it("rejects empty string item in evidence", () => {
    expect(() => parseReviewGateResult({ ...validApprovedResult, evidence: [""] })).toThrow(
      "reviewResult.evidence",
    );
  });

  it("accepts empty array", () => {
    expect(parseReviewGateResult({ ...validApprovedResult, evidence: [] })).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // confidence
  // -----------------------------------------------------------------------

  it.each(["low", "medium", "high"] as const)("accepts confidence: %s", (confidence) => {
    expect(parseReviewGateResult({ ...validApprovedResult, confidence })).toBeDefined();
  });

  it("rejects invalid confidence", () => {
    expect(() => parseReviewGateResult({ ...validApprovedResult, confidence: "unknown" })).toThrow(
      "reviewResult.confidence",
    );
  });

  it("rejects missing confidence", () => {
    const { confidence: _, ...rest } = validApprovedResult;
    expect(() => parseReviewGateResult(rest)).toThrow("reviewResult.confidence");
  });
});
