import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.js";
import { createRuntimeState } from "./state.js";

export default function (pi: ExtensionAPI) {
  const state = createRuntimeState();
  registerCommands(pi, state);
}
