import {
  apiKeyEnvFromInput,
  applyProviderPreset,
  EMPTY_SIDECAR,
  isProviderKind,
  numberFromInput,
} from "@renderer/app/console/presets";
import { type InferenceConfig, PROVIDER_KINDS, PROVIDER_PRESETS } from "@shared/llm";
import { describe, expect, it } from "vitest";

const custom: InferenceConfig = {
  kind: "custom",
  baseUrl: "http://127.0.0.1:9999/v1",
  model: "mine",
  apiKeyEnv: "MY_KEY",
  sidecar: { ...EMPTY_SIDECAR, binaryPath: "/opt/homebrew/bin/llama-server" },
};

describe("provider presets", () => {
  it("replaces the endpoint fields with the preset for every kind", () => {
    for (const kind of PROVIDER_KINDS) {
      const next = applyProviderPreset(custom, kind);
      expect(next.kind).toBe(kind);
      expect(next.baseUrl).toBe(PROVIDER_PRESETS[kind].baseUrl);
      expect(next.model).toBe(PROVIDER_PRESETS[kind].model);
      expect(next.apiKeyEnv).toBe(PROVIDER_PRESETS[kind].apiKeyEnv);
    }
  });

  it("keeps the sidecar the user configured", () => {
    expect(applyProviderPreset(custom, "openai").sidecar).toBe(custom.sidecar);
    expect(applyProviderPreset({ ...custom, sidecar: null }, "llamacpp").sidecar).toBeNull();
  });

  it("does not mutate the current config", () => {
    const before = JSON.stringify(custom);
    applyProviderPreset(custom, "ollama");
    expect(JSON.stringify(custom)).toBe(before);
  });

  it("recognises only the known kinds", () => {
    expect(isProviderKind("llamacpp")).toBe(true);
    expect(isProviderKind("anthropic")).toBe(false);
  });

  it("treats an empty apiKeyEnv field as no auth", () => {
    expect(apiKeyEnvFromInput("")).toBeNull();
    expect(apiKeyEnvFromInput("   ")).toBeNull();
    expect(apiKeyEnvFromInput(" OPENAI_API_KEY ")).toBe("OPENAI_API_KEY");
  });

  it("falls back instead of writing NaN into port/ctxSize", () => {
    expect(numberFromInput("8081", 8080)).toBe(8081);
    expect(numberFromInput("", 8080)).toBe(8080);
    expect(numberFromInput("abc", 8080)).toBe(8080);
    expect(numberFromInput("-1", 8080)).toBe(8080);
  });
});
