import {
  GIT_DIFF_STAT_TIMEOUT_MS,
  GIT_DIFF_TIMEOUT_MS,
  GIT_STATUS_TIMEOUT_MS,
} from "./constants.js";
import type { GitContext, ReviewGateConfig } from "./types.js";

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
    };
  }

  const status = config.git.includeStatus
    ? ((
        await pi.exec("git", ["status", "--short"], {
          timeout: GIT_STATUS_TIMEOUT_MS,
          signal,
        })
      ).stdout ?? "")
    : null;

  const diffStat = config.git.includeDiffStat
    ? ((
        await pi.exec("git", ["diff", "--stat"], {
          timeout: GIT_DIFF_STAT_TIMEOUT_MS,
          signal,
        })
      ).stdout ?? "")
    : null;

  const diff = config.git.includeDiff
    ? ((
        await pi.exec("git", ["diff"], {
          timeout: GIT_DIFF_TIMEOUT_MS,
          signal,
        })
      ).stdout ?? "")
    : null;

  return {
    status,
    diffStat,
    diff,
  };
}
