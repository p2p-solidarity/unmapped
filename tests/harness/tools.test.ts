import {
  createHarness,
  defineTool,
  type Harness,
  type JsonValue,
  type ToolExecInput,
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
});
