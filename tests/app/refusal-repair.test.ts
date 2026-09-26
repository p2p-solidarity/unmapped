// Refusals feed repairs (rev 6 phase 3, D5, Rule 7): a witness, chapter or place that main refuses
// on append goes back to the model only when the refusal is about the program, and from the same
// two repairs as a parse error. Isolated because E2E cannot make a model alternate between a
// program that does not parse and one main refuses, nor make main refuse on cue.
//
// Failure modes guarded here (each test names one):
// 1. Parse errors and content refusals alternating spend more than two repairs (a fourth call).
// 2. A refusal that is not the model's to fix (the door, a quota, physics, a spot the host picks
//    again itself, an unknown code) is sent to the model as a repair turn.
// 3. A content refusal is repaired without telling the model why: its code, message and hint are
//    missing from the repair turn.
// 4. A stop that came while the model wrote still appends the program it sent.
// 5. After the append succeeded the loop asks again (a second call, a second append).

import {
  acceptedOf,
  type ProgramChat,
  type ProgramSpec,
  runProgram,
} from "@renderer/narrative/program";
import { isContentRefusal } from "@shared/history/repairable";
import type { ChatMessage } from "@shared/llm";
import { type AppError, err, ok, type Result } from "@shared/result";
import { describe, expect, it } from "vitest";

interface FakeError extends AppError {
  errors: { message: string }[];
}

const VALID = "Scene(ok)";

function parse(source: string): Result<string, FakeError> {
  if (source === VALID) return ok(source);
  return {
    ok: false,
    error: { code: "dsl-parse", message: "unknown statement", errors: [{ message: "unknown" }] },
  };
}

const asFake = (error: AppError): FakeError => ({ ...error, errors: [] });

function scripted(replies: string[]): { chat: ProgramChat; turns: ChatMessage[][] } {
  const turns: ChatMessage[][] = [];
  const chat: ProgramChat = async (request) => {
    turns.push(request.messages);
    return ok({ text: replies[Math.min(turns.length - 1, replies.length - 1)] ?? "", usage: null });
  };
  return { chat, turns };
}

function spec(accept: ProgramSpec<string, FakeError>["accept"], signal?: AbortSignal) {
  return {
    system: "SYSTEM",
    user: "USER",
    parse,
    normalize: (raw: string) => raw.trim(),
    repair: (source: string, error: FakeError) =>
      `fix ${source}: ${error.code}: ${error.message} ${error.hint ?? ""}`,
    accept,
    ...(signal === undefined ? {} : { signal }),
  } satisfies ProgramSpec<string, FakeError>;
}

const LINK = err(
  "lore-link-unknown",
  "Lore a@1,0 links to b@9,9, which is not live.",
  "Link less.",
);

describe("refusals in the repair loop", () => {
  it("never spends more than two repairs when parse errors and refusals alternate (1)", async () => {
    const { chat, turns } = scripted(["Scene(broken)", VALID, "Scene(broken)", VALID]);
    let appends = 0;
    const result = await runProgram(
      chat,
      spec(async () => {
        appends += 1;
        return acceptedOf(LINK, asFake);
      }),
    );
    expect(turns).toHaveLength(3);
    expect(appends).toBe(1);
    expect(result).toMatchObject({ ok: false, error: { code: "dsl-parse" } });
    if (!result.ok) expect(result.error.message).toContain("2 repair rounds");

    // Refused, refused, refused: still three calls, and the refusal is what the player sees.
    const again = scripted([VALID]);
    const refused = await runProgram(
      again.chat,
      spec(async () => acceptedOf(LINK, asFake)),
    );
    expect(again.turns).toHaveLength(3);
    expect(refused).toMatchObject({ ok: false, error: { code: "lore-link-unknown" } });
  });

  it("shows a refusal the model cannot fix at once, without a repair turn (2)", async () => {
    const codes = [
      "access-members-only",
      "access-private",
      "access-removed",
      "quota-events",
      "places-full",
      "signpost-quota",
      "physics-newer",
      "place-spot-taken",
      "place-no-room",
      "chunk-already-witnessed",
      "witness-index-mismatch",
      "history-diverged",
      "world-read-only",
      "identity-locked",
      "something-new-from-a-later-build",
    ];
    for (const code of codes) {
      expect(isContentRefusal({ code }), code).toBe(false);
      const { chat, turns } = scripted([VALID]);
      const result = await runProgram(
        chat,
        spec(async () => acceptedOf(err(code, "no"), asFake)),
      );
      expect(turns, code).toHaveLength(1);
      expect(result, code).toMatchObject({ ok: false, error: { code } });
    }
  });

  it("tells the model the refusal's code, message and hint (3)", async () => {
    const { chat, turns } = scripted([VALID]);
    let first = true;
    const result = await runProgram(
      chat,
      spec(async () => {
        if (!first) return { ok: true };
        first = false;
        return acceptedOf(LINK, asFake);
      }),
    );
    expect(result.ok).toBe(true);
    expect(turns).toHaveLength(2);
    const repair = turns[1]?.at(-1)?.content ?? "";
    expect(repair).toContain("lore-link-unknown");
    expect(repair).toContain("b@9,9, which is not live");
    expect(repair).toContain("Link less.");
  });

  it("appends nothing once a stop came while the model wrote (4)", async () => {
    const controller = new AbortController();
    const chat: ProgramChat = async () => {
      controller.abort();
      return ok({ text: VALID, usage: null });
    };
    let appends = 0;
    const result = await runProgram(
      chat,
      spec(async () => {
        appends += 1;
        return { ok: true };
      }, controller.signal),
    );
    expect(appends).toBe(0);
    expect(result).toMatchObject({ ok: false, error: { code: "request-aborted" } });
  });

  it("stops at the first accepted program (5)", async () => {
    const { chat, turns } = scripted([VALID]);
    let appends = 0;
    const result = await runProgram(
      chat,
      spec(async () => {
        appends += 1;
        return acceptedOf(ok({ id: "h1" }), asFake);
      }),
    );
    expect(result).toMatchObject({ ok: true, value: { source: VALID } });
    expect(turns).toHaveLength(1);
    expect(appends).toBe(1);
  });
});
