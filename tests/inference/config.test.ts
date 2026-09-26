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
  it("uses Apple's on-device model when the key is absent and the bridge answers", () => {
    const config = defaultConfig({}, true);
    expect(config.kind).toBe("apple-fm");
    expect(config.sidecar).toBeNull();
    expect(parseConfig(config).ok).toBe(true);
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
});

describe("loadConfig / saveConfig", () => {
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

  // Guards silent loss of the player's choice: a config saved when Apple ran as `fm serve` must read
  // back as Apple through the bridge, never be refused and replaced by the default provider, and
  // must never keep a sidecar that spawns /usr/bin/fm.
  it("reads a config saved for fm serve as Apple inside the app", async () => {
    const dir = await tmp();
    const legacy = {
      kind: "apple-fm",
      baseUrl: "http://127.0.0.1:11535/v1",
      model: "system",
      apiKeyEnv: null,
      sidecar: { binaryPath: "/usr/bin/fm", modelPath: "", port: 11535, ctxSize: 4096 },
    };
    await writeFile(configPath(dir), JSON.stringify(legacy), "utf8");
    await expect(loadConfig(dir, { OPENAI_API_KEY: "sk-test" })).resolves.toEqual({
      ...PROVIDER_PRESETS["apple-fm"],
      sidecar: null,
    });
    const spawnFm = { ...PROVIDER_PRESETS.llamacpp, sidecar: legacy.sidecar };
    expect(parseConfig(spawnFm).ok).toBe(false);
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
