import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.js";
import { loadConfig } from "./config.js";
import type { ModelRegistryAPI } from "./model.js";
import { handleAgentEnd } from "./reviewer.js";
import { createRuntimeState } from "./state.js";

export default function (pi: ExtensionAPI) {
  const state = createRuntimeState();

  pi.on("agent_end", async (event, ctx) => {
    await handleAgentEnd({
      pi: {
        appendEntry: pi.appendEntry.bind(pi),
        exec: pi.exec.bind(pi),
      },
      state,
      event,
      loadConfig,
      context: {
        sessionManager: ctx.sessionManager,
        // bridge: Pi ModelRegistry → local ModelRegistryAPI
        modelRegistry: ctx.modelRegistry as unknown as ModelRegistryAPI,
      },
    });
  });

  registerCommands(pi, state);
}
