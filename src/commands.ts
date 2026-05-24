import {
  COMMAND_REVIEW_GATE,
  COMMAND_REVIEW_GATE_MODEL,
  COMMAND_REVIEW_GATE_OFF,
  COMMAND_REVIEW_GATE_ON,
  COMMAND_REVIEW_GATE_STATUS,
} from "./constants.js";

type CommandHandler = () => Promise<string | undefined> | string | undefined;

type CommandDefinition = {
  name: string;
  description: string;
  handler: CommandHandler;
};

export type ReviewGateCommandAPI = {
  registerCommand?: (
    name: string,
    options: {
      description?: string;
      handler: CommandHandler;
    },
  ) => void;
  command?: (
    command: string,
    handler: CommandHandler,
    options?: {
      description?: string;
    },
  ) => void;
  commands?: {
    register?: (
      command: string,
      handler: CommandHandler,
      options?: {
        description?: string;
      },
    ) => void;
  };
};

function registerCommand(pi: ReviewGateCommandAPI, definition: CommandDefinition): void {
  if (pi.registerCommand) {
    pi.registerCommand(definition.name, {
      description: definition.description,
      handler: definition.handler,
    });
    return;
  }
  if (pi.command) {
    pi.command(definition.name, definition.handler, {
      description: definition.description,
    });
    return;
  }
  if (pi.commands?.register) {
    pi.commands.register(definition.name, definition.handler, {
      description: definition.description,
    });
    return;
  }
  throw new Error("Pi command registration API is not available.");
}

export function registerCommands(params: { pi: ReviewGateCommandAPI }): void {
  const { pi } = params;

  const commands: CommandDefinition[] = [
    {
      name: COMMAND_REVIEW_GATE,
      description: "Open review gate menu.",
      handler: () => "Review gate menu is not implemented yet.",
    },
    {
      name: COMMAND_REVIEW_GATE_STATUS,
      description: "Show review gate status.",
      handler: () => "Review gate status command is not implemented yet.",
    },
    {
      name: COMMAND_REVIEW_GATE_MODEL,
      description: "Configure reviewer model.",
      handler: () => "Review gate model command is not implemented yet.",
    },
    {
      name: COMMAND_REVIEW_GATE_ON,
      description: "Enable review gate.",
      handler: () => "Review gate on command is not implemented yet.",
    },
    {
      name: COMMAND_REVIEW_GATE_OFF,
      description: "Disable review gate.",
      handler: () => "Review gate off command is not implemented yet.",
    },
  ];

  for (const command of commands) {
    registerCommand(pi, command);
  }
}
