import { getMessageText } from "./serialization.js";
import { isReviewGateInjectedText } from "./state.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRole(value: unknown): string | null {
  if (!isRecord(value) || typeof value.role !== "string") {
    return null;
  }
  return value.role;
}

// ---- Entry helpers for collectSessionSliceSinceLastRealUserMessage ----

function getEntryMessage(entry: unknown): unknown | null {
  if (!isRecord(entry) || !isRecord(entry.message)) {
    return null;
  }
  return entry.message;
}

function getEntryType(entry: unknown): string | null {
  if (!isRecord(entry) || typeof entry.type !== "string") {
    return null;
  }
  return entry.type;
}

function getEntryRole(entry: unknown): string | null {
  const message = getEntryMessage(entry);
  if (isRecord(message) && typeof message.role === "string") {
    return message.role;
  }
  // Fallback: flat format entry.role
  if (isRecord(entry) && typeof entry.role === "string") {
    return entry.role;
  }
  return null;
}

function isRealUserMessageEntry(entry: unknown): boolean {
  if (getEntryType(entry) !== "message") {
    return false;
  }
  if (getEntryRole(entry) !== "user") {
    return false;
  }
  const message = getEntryMessage(entry);
  const text = getMessageText(message ?? entry);
  return !isReviewGateInjectedText(text);
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

/**
 * Collects the session slice from the last real user message to the end
 * of the branch, respecting a maximum entry limit.
 *
 * A "real" user message is one that was sent by the actual user, not
 * injected by the review gate (e.g. correction prompts containing
 * {@link CORRECTION_REQUEST_MARKER}).
 *
 * The returned slice:
 * - starts at the last real user message entry;
 * - is limited to the last `maxEntries` entries;
 * - never mutates the input `branch` array.
 *
 * Returns an empty array when no real user message is found or when
 * `maxEntries` is not a finite positive integer.
 *
 * Never throws.
 */
export function collectSessionSliceSinceLastRealUserMessage(params: {
  branch: unknown[];
  maxEntries: number;
}): unknown[] {
  const { branch, maxEntries } = params;

  if (!Number.isFinite(maxEntries) || !Number.isInteger(maxEntries) || maxEntries <= 0) {
    return [];
  }

  let lastRealUserIndex = -1;
  for (let index = branch.length - 1; index >= 0; index -= 1) {
    if (isRealUserMessageEntry(branch[index])) {
      lastRealUserIndex = index;
      break;
    }
  }

  if (lastRealUserIndex === -1) {
    return [];
  }

  return branch.slice(lastRealUserIndex).slice(-maxEntries);
}
