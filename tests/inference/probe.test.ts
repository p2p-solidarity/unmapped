import { guessServerName, type ServerHints } from "@main/inference/probe";
import { describe, expect, it } from "vitest";

const hints = (overrides: Partial<ServerHints> = {}): ServerHints => ({
  baseUrl: "http://127.0.0.1:8080/v1",
  serverHeader: null,
  ownedBy: null,
  models: [],
  ...overrides,
});

describe("guessServerName", () => {
  it("reads llama.cpp from the server header", () => {
    expect(guessServerName(hints({ serverHeader: "llama.cpp" }))).toBe("llama.cpp");
  });

  it("does not mistake an ollama header for llama.cpp", () => {
    expect(guessServerName(hints({ serverHeader: "ollama/0.6.2" }))).toBe("ollama");
  });

  it("reads vllm from owned_by", () => {
    expect(guessServerName(hints({ ownedBy: "vllm", models: ["thesysdev/OUI-1"] }))).toBe("vllm");
  });

  it("uses port 11434 for ollama", () => {
    expect(guessServerName(hints({ baseUrl: "http://127.0.0.1:11434/v1" }))).toBe("ollama");
  });

  it("recognises the OpenAI host", () => {
    expect(guessServerName(hints({ baseUrl: "https://api.openai.com/v1" }))).toBe("openai");
  });

  it("infers llama.cpp from a gguf model id", () => {
    expect(guessServerName(hints({ models: ["/Users/p/models/Qwen3.5-4B-Q4_K_M.gguf"] }))).toBe(
      "llama.cpp",
    );
  });

  it("infers llama.cpp from the 'local' alias", () => {
    expect(guessServerName(hints({ models: ["local"] }))).toBe("llama.cpp");
  });

  it("does not claim llama.cpp for a huggingface-style id", () => {
    expect(
      guessServerName(hints({ baseUrl: "http://127.0.0.1:8000/v1", models: ["thesysdev/OUI-1"] })),
    ).toBeNull();
  });

  it("returns null when nothing identifies the server", () => {
    expect(guessServerName(hints({ baseUrl: "https://example.test/v1" }))).toBeNull();
  });
});
