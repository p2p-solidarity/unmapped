import {
  createHarness,
  defineTool,
  type Harness,
  type JsonValue,
  type ToolExecInput,
  type ToolExecutionResult,
} from "@harness";
import type { ToolCall } from "@shared/llm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXEC: ToolExecInput = { purpose: "resolve" };

const call = (name: string, args: unknown, id = "call-1"): ToolCall => ({
  id,
  name,
  arguments: typeof args === "string" ? args : JSON.stringify(args),
});

const echo = (overrides: { name?: string } = {}) =>
  defineTool({
    name: overrides.name ?? "echo",
    description: "Echo a line back.",
    parameters: {
      line: { type: "string", required: true, description: "What to echo." },
      times: { type: "integer", minimum: 1, maximum: 3 },
    },
    execute: (args) => Promise.resolve({ line: args.line, times: args.times ?? 1 }),
    render: (_args, value) => `echoed ${JSON.stringify(value)}`,
  });

describe("ctx.tools", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(async () => {
    await harness.dispose();
  });

  it("registers, exposes a model-facing schema, and unregisters on dispose", () => {
    const { tools } = harness.ctx;
    const drop = tools.register(echo());

    expect(tools.has("echo")).toBe(true);
    expect(tools.schemas()).toEqual([
      {
        name: "echo",
        description: "Echo a line back.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["line"],
          properties: {
            line: { type: "string", description: "What to echo." },
            times: { type: "integer", minimum: 1, maximum: 3 },
          },
        },
      },
    ]);
    // The body and the validator never reach the model.
    expect(Object.keys(tools.schemas()[0] ?? {})).toEqual(["name", "description", "parameters"]);

    drop();
    expect(tools.has("echo")).toBe(false);
    expect(tools.schemas()).toEqual([]);
  });

  it("refuses a duplicate name and sorts schemas by name", () => {
    const { tools } = harness.ctx;
    tools.register(echo());
    expect(() => tools.register(echo())).toThrowError(/"echo" is already registered/);

    tools.register(echo({ name: "alpha" }));
    expect(tools.schemas().map((schema) => schema.name)).toEqual(["alpha", "echo"]);
  });

  it("runs a call and renders the value for the model", async () => {
    harness.ctx.tools.register(echo());
    const result = await harness.ctx.tools.execute(call("echo", { line: "hi", times: 2 }), EXEC);

    expect(result).toMatchObject({
      callId: "call-1",
      name: "echo",
      args: { line: "hi", times: 2 },
      value: { line: "hi", times: 2 },
      content: 'echoed {"line":"hi","times":2}',
      isError: false,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports an unknown tool instead of throwing", async () => {
    harness.ctx.tools.register(echo());
    const result = await harness.ctx.tools.execute(call("nope", {}), EXEC);
    expect(result.isError).toBe(true);
    expect(result.content).toContain('no tool named "nope"');
    expect(result.content).toContain("available tools: echo");
  });

  it("reports unparseable arguments and schema violations with the expected schema", async () => {
    harness.ctx.tools.register(echo());

    const broken = await harness.ctx.tools.execute(call("echo", "{not json"), EXEC);
    expect(broken.isError).toBe(true);
    expect(broken.content).toContain("not valid JSON");

    const invalid = await harness.ctx.tools.execute(call("echo", { times: 9 }), EXEC);
    expect(invalid.isError).toBe(true);
    expect(invalid.value).toBeNull();
    expect(invalid.content).toContain('invalid arguments for "echo"');
    expect(invalid.content).toContain("line:");
    expect(invalid.content).toContain("times:");
    expect(invalid.content).toContain('"additionalProperties":false');
  });

  it("turns a throwing body into an error result", async () => {
    harness.ctx.tools.register(
      defineTool({
        name: "boom",
        description: "Always fails.",
        parameters: {},
        execute: () => Promise.reject(new Error("the gate is barred")),
      }),
    );
    const result = await harness.ctx.tools.execute(call("boom", {}), EXEC);
    expect(result.isError).toBe(true);
    expect(result.content).toBe('tool "boom" failed: the gate is barred');
  });

  it("lets tools/pre-execute deny a call before the body runs", async () => {
    const body = vi.fn(() => Promise.resolve<JsonValue>("ran"));
    harness.ctx.tools.register(
      defineTool({ name: "guarded", description: "d", parameters: {}, execute: body }),
    );
    harness.ctx.on("tools/pre-execute", async (exec, next) =>
      exec.name === "guarded" ? { kind: "deny", reason: "the spire is asleep" } : next(),
    );

    const result = await harness.ctx.tools.execute(call("guarded", {}), EXEC);
    expect(body).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content).toBe('tool "guarded" was denied: the spire is asleep');
  });

  it("lets tools/execute wrap the body and tools/post-execute replace the result", async () => {
    harness.ctx.tools.register(echo());
    harness.ctx.on("tools/execute", async (_exec, next) => {
      const value = await next();
      return { wrapped: value };
    });
    harness.ctx.on("tools/post-execute", async (_exec, _result, next) => {
      const accepted = await next();
      return { ...accepted, content: `[redacted] ${accepted.name}` };
    });

    const seen: ToolExecutionResult[] = [];
    harness.ctx.on("tools/result", (result) => seen.push(result));

    const result = await harness.ctx.tools.execute(call("echo", { line: "hi" }), EXEC);
    expect(result.value).toEqual({ wrapped: { line: "hi", times: 1 } });
    expect(result.content).toBe("[redacted] echo");
    expect(seen).toEqual([result]);
  });

  it("carries the purpose and the signal into the tool body", async () => {
    const controller = new AbortController();
    harness.ctx.tools.register(
      defineTool({
        name: "peek",
        description: "d",
        parameters: {},
        execute: (_args, exec) =>
          Promise.resolve({ purpose: exec.purpose, aborted: exec.signal?.aborted ?? null }),
      }),
    );
    controller.abort();
    const result = await harness.ctx.tools.execute(call("peek", {}), {
      purpose: "dialogue",
      signal: controller.signal,
    });
    expect(result.value).toEqual({ purpose: "dialogue", aborted: true });
  });
});
