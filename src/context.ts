import { getMessageText } from "./serialization.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRole(value: unknown): string | null {
  if (!isRecord(value) || typeof value.role !== "string") {
    return null;
  }
  return value.role;
}

/**
 * Extracts the text of the first user message from an array of messages.
 *
 * Uses {@link getMessageText} to handle string content and array-of-parts
 * content formats. Returns an empty string when no user message is found
 * or when the message has no extractable text.
 *
 * Never throws.
 */
export function extractCurrentUserPrompt(messages: unknown[]): string {
  const userMessage = messages.find((message) => getRole(message) === "user");
  if (!userMessage) {
    return "";
  }
  return getMessageText(userMessage);
}

/**
 * Extracts the text of the last assistant message from an array of messages.
 *
 * Uses {@link getMessageText} to handle string content and array-of-parts
 * content formats. Returns `null` when no assistant message is found,
 * or an empty string when the assistant message has no extractable text.
 *
 * Never throws.
 */
export function extractLatestAssistantResponse(messages: unknown[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (getRole(message) === "assistant") {
      return getMessageText(message);
    }
  }
  return null;
}
