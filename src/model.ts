import type { ReviewerModelConfig } from "./types.js";

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
