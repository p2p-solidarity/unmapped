// Exercises the generate → parse → repair loop with a fake chat and a fake parser, so it depends
// on nothing from src/dsl beyond the shape of its contract (Result + an AppError with errors).

import type { AppError, Result } from "@shared/result";
import { fail, ok } from "@shared/result";
import { describe, expect, it } from "vitest";
import { MAX_REPAIRS, type ProgramChat, type ProgramSpec, runProgram } from "./program";

interface FakeError extends AppError {
  errors: { message: string }[];
  unresolved: string[];
  orphaned: string[];
}

const VALID = "Scene(ok)";

function fakeParse(source: string): Result<{ name: string }, FakeError> {
  if (source === VALID) return ok({ name: "ok" });
  const error: FakeError = {
    code: "dsl-parse",
    message: `unknown statement in ${source}`,
    hint: "use only the documented components",
    errors: [{ message: "unknown statement" }],
    unresolved: [],
    orphaned: [],
  };
  return { ok: false, error };
}

function scriptedChat(replies: string[]): { chat: ProgramChat; seen: { messages: number }[] } {
  const seen: { messages: number }[] = [];
  let call = 0;
  const chat: ProgramChat = async (request) => {
    seen.push({ messages: request.messages.length });
    const text = replies[Math.min(call, replies.length - 1)] ?? "";
    call += 1;
    return ok({ text, usage: null });
  };
  return { chat, seen };
}

function spec(over: Partial<ProgramSpec<{ name: string }, FakeError>> = {}) {
  const base: ProgramSpec<{ name: string }, FakeError> = {
    system: "SYSTEM",
    user: "USER",
    parse: fakeParse,
    normalize: (raw) => raw.trim(),
    repair: (source, error) => `fix ${source}: ${error.errors[0]?.message ?? error.message}`,
    ...over,
  };
  return base;
}

describe("runProgram", () => {
  it("returns the parsed program on the first try", async () => {
    const { chat, seen } = scriptedChat([VALID]);
    const result = await runProgram(chat, spec());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ source: VALID, graph: { name: "ok" } });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.messages).toBe(2);
  });

  it("repairs an invalid program and succeeds on the second call", async () => {
    const { chat, seen } = scriptedChat(["Scene(broken)", VALID]);
    const result = await runProgram(chat, spec());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.source).toBe(VALID);
    expect(seen).toHaveLength(2);
    // The repair turn carries the original pair plus the assistant program and the repair prompt.
    expect(seen[1]?.messages).toBe(4);
  });

  it("gives up after two repair rounds and never invents a fallback", async () => {
    const { chat, seen } = scriptedChat(["Scene(broken)"]);
    const result = await runProgram(chat, spec());
    expect(result.ok).toBe(false);
    expect(seen).toHaveLength(MAX_REPAIRS + 1);
    if (!result.ok) {
      expect(result.error.code).toBe("dsl-parse");
      expect(result.error.message).toContain("2 repair rounds");
      expect(result.error.hint).toBe("use only the documented components");
    }
  });

  it("stops immediately on a transport failure — a repair prompt cannot fix a dead server", async () => {
    let calls = 0;
    const chat: ProgramChat = async () => {
      calls += 1;
      return fail({ code: "connection-refused", message: "no model", hint: "start llama-server" });
    };
    const result = await runProgram(chat, spec());
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("connection-refused");
  });

  it("normalises the model output before parsing", async () => {
    const { chat } = scriptedChat([`\n\`\`\`\n${VALID}\n\`\`\`\n`]);
    const result = await runProgram(
      chat,
      spec({ normalize: (raw) => raw.replace(/```/g, "").trim() }),
    );
    expect(result.ok).toBe(true);
  });

  it("passes grammar, budget and temperature through to the chat bridge", async () => {
    let captured: { grammar: string | null; maxTokens: number; temperature: number } | null = null;
    const chat: ProgramChat = async (request) => {
      captured = {
        grammar: request.grammar,
        maxTokens: request.maxTokens,
        temperature: request.temperature,
      };
      return ok({ text: VALID, usage: null });
    };
    await runProgram(chat, spec({ grammar: "root ::= x", maxTokens: 321, temperature: 0.1 }));
    expect(captured).toEqual({ grammar: "root ::= x", maxTokens: 321, temperature: 0.1 });
  });

  it("honours a custom repair budget", async () => {
    const { chat, seen } = scriptedChat(["Scene(broken)"]);
    await runProgram(chat, spec({ maxRepairs: 0 }));
    expect(seen).toHaveLength(1);
  });
});
