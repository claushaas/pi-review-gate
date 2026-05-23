import { describe, expect, it } from "vitest";
import { getMessageText } from "../src/serialization.js";

describe("getMessageText", () => {
  describe("invalid values", () => {
    it("returns an empty string for null", () => {
      expect(getMessageText(null)).toBe("");
    });

    it("returns an empty string for undefined", () => {
      expect(getMessageText(undefined)).toBe("");
    });

    it("returns an empty string for boolean", () => {
      expect(getMessageText(true)).toBe("");
      expect(getMessageText(false)).toBe("");
    });

    it("returns an empty string for number", () => {
      expect(getMessageText(123)).toBe("");
    });

    it("returns an empty string for an empty array", () => {
      expect(getMessageText([])).toBe("");
    });

    it("returns an empty string for an empty object", () => {
      expect(getMessageText({})).toBe("");
    });
  });

  describe("content: string", () => {
    it("extracts text from a user message with content: string", () => {
      expect(
        getMessageText({
          role: "user",
          content: "hello",
        }),
      ).toBe("hello");
    });

    it("extracts text from an assistant message with content: string", () => {
      expect(
        getMessageText({
          role: "assistant",
          content: "done",
        }),
      ).toBe("done");
    });

    it("returns an empty string when content is an empty string", () => {
      expect(
        getMessageText({
          role: "user",
          content: "",
        }),
      ).toBe("");
    });
  });

  describe("content array", () => {
    it("joins multiple text parts with newline", () => {
      expect(
        getMessageText({
          role: "user",
          content: [
            { type: "text", text: "hello" },
            { type: "text", text: "world" },
          ],
        }),
      ).toBe("hello\nworld");
    });

    it("ignores non-text parts", () => {
      expect(
        getMessageText({
          role: "user",
          content: [
            { type: "text", text: "describe this" },
            { type: "image", source: { type: "base64", data: "abc" } },
          ],
        }),
      ).toBe("describe this");
    });

    it("accepts parts with { text: string } without type field", () => {
      expect(
        getMessageText({
          content: [{ text: "plain text part" }],
        }),
      ).toBe("plain text part");
    });

    it("preserves empty string from textual part without throwing", () => {
      expect(
        getMessageText({
          content: [{ type: "text", text: "" }],
        }),
      ).toBe("");
    });

    it("skips parts that are not objects", () => {
      expect(
        getMessageText({
          content: ["not an object", { type: "text", text: "valid" }],
        }),
      ).toBe("valid");
    });
  });

  describe("entry with message", () => {
    it("extracts text from entry.message.content", () => {
      expect(
        getMessageText({
          type: "message",
          message: {
            role: "assistant",
            content: "done",
          },
        }),
      ).toBe("done");
    });

    it("returns empty string when entry.message is not an object", () => {
      expect(
        getMessageText({
          type: "message",
          message: null,
        }),
      ).toBe("");
    });

    it("handles nested entry with array content", () => {
      expect(
        getMessageText({
          type: "message",
          message: {
            role: "user",
            content: [
              { type: "text", text: "nested" },
              { type: "text", text: "content" },
            ],
          },
        }),
      ).toBe("nested\ncontent");
    });
  });

  describe("tool result", () => {
    it("extracts text from tool result with content array", () => {
      expect(
        getMessageText({
          role: "toolResult",
          content: [{ type: "text", text: "command output" }],
        }),
      ).toBe("command output");
    });

    it("extracts text from tool result with content string", () => {
      expect(
        getMessageText({
          role: "toolResult",
          content: "output text",
        }),
      ).toBe("output text");
    });

    it("ignores non-textual details", () => {
      expect(
        getMessageText({
          role: "toolResult",
          content: [
            { type: "text", text: "real output" },
            { type: "image", source: { type: "base64", data: "..." } },
          ],
        }),
      ).toBe("real output");
    });
  });

  describe("tolerance", () => {
    it("does not throw for unknown formats", () => {
      expect(() => getMessageText({ unknown: "format" })).not.toThrow();
      expect(getMessageText({ unknown: "format" })).toBe("");
    });

    it("does not throw for deeply unknown shapes", () => {
      expect(() =>
        getMessageText({
          message: {
            content: [{ something: "else" }],
          },
        }),
      ).not.toThrow();
      expect(
        getMessageText({
          message: {
            content: [{ something: "else" }],
          },
        }),
      ).toBe("");
    });

    it("does not mutate the input object", () => {
      const message = {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      };
      const before = JSON.stringify(message);
      getMessageText(message);
      expect(JSON.stringify(message)).toBe(before);
    });

    it("does not mutate a message with string content", () => {
      const message = { role: "user", content: "hello" };
      const before = JSON.stringify(message);
      getMessageText(message);
      expect(JSON.stringify(message)).toBe(before);
    });
  });
});
