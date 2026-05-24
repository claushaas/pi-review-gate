import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.js";
import { loadConfig } from "./config.js";
import { handleAgentEnd } from "./reviewer.js";
import { createRuntimeState } from "./state.js";

export default function (pi: ExtensionAPI) {
  const state = createRuntimeState();

  pi.on("agent_end", async (event) => {
    await handleAgentEnd({
      pi: { appendEntry: pi.appendEntry.bind(pi) },
      state,
      event,
      loadConfig,
    });
  });

  registerCommands(pi, state);
}
