// `ctx.tools` — the registry and the execution pipeline.
//
//   parse arguments → validate → tools/pre-execute → tools/execute (body) → tools/post-execute
//                                                                         → emit tools/result
//
// Nothing in here ever throws at the caller: every failure becomes a result with `isError: true`
// whose `content` is the sentence the model reads next, because a tool error is a turn the model
// can still recover from.

import { type Context, Service } from "@deepseek-ai/cordis";
import type { ToolCall, ToolSchema } from "@shared/llm";
import type { ZodError } from "zod";
import "./events";
import type {
  JsonValue,
  PreToolDecision,
  ToolDefinition,
  ToolExec,
  ToolExecInput,
  ToolExecutionResult,
} from "./types";

/** Flatten zod issues into one sentence the model can act on. */
function describeIssues(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

export class ToolsService extends Service {
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(ctx: Context) {
    super(ctx, "tools");
  }

  /** Register a tool. A duplicate name throws; disposal unregisters it. */
  register(definition: ToolDefinition): () => void {
    return this.ctx.effect(() => {
      if (this.tools.has(definition.name)) {
        throw new Error(`tool "${definition.name}" is already registered`);
      }
      this.tools.set(definition.name, definition);
      return () => {
        this.tools.delete(definition.name);
      };
    }, "tools.register()");
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * The model-facing projection, name-ordered. Deliberately a whitelist: only name, description
   * and the JSON Schema cross this line — never the body, never the zod validator.
   */
  schemas(): ToolSchema[] {
    return [...this.tools.values()]
      .map(
        (tool): ToolSchema => ({
          name: tool.name,
          description: tool.description,
          parameters: structuredClone(tool.parameters),
        }),
      )
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /** Run one call end to end. Never rejects. */
  async execute(call: ToolCall, input: ToolExecInput): Promise<ToolExecutionResult> {
    const started = Date.now();
    const fail = (content: string, args: JsonValue = {}): ToolExecutionResult => ({
      callId: call.id,
      name: call.name,
      args,
      value: null,
      content,
      isError: true,
      durationMs: Date.now() - started,
    });

    const definition = this.tools.get(call.name);
    if (definition === undefined) {
      const known = [...this.tools.keys()].sort().join(", ");
      return this.finish(
        fail(
          `no tool named "${call.name}"; available tools: ${known.length > 0 ? known : "(none)"}`,
        ),
      );
    }

    let raw: unknown;
    try {
      raw = call.arguments.trim().length === 0 ? {} : JSON.parse(call.arguments);
    } catch (thrown) {
      return this.finish(
        fail(
          `arguments for "${call.name}" are not valid JSON (${messageOf(thrown)}); expected schema: ${JSON.stringify(definition.parameters)}`,
        ),
      );
    }

    const parsed = definition.schema.safeParse(raw);
    if (!parsed.success) {
      return this.finish(
        fail(
          `invalid arguments for "${call.name}": ${describeIssues(parsed.error)}; expected schema: ${JSON.stringify(definition.parameters)}`,
        ),
      );
    }

    const args = parsed.data as JsonValue;
    const exec: ToolExec = {
      callId: call.id,
      name: call.name,
      args,
      purpose: input.purpose,
      signal: input.signal,
    };

    let result: ToolExecutionResult;
    try {
      result = await this.dispatch(definition, exec, started);
    } catch (thrown) {
      // A throwing pipeline listener must not take the turn down with it.
      result = fail(`tool "${call.name}" failed: ${messageOf(thrown)}`, args);
    }
    return this.finish(result);
  }

  /** pre-execute → body (wrapped by `tools/execute`) → post-execute. */
  private async dispatch(
    definition: ToolDefinition,
    exec: ToolExec,
    started: number,
  ): Promise<ToolExecutionResult> {
    const gate = await this.ctx.waterfall("tools/pre-execute", exec, () =>
      Promise.resolve<PreToolDecision>({ kind: "allow" }),
    );
    if (gate.kind === "deny") {
      return this.postExecute(exec, {
        callId: exec.callId,
        name: exec.name,
        args: exec.args,
        value: null,
        content: `tool "${exec.name}" was denied: ${gate.reason}`,
        isError: true,
        durationMs: Date.now() - started,
      });
    }

    let outcome: ToolExecutionResult;
    try {
      const value = await this.ctx.waterfall("tools/execute", exec, () =>
        definition.execute(exec.args, exec),
      );
      outcome = {
        callId: exec.callId,
        name: exec.name,
        args: exec.args,
        value,
        content: definition.render(exec.args, value),
        isError: false,
        durationMs: Date.now() - started,
      };
    } catch (thrown) {
      outcome = {
        callId: exec.callId,
        name: exec.name,
        args: exec.args,
        value: null,
        content: `tool "${exec.name}" failed: ${messageOf(thrown)}`,
        isError: true,
        durationMs: Date.now() - started,
      };
    }
    return this.postExecute(exec, outcome);
  }

  private postExecute(exec: ToolExec, result: ToolExecutionResult): Promise<ToolExecutionResult> {
    return this.ctx.waterfall("tools/post-execute", exec, result, () => Promise.resolve(result));
  }

  /** Publish the final outcome; observers must never change it. */
  private finish(result: ToolExecutionResult): ToolExecutionResult {
    this.ctx.emit("tools/result", result);
    return result;
  }
}
