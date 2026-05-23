import { describe, expect, it, vi } from "vitest";
import { defaultConfig } from "../src/config.js";
import {
  GIT_DIFF_STAT_TIMEOUT_MS,
  GIT_DIFF_TIMEOUT_MS,
  GIT_STATUS_TIMEOUT_MS,
} from "../src/constants.js";
import { collectGitContext } from "../src/git.js";

describe("collectGitContext", () => {
  it("collects git status, diff stat, and diff when enabled", async () => {
    const pi = {
      exec: vi.fn(async (_command: string, args: string[]) => {
        const joinedArgs = args.join(" ");
        if (joinedArgs === "status --short") {
          return { stdout: " M src/git.ts\n" };
        }
        if (joinedArgs === "diff --stat") {
          return { stdout: " src/git.ts | 10 ++++++++++\n" };
        }
        if (joinedArgs === "diff") {
          return { stdout: "diff --git a/src/git.ts b/src/git.ts\n" };
        }
        throw new Error(`Unexpected args: ${joinedArgs}`);
      }),
    };

    const result = await collectGitContext({
      pi,
      config: defaultConfig,
    });

    expect(result).toEqual({
      status: " M src/git.ts\n",
      diffStat: " src/git.ts | 10 ++++++++++\n",
      diff: "diff --git a/src/git.ts b/src/git.ts\n",
    });

    expect(pi.exec).toHaveBeenCalledWith("git", ["status", "--short"], {
      timeout: GIT_STATUS_TIMEOUT_MS,
      signal: undefined,
    });
    expect(pi.exec).toHaveBeenCalledWith("git", ["diff", "--stat"], {
      timeout: GIT_DIFF_STAT_TIMEOUT_MS,
      signal: undefined,
    });
    expect(pi.exec).toHaveBeenCalledWith("git", ["diff"], {
      timeout: GIT_DIFF_TIMEOUT_MS,
      signal: undefined,
    });
  });

  it("does not execute git commands when git collection is disabled", async () => {
    const pi = {
      exec: vi.fn(),
    };
    const config = {
      ...defaultConfig,
      git: {
        ...defaultConfig.git,
        enabled: false,
      },
    };

    const result = await collectGitContext({
      pi,
      config,
    });

    expect(result).toEqual({
      status: null,
      diffStat: null,
      diff: null,
    });
    expect(pi.exec).not.toHaveBeenCalled();
  });

  it("respects disabled individual git flags", async () => {
    const pi = {
      exec: vi.fn(async (_command: string, args: string[]) => {
        if (args.join(" ") === "diff") {
          return { stdout: "diff output" };
        }
        throw new Error(`Unexpected args: ${args.join(" ")}`);
      }),
    };
    const config = {
      ...defaultConfig,
      git: {
        ...defaultConfig.git,
        includeStatus: false,
        includeDiffStat: false,
        includeDiff: true,
      },
    };

    const result = await collectGitContext({
      pi,
      config,
    });

    expect(result).toEqual({
      status: null,
      diffStat: null,
      diff: "diff output",
    });
    expect(pi.exec).toHaveBeenCalledTimes(1);
    expect(pi.exec).toHaveBeenCalledWith("git", ["diff"], {
      timeout: GIT_DIFF_TIMEOUT_MS,
      signal: undefined,
    });
  });

  it("propagates the abort signal to executed commands", async () => {
    const signal = new AbortController().signal;
    const pi = {
      exec: vi.fn(async () => ({ stdout: "" })),
    };

    await collectGitContext({
      pi,
      config: defaultConfig,
      signal,
    });

    expect(pi.exec).toHaveBeenCalledWith("git", ["status", "--short"], {
      timeout: GIT_STATUS_TIMEOUT_MS,
      signal,
    });
    expect(pi.exec).toHaveBeenCalledWith("git", ["diff", "--stat"], {
      timeout: GIT_DIFF_STAT_TIMEOUT_MS,
      signal,
    });
    expect(pi.exec).toHaveBeenCalledWith("git", ["diff"], {
      timeout: GIT_DIFF_TIMEOUT_MS,
      signal,
    });
  });

  it("uses empty strings when stdout is missing", async () => {
    const pi = {
      exec: vi.fn(async () => ({})),
    };

    const result = await collectGitContext({
      pi,
      config: defaultConfig,
    });

    expect(result).toEqual({
      status: "",
      diffStat: "",
      diff: "",
    });
  });

  it("propagates exec errors in this step", async () => {
    const pi = {
      exec: vi.fn(async () => {
        throw new Error("git failed");
      }),
    };

    await expect(
      collectGitContext({
        pi,
        config: defaultConfig,
      }),
    ).rejects.toThrow("git failed");
  });

  it("does not mutate config", async () => {
    const pi = {
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const config = {
      ...defaultConfig,
      git: {
        ...defaultConfig.git,
      },
    };
    const before = JSON.stringify(config);

    await collectGitContext({
      pi,
      config,
    });

    expect(JSON.stringify(config)).toBe(before);
  });

  it("returns null for status when includeStatus is false", async () => {
    const pi = {
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const config = {
      ...defaultConfig,
      git: {
        ...defaultConfig.git,
        includeStatus: false,
      },
    };

    const result = await collectGitContext({ pi, config });

    expect(result.status).toBeNull();
  });

  it("returns null for diffStat when includeDiffStat is false", async () => {
    const pi = {
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const config = {
      ...defaultConfig,
      git: {
        ...defaultConfig.git,
        includeDiffStat: false,
      },
    };

    const result = await collectGitContext({ pi, config });

    expect(result.diffStat).toBeNull();
  });

  it("returns null for diff when includeDiff is false", async () => {
    const pi = {
      exec: vi.fn(async () => ({ stdout: "" })),
    };
    const config = {
      ...defaultConfig,
      git: {
        ...defaultConfig.git,
        includeDiff: false,
      },
    };

    const result = await collectGitContext({ pi, config });

    expect(result.diff).toBeNull();
  });
});
