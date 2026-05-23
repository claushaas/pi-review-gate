import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultConfig,
  loadConfig,
  mergeConfig,
  resolveConfigPath,
  saveConfig,
} from "../src/config.js";

describe("defaultConfig", () => {
  it("uses the expected top-level defaults", () => {
    expect(defaultConfig.enabled).toBe(true);
    expect(defaultConfig.mode).toBe("block");
    expect(defaultConfig.reviewerModel).toBeNull();
    expect(defaultConfig.maxCorrectionCycles).toBe(2);
  });

  it("uses the expected context defaults", () => {
    expect(defaultConfig.context).toEqual({
      strategy: "current_run",
      includeEventMessages: true,
      includeSessionSlice: true,
      maxSessionEntries: 40,
    });
  });

  it("uses the expected git defaults", () => {
    expect(defaultConfig.git).toEqual({
      enabled: true,
      includeStatus: true,
      includeDiffStat: true,
      includeDiff: true,
      maxDiffChars: 60_000,
      maxStatusChars: 12_000,
      maxDiffStatChars: 12_000,
    });
  });

  it("uses the expected reviewer defaults", () => {
    expect(defaultConfig.reviewer).toEqual({
      requireJson: true,
      failClosedOnInvalidJson: true,
      timeoutMs: 120_000,
    });
  });

  it("uses the expected ui defaults", () => {
    expect(defaultConfig.ui).toEqual({
      notifyOnPass: true,
      notifyOnFail: true,
      showReviewerSummary: true,
    });
  });
});

describe("resolveConfigPath", () => {
  it("uses the provided home directory", () => {
    const result = resolveConfigPath("/home/testuser");
    expect(result).toBe("/home/testuser/.config/pi-review-gate/config.json");
  });

  it("includes .config in the path", () => {
    const result = resolveConfigPath("/tmp");
    expect(result).toContain(".config");
  });

  it("includes pi-review-gate in the path", () => {
    const result = resolveConfigPath("/tmp");
    expect(result).toContain("pi-review-gate");
  });

  it("ends with config.json", () => {
    const result = resolveConfigPath("/tmp");
    expect(result.endsWith("config.json")).toBe(true);
  });
});

describe("mergeConfig", () => {
  it("returns defaults when partialConfig is undefined", () => {
    expect(mergeConfig(undefined)).toEqual(defaultConfig);
  });

  it("overrides top-level fields from partialConfig", () => {
    const result = mergeConfig({ enabled: false, mode: "warn" });
    expect(result.enabled).toBe(false);
    expect(result.mode).toBe("warn");
  });

  it("merges context preserving absent fields", () => {
    const result = mergeConfig({ context: { strategy: "since_last_user" } });
    expect(result.context.strategy).toBe("since_last_user");
    expect(result.context.includeEventMessages).toBe(true);
    expect(result.context.maxSessionEntries).toBe(40);
  });

  it("merges git preserving absent fields", () => {
    const result = mergeConfig({ git: { enabled: false } });
    expect(result.git.enabled).toBe(false);
    expect(result.git.includeStatus).toBe(true);
  });

  it("merges reviewer preserving absent fields", () => {
    const result = mergeConfig({ reviewer: { requireJson: false } });
    expect(result.reviewer.requireJson).toBe(false);
    expect(result.reviewer.timeoutMs).toBe(120_000);
  });

  it("merges ui preserving absent fields", () => {
    const result = mergeConfig({ ui: { notifyOnPass: false } });
    expect(result.ui.notifyOnPass).toBe(false);
    expect(result.ui.notifyOnFail).toBe(true);
  });

  it("preserves reviewerModel: null when explicitly set", () => {
    const result = mergeConfig({ reviewerModel: null });
    expect(result.reviewerModel).toBeNull();
  });

  it("does not mutate defaultConfig", () => {
    const snapshot = JSON.stringify(defaultConfig);
    mergeConfig({ enabled: false, context: { strategy: "since_last_user" } });
    expect(JSON.stringify(defaultConfig)).toBe(snapshot);
  });
});

describe("config persistence", () => {
  it("returns defaults when config file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-review-gate-"));
    const path = join(dir, "missing", "config.json");
    try {
      await expect(loadConfig(path)).resolves.toEqual(defaultConfig);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("loads partial config and merges with defaults", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-review-gate-"));
    const path = join(dir, "config.json");
    try {
      const partial = { enabled: false, mode: "warn" };
      await writeFile(path, JSON.stringify(partial), "utf8");
      const result = await loadConfig(path);
      expect(result.enabled).toBe(false);
      expect(result.mode).toBe("warn");
      expect(result.maxCorrectionCycles).toBe(2);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects on invalid JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-review-gate-"));
    const path = join(dir, "config.json");
    try {
      await writeFile(path, "not valid json", "utf8");
      await expect(loadConfig(path)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("saveConfig creates directory if missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-review-gate-"));
    const configPath = join(dir, "subdir", "config.json");
    try {
      await saveConfig(defaultConfig, configPath);
      const raw = await readFile(configPath, "utf8");
      expect(JSON.parse(raw)).toEqual(defaultConfig);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("saveConfig writes valid JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-review-gate-"));
    const path = join(dir, "config.json");
    try {
      await saveConfig(defaultConfig, path);
      const raw = await readFile(path, "utf8");
      expect(() => JSON.parse(raw)).not.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("saveConfig writes with trailing newline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-review-gate-"));
    const path = join(dir, "config.json");
    try {
      await saveConfig(defaultConfig, path);
      const raw = await readFile(path, "utf8");
      expect(raw.endsWith("\n")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("saved config can be reloaded with loadConfig", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-review-gate-"));
    const path = join(dir, "config.json");
    try {
      const config = mergeConfig({
        enabled: false,
        context: { strategy: "since_last_user" },
      });
      await saveConfig(config, path);
      const loaded = await loadConfig(path);
      expect(loaded).toEqual(config);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
