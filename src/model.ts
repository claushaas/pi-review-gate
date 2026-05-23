import type { ReviewerModelConfig } from "./types.js";

export type ModelRegistryCandidate = {
  provider?: string;
  id?: string;
  name?: string;
  complete?: (params: {
    systemPrompt: string;
    userPrompt: string;
    signal?: AbortSignal;
    timeoutMs: number;
    thinkingLevel?: ReviewerModelConfig["thinkingLevel"];
  }) => Promise<string>;
};

export type ModelRegistryAPI = {
  getModels?: () => ModelRegistryCandidate[] | Promise<ModelRegistryCandidate[]>;
  find?: (
    provider: string,
    id: string,
  ) => ModelRegistryCandidate | Promise<ModelRegistryCandidate | null | undefined>;
};

export type ModelClientContext = {
  modelRegistry?: ModelRegistryAPI;
};

export type ModelCompletionParams = {
  systemPrompt: string;
  userPrompt: string;
  model: ReviewerModelConfig;
  signal?: AbortSignal;
  timeoutMs: number;
};

export type ModelClient = {
  complete(params: ModelCompletionParams): Promise<string>;
};

export function createUnavailableModelClient(): ModelClient {
  return {
    async complete(): Promise<string> {
      throw new Error("Model client is not implemented yet.");
    },
  };
}

// ---------------------------------------------------------------------------
// Private resolution helper
// ---------------------------------------------------------------------------

async function resolveReviewerModel(params: {
  modelRegistry: ModelRegistryAPI;
  model: ReviewerModelConfig;
}): Promise<ModelRegistryCandidate | null> {
  const { modelRegistry, model } = params;

  if (modelRegistry.find) {
    const candidate = await modelRegistry.find(model.provider, model.id);
    return candidate ?? null;
  }

  if (!modelRegistry.getModels) {
    return null;
  }

  const models = await modelRegistry.getModels();
  return (
    models.find(
      (candidate) => candidate.provider === model.provider && candidate.id === model.id,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a {@link ModelClient} that resolves the reviewer model from the
 * provided {@link ModelClientContext.modelRegistry}.
 *
 * The resolution prefers {@link ModelRegistryAPI.find} and falls back to
 * {@link ModelRegistryAPI.getModels} when `find` is absent.
 *
 * @param context - The minimal context carrying an optional model registry.
 * @returns A `ModelClient` whose `complete` method resolves and invokes the
 *          reviewer model.
 */
export function createModelClientFromContext(context: ModelClientContext): ModelClient {
  return {
    async complete(params): Promise<string> {
      const { modelRegistry } = context;

      if (!modelRegistry) {
        throw new Error("Model registry is not available.");
      }

      const candidate = await resolveReviewerModel({
        modelRegistry,
        model: params.model,
      });

      const modelLabel = `${params.model.provider}/${params.model.id}`;

      if (!candidate) {
        throw new Error(`Reviewer model not found: ${modelLabel}`);
      }

      if (!candidate.complete) {
        throw new Error(`Reviewer model does not expose a complete method: ${modelLabel}`);
      }

      const response = await candidate.complete({
        systemPrompt: params.systemPrompt,
        userPrompt: params.userPrompt,
        signal: params.signal,
        timeoutMs: params.timeoutMs,
        thinkingLevel: params.model.thinkingLevel,
      });

      if (typeof response !== "string") {
        throw new Error(`Reviewer model returned a non-string response: ${modelLabel}`);
      }

      return response;
    },
  };
}
