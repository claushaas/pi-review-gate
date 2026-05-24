import {
  COMMAND_REVIEW_GATE,
  COMMAND_REVIEW_GATE_MODEL,
  COMMAND_REVIEW_GATE_OFF,
  COMMAND_REVIEW_GATE_ON,
  COMMAND_REVIEW_GATE_STATUS,
} from "./constants.js";
import type { ModelRegistryAPI, ModelRegistryCandidate } from "./model.js";
import type { ReviewerModelConfig, ReviewGateConfig, ThinkingLevel } from "./types.js";

type CommandHandler = (input?: unknown) => Promise<string | undefined> | string | undefined;

type ReviewGateCommandContext = {
  modelRegistry?: ModelRegistryAPI;
};

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

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

function isThinkingLevel(value: string): value is ThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(value);
}

function extractCommandText(input: unknown): string {
  if (typeof input === "string") {
    return input.trim();
  }
  if (typeof input !== "object" || input === null) {
    return "";
  }
  for (const key of ["args", "input", "text", "message", "content"] as const) {
    if (key in input && typeof (input as Record<string, unknown>)[key] === "string") {
      return ((input as Record<string, unknown>)[key] as string).trim();
    }
  }
  return "";
}

type ParseModelResult = { ok: true; model: ReviewerModelConfig } | { ok: false; error: string };

function parseModelSelection(text: string): ParseModelResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "missing" };
  }
  const [modelSpec, thinkingLevelRaw, ...rest] = trimmed.split(/\s+/);
  if (!modelSpec || rest.length > 0) {
    return {
      ok: false,
      error: "Invalid reviewer model. Use /review-gate-model <provider>/<id> [thinkingLevel].",
    };
  }
  const slashIndex = modelSpec.indexOf("/");
  if (slashIndex <= 0 || slashIndex === modelSpec.length - 1) {
    return {
      ok: false,
      error: "Invalid reviewer model. Use /review-gate-model <provider>/<id> [thinkingLevel].",
    };
  }
  const provider = modelSpec.slice(0, slashIndex).trim();
  const id = modelSpec.slice(slashIndex + 1).trim();
  if (provider.length === 0 || id.length === 0) {
    return {
      ok: false,
      error: "Invalid reviewer model. Use /review-gate-model <provider>/<id> [thinkingLevel].",
    };
  }
  if (thinkingLevelRaw !== undefined && !isThinkingLevel(thinkingLevelRaw)) {
    return {
      ok: false,
      error: "Invalid thinking level. Expected one of: off, minimal, low, medium, high, xhigh.",
    };
  }
  return {
    ok: true,
    model: {
      provider,
      id,
      ...(thinkingLevelRaw ? { thinkingLevel: thinkingLevelRaw } : {}),
    },
  };
}

async function findModelCandidate(params: {
  modelRegistry: ModelRegistryAPI;
  provider: string;
  id: string;
}): Promise<ModelRegistryCandidate | null> {
  const { modelRegistry, provider, id } = params;

  if (modelRegistry.find) {
    const candidate = await modelRegistry.find(provider, id);
    return candidate ?? null;
  }

  if (!modelRegistry.getModels) {
    return null;
  }

  const models = await modelRegistry.getModels();
  return models.find((candidate) => candidate.provider === provider && candidate.id === id) ?? null;
}

function formatAvailableModels(models: ModelRegistryCandidate[]): string {
  return models
    .map((model, index) => {
      const label = `${model.provider ?? "?"}/${model.id ?? "?"}`;
      const suffix = model.name ? ` — ${model.name}` : "";
      return `${index + 1}. ${label}${suffix}`;
    })
    .join("\n");
}

function formatReviewerModelSetMessage(model: ReviewerModelConfig): string {
  const base = `Reviewer model set to ${model.provider}/${model.id}`;
  return model.thinkingLevel ? `${base} (thinking: ${model.thinkingLevel}).` : `${base}.`;
}

async function listReviewerModels(modelRegistry: ModelRegistryAPI): Promise<string> {
  if (!modelRegistry.getModels) {
    return "Model registry does not support listing models.";
  }
  const models = await modelRegistry.getModels();
  if (models.length === 0) {
    return "No models available in registry.";
  }
  const modelsList = formatAvailableModels(models);
  return `# Available Reviewer Models
Use:
/review-gate-model <provider>/<id> [thinkingLevel]
${modelsList}`;
}

async function handleReviewGateModel(params: {
  loadConfig: () => Promise<ReviewGateConfig>;
  saveConfig: (config: ReviewGateConfig) => Promise<void>;
  context?: ReviewGateCommandContext;
  input?: unknown;
}): Promise<string> {
  const { loadConfig, saveConfig, context, input } = params;
  const text = extractCommandText(input);

  if (text.length === 0) {
    const registry = context?.modelRegistry;
    if (!registry) {
      return "Model registry is not available.";
    }
    return await listReviewerModels(registry);
  }

  const parsed = parseModelSelection(text);
  if (!parsed.ok) {
    if (parsed.error === "missing") {
      const registry = context?.modelRegistry;
      if (!registry) {
        return "Model registry is not available.";
      }
      return await listReviewerModels(registry);
    }
    return parsed.error;
  }

  const registry = context?.modelRegistry;
  if (registry) {
    const candidate = await findModelCandidate({
      modelRegistry: registry,
      provider: parsed.model.provider,
      id: parsed.model.id,
    });
    const canValidate = Boolean(registry.find || registry.getModels);
    if (canValidate && candidate === null) {
      return `Reviewer model not found: ${parsed.model.provider}/${parsed.model.id}`;
    }
  }

  const config = await loadConfig();
  await saveConfig({
    ...config,
    reviewerModel: parsed.model,
  });
  return formatReviewerModelSetMessage(parsed.model);
}

// ---------------------------------------------------------------------------
// /review-gate menu helpers
// ---------------------------------------------------------------------------

function formatReviewGateMenu(config: ReviewGateConfig): string {
  const enabledStatus = config.enabled ? "enabled" : "disabled";
  const gitDiffStatus = config.git.includeDiff ? "enabled" : "disabled";
  const sessionContextStatus = config.context.includeSessionSlice ? "enabled" : "disabled";

  return `# Review Gate
Status: ${enabledStatus}
Mode: ${config.mode}
Reviewer model: ${formatReviewerModel(config)}
Max correction cycles: ${config.maxCorrectionCycles}
Git diff: ${gitDiffStatus}
Session context: ${sessionContextStatus}
## Commands
/review-gate status
/review-gate on
/review-gate off
/review-gate model
/review-gate model <provider>/<id> [thinkingLevel]
/review-gate thinking <thinkingLevel>
/review-gate max-cycles <number>
/review-gate toggle-git-diff
/review-gate toggle-session-context
/review-gate manual
Direct commands are also available:
/review-gate-status
/review-gate-on
/review-gate-off
/review-gate-model`;
}

function parseReviewGateMenuInput(text: string): { command: string; args: string } {
  const trimmed = text.trim();
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) {
    return { command: trimmed, args: "" };
  }
  return {
    command: trimmed.slice(0, firstSpace),
    args: trimmed.slice(firstSpace + 1).trim(),
  };
}

function isPositiveIntegerText(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const num = Number(value);
  return Number.isFinite(num) && Number.isInteger(num) && num >= 1 && String(num) === value;
}

async function handleReviewGateThinking(
  thinkingLevelRaw: string,
  loadConfig: () => Promise<ReviewGateConfig>,
  saveConfig: (config: ReviewGateConfig) => Promise<void>,
): Promise<string> {
  if (!isThinkingLevel(thinkingLevelRaw)) {
    return "Invalid thinking level. Expected one of: off, minimal, low, medium, high, xhigh.";
  }
  const config = await loadConfig();
  if (config.reviewerModel === null) {
    return "Reviewer model is not configured.";
  }
  await saveConfig({
    ...config,
    reviewerModel: {
      ...config.reviewerModel,
      thinkingLevel: thinkingLevelRaw,
    },
  });
  return `Reviewer thinking level set to ${thinkingLevelRaw}.`;
}

async function handleReviewGateMaxCycles(
  value: string,
  loadConfig: () => Promise<ReviewGateConfig>,
  saveConfig: (config: ReviewGateConfig) => Promise<void>,
): Promise<string> {
  if (!isPositiveIntegerText(value)) {
    return "Invalid max correction cycles. Expected a positive integer.";
  }
  const num = Number(value);
  const config = await loadConfig();
  await saveConfig({
    ...config,
    maxCorrectionCycles: num,
  });
  return `Max correction cycles set to ${num}.`;
}

async function handleReviewGateToggleGitDiff(
  loadConfig: () => Promise<ReviewGateConfig>,
  saveConfig: (config: ReviewGateConfig) => Promise<void>,
): Promise<string> {
  const config = await loadConfig();
  const newValue = !config.git.includeDiff;
  await saveConfig({
    ...config,
    git: {
      ...config.git,
      includeDiff: newValue,
    },
  });
  return newValue ? "Git diff collection enabled." : "Git diff collection disabled.";
}

async function handleReviewGateToggleSessionContext(
  loadConfig: () => Promise<ReviewGateConfig>,
  saveConfig: (config: ReviewGateConfig) => Promise<void>,
): Promise<string> {
  const config = await loadConfig();
  const newValue = !config.context.includeSessionSlice;
  await saveConfig({
    ...config,
    context: {
      ...config.context,
      includeSessionSlice: newValue,
    },
  });
  return newValue ? "Session context enabled." : "Session context disabled.";
}

export function registerCommands(params: {
  pi: ReviewGateCommandAPI;
  loadConfig: () => Promise<ReviewGateConfig>;
  saveConfig: (config: ReviewGateConfig) => Promise<void>;
  context?: ReviewGateCommandContext;
}): void {
  const { pi, loadConfig, saveConfig, context } = params;

  const commands: CommandDefinition[] = [
    {
      name: COMMAND_REVIEW_GATE,
      description: "Open review gate menu.",
      handler: async (input?: unknown) => {
        const text = extractCommandText(input);
        if (text.length === 0) {
          const config = await loadConfig();
          return formatReviewGateMenu(config);
        }
        const { command, args } = parseReviewGateMenuInput(text);

        if (command === "status") {
          const config = await loadConfig();
          return formatReviewGateStatus(config);
        }
        if (command === "on") {
          const config = await loadConfig();
          const nextConfig = createEnabledConfig(config, true);
          await saveConfig(nextConfig);
          return "Review gate enabled.";
        }
        if (command === "off") {
          const config = await loadConfig();
          const nextConfig = createEnabledConfig(config, false);
          await saveConfig(nextConfig);
          return "Review gate disabled.";
        }
        if (command === "model") {
          return await handleReviewGateModel({
            loadConfig,
            saveConfig,
            context,
            input: args || undefined,
          });
        }
        if (command === "thinking") {
          return await handleReviewGateThinking(args, loadConfig, saveConfig);
        }
        if (command === "max-cycles") {
          return await handleReviewGateMaxCycles(args, loadConfig, saveConfig);
        }
        if (command === "toggle-git-diff") {
          return await handleReviewGateToggleGitDiff(loadConfig, saveConfig);
        }
        if (command === "toggle-session-context") {
          return await handleReviewGateToggleSessionContext(loadConfig, saveConfig);
        }
        if (command === "manual") {
          return "Manual review is not implemented yet.";
        }
        return "Unknown review gate command. Run /review-gate to see available commands.";
      },
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
      handler: async (input?: unknown) => {
        return await handleReviewGateModel({
          loadConfig,
          saveConfig,
          context,
          input,
        });
      },
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
