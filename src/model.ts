import {
  type Api,
  type AssistantMessage,
  completeSimple,
  type Model,
  type ThinkingContent,
} from "@earendil-works/pi-ai";
import type { ReviewerModelConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function isPositiveInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

function createTimeoutError(timeoutMs: number): Error {
  return new Error(`Reviewer model request timed out after ${timeoutMs}ms.`);
}

function createAbortError(): Error {
  return new Error("Reviewer model request was aborted.");
}

type CombinedSignal = {
  signal?: AbortSignal;
  cleanup: () => void;
  throwIfTimedOutOrAborted: () => void;
};

function createCombinedSignal(params: { signal?: AbortSignal; timeoutMs: number }): CombinedSignal {
  const { signal, timeoutMs } = params;

  // External signal already aborted — reject immediately without creating timers.
  if (signal?.aborted) {
    return {
      signal,
      cleanup: () => {},
      throwIfTimedOutOrAborted: () => {
        throw createAbortError();
      },
    };
  }

  // No valid timeout — just propagate the external signal (if any).
  if (!isPositiveInteger(timeoutMs)) {
    return {
      signal,
      cleanup: () => {},
      throwIfTimedOutOrAborted: () => {
        if (signal?.aborted) {
          throw createAbortError();
        }
      },
    };
  }

  const controller = new AbortController();
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const abortFromExternalSignal = () => {
    controller.abort();
  };
  signal?.addEventListener("abort", abortFromExternalSignal, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromExternalSignal);
    },
    throwIfTimedOutOrAborted: () => {
      if (timedOut) {
        throw createTimeoutError(timeoutMs);
      }
      if (signal?.aborted) {
        throw createAbortError();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ModelRegistryCandidate = {
  provider?: string;
  id?: string;
  name?: string;
  reasoning?: boolean;
  api?: unknown;
  /** Test mock path: calls a mock complete method. When absent, the real Pi SDK `completeSimple` is used. */
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
  getAvailable?: () => ModelRegistryCandidate[] | Promise<ModelRegistryCandidate[]>;
  getAll?: () => ModelRegistryCandidate[] | Promise<ModelRegistryCandidate[]>;
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

async function resolveReviewerModel(params: {
  modelRegistry: ModelRegistryAPI;
  model: ReviewerModelConfig;
}): Promise<ModelRegistryCandidate | null> {
  const { modelRegistry, model } = params;

  if (modelRegistry.find) {
    const candidate = await modelRegistry.find(model.provider, model.id);
    return candidate ?? null;
  }

  const models = await getRegistryModels(modelRegistry);
  return (
    models?.find(
      (candidate) => candidate.provider === model.provider && candidate.id === model.id,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Response extraction helper
// ---------------------------------------------------------------------------

/**
 * Extracts the concatenated text content from an {@link AssistantMessage}.
 *
 * Iterates over all content blocks generically. Prefers {@link TextContent}
 * blocks. Falls back to {@link ThinkingContent} blocks (some reasoning-only
 * models return their full response there with no separate text block).
 *
 * Returns an empty string when the message contains no extractable text.
 */
function extractAssistantText(message: AssistantMessage): string {
  let textResult = "";
  let thinkingResult = "";

  for (const block of message.content) {
    if (block.type === "text" && "text" in block && typeof block.text === "string") {
      if (textResult.length > 0) {
        textResult += "\n";
      }
      textResult += block.text;
    } else if (
      block.type === "thinking" &&
      "thinking" in block &&
      typeof block.thinking === "string"
    ) {
      if (thinkingResult.length > 0) {
        thinkingResult += "\n";
      }
      thinkingResult += block.thinking;
    }
  }

  if (textResult.length > 0) {
    return textResult;
  }

  return thinkingResult;
}

/**
 * Builds a diagnostic description of content blocks for error messages.
 */
function describeContentBlocks(message: AssistantMessage): string {
  if (message.content.length === 0) {
    return "no content blocks";
  }
  return message.content
    .map((c, i) => {
      const detail =
        c.type === "text" && "text" in c
          ? `len=${c.text.length}`
          : c.type === "thinking" && "thinking" in c
            ? `len=${c.thinking.length}${c.redacted ? ",redacted" : ""}${c.thinkingSignature ? `,sig=${c.thinkingSignature}` : ""}`
            : "";
      return `[${i}] type=${c.type} ${detail}`.trim();
    })
    .join("; ");
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates a {@link ModelClient} that resolves the reviewer model from the
 * provided {@link ModelClientContext.modelRegistry}.
 *
 * The resolution prefers {@link ModelRegistryAPI.find} and falls back to
 * registry listing methods when `find` is absent.
 *
 * Two invocation paths are supported:
 * 1. **Test mock path:** the resolved candidate exposes a `complete` method
 *    (used by tests).
 * 2. **Real Pi SDK path:** the resolved candidate is a Pi {@link Model}
 *    object; `completeSimple` from `@earendil-works/pi-ai` is used.
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

      const combinedSignal = createCombinedSignal({
        signal: params.signal,
        timeoutMs: params.timeoutMs,
      });

      try {
        combinedSignal.throwIfTimedOutOrAborted();

        // Test mock path: candidate exposes a `complete` method directly.
        if (candidate.complete) {
          const response = await candidate.complete({
            systemPrompt: params.systemPrompt,
            userPrompt: params.userPrompt,
            signal: combinedSignal.signal,
            timeoutMs: params.timeoutMs,
            thinkingLevel: params.model.thinkingLevel,
          });

          combinedSignal.throwIfTimedOutOrAborted();

          if (typeof response !== "string") {
            throw new Error(`Reviewer model returned a non-string response: ${modelLabel}`);
          }

          return response;
        }

        // Real Pi SDK path: use completeSimple from @earendil-works/pi-ai.
        const assistantMessage: AssistantMessage = await completeSimple(
          candidate as Model<Api>,
          {
            systemPrompt: params.systemPrompt,
            messages: [
              {
                role: "user",
                content: [{ type: "text", text: params.userPrompt }],
                timestamp: Date.now(),
              },
            ],
          },
          {
            signal: combinedSignal.signal,
            timeoutMs: params.timeoutMs,
            ...(params.model.thinkingLevel && params.model.thinkingLevel !== "off"
              ? {
                  reasoning: params.model.thinkingLevel as
                    | "minimal"
                    | "low"
                    | "medium"
                    | "high"
                    | "xhigh",
                }
              : {}),
          },
        );

        combinedSignal.throwIfTimedOutOrAborted();

        const textContents = extractAssistantText(assistantMessage);
        if (textContents.length === 0) {
          const blocks = describeContentBlocks(assistantMessage);
          throw new Error(
            `Reviewer model returned no text content: ${modelLabel}. Content blocks: ${blocks}`,
          );
        }

        return textContents;
      } catch (error) {
        combinedSignal.throwIfTimedOutOrAborted();
        throw error;
      } finally {
        combinedSignal.cleanup();
      }
    },
  };
}
