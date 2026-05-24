import { readFileSync } from "node:fs";
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
import { validateConfig } from "../src/schema.js";

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

  it("rejects config with invalid mode in file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-review-gate-"));
    const path = join(dir, "config.json");
    try {
      const invalid = { mode: "invalid" };
      await writeFile(path, JSON.stringify(invalid), "utf8");
      await expect(loadConfig(path)).rejects.toThrow("config.mode");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects config with negative maxCorrectionCycles in file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-review-gate-"));
    const path = join(dir, "config.json");
    try {
      const invalid = { maxCorrectionCycles: -1 };
      await writeFile(path, JSON.stringify(invalid), "utf8");
      await expect(loadConfig(path)).rejects.toThrow("config.maxCorrectionCycles");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Example config validation
// ---------------------------------------------------------------------------

describe("example config", () => {
  const EXAMPLE_CONFIG_PATH = join(process.cwd(), "examples", "config.example.json");

  it("is parseable valid JSON", () => {
    const raw = readFileSync(EXAMPLE_CONFIG_PATH, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("passes schema validation", () => {
    const raw = readFileSync(EXAMPLE_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    expect(validateConfig(parsed)).toBeDefined();
  });

  it("matches defaultConfig", () => {
    const raw = readFileSync(EXAMPLE_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    expect(validateConfig(parsed)).toEqual(defaultConfig);
  });

  it("has reviewerModel explicitly null", () => {
    const raw = readFileSync(EXAMPLE_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const config = validateConfig(parsed);
    expect(config.reviewerModel).toBeNull();
  });

  it("has all required top-level fields", () => {
    const raw = readFileSync(EXAMPLE_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const config = validateConfig(parsed);
    expect(config).toEqual(
      expect.objectContaining({
        enabled: expect.any(Boolean),
        mode: expect.any(String),
        reviewerModel: expect.any(Object) as unknown,
        maxCorrectionCycles: expect.any(Number),
        context: expect.any(Object),
        git: expect.any(Object),
        reviewer: expect.any(Object),
        ui: expect.any(Object),
      }),
    );
  });

  it("has all required nested fields", () => {
    const raw = readFileSync(EXAMPLE_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const config = validateConfig(parsed);
    expect(config.context).toEqual(
      expect.objectContaining({
        strategy: expect.any(String),
        includeEventMessages: expect.any(Boolean),
        includeSessionSlice: expect.any(Boolean),
        maxSessionEntries: expect.any(Number),
      }),
    );
    expect(config.git).toEqual(
      expect.objectContaining({
        enabled: expect.any(Boolean),
        includeStatus: expect.any(Boolean),
        includeDiffStat: expect.any(Boolean),
        includeDiff: expect.any(Boolean),
        maxDiffChars: expect.any(Number),
        maxStatusChars: expect.any(Number),
        maxDiffStatChars: expect.any(Number),
      }),
    );
    expect(config.reviewer).toEqual(
      expect.objectContaining({
        requireJson: expect.any(Boolean),
        failClosedOnInvalidJson: expect.any(Boolean),
        timeoutMs: expect.any(Number),
      }),
    );
    expect(config.ui).toEqual(
      expect.objectContaining({
        notifyOnPass: expect.any(Boolean),
        notifyOnFail: expect.any(Boolean),
        showReviewerSummary: expect.any(Boolean),
      }),
    );
  });

  it("is compatible with mergeConfig (loadConfig pattern)", () => {
    const raw = readFileSync(EXAMPLE_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    expect(validateConfig(mergeConfig(parsed))).toEqual(defaultConfig);
  });

  it("does not contain secrets or credentials", () => {
    const raw = readFileSync(EXAMPLE_CONFIG_PATH, "utf8");
    const lower = raw.toLowerCase();
    const secretIndicators = [
      "apikey",
      "api_key",
      "password",
      "secret",
      "token",
      "credential",
      "private_key",
    ];
    for (const indicator of secretIndicators) {
      expect(lower).not.toContain(indicator);
    }
  });
});
