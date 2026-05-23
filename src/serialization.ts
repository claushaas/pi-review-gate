function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractTextFromPart(part: unknown): string | null {
  if (!isRecord(part)) {
    return null;
  }
  if (typeof part.text === "string") {
    return part.text;
  }
  return null;
}

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map(extractTextFromPart)
    .filter((text): text is string => text !== null)
    .join("\n");
}

/**
 * Extracts textual content from a message-like object.
 *
 * Supports:
 * - messages with `content` as a string or array of text parts
 * - entries with `entry.message.content`
 * - tool results with text content
 *
 * Returns an empty string for any unrecognized or non-textual input.
 * Never throws.
 */
export function getMessageText(message: unknown): string {
  if (!isRecord(message)) {
    return "";
  }

  // Entry with a nested message (e.g. { type: "message", message: { ... } })
  if ("message" in message && isRecord(message.message)) {
    return getMessageText(message.message);
  }

  return extractTextFromContent(message.content);
}

function getMessageRole(message: unknown): string {
  if (!isRecord(message) || typeof message.role !== "string" || message.role.length === 0) {
    return "unknown";
  }
  return message.role;
}

function getMessageToolName(message: unknown): string | null {
  if (!isRecord(message)) {
    return null;
  }
  if (typeof message.toolName === "string" && message.toolName.length > 0) {
    return message.toolName;
  }
  if (typeof message.tool === "string" && message.tool.length > 0) {
    return message.tool;
  }
  return null;
}

function getMessageIsError(message: unknown): boolean | null {
  if (!isRecord(message) || typeof message.isError !== "boolean") {
    return null;
  }
  return message.isError;
}

/**
 * Serializes an array of message-like objects into a stable, human-readable
 * block format.
 *
 * Each message is rendered as a `[message N]` block with role, optional
 * tool name, optional error flag, and textual content extracted via
 * {@link getMessageText}. Blocks are separated by a single blank line.
 *
 * Returns an empty string for an empty array. Never throws.
 */
export function serializeMessages(messages: unknown[]): string {
  if (messages.length === 0) {
    return "";
  }

  return messages
    .map((message, index) => {
      const lines = [`[message ${index + 1}]`, `role: ${getMessageRole(message)}`];

      const toolName = getMessageToolName(message);
      if (toolName !== null) {
        lines.push(`tool: ${toolName}`);
      }

      const isError = getMessageIsError(message);
      if (isError !== null) {
        lines.push(`isError: ${String(isError)}`);
      }

      lines.push("content:");
      lines.push(getMessageText(message));

      return lines.join("\n");
    })
    .join("\n\n");
}
