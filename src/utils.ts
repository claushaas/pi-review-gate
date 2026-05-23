import { TRUNCATION_MARKER_PREFIX } from "./constants.js";

/**
 * Attempts to extract a strict top-level JSON object from a raw text string.
 *
 * Accepted formats:
 * - Direct JSON object: the entire trimmed text starts with `{` and ends with `}`.
 * - Single code fence containing only a JSON object:
 *   ```json\n{...}\n``` or ```\n{...}\n```
 *
 * Returns the JSON text string when the input matches one of the accepted
 * formats. Returns `null` for empty input, prose, arrays, strings, numbers,
 * multiple objects, or any other non-conforming text.
 *
 * This function only extracts text — it does not call `JSON.parse` or
 * validate the structure of the object.
 */
export function extractStrictJsonObjectText(raw: string): string | null {
  const trimmed = raw.trim();

  // Reject empty or whitespace-only input.
  if (trimmed.length === 0) {
    return null;
  }

  // Direct JSON object.
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  // Single code fence containing only a JSON object.
  // Only "json" language or no language is accepted.
  // The content must start with { on the very next line (after optional
  // horizontal whitespace), not with a blank line.
  const fenceMatch = trimmed.match(/^```(?:json)?\n([^\n][\s\S]*?)\n```$/);
  if (fenceMatch !== null) {
    const rawCandidate = fenceMatch[1];
    // The candidate may have horizontal whitespace indentation, but its
    // first non-whitespace character after horizontal indentation must be `{`.
    const candidate = rawCandidate.trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) {
      return candidate;
    }
  }

  return null;
}

/**
 * Checks whether `text` is exactly one top-level JSON object — that is,
 * the braces balance to zero exactly once, and there is no non-whitespace
 * content after the first top-level closing `}`.
 *
 * Returns:
 * - `"ok"` when the entire text is a single JSON object.
 * - `"extra_content"` when braces balance but non-whitespace follows the
 *   first top-level `}` (e.g., multiple objects or prose after JSON).
 * - `"unbalanced"` when braces never balance or depth goes negative.
 */
export function classifyJsonObjectText(text: string): "ok" | "extra_content" | "unbalanced" {
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\" && inString) {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        // Found closing brace of the first top-level object.
        const rest = text.slice(i + 1);
        if (rest.trim().length > 0) {
          return "extra_content";
        }
        return "ok";
      }
    }
  }

  return "unbalanced";
}

/**
 * Produces a deterministic, non-cryptographic integer hash from a string.
 * Uses a simple djb2 variant. The result is a hexadecimal string.
 *
 * This is suitable for lightweight identification of a prompt, not for
 * security-sensitive contexts.
 */
export function hashText(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Truncates `text` to at most `maxChars` characters. When truncation
 * occurs, appends a marker indicating the original length and how many
 * characters were included.
 *
 * Returns `text` unchanged when `maxChars` is not a finite positive
 * integer or when `text.length <= maxChars`.
 */
export function truncateWithMarker(text: string, maxChars: number): string {
  if (!Number.isFinite(maxChars) || !Number.isInteger(maxChars) || maxChars <= 0) {
    return text;
  }
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}
${TRUNCATION_MARKER_PREFIX} original length ${text.length} chars, included first ${maxChars} chars]`;
}
