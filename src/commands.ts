import {
  COMMAND_REVIEW_GATE,
  COMMAND_REVIEW_GATE_MODEL,
  COMMAND_REVIEW_GATE_OFF,
  COMMAND_REVIEW_GATE_ON,
  COMMAND_REVIEW_GATE_STATUS,
} from "./constants.js";
import type { ReviewGateConfig } from "./types.js";

type CommandHandler = () => Promise<string | undefined> | string | undefined;

type CommandDefinition = {
  name: string;
  description: string;
  handler: CommandHandler;
};

export type ReviewGateCommandAPI = {
  registerCommand?: (
    name: string,
    options: {
      description?: string;
      handler: CommandHandler;
    },
  ) => void;
  command?: (
    command: string,
    handler: CommandHandler,
    options?: {
      description?: string;
    },
  ) => void;
  commands?: {
    register?: (
      command: string,
      handler: CommandHandler,
      options?: {
        description?: string;
      },
    ) => void;
  };
};

function registerCommand(pi: ReviewGateCommandAPI, definition: CommandDefinition): void {
  if (pi.registerCommand) {
    pi.registerCommand(definition.name, {
      description: definition.description,
      handler: definition.handler,
    });
    return;
  }
  if (pi.command) {
    pi.command(definition.name, definition.handler, {
      description: definition.description,
    });
    return;
  }
  if (pi.commands?.register) {
    pi.commands.register(definition.name, definition.handler, {
      description: definition.description,
    });
    return;
  }
  throw new Error("Pi command registration API is not available.");
}

function createEnabledConfig(config: ReviewGateConfig, enabled: boolean): ReviewGateConfig {
  return {
    ...config,
    enabled,
  };
}

function formatReviewerModel(config: ReviewGateConfig): string {
  if (config.reviewerModel === null) {
    return "[not configured]";
  }
  const base = `${config.reviewerModel.provider}/${config.reviewerModel.id}`;
  return config.reviewerModel.thinkingLevel
    ? `${base} (thinking: ${config.reviewerModel.thinkingLevel})`
    : base;
}

function formatReviewGateStatus(config: ReviewGateConfig): string {
  return `# Review Gate Status
Enabled: ${config.enabled}
Mode: ${config.mode}
Reviewer model: ${formatReviewerModel(config)}
Max correction cycles: ${config.maxCorrectionCycles}
## Context
Include event messages: ${config.context.includeEventMessages}
Include session slice: ${config.context.includeSessionSlice}
Max session entries: ${config.context.maxSessionEntries}
## Git
Enabled: ${config.git.enabled}
Include status: ${config.git.includeStatus}
Include diff stat: ${config.git.includeDiffStat}
Include diff: ${config.git.includeDiff}
## Reviewer
Timeout ms: ${config.reviewer.timeoutMs}
Require JSON: ${config.reviewer.requireJson}
Fail closed on invalid JSON: ${config.reviewer.failClosedOnInvalidJson}`;
}

export function registerCommands(params: {
  pi: ReviewGateCommandAPI;
  loadConfig: () => Promise<ReviewGateConfig>;
  saveConfig: (config: ReviewGateConfig) => Promise<void>;
}): void {
  const { pi, loadConfig, saveConfig } = params;

  const commands: CommandDefinition[] = [
    {
      name: COMMAND_REVIEW_GATE,
      description: "Open review gate menu.",
      handler: () => "Review gate menu is not implemented yet.",
    },
    {
      name: COMMAND_REVIEW_GATE_STATUS,
      description: "Show review gate status.",
      handler: async () => {
        const config = await loadConfig();
        return formatReviewGateStatus(config);
      },
    },
    {
      name: COMMAND_REVIEW_GATE_MODEL,
      description: "Configure reviewer model.",
      handler: () => "Review gate model command is not implemented yet.",
    },
    {
      name: COMMAND_REVIEW_GATE_ON,
      description: "Enable review gate.",
      handler: async () => {
        const config = await loadConfig();
        const nextConfig = createEnabledConfig(config, true);
        await saveConfig(nextConfig);
        return "Review gate enabled.";
      },
    },
    {
      name: COMMAND_REVIEW_GATE_OFF,
      description: "Disable review gate.",
      handler: async () => {
        const config = await loadConfig();
        const nextConfig = createEnabledConfig(config, false);
        await saveConfig(nextConfig);
        return "Review gate disabled.";
      },
    },
  ];

  for (const command of commands) {
    registerCommand(pi, command);
  }
}
