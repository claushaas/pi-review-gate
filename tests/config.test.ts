import { describe, expect, it } from "vitest";
import { defaultConfig } from "../src/config.js";

describe("defaultConfig", () => {
  it("uses the expected top-level defaults", () => {
    expect(defaultConfig.enabled).toBe(true);
    expect(defaultConfig.mode).toBe("block");
    expect(defaultConfig.reviewerModel).toBeNull();
    expect(defaultConfig.maxCorrectionCycles).toBe(2);
  });

  it("uses the expected context defaults", () => {
    expect(defaultConfig.context).toEqual({
      strategy: "current_run",
      includeEventMessages: true,
      includeSessionSlice: true,
      maxSessionEntries: 40,
    });
  });

  it("uses the expected git defaults", () => {
    expect(defaultConfig.git).toEqual({
      enabled: true,
      includeStatus: true,
      includeDiffStat: true,
      includeDiff: true,
      maxDiffChars: 60_000,
      maxStatusChars: 12_000,
      maxDiffStatChars: 12_000,
    });
  });

  it("uses the expected reviewer defaults", () => {
    expect(defaultConfig.reviewer).toEqual({
      requireJson: true,
      failClosedOnInvalidJson: true,
      timeoutMs: 120_000,
    });
  });

  it("uses the expected ui defaults", () => {
    expect(defaultConfig.ui).toEqual({
      notifyOnPass: true,
      notifyOnFail: true,
      showReviewerSummary: true,
    });
  });
});
