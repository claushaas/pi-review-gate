import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
  COMMAND_REVIEW_GATE,
  COMMAND_REVIEW_GATE_MODEL,
  COMMAND_REVIEW_GATE_OFF,
  COMMAND_REVIEW_GATE_ON,
  COMMAND_REVIEW_GATE_STATUS,
} from "./constants.js";
import type { ModelRegistryAPI, ModelRegistryCandidate } from "./model.js";
import type { ReviewerModelConfig, ReviewGateConfig, ThinkingLevel } from "./types.js";

type CommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

type ReviewGateCommandContext = {
  modelRegistry?: ModelRegistryAPI;
};

type CommandDefinition = {
  name: string;
  description: string;
  handler: CommandHandler;
};

export type ReviewGateCommandAPI = {
  registerCommand(
    name: string,
    options: {
      description?: string;
      handler: CommandHandler;
    },
  ): void;
};

function toRuntimeCommandName(name: string): string {
  return name.startsWith("/") ? name.slice(1) : name;
}

function registerCommand(pi: ReviewGateCommandAPI, definition: CommandDefinition): void {
  pi.registerCommand(toRuntimeCommandName(definition.name), {
    description: definition.description,
    handler: definition.handler,
  });
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

function extractCommandArgs(args: string): string {
  return args.trim();
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

async function getRegistryModels(
  modelRegistry: ModelRegistryAPI,
): Promise<ModelRegistryCandidate[] | null> {
  if (modelRegistry.getAvailable) {
    return await modelRegistry.getAvailable();
  }
  if (modelRegistry.getModels) {
    return await modelRegistry.getModels();
  }
  if (modelRegistry.getAll) {
    return await modelRegistry.getAll();
  }
  return null;
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

  const models = await getRegistryModels(modelRegistry);
  return (
    models?.find((candidate) => candidate.provider === provider && candidate.id === id) ?? null
  );
}

function formatModelLabel(model: ModelRegistryCandidate): string {
  const label = `${model.provider ?? "?"}/${model.id ?? "?"}`;
  const suffix = model.name ? ` — ${model.name}` : "";
  return `${label}${suffix}`;
}

function formatAvailableModels(models: ModelRegistryCandidate[]): string {
  return models.map((model, index) => `${index + 1}. ${formatModelLabel(model)}`).join("\n");
}

function formatReviewerModelSetMessage(model: ReviewerModelConfig): string {
  const base = `Reviewer model set to ${model.provider}/${model.id}`;
  return model.thinkingLevel ? `${base} (thinking: ${model.thinkingLevel}).` : `${base}.`;
}

async function listReviewerModels(modelRegistry: ModelRegistryAPI): Promise<string> {
  const models = await getRegistryModels(modelRegistry);
  if (models === null) {
    return "Model registry does not support listing models.";
  }
  if (models.length === 0) {
    return "No models available in registry.";
  }
  const modelsList = formatAvailableModels(models);
  return `# Available Reviewer Models
Use:
/review-gate-model <provider>/<id> [thinkingLevel]
${modelsList}`;
}

function modelCandidateToId(model: ModelRegistryCandidate): string {
  return `${model.provider ?? "?"}/${model.id ?? "?"}`;
}

function modelCandidateToLabel(model: ModelRegistryCandidate): string {
  const id = modelCandidateToId(model);
  const suffix = model.name ? ` — ${model.name}` : "";
  return `${id}${suffix}`;
}

function getModelRegistry(
  context: ReviewGateCommandContext | undefined,
  ctx: ExtensionCommandContext,
): ModelRegistryAPI | undefined {
  return (ctx.modelRegistry as unknown as ModelRegistryAPI | undefined) ?? context?.modelRegistry;
}

async function handleReviewGateModel(params: {
  loadConfig: () => Promise<ReviewGateConfig>;
  saveConfig: (config: ReviewGateConfig) => Promise<void>;
  context?: ReviewGateCommandContext;
  args: string;
  ctx: ExtensionCommandContext;
}): Promise<void> {
  const { loadConfig, saveConfig, context, args, ctx } = params;
  const text = extractCommandArgs(args);

  if (text.length === 0) {
    const registry = getModelRegistry(context, ctx);
    if (!registry) {
      ctx.ui.notify("Model registry is not available.");
      return;
    }
    const models = await getRegistryModels(registry);
    if (models === null) {
      ctx.ui.notify("Model registry does not support listing models.");
      return;
    }
    if (models.length === 0) {
      ctx.ui.notify("No models available in registry.");
      return;
    }

    const choice = await ctx.ui.select(
      "Select reviewer model:",
      models.map((model) => modelCandidateToId(model)),
    );

    if (choice === null || choice === undefined) {
      return;
    }

    await applyModelSelection({
      modelSpec: String(choice),
      loadConfig,
      saveConfig,
      context,
      ctx,
    });
    return;
  }

  await applyModelSelection({
    modelSpec: text,
    loadConfig,
    saveConfig,
    context,
    ctx,
  });
}

async function applyModelSelection(params: {
  modelSpec: string;
  loadConfig: () => Promise<ReviewGateConfig>;
  saveConfig: (config: ReviewGateConfig) => Promise<void>;
  context?: ReviewGateCommandContext;
  ctx: ExtensionCommandContext;
}): Promise<void> {
  const { modelSpec, loadConfig, saveConfig, context, ctx } = params;

  const parsed = parseModelSelection(modelSpec);
  if (!parsed.ok) {
    ctx.ui.notify(parsed.error);
    return;
  }

  const registry = getModelRegistry(context, ctx);
  if (registry) {
    const candidate = await findModelCandidate({
      modelRegistry: registry,
      provider: parsed.model.provider,
      id: parsed.model.id,
    });
    const canValidate = Boolean(
      registry.find || registry.getAvailable || registry.getModels || registry.getAll,
    );
    if (canValidate && candidate === null) {
      ctx.ui.notify(`Reviewer model not found: ${parsed.model.provider}/${parsed.model.id}`);
      return;
    }
  }

  const config = await loadConfig();
  await saveConfig({
    ...config,
    reviewerModel: parsed.model,
  });
  ctx.ui.notify(formatReviewerModelSetMessage(parsed.model));
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
Reviewer timeout: ${config.reviewer.timeoutMs}ms
## Commands
/review-gate status
/review-gate on
/review-gate off
/review-gate model              (interactive picker when no args)
/review-gate model <provider>/<id> [thinkingLevel]
/review-gate thinking           (interactive picker when no args)
/review-gate thinking <thinkingLevel>
/review-gate timeout <ms>
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
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (thinkingLevelRaw.length === 0) {
    const choice = await ctx.ui.select("Select reviewer thinking level:", [...THINKING_LEVELS]);

    if (choice === null || choice === undefined) {
      return;
    }
    thinkingLevelRaw = String(choice);
  }

  if (!isThinkingLevel(thinkingLevelRaw)) {
    ctx.ui.notify(
      "Invalid thinking level. Expected one of: off, minimal, low, medium, high, xhigh.",
    );
    return;
  }
  const config = await loadConfig();
  if (config.reviewerModel === null) {
    ctx.ui.notify("Reviewer model is not configured.");
    return;
  }
  await saveConfig({
    ...config,
    reviewerModel: {
      ...config.reviewerModel,
      thinkingLevel: thinkingLevelRaw,
    },
  });
  ctx.ui.notify(`Reviewer thinking level set to ${thinkingLevelRaw}.`);
}

async function handleReviewGateMaxCycles(
  value: string,
  loadConfig: () => Promise<ReviewGateConfig>,
  saveConfig: (config: ReviewGateConfig) => Promise<void>,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!isPositiveIntegerText(value)) {
    ctx.ui.notify("Invalid max correction cycles. Expected a positive integer.");
    return;
  }
  const num = Number(value);
  const config = await loadConfig();
  await saveConfig({
    ...config,
    maxCorrectionCycles: num,
  });
  ctx.ui.notify(`Max correction cycles set to ${num}.`);
}

async function handleReviewGateTimeout(
  value: string,
  loadConfig: () => Promise<ReviewGateConfig>,
  saveConfig: (config: ReviewGateConfig) => Promise<void>,
  ctx: ExtensionCommandContext,
): Promise<void> {
  if (!isPositiveIntegerText(value)) {
    ctx.ui.notify("Invalid timeout. Expected a positive integer (milliseconds).");
    return;
  }
  const num = Number(value);
  if (num < 5000) {
    ctx.ui.notify("Timeout must be at least 5000ms (5 seconds).");
    return;
  }
  const config = await loadConfig();
  await saveConfig({
    ...config,
    reviewer: {
      ...config.reviewer,
      timeoutMs: num,
    },
  });
  ctx.ui.notify(`Reviewer timeout set to ${num}ms (${(num / 1000).toFixed(0)}s).`);
}

async function handleReviewGateToggleGitDiff(
  loadConfig: () => Promise<ReviewGateConfig>,
  saveConfig: (config: ReviewGateConfig) => Promise<void>,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const config = await loadConfig();
  const newValue = !config.git.includeDiff;
  await saveConfig({
    ...config,
    git: {
      ...config.git,
      includeDiff: newValue,
    },
  });
  ctx.ui.notify(newValue ? "Git diff collection enabled." : "Git diff collection disabled.");
}

async function handleReviewGateToggleSessionContext(
  loadConfig: () => Promise<ReviewGateConfig>,
  saveConfig: (config: ReviewGateConfig) => Promise<void>,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const config = await loadConfig();
  const newValue = !config.context.includeSessionSlice;
  await saveConfig({
    ...config,
    context: {
      ...config.context,
      includeSessionSlice: newValue,
    },
  });
  ctx.ui.notify(newValue ? "Session context enabled." : "Session context disabled.");
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
      handler: async (args: string, ctx: ExtensionCommandContext) => {
        const text = extractCommandArgs(args);
        if (text.length === 0) {
          const config = await loadConfig();
          ctx.ui.notify(formatReviewGateMenu(config));
          return;
        }
        const { command, args: subArgs } = parseReviewGateMenuInput(text);

        if (command === "status") {
          const config = await loadConfig();
          ctx.ui.notify(formatReviewGateStatus(config));
          return;
        }
        if (command === "on") {
          const config = await loadConfig();
          const nextConfig = createEnabledConfig(config, true);
          await saveConfig(nextConfig);
          ctx.ui.notify("Review gate enabled.");
          return;
        }
        if (command === "off") {
          const config = await loadConfig();
          const nextConfig = createEnabledConfig(config, false);
          await saveConfig(nextConfig);
          ctx.ui.notify("Review gate disabled.");
          return;
        }
        if (command === "model") {
          await handleReviewGateModel({
            loadConfig,
            saveConfig,
            context,
            args: subArgs,
            ctx,
          });
          return;
        }
        if (command === "thinking") {
          await handleReviewGateThinking(subArgs, loadConfig, saveConfig, ctx);
          return;
        }
        if (command === "max-cycles") {
          await handleReviewGateMaxCycles(subArgs, loadConfig, saveConfig, ctx);
          return;
        }
        if (command === "timeout") {
          await handleReviewGateTimeout(subArgs, loadConfig, saveConfig, ctx);
          return;
        }
        if (command === "toggle-git-diff") {
          await handleReviewGateToggleGitDiff(loadConfig, saveConfig, ctx);
          return;
        }
        if (command === "toggle-session-context") {
          await handleReviewGateToggleSessionContext(loadConfig, saveConfig, ctx);
          return;
        }
        if (command === "manual") {
          ctx.ui.notify("Manual review is not implemented yet.");
          return;
        }
        ctx.ui.notify("Unknown review gate command. Run /review-gate to see available commands.");
      },
    },
    {
      name: COMMAND_REVIEW_GATE_STATUS,
      description: "Show review gate status.",
      handler: async (_args: string, ctx: ExtensionCommandContext) => {
        const config = await loadConfig();
        ctx.ui.notify(formatReviewGateStatus(config));
      },
    },
    {
      name: COMMAND_REVIEW_GATE_MODEL,
      description: "Configure reviewer model.",
      handler: async (args: string, ctx: ExtensionCommandContext) => {
        await handleReviewGateModel({
          loadConfig,
          saveConfig,
          context,
          args,
          ctx,
        });
      },
    },
    {
      name: COMMAND_REVIEW_GATE_ON,
      description: "Enable review gate.",
      handler: async (_args: string, ctx: ExtensionCommandContext) => {
        const config = await loadConfig();
        const nextConfig = createEnabledConfig(config, true);
        await saveConfig(nextConfig);
        ctx.ui.notify("Review gate enabled.");
      },
    },
    {
      name: COMMAND_REVIEW_GATE_OFF,
      description: "Disable review gate.",
      handler: async (_args: string, ctx: ExtensionCommandContext) => {
        const config = await loadConfig();
        const nextConfig = createEnabledConfig(config, false);
        await saveConfig(nextConfig);
        ctx.ui.notify("Review gate disabled.");
      },
    },
  ];

  for (const command of commands) {
    registerCommand(pi, command);
  }
}
