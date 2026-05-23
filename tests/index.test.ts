import { describe, expect, it } from "vitest";
import extensionFactory from "../src/index.js";

describe("pi-review-gate entrypoint", () => {
  it("exports a default extension factory", () => {
    expect(typeof extensionFactory).toBe("function");
  });
});
