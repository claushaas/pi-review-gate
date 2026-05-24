import {
  GIT_DIFF_STAT_TIMEOUT_MS,
  GIT_DIFF_TIMEOUT_MS,
  GIT_STATUS_TIMEOUT_MS,
} from "./constants.js";
import type { GitContext, ReviewGateConfig } from "./types.js";
import { truncateWithMarker } from "./utils.js";

type GitExecAPI = {
  exec(
    command: string,
    args: string[],
    options?: {
      timeout?: number;
      signal?: AbortSignal;
    },
  ): Promise<{
    stdout?: string;
    stderr?: string;
    code?: number | null;
    killed?: boolean;
  }>;
};

function getErrorText(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (typeof error !== "object" || error === null) {
    return "";
  }
  const parts: string[] = [];
  if ("stderr" in error && typeof error.stderr === "string") {
    parts.push(error.stderr);
  }
  if ("stdout" in error && typeof error.stdout === "string") {
    parts.push(error.stdout);
  }
  if ("message" in error && typeof error.message === "string") {
    parts.push(error.message);
  }
  return parts.join("\n");
}

function extractGitErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    if ("stderr" in error && typeof error.stderr === "string" && error.stderr.length > 0) {
      return error.stderr;
    }
    if ("stdout" in error && typeof error.stdout === "string" && error.stdout.length > 0) {
      return error.stdout;
    }
    if ("message" in error && typeof error.message === "string" && error.message.length > 0) {
      return error.message;
    }
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return "unknown Git error.";
}

export function isNotGitRepositoryError(error: unknown): boolean {
  const text = getErrorText(error);
  return /not a git repository/i.test(text);
}

export async function collectGitContext(params: {
  pi: GitExecAPI;
  config: ReviewGateConfig;
  signal?: AbortSignal;
}): Promise<GitContext> {
  const { pi, config, signal } = params;

  if (!config.git.enabled) {
    return {
      status: null,
      diffStat: null,
      diff: null,
      unavailableReason: "Git collection is disabled.",
    };
  }

  try {
    const status = config.git.includeStatus
      ? truncateWithMarker(
          (
            await pi.exec("git", ["status", "--short"], {
              timeout: GIT_STATUS_TIMEOUT_MS,
              signal,
            })
          ).stdout ?? "",
          config.git.maxStatusChars,
        )
      : null;

    const diffStat = config.git.includeDiffStat
      ? truncateWithMarker(
          (
            await pi.exec("git", ["diff", "--stat"], {
              timeout: GIT_DIFF_STAT_TIMEOUT_MS,
              signal,
            })
          ).stdout ?? "",
          config.git.maxDiffStatChars,
        )
      : null;

    const diff = config.git.includeDiff
      ? truncateWithMarker(
          (
            await pi.exec("git", ["diff"], {
              timeout: GIT_DIFF_TIMEOUT_MS,
              signal,
            })
          ).stdout ?? "",
          config.git.maxDiffChars,
        )
      : null;

    return {
      status,
      diffStat,
      diff,
    };
  } catch (error) {
    if (isNotGitRepositoryError(error)) {
      return {
        status: null,
        diffStat: null,
        diff: null,
        unavailableReason: "Git context unavailable: not a git repository.",
      };
    }
    return {
      status: null,
      diffStat: null,
      diff: null,
      unavailableReason: `Git context unavailable: ${extractGitErrorMessage(error)}`,
    };
  }
}
