import {
  type AssembleContext,
  type ChatFn,
  createHarness,
  defineTool,
  type Harness,
  ORDER,
  runTurn,
} from "@harness";
import type { ChatRequest, ChatUsage, ToolCall } from "@shared/llm";
import { err, ok, type Result } from "@shared/result";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type ChatStep = Result<{ text: string; toolCalls: ToolCall[]; usage: ChatUsage | null }>;

const ASSEMBLE: AssembleContext = { purpose: "resolve", language: "ja-JP" };

const say = (text: string, toolCalls: ToolCall[] = []): ChatStep =>
  ok({ text, toolCalls, usage: null });

/** A model that replays a scripted list of answers and records what it was asked. */
function fakeChat(steps: ChatStep[]): { chat: ChatFn; seen: Omit<ChatRequest, "id">[] } {
  const seen: Omit<ChatRequest, "id">[] = [];
  const chat: ChatFn = (request) => {
    seen.push(request);
    const step = steps[seen.length - 1];
    return Promise.resolve(step ?? err("fake-chat", "the fake model ran out of answers"));
  };
  return { chat, seen };
}

describe("runTurn", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
    harness.ctx.systemPrompt.variable("language", (assemble) => assemble.language);
    harness.ctx.systemPrompt.section({
      name: "persona",
      order: ORDER.PERSONA,
      text: "speak {{language}}",
    });
    harness.ctx.tools.register(
      defineTool({
        name: "set_flag",
        description: "Remember a fact.",
        parameters: { key: { type: "string", required: true } },
        execute: (args) => Promise.resolve({ ok: true, key: args.key }),
        render: (_args, value) => `remembered ${JSON.stringify(value)}`,
      }),
    );
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it("prepends the assembled prompt and returns the model's answer", async () => {
    const { chat, seen } = fakeChat([say("灯りは戻った。")]);
    const result = await runTurn({
      ctx: harness.ctx,
      chat,
      messages: [
        { role: "system", content: "an incoming system message that must be replaced" },
        { role: "user", content: "I light the lantern." },
      ],
      assemble: ASSEMBLE,
    });

    expect(result).toEqual(
      ok({
        text: "灯りは戻った。",
        steps: 1,
        toolResults: [],
        messages: [
          { role: "system", content: "speak ja-JP" },
          { role: "user", content: "I light the lantern." },
          { role: "assistant", content: "灯りは戻った。" },
        ],
      }),
    );
    expect(seen[0]?.tools.map((tool) => tool.name)).toEqual(["set_flag"]);
  });

  it("executes tool calls, feeds the results back, and answers on the next step", async () => {
    const { chat, seen } = fakeChat([
      say("", [{ id: "c1", name: "set_flag", arguments: '{"key":"gate_7_open"}' }]),
      say("門が開いた。"),
    ]);
    const result = await runTurn({ ctx: harness.ctx, chat, messages: [], assemble: ASSEMBLE });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps).toBe(2);
    expect(result.value.toolResults).toHaveLength(1);
    expect(result.value.toolResults[0]).toMatchObject({ name: "set_flag", isError: false });
    expect(result.value.messages).toEqual([
      { role: "system", content: "speak ja-JP" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "set_flag", arguments: '{"key":"gate_7_open"}' }],
      },
      {
        role: "tool",
        content: 'remembered {"ok":true,"key":"gate_7_open"}',
        toolCallId: "c1",
        name: "set_flag",
      },
      { role: "assistant", content: "門が開いた。" },
    ]);
    // The second request carries the whole history back to the model.
    expect(seen[1]?.messages).toHaveLength(3);
  });

  it("offers no tools and passes the grammar through when useTools is false", async () => {
    const { chat, seen } = fakeChat([say("Scene { }")]);
    await runTurn({
      ctx: harness.ctx,
      chat,
      messages: [],
      assemble: { purpose: "scene", language: "en" },
      useTools: false,
      grammar: "root ::= scene",
      maxTokens: 512,
      temperature: 0.2,
    });
    expect(seen[0]).toMatchObject({
      tools: [],
      grammar: "root ::= scene",
      maxTokens: 512,
      temperature: 0.2,
    });
  });

  it("drops the grammar when tools are offered, because no server honours both", async () => {
    const { chat, seen } = fakeChat([say("ok")]);
    await runTurn({
      ctx: harness.ctx,
      chat,
      messages: [],
      assemble: ASSEMBLE,
      grammar: "root ::= scene",
    });
    expect(seen[0]?.grammar).toBeNull();
  });

  it("gives up after maxSteps of tool calls", async () => {
    const loop = say("", [{ id: "c1", name: "set_flag", arguments: '{"key":"a"}' }]);
    const { chat } = fakeChat([loop, loop, loop, loop, loop]);
    const result = await runTurn({
      ctx: harness.ctx,
      chat,
      messages: [],
      assemble: ASSEMBLE,
      maxSteps: 2,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "turn-max-steps" } });
  });

  it("returns the chat error unchanged", async () => {
    const { chat } = fakeChat([err("offline", "no model is reachable", "start llama-server")]);
    const result = await runTurn({ ctx: harness.ctx, chat, messages: [], assemble: ASSEMBLE });
    expect(result).toEqual(err("offline", "no model is reachable", "start llama-server"));
  });

  it("aborts before the first request when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const { chat, seen } = fakeChat([say("never")]);
    const result = await runTurn({
      ctx: harness.ctx,
      chat,
      messages: [],
      assemble: { ...ASSEMBLE, signal: controller.signal },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "aborted" } });
    expect(seen).toEqual([]);
  });

  it("aborts after a tool round when the signal fires mid-turn", async () => {
    const controller = new AbortController();
    const { chat } = fakeChat([
      say("", [{ id: "c1", name: "set_flag", arguments: '{"key":"a"}' }]),
      say("never"),
    ]);
    harness.ctx.on("tools/result", () => controller.abort());

    const result = await runTurn({
      ctx: harness.ctx,
      chat,
      messages: [],
      assemble: { ...ASSEMBLE, signal: controller.signal },
    });
    expect(result).toMatchObject({ ok: false, error: { code: "aborted" } });
  });

  it("turns an unresolvable prompt variable into a Result error", async () => {
    harness.ctx.systemPrompt.section({ name: "oops", order: 200, text: "the {{floor}} floor" });
    const { chat, seen } = fakeChat([say("never")]);
    const result = await runTurn({ ctx: harness.ctx, chat, messages: [], assemble: ASSEMBLE });

    expect(result).toMatchObject({ ok: false, error: { code: "prompt-assemble" } });
    expect(seen).toEqual([]);
  });
});
