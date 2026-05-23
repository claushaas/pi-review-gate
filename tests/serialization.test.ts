import { describe, expect, it } from "vitest";
import { getMessageText, serializeMessages } from "../src/serialization.js";

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

describe("serializeMessages", () => {
  describe("empty array", () => {
    it("returns an empty string for an empty array", () => {
      expect(serializeMessages([])).toBe("");
    });
  });

  describe("simple messages", () => {
    it("serializes a user message with role and content", () => {
      expect(
        serializeMessages([
          {
            role: "user",
            content: "hello",
          },
        ]),
      ).toBe(`[message 1]
role: user
content:
hello`);
    });

    it("serializes an assistant message with role and content", () => {
      expect(
        serializeMessages([
          {
            role: "assistant",
            content: "done",
          },
        ]),
      ).toBe(`[message 1]
role: assistant
content:
done`);
    });

    it("numbers the first message as [message 1]", () => {
      expect(
        serializeMessages([
          {
            role: "user",
            content: "first",
          },
        ]),
      ).toMatch(/^\[message 1\]/);
    });
  });

  describe("multiple messages", () => {
    it("generates [message 1], [message 2], [message 3] blocks", () => {
      const result = serializeMessages([
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ]);

      expect(result).toBe(
        "[message 1]\nrole: user\ncontent:\na\n\n" +
          "[message 2]\nrole: assistant\ncontent:\nb\n\n" +
          "[message 3]\nrole: user\ncontent:\nc",
      );
    });

    it("separates blocks with a single blank line", () => {
      const result = serializeMessages([
        { role: "user", content: "hello" },
        { role: "assistant", content: "done" },
      ]);

      expect(result).toBe(
        "[message 1]\nrole: user\ncontent:\nhello\n\n" +
          "[message 2]\nrole: assistant\ncontent:\ndone",
      );
    });

    it("preserves the original order", () => {
      const messages: unknown[] = [
        { role: "user", content: "q1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "q2" },
      ];

      const result = serializeMessages(messages);
      const indexQ1 = result.indexOf("q1");
      const indexA1 = result.indexOf("a1");
      const indexQ2 = result.indexOf("q2");

      expect(indexQ1).toBeLessThan(indexA1);
      expect(indexA1).toBeLessThan(indexQ2);
    });
  });

  describe("role", () => {
    it("uses role when a string", () => {
      expect(serializeMessages([{ role: "user", content: "hello" }])).toContain("role: user");
    });

    it("uses unknown when role is absent", () => {
      expect(serializeMessages([{ content: "hello" }])).toContain("role: unknown");
    });

    it("uses unknown when role is not a string", () => {
      expect(serializeMessages([{ role: 42, content: "hello" }])).toContain("role: unknown");
    });

    it("uses unknown when role is an empty string", () => {
      expect(serializeMessages([{ role: "", content: "hello" }])).toContain("role: unknown");
    });
  });

  describe("tool metadata", () => {
    it("includes tool: bash when toolName is bash", () => {
      expect(
        serializeMessages([
          {
            role: "toolResult",
            toolName: "bash",
            content: "result",
          },
        ]),
      ).toContain("tool: bash");
    });

    it("includes tool: bash when tool is bash and toolName absent", () => {
      expect(
        serializeMessages([
          {
            role: "toolResult",
            tool: "bash",
            content: "result",
          },
        ]),
      ).toContain("tool: bash");
    });

    it("prefers toolName when both toolName and tool exist", () => {
      const result = serializeMessages([
        {
          role: "toolResult",
          toolName: "toolName_val",
          tool: "tool_val",
          content: "result",
        },
      ]);

      expect(result).toContain("tool: toolName_val");
      expect(result).not.toContain("tool: tool_val");
    });

    it("omits tool: when absent", () => {
      expect(serializeMessages([{ role: "user", content: "hello" }])).not.toContain("tool:");
    });

    it("omits tool: when the value is not a string", () => {
      expect(
        serializeMessages([{ role: "toolResult", toolName: 123, content: "result" }]),
      ).not.toContain("tool:");
    });
  });

  describe("error metadata", () => {
    it("includes isError: true when isError is true", () => {
      expect(
        serializeMessages([
          {
            role: "toolResult",
            toolName: "bash",
            isError: true,
            content: "error",
          },
        ]),
      ).toContain("isError: true");
    });

    it("includes isError: false when isError is false", () => {
      expect(
        serializeMessages([
          {
            role: "toolResult",
            toolName: "bash",
            isError: false,
            content: "ok",
          },
        ]),
      ).toContain("isError: false");
    });

    it("omits isError: when absent", () => {
      expect(serializeMessages([{ role: "toolResult", content: "ok" }])).not.toContain("isError:");
    });

    it("omits isError: when not a boolean", () => {
      expect(
        serializeMessages([{ role: "toolResult", isError: "yes", content: "ok" }]),
      ).not.toContain("isError:");
    });
  });

  describe("content", () => {
    it("uses getMessageText to extract content", () => {
      expect(
        serializeMessages([
          {
            role: "toolResult",
            content: [{ type: "text", text: "output" }],
          },
        ]),
      ).toContain("content:\noutput");
    });

    it("preserves multiline content", () => {
      expect(
        serializeMessages([
          {
            role: "user",
            content: "line1\nline2\nline3",
          },
        ]),
      ).toBe("[message 1]\nrole: user\ncontent:\nline1\nline2\nline3");
    });

    it("represents absent content with content: followed by an empty string", () => {
      expect(serializeMessages([{ role: "assistant" }])).toBe(
        "[message 1]\nrole: assistant\ncontent:\n",
      );
    });

    it("ignores non-textual content without throwing", () => {
      expect(() =>
        serializeMessages([
          {
            role: "user",
            content: [{ type: "image", source: { type: "base64", data: "abc" } }],
          },
        ]),
      ).not.toThrow();
    });
  });

  describe("tolerance", () => {
    it("does not throw for unknown message formats", () => {
      expect(() => serializeMessages([{ unknown: "format" }])).not.toThrow();
    });

    it("does not throw when a message is not an object", () => {
      expect(() => serializeMessages(["not an object" as unknown])).not.toThrow();
    });

    it("does not throw for null messages", () => {
      expect(() => serializeMessages([null as unknown])).not.toThrow();
    });

    it("does not mutate input messages", () => {
      const messages: unknown[] = [
        {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      ];
      const before = JSON.stringify(messages);
      serializeMessages(messages);
      expect(JSON.stringify(messages)).toBe(before);
    });
  });
});
