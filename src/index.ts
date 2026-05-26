import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ReviewGateCommandAPI } from "./commands.js";
import { registerCommands } from "./commands.js";
import { loadConfig, saveConfig } from "./config.js";
import type { ModelRegistryAPI } from "./model.js";
import type { ReviewGateNotificationAPI } from "./reviewer.js";
import { handleAgentEnd } from "./reviewer.js";
import { createRuntimeState } from "./state.js";

/**
 * Adapts the Pi runtime's {@link ExtensionUIContext.notify} to the
 * {@link ReviewGateNotificationAPI} shape used by the reviewer.
 *
 * The Pi runtime exposes `notify(message, type?)` while the reviewer
 * expects `notify({ title, message, severity? })`. This adapter
 * composes title and message into a single notification string and
 * maps severity to the runtime's notification type.
 */
function createNotifyAdapter(piUi: {
  notify: (message: string, type?: "info" | "warning" | "error") => void;
}): ReviewGateNotificationAPI["notify"] {
  return async (params) => {
    const text = `${params.title}: ${params.message}`;
    piUi.notify(text, params.severity ?? "info");
  };
}

export default function (pi: ExtensionAPI) {
  const state = createRuntimeState();

  // Captured from agent_end ctx — modelRegistry is not on ExtensionAPI directly.
  let capturedModelRegistry: ModelRegistryAPI | undefined;

  pi.on("agent_end", async (event, ctx) => {
    capturedModelRegistry = ctx.modelRegistry as unknown as ModelRegistryAPI | undefined;
    await handleAgentEnd({
      pi: {
        appendEntry: pi.appendEntry.bind(pi),
        exec: pi.exec.bind(pi),
        sendUserMessage: pi.sendUserMessage?.bind(pi),
      },
      state,
      event,
      loadConfig,
      context: {
        sessionManager: ctx.sessionManager,
        modelRegistry: capturedModelRegistry,
        ui: ctx.ui ? { notify: createNotifyAdapter(ctx.ui) } : undefined,
      },
    });
  });

  registerCommands({
    pi: pi as unknown as ReviewGateCommandAPI,
    loadConfig,
    saveConfig,
    context: {
      get modelRegistry() {
        return capturedModelRegistry;
      },
    },
  });
}
