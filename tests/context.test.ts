import { describe, expect, it } from "vitest";
import { extractCurrentUserPrompt, extractLatestAssistantResponse } from "../src/context.js";

// ---------------------------------------------------------------------------
// extractCurrentUserPrompt
// ---------------------------------------------------------------------------

describe("extractCurrentUserPrompt", () => {
  it("extracts the first user message text (string content)", () => {
    expect(
      extractCurrentUserPrompt([
        { role: "assistant", content: "previous" },
        { role: "user", content: "implement step 8.1" },
        { role: "user", content: "second user message" },
      ]),
    ).toBe("implement step 8.1");
  });

  it("supports array content through getMessageText", () => {
    expect(
      extractCurrentUserPrompt([
        {
          role: "user",
          content: [
            { type: "text", text: "hello" },
            { type: "image", source: { type: "base64", data: "..." } },
            { type: "text", text: "world" },
          ],
        },
      ]),
    ).toBe("hello\nworld");
  });

  it("returns an empty string when no user message exists", () => {
    expect(extractCurrentUserPrompt([{ role: "assistant", content: "done" }])).toBe("");
  });

  it("returns an empty string when user message has no extractable text", () => {
    expect(extractCurrentUserPrompt([{ role: "user", content: [] }])).toBe("");
  });

  it("ignores assistant messages before the first user", () => {
    expect(
      extractCurrentUserPrompt([
        { role: "assistant", content: "first assistant" },
        { role: "user", content: "the prompt" },
      ]),
    ).toBe("the prompt");
  });

  it("does not throw for malformed messages", () => {
    expect(() =>
      extractCurrentUserPrompt([null, 42, "hello", undefined, { role: "user" }]),
    ).not.toThrow();
  });

  it("returns empty string for malformed array", () => {
    expect(extractCurrentUserPrompt([null, 42, "hello", undefined, { role: "user" }])).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(extractCurrentUserPrompt([])).toBe("");
  });

  it("does not mutate the messages array", () => {
    const messages = [{ role: "user", content: "hello" }];
    const before = JSON.stringify(messages);
    extractCurrentUserPrompt(messages);
    expect(JSON.stringify(messages)).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// extractLatestAssistantResponse
// ---------------------------------------------------------------------------

describe("extractLatestAssistantResponse", () => {
  it("extracts the latest assistant message text (string content)", () => {
    expect(
      extractLatestAssistantResponse([
        { role: "assistant", content: "first" },
        { role: "user", content: "prompt" },
        { role: "assistant", content: "final" },
      ]),
    ).toBe("final");
  });

  it("supports array content through getMessageText", () => {
    expect(
      extractLatestAssistantResponse([
        {
          role: "assistant",
          content: [
            { type: "text", text: "line one" },
            { type: "text", text: "line two" },
          ],
        },
      ]),
    ).toBe("line one\nline two");
  });

  it("returns null when no assistant message exists", () => {
    expect(extractLatestAssistantResponse([{ role: "user", content: "prompt" }])).toBeNull();
  });

  it("returns empty string when the last assistant has no extractable text", () => {
    expect(
      extractLatestAssistantResponse([
        { role: "assistant", content: "first" },
        { role: "assistant", content: [] },
      ]),
    ).toBe("");
  });

  it("ignores user messages after an assistant when finding the last assistant", () => {
    expect(
      extractLatestAssistantResponse([
        { role: "assistant", content: "done" },
        { role: "user", content: "follow-up prompt" },
      ]),
    ).toBe("done");
  });

  it("does not throw for malformed messages", () => {
    expect(() => extractLatestAssistantResponse([null, 42, "hello", undefined])).not.toThrow();
  });

  it("returns null for malformed array with no assistant", () => {
    expect(extractLatestAssistantResponse([null, 42, "hello", undefined])).toBeNull();
  });

  it("returns null for empty array", () => {
    expect(extractLatestAssistantResponse([])).toBeNull();
  });

  it("does not mutate the messages array", () => {
    const messages = [{ role: "assistant", content: "done" }];
    const before = JSON.stringify(messages);
    extractLatestAssistantResponse(messages);
    expect(JSON.stringify(messages)).toBe(before);
  });
});
