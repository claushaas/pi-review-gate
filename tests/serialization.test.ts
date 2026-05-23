import { describe, expect, it } from "vitest";
import {
  getMessageText,
  serializeMessages,
  serializeSessionEntries,
} from "../src/serialization.js";

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

describe("serializeSessionEntries", () => {
  describe("empty array", () => {
    it("returns an empty string for an empty array", () => {
      expect(serializeSessionEntries([])).toBe("");
    });
  });

  describe("simple message entry", () => {
    it("serializes a user message entry with type, role, and content", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "user",
              content: "hello",
            },
          },
        ]),
      ).toBe(`[entry 1]
type: message
role: user
content:
hello`);
    });

    it("serializes an assistant message entry", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "assistant",
              content: "done",
            },
          },
        ]),
      ).toBe(`[entry 1]
type: message
role: assistant
content:
done`);
    });

    it("numbers the first entry as [entry 1]", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: { role: "user", content: "first" },
          },
        ]),
      ).toMatch(/^\[entry 1\]/);
    });
  });

  describe("multiple entries", () => {
    it("generates [entry 1], [entry 2], [entry 3] blocks", () => {
      const result = serializeSessionEntries([
        { type: "message", message: { role: "user", content: "a" } },
        { type: "message", message: { role: "assistant", content: "b" } },
        { type: "message", message: { role: "user", content: "c" } },
      ]);

      expect(result).toBe(
        "[entry 1]\ntype: message\nrole: user\ncontent:\na\n\n" +
          "[entry 2]\ntype: message\nrole: assistant\ncontent:\nb\n\n" +
          "[entry 3]\ntype: message\nrole: user\ncontent:\nc",
      );
    });

    it("separates blocks with a single blank line", () => {
      const result = serializeSessionEntries([
        { type: "message", message: { role: "user", content: "hello" } },
        { type: "message", message: { role: "assistant", content: "done" } },
      ]);

      expect(result).toBe(
        "[entry 1]\ntype: message\nrole: user\ncontent:\nhello\n\n" +
          "[entry 2]\ntype: message\nrole: assistant\ncontent:\ndone",
      );
    });

    it("preserves the original order", () => {
      const entries: unknown[] = [
        { type: "message", message: { role: "user", content: "q1" } },
        { type: "message", message: { role: "assistant", content: "a1" } },
        { type: "message", message: { role: "user", content: "q2" } },
      ];

      const result = serializeSessionEntries(entries);
      const indexQ1 = result.indexOf("q1");
      const indexA1 = result.indexOf("a1");
      const indexQ2 = result.indexOf("q2");

      expect(indexQ1).toBeLessThan(indexA1);
      expect(indexA1).toBeLessThan(indexQ2);
    });
  });

  describe("type", () => {
    it("uses entry.type when it is a string", () => {
      expect(
        serializeSessionEntries([{ type: "custom", customType: "event", data: {} }]),
      ).toContain("type: custom");
    });

    it("uses type: unknown when type is absent", () => {
      expect(serializeSessionEntries([{}])).toContain("type: unknown");
    });

    it("uses type: unknown when type is not a string", () => {
      expect(serializeSessionEntries([{ type: 42 }])).toContain("type: unknown");
    });

    it("uses type: unknown when type is an empty string", () => {
      expect(serializeSessionEntries([{ type: "" }])).toContain("type: unknown");
    });
  });

  describe("role", () => {
    it("includes role from entry.message.role", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: { role: "user", content: "hello" },
          },
        ]),
      ).toContain("role: user");
    });

    it("falls back to entry.role when entry.message.role is absent", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            role: "assistant",
            message: { content: "done" },
          },
        ]),
      ).toContain("role: assistant");
    });

    it("omits role: when absent", () => {
      expect(serializeSessionEntries([{ type: "custom", data: {} }])).not.toContain("role:");
    });

    it("omits role: when role is not a string", () => {
      expect(
        serializeSessionEntries([{ type: "message", role: 42, content: "hello" }]),
      ).not.toContain("role:");
    });

    it("omits role: when role is an empty string", () => {
      expect(
        serializeSessionEntries([{ type: "message", role: "", content: "hello" }]),
      ).not.toContain("role:");
    });
  });

  describe("customType", () => {
    it("includes customType when entry.customType is a non-empty string", () => {
      expect(
        serializeSessionEntries([
          {
            type: "custom",
            customType: "pi-review-gate-result",
            data: { approved: true },
          },
        ]),
      ).toContain("customType: pi-review-gate-result");
    });

    it("serializes custom entry without adding role noise", () => {
      const result = serializeSessionEntries([
        {
          type: "custom",
          customType: "pi-review-gate-result",
          data: { approved: true },
        },
      ]);

      expect(result).not.toContain("role:");
    });

    it("omits customType when absent", () => {
      expect(serializeSessionEntries([{ type: "custom", data: {} }])).not.toContain("customType:");
    });

    it("omits customType when not a string", () => {
      expect(
        serializeSessionEntries([{ type: "custom", customType: 123, data: {} }]),
      ).not.toContain("customType:");
    });

    it("omits customType when empty string", () => {
      expect(serializeSessionEntries([{ type: "custom", customType: "", data: {} }])).not.toContain(
        "customType:",
      );
    });
  });

  describe("tool metadata", () => {
    it("includes tool: bash when entry.message.toolName is bash", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "toolResult",
              toolName: "bash",
              isError: false,
              content: [{ type: "text", text: "ok" }],
            },
          },
        ]),
      ).toContain("tool: bash");
    });

    it("includes tool: bash when entry.message.tool is bash", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "toolResult",
              tool: "bash",
              content: [{ type: "text", text: "ok" }],
            },
          },
        ]),
      ).toContain("tool: bash");
    });

    it("falls back to entry.toolName", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            toolName: "bash",
            message: {
              role: "toolResult",
              content: [{ type: "text", text: "ok" }],
            },
          },
        ]),
      ).toContain("tool: bash");
    });

    it("falls back to entry.tool", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            tool: "bash",
            message: {
              role: "toolResult",
              content: [{ type: "text", text: "ok" }],
            },
          },
        ]),
      ).toContain("tool: bash");
    });

    it("prefers entry.message.toolName over the other fields", () => {
      const result = serializeSessionEntries([
        {
          type: "message",
          toolName: "entryToolName",
          tool: "entryTool",
          message: {
            role: "toolResult",
            toolName: "msgToolName",
            tool: "msgTool",
            content: [{ type: "text", text: "ok" }],
          },
        },
      ]);

      expect(result).toContain("tool: msgToolName");
    });

    it("omits tool: when absent", () => {
      expect(
        serializeSessionEntries([{ type: "message", message: { role: "user", content: "hello" } }]),
      ).not.toContain("tool:");
    });

    it("omits tool: when the value is not a string", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "toolResult",
              toolName: 123,
              content: "result",
            },
          },
        ]),
      ).not.toContain("tool:");
    });
  });

  describe("error metadata", () => {
    it("includes isError: true when entry.message.isError is true", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "toolResult",
              toolName: "bash",
              isError: true,
              content: "error output",
            },
          },
        ]),
      ).toContain("isError: true");
    });

    it("includes isError: false when entry.message.isError is false", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "toolResult",
              toolName: "bash",
              isError: false,
              content: "ok",
            },
          },
        ]),
      ).toContain("isError: false");
    });

    it("falls back to entry.isError", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            isError: true,
            message: {
              role: "toolResult",
              content: [{ type: "text", text: "error" }],
            },
          },
        ]),
      ).toContain("isError: true");
    });

    it("omits isError: when absent", () => {
      expect(
        serializeSessionEntries([{ type: "message", message: { role: "user", content: "hello" } }]),
      ).not.toContain("isError:");
    });

    it("omits isError: when not a boolean", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "toolResult",
              isError: "yes",
              content: "ok",
            },
          },
        ]),
      ).not.toContain("isError:");
    });
  });

  describe("content", () => {
    it("uses getMessageText to extract content", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "toolResult",
              content: [{ type: "text", text: "output" }],
            },
          },
        ]),
      ).toContain("content:\noutput");
    });

    it("preserves multiline content", () => {
      expect(
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "user",
              content: "line1\nline2\nline3",
            },
          },
        ]),
      ).toContain("content:\nline1\nline2\nline3");
    });

    it("represents absent content with content: followed by an empty string", () => {
      const result = serializeSessionEntries([
        {
          type: "message",
          message: { role: "assistant" },
        },
      ]);
      expect(result).toContain("content:\n");
    });

    it("ignores non-textual content without throwing", () => {
      expect(() =>
        serializeSessionEntries([
          {
            type: "message",
            message: {
              role: "user",
              content: [{ type: "image", source: { type: "base64", data: "abc" } }],
            },
          },
        ]),
      ).not.toThrow();
    });
  });

  describe("tolerance", () => {
    it("does not throw for unknown entry formats", () => {
      expect(() => serializeSessionEntries([{ unknown: "format" }])).not.toThrow();
    });

    it("does not throw when an entry is not an object", () => {
      expect(() => serializeSessionEntries(["not an object" as unknown])).not.toThrow();
    });

    it("does not throw for null entries", () => {
      expect(() => serializeSessionEntries([null as unknown])).not.toThrow();
    });

    it("does not mutate input entries", () => {
      const entries: unknown[] = [
        {
          type: "message",
          message: {
            role: "user",
            content: [{ type: "text", text: "hello" }],
          },
        },
      ];
      const before = JSON.stringify(entries);
      serializeSessionEntries(entries);
      expect(JSON.stringify(entries)).toBe(before);
    });
  });
});
