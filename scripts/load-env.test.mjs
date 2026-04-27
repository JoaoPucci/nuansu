import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultCandidates, loadEnv, parseEnvFile, resolveEnvPath } from "./load-env.mjs";

let scratch;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "nuansu-env-"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("parseEnvFile", () => {
  it("parses basic KEY=VALUE pairs", () => {
    expect(parseEnvFile("FOO=bar\nBAZ=qux")).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("ignores blank lines and full-line comments", () => {
    const text = "\n# top\nFOO=bar\n\n# inner\nBAZ=qux\n";
    expect(parseEnvFile(text)).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  it("preserves spaces and # inside double-quoted values", () => {
    expect(parseEnvFile('FOO="hello # world"')).toEqual({ FOO: "hello # world" });
  });

  it("preserves spaces inside single-quoted values", () => {
    expect(parseEnvFile("FOO='hello world'")).toEqual({ FOO: "hello world" });
  });

  it("strips inline ` #` comments from bare values", () => {
    expect(parseEnvFile("FOO=bar # note")).toEqual({ FOO: "bar" });
  });

  it("rejects invalid keys", () => {
    expect(parseEnvFile("123=bad\nFOO=ok")).toEqual({ FOO: "ok" });
  });
});

describe("defaultCandidates", () => {
  it("places XDG canonical before repo-root fallbacks", () => {
    expect(defaultCandidates({ env: { XDG_DATA_HOME: "/xdg" }, cwd: "/repo" })).toEqual([
      "/xdg/nuansu/.env",
      "/repo/.env.local",
      "/repo/.env",
    ]);
  });

  it("respects $NUANSU_ENV_FILE override at top of the list", () => {
    const list = defaultCandidates({
      env: { NUANSU_ENV_FILE: "/explicit/.env", XDG_DATA_HOME: "/xdg" },
      cwd: "/repo",
    });
    expect(list[0]).toBe("/explicit/.env");
  });

  it("falls back to ~/.local/share when XDG_DATA_HOME is unset", () => {
    const list = defaultCandidates({ env: {}, cwd: "/repo" });
    expect(list[0]).toMatch(/\.local[\\/]share[\\/]nuansu[\\/]\.env$/);
  });
});

describe("resolveEnvPath", () => {
  it("returns null when no candidate exists", () => {
    expect(resolveEnvPath([join(scratch, "missing")])).toBeNull();
  });

  it("returns the first existing candidate", () => {
    const xdg = join(scratch, "xdg.env");
    const repo = join(scratch, "repo.env");
    writeFileSync(xdg, "");
    writeFileSync(repo, "");
    expect(resolveEnvPath([xdg, repo])).toBe(xdg);
  });

  it("falls through past missing candidates", () => {
    const xdg = join(scratch, "xdg.env");
    const repo = join(scratch, "repo.env");
    writeFileSync(repo, "");
    expect(resolveEnvPath([xdg, repo])).toBe(repo);
  });
});

describe("loadEnv", () => {
  it("populates process.env from the resolved file", () => {
    const file = join(scratch, "test.env");
    writeFileSync(file, "TEST_NUANSU_LOADER_KEY_A=hello");
    const original = process.env.TEST_NUANSU_LOADER_KEY_A;
    delete process.env.TEST_NUANSU_LOADER_KEY_A;
    try {
      loadEnv({ candidates: [file], reset: true });
      expect(process.env.TEST_NUANSU_LOADER_KEY_A).toBe("hello");
    } finally {
      if (original === undefined) delete process.env.TEST_NUANSU_LOADER_KEY_A;
      else process.env.TEST_NUANSU_LOADER_KEY_A = original;
    }
  });

  it("does NOT overwrite existing process.env vars by default", () => {
    const file = join(scratch, "test.env");
    writeFileSync(file, "TEST_NUANSU_LOADER_KEY_B=fromfile");
    process.env.TEST_NUANSU_LOADER_KEY_B = "fromshell";
    try {
      loadEnv({ candidates: [file], reset: true });
      expect(process.env.TEST_NUANSU_LOADER_KEY_B).toBe("fromshell");
    } finally {
      delete process.env.TEST_NUANSU_LOADER_KEY_B;
    }
  });

  it("overrides when override:true", () => {
    const file = join(scratch, "test.env");
    writeFileSync(file, "TEST_NUANSU_LOADER_KEY_C=fromfile");
    process.env.TEST_NUANSU_LOADER_KEY_C = "fromshell";
    try {
      loadEnv({ candidates: [file], override: true, reset: true });
      expect(process.env.TEST_NUANSU_LOADER_KEY_C).toBe("fromfile");
    } finally {
      delete process.env.TEST_NUANSU_LOADER_KEY_C;
    }
  });

  it("returns null when no candidate exists", () => {
    expect(loadEnv({ candidates: [join(scratch, "nope")], reset: true })).toBeNull();
  });
});
