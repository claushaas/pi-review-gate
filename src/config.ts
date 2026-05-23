import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
  DEFAULT_MAX_CORRECTION_CYCLES,
  DEFAULT_MAX_DIFF_CHARS,
  DEFAULT_MAX_DIFF_STAT_CHARS,
  DEFAULT_MAX_SESSION_ENTRIES,
  DEFAULT_MAX_STATUS_CHARS,
  DEFAULT_REVIEWER_TIMEOUT_MS,
} from "./constants.js";
import { validateConfig } from "./schema.js";
import type { ReviewGateConfig } from "./types.js";

export type PartialReviewGateConfig = {
  enabled?: ReviewGateConfig["enabled"];
  mode?: ReviewGateConfig["mode"];
  reviewerModel?: ReviewGateConfig["reviewerModel"];
  maxCorrectionCycles?: ReviewGateConfig["maxCorrectionCycles"];
  context?: Partial<ReviewGateConfig["context"]>;
  git?: Partial<ReviewGateConfig["git"]>;
  reviewer?: Partial<ReviewGateConfig["reviewer"]>;
  ui?: Partial<ReviewGateConfig["ui"]>;
};

export const defaultConfig: ReviewGateConfig = {
  enabled: true,
  mode: "block",
  reviewerModel: null,
  maxCorrectionCycles: DEFAULT_MAX_CORRECTION_CYCLES,
  context: {
    strategy: "current_run",
    includeEventMessages: true,
    includeSessionSlice: true,
    maxSessionEntries: DEFAULT_MAX_SESSION_ENTRIES,
  },
  git: {
    enabled: true,
    includeStatus: true,
    includeDiffStat: true,
    includeDiff: true,
    maxDiffChars: DEFAULT_MAX_DIFF_CHARS,
    maxStatusChars: DEFAULT_MAX_STATUS_CHARS,
    maxDiffStatChars: DEFAULT_MAX_DIFF_STAT_CHARS,
  },
  reviewer: {
    requireJson: true,
    failClosedOnInvalidJson: true,
    timeoutMs: DEFAULT_REVIEWER_TIMEOUT_MS,
  },
  ui: {
    notifyOnPass: true,
    notifyOnFail: true,
    showReviewerSummary: true,
  },
};

export function resolveConfigPath(homeDirectory = homedir()): string {
  return join(homeDirectory, ".config", CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

export function mergeConfig(partialConfig: PartialReviewGateConfig | undefined): ReviewGateConfig {
  return {
    ...defaultConfig,
    ...partialConfig,
    context: {
      ...defaultConfig.context,
      ...partialConfig?.context,
    },
    git: {
      ...defaultConfig.git,
      ...partialConfig?.git,
    },
    reviewer: {
      ...defaultConfig.reviewer,
      ...partialConfig?.reviewer,
    },
    ui: {
      ...defaultConfig.ui,
      ...partialConfig?.ui,
    },
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function loadConfig(configPath = resolveConfigPath()): Promise<ReviewGateConfig> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return validateConfig(mergeConfig(parsed as PartialReviewGateConfig));
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return validateConfig(mergeConfig(undefined));
    }
    throw error;
  }
}

export async function saveConfig(
  config: ReviewGateConfig,
  configPath = resolveConfigPath(),
): Promise<void> {
  const directory = dirname(configPath);
  await mkdir(directory, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  try {
    await chmod(configPath, 0o600);
  } catch {
    // Ignore chmod failures for cross-platform compatibility.
  }
}
