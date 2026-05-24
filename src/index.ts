import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ReviewGateCommandAPI } from "./commands.js";
import { registerCommands } from "./commands.js";
import { loadConfig, saveConfig } from "./config.js";
import type { ModelRegistryAPI } from "./model.js";
import { handleAgentEnd } from "./reviewer.js";
import { createRuntimeState } from "./state.js";

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
