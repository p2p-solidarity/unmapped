import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  configPath,
  defaultConfig,
  loadConfig,
  parseConfig,
  saveConfig,
} from "@main/inference/config";
import { PROVIDER_PRESETS } from "@shared/llm";
import { describe, expect, it } from "vitest";

const tmp = () => mkdtemp(join(tmpdir(), "aether-inference-"));

describe("defaultConfig", () => {
  it("uses the OpenAI preset with no sidecar when OPENAI_API_KEY is set", () => {
    const config = defaultConfig({ OPENAI_API_KEY: "sk-test" });
    expect(config.kind).toBe("openai");
    expect(config.baseUrl).toBe(PROVIDER_PRESETS.openai.baseUrl);
    expect(config.apiKeyEnv).toBe("OPENAI_API_KEY");
    expect(config.sidecar).toBeNull();
  });

  it("uses Apple's on-device model when the key is absent and fm exists", () => {
    const config = defaultConfig({}, true);
    expect(config.kind).toBe("apple-fm");
    expect(config.sidecar?.binaryPath).toBe("/usr/bin/fm");
    expect(parseConfig(config).ok).toBe(true);
  });

  it("falls back to llama.cpp with a sidecar when the key is absent", () => {
    const config = defaultConfig({}, false);
    expect(config.kind).toBe("llamacpp");
    expect(config.apiKeyEnv).toBeNull();
    expect(config.sidecar).toEqual({
      binaryPath: "/opt/homebrew/bin/llama-server",
      modelPath: "",
      port: 8080,
      ctxSize: 16384,
    });
  });

  it("treats an empty OPENAI_API_KEY as absent", () => {
    expect(defaultConfig({ OPENAI_API_KEY: "" }, false).kind).toBe("llamacpp");
  });
});

describe("parseConfig", () => {
  it("rejects an unknown provider kind", () => {
    const result = parseConfig({ ...PROVIDER_PRESETS.openai, kind: "groq", sidecar: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid-config");
  });

  it("rejects a non-URL baseUrl", () => {
    const result = parseConfig({
      ...PROVIDER_PRESETS.llamacpp,
      baseUrl: "localhost:8080",
      sidecar: null,
    });
    expect(result.ok).toBe(false);
  });

  it("accepts a valid config", () => {
    const result = parseConfig({ ...PROVIDER_PRESETS.llamacpp, sidecar: null });
    expect(result.ok).toBe(true);
  });

  it("rejects a renderer-supplied endpoint that could receive an environment secret", () => {
    const result = parseConfig({
      ...PROVIDER_PRESETS.openai,
      baseUrl: "https://collector.example/v1",
      sidecar: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("untrusted-config");
  });

  it("keeps custom endpoints available when they do not request a main-process secret", () => {
    const result = parseConfig({
      ...PROVIDER_PRESETS.custom,
      baseUrl: "https://local-gateway.example/v1",
      apiKeyEnv: null,
      sidecar: null,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects arbitrary sidecar executables", () => {
    const result = parseConfig({
      ...PROVIDER_PRESETS.llamacpp,
      sidecar: {
        binaryPath: "/tmp/anything-else",
        modelPath: "/models/world.gguf",
        port: 8080,
        ctxSize: 4096,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("untrusted-config");
  });

  it("rejects a same-named sidecar outside the main-owned paths", () => {
    const result = parseConfig({
      ...PROVIDER_PRESETS.llamacpp,
      sidecar: {
        binaryPath: "/tmp/llama-server",
        modelPath: "/models/world.gguf",
        port: 8080,
        ctxSize: 4096,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("untrusted-config");
  });

  it("accepts the documented Intel Homebrew sidecar path", () => {
    const result = parseConfig({
      ...PROVIDER_PRESETS.llamacpp,
      sidecar: {
        binaryPath: "/usr/local/bin/llama-server",
        modelPath: "/models/world.gguf",
        port: 8080,
        ctxSize: 4096,
      },
    });
    expect(result.ok).toBe(true);
  });
});

describe("loadConfig / saveConfig", () => {
  it("returns the default when the file is missing", async () => {
    const dir = await tmp();
    await expect(loadConfig(dir, {})).resolves.toEqual(defaultConfig({}));
  });

  it("returns the default when the file is invalid JSON", async () => {
    const dir = await tmp();
    await writeFile(configPath(dir), "{ not json", "utf8");
    await expect(loadConfig(dir, {})).resolves.toEqual(defaultConfig({}));
  });

  it("returns the default when the file fails validation", async () => {
    const dir = await tmp();
    await writeFile(configPath(dir), JSON.stringify({ kind: "nope" }), "utf8");
    await expect(loadConfig(dir, { OPENAI_API_KEY: "sk-test" })).resolves.toMatchObject({
      kind: "openai",
    });
  });

  it("round-trips a saved config", async () => {
    const dir = await tmp();
    const config = { ...PROVIDER_PRESETS.ollama, sidecar: null };
    const saved = await saveConfig(dir, config);
    expect(saved.ok).toBe(true);
    expect(JSON.parse(await readFile(configPath(dir), "utf8"))).toEqual(config);
    await expect(loadConfig(dir, {})).resolves.toEqual(config);
  });

  it("refuses to persist an invalid config", async () => {
    const dir = await tmp();
    const saved = await saveConfig(dir, {
      ...PROVIDER_PRESETS.openai,
      baseUrl: "not a url",
      sidecar: null,
    });
    expect(saved.ok).toBe(false);
  });
});
