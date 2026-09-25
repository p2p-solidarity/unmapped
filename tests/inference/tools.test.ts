// Tool calling over the wire: how our ChatMessage union becomes OpenAI messages, what the body
// looks like when tools are offered, and how streamed `tool_calls` fragments are reassembled.

import { buildChatBody, toWireMessage } from "@main/inference/client";
import { createToolCallAccumulator, type ToolCallDelta } from "@main/inference/toolCalls";
import type { ChatMessage, ChatRequest, InferenceConfig, ToolSchema } from "@shared/llm";
import { PROVIDER_PRESETS } from "@shared/llm";
import { describe, expect, it } from "vitest";

const config = (over: Partial<InferenceConfig>): InferenceConfig => ({
  ...PROVIDER_PRESETS.llamacpp,
  sidecar: null,
  ...over,
});

const lightLanterns: ToolSchema = {
  name: "light_lanterns",
  description: "Light the festival lanterns.",
  parameters: {
    type: "object",
    properties: { color: { type: "string" } },
    required: ["color"],
    additionalProperties: false,
  },
};

const request = (over: Partial<ChatRequest>): ChatRequest => ({
  id: "req-1",
  messages: [{ role: "user", content: "light them" }],
  maxTokens: 512,
  temperature: 0.7,
  grammar: null,
  stop: [],
  tools: [],
  ...over,
});

describe("toWireMessage", () => {
  it("passes system and user turns through unchanged", () => {
    expect(toWireMessage({ role: "system", content: "sys" })).toEqual({
      role: "system",
      content: "sys",
    });
    expect(toWireMessage({ role: "user", content: "hi" })).toEqual({ role: "user", content: "hi" });
  });

  it("omits tool_calls entirely for a plain assistant turn", () => {
    expect(toWireMessage({ role: "assistant", content: "done" })).toEqual({
      role: "assistant",
      content: "done",
    });
    expect(toWireMessage({ role: "assistant", content: "done", toolCalls: [] })).toEqual({
      role: "assistant",
      content: "done",
    });
  });

  it("wraps assistant toolCalls in the function envelope", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "",
      toolCalls: [
        { id: "call_a", name: "light_lanterns", arguments: '{"color":"#ffaa33"}' },
        { id: "call_b", name: "set_flag", arguments: '{"key":"lit","value":true}' },
      ],
    };
    expect(toWireMessage(message)).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: "call_a",
          type: "function",
          function: { name: "light_lanterns", arguments: '{"color":"#ffaa33"}' },
        },
        {
          id: "call_b",
          type: "function",
          function: { name: "set_flag", arguments: '{"key":"lit","value":true}' },
        },
      ],
    });
  });

  it("addresses a tool result by tool_call_id and drops our local name field", () => {
    const message: ChatMessage = {
      role: "tool",
      content: "the lanterns are lit",
      toolCallId: "call_a",
      name: "light_lanterns",
    };
    expect(toWireMessage(message)).toEqual({
      role: "tool",
      content: "the lanterns are lit",
      tool_call_id: "call_a",
    });
  });
});

describe("buildChatBody with tools", () => {
  it("omits tools and tool_choice when the caller offered none", () => {
    const body = buildChatBody(config({}), request({}));
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("sends the function envelope and tool_choice auto", () => {
    const body = buildChatBody(config({}), request({ tools: [lightLanterns] }));
    expect(body.tool_choice).toBe("auto");
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "light_lanterns",
          description: "Light the festival lanterns.",
          parameters: lightLanterns.parameters,
        },
      },
    ]);
  });

  it("disables reasoning when GPT-5 Chat Completions receives function tools", () => {
    const body = buildChatBody(
      config({ ...PROVIDER_PRESETS.openai, model: "gpt-5.4-mini" }),
      request({ tools: [lightLanterns] }),
    );
    expect(body.reasoning_effort).toBe("none");
    expect(body.max_completion_tokens).toBe(512);
  });

  it("drops the grammar when tools are present, even on llama.cpp", () => {
    const withGrammar = request({ grammar: "root ::= scene" });
    expect(buildChatBody(config({ kind: "llamacpp" }), withGrammar).grammar).toBe("root ::= scene");
    const withBoth = request({ grammar: "root ::= scene", tools: [lightLanterns] });
    expect(buildChatBody(config({ kind: "llamacpp" }), withBoth).grammar).toBeUndefined();
  });

  it("maps a whole tool round-trip onto the wire", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "light them" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "call_a", name: "light_lanterns", arguments: '{"color":"#ffaa33"}' }],
      },
      { role: "tool", content: "ok", toolCallId: "call_a", name: "light_lanterns" },
    ];
    const body = buildChatBody(config({}), request({ messages, tools: [lightLanterns] }));
    expect(body.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(body.messages[3]).toEqual({ role: "tool", content: "ok", tool_call_id: "call_a" });
  });
});

describe("createToolCallAccumulator", () => {
  const push = (accumulator: ReturnType<typeof createToolCallAccumulator>) => (d: ToolCallDelta) =>
    accumulator.push([d]);

  it("has nothing to report before any delta arrives", () => {
    expect(createToolCallAccumulator().toolCalls()).toEqual([]);
  });

  it("concatenates arguments split across chunks", () => {
    const accumulator = createToolCallAccumulator();
    const one = push(accumulator);
    one({ index: 0, id: "call_a", function: { name: "light_lanterns", arguments: '{"col' } });
    one({ index: 0, function: { arguments: 'or":"#ff' } });
    one({ index: 0, function: { arguments: 'aa33"}' } });
    expect(accumulator.toolCalls()).toEqual([
      { id: "call_a", name: "light_lanterns", arguments: '{"color":"#ffaa33"}' },
    ]);
  });

  it("keeps interleaved indices apart and returns them in index order", () => {
    const accumulator = createToolCallAccumulator();
    accumulator.push([
      { index: 1, id: "call_b", function: { name: "set_flag", arguments: "{" } },
      { index: 0, id: "call_a", function: { name: "narrate", arguments: "{" } },
    ]);
    accumulator.push([
      { index: 0, function: { arguments: '"text":"a"}' } },
      { index: 1, function: { arguments: '"key":"lit"}' } },
    ]);
    expect(accumulator.toolCalls()).toEqual([
      { id: "call_a", name: "narrate", arguments: '{"text":"a"}' },
      { id: "call_b", name: "set_flag", arguments: '{"key":"lit"}' },
    ]);
  });

  it("ignores content-only chunks and null tool_calls", () => {
    const accumulator = createToolCallAccumulator();
    accumulator.push(null);
    accumulator.push(undefined);
    accumulator.push([]);
    expect(accumulator.toolCalls()).toEqual([]);
  });

  it("substitutes a deterministic id for servers that omit one", () => {
    const accumulator = createToolCallAccumulator();
    accumulator.push([{ index: 2, function: { name: "narrate", arguments: "{}" } }]);
    expect(accumulator.toolCalls()).toEqual([{ id: "call_2", name: "narrate", arguments: "{}" }]);
  });

  it("drops a fragment that never received a function name", () => {
    const accumulator = createToolCallAccumulator();
    accumulator.push([{ index: 0, id: "call_a", function: { arguments: "{}" } }]);
    expect(accumulator.toolCalls()).toEqual([]);
  });
});
