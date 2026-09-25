import { buildChatBody, createClient, usesReasoningParams } from "@main/inference/client";
import type { ChatRequest, InferenceConfig } from "@shared/llm";
import { PROVIDER_PRESETS } from "@shared/llm";
import { describe, expect, it } from "vitest";

const request: ChatRequest = {
  id: "req-1",
  messages: [
    { role: "system", content: "sys" },
    { role: "user", content: "write a scene" },
  ],
  maxTokens: 1600,
  temperature: 0.9,
  grammar: "root ::= scene",
  stop: [],
  tools: [],
};

const config = (over: Partial<InferenceConfig>): InferenceConfig => ({
  ...PROVIDER_PRESETS.llamacpp,
  sidecar: null,
  ...over,
});

describe("usesReasoningParams", () => {
  it("is false when the openai preset is pointed at a non-reasoning model", () => {
    expect(usesReasoningParams(config({ ...PROVIDER_PRESETS.openai, model: "gpt-4o" }))).toBe(
      false,
    );
  });

  it("is true for a gpt-5 or o-series model on a custom endpoint", () => {
    expect(usesReasoningParams(config({ kind: "custom", model: "gpt-5.4-mini" }))).toBe(true);
    expect(usesReasoningParams(config({ kind: "custom", model: "openai/gpt-5.5" }))).toBe(true);
    expect(usesReasoningParams(config({ kind: "custom", model: "o3-mini" }))).toBe(true);
  });

  it("is false for local runtimes, including ids that merely start with o", () => {
    expect(usesReasoningParams(config({ kind: "llamacpp", model: "local" }))).toBe(false);
    expect(usesReasoningParams(config({ ...PROVIDER_PRESETS.vllm }))).toBe(false);
    expect(usesReasoningParams(config({ kind: "vllm", model: "OUI-1" }))).toBe(false);
  });
});

describe("createClient", () => {
  it("does not construct a client for an untrusted secret endpoint", () => {
    const result = createClient(
      config({
        kind: "custom",
        baseUrl: "https://collector.example/v1",
        apiKeyEnv: "OPENAI_API_KEY",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("untrusted-config");
  });
});

describe("buildChatBody", () => {
  it("sends max_completion_tokens + reasoning_effort and no temperature for GPT-5", () => {
    const body = buildChatBody(
      config({ ...PROVIDER_PRESETS.openai, model: "gpt-5.4-mini" }),
      request,
    );
    expect(body.max_completion_tokens).toBe(1600);
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.reasoning_effort).toBe("low");
    expect(body.grammar).toBeUndefined();
    expect(body.chat_template_kwargs).toBeUndefined();
  });

  it("sends max_tokens + temperature for llama.cpp, plus grammar and thinking-off", () => {
    const body = buildChatBody(config({ kind: "llamacpp" }), request);
    expect(body.max_tokens).toBe(1600);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.temperature).toBe(0.9);
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.grammar).toBe("root ::= scene");
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("never sends grammar to a server that is not llama.cpp", () => {
    expect(buildChatBody(config({ ...PROVIDER_PRESETS.ollama }), request).grammar).toBeUndefined();
    expect(buildChatBody(config({ ...PROVIDER_PRESETS.vllm }), request).grammar).toBeUndefined();
  });

  it("sends chat_template_kwargs to ollama but not to vllm", () => {
    expect(
      buildChatBody(config({ ...PROVIDER_PRESETS.ollama }), request).chat_template_kwargs,
    ).toEqual({
      enable_thinking: false,
    });
    expect(
      buildChatBody(config({ ...PROVIDER_PRESETS.vllm }), request).chat_template_kwargs,
    ).toBeUndefined();
  });
});
