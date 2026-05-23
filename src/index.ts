import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands";
import { createRuntimeState } from "./state";

export default function (pi: ExtensionAPI) {
  const state = createRuntimeState();
  registerCommands(pi, state);
}
