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
