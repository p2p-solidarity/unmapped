// The attempt loop with a scripted model: a repair that rewrites a whole file is refused, counts
// as a repair, is not echoed back, and the loop stops at WORK_REPAIR_LIMIT.

import type { ChatMessage } from "@shared/llm";
import { WORK_REPAIR_LIMIT } from "@shared/workPrompt";
import type { WorkDraft } from "@shared/works";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chat = vi.fn();
vi.mock("@renderer/llm", () => ({ chat: (...args: unknown[]) => chat(...args) }));

const { runAttempt } = await import("../../src/renderer/works/author");

const DRAFT: WorkDraft = {
  formatVersion: 1,
  draftId: `d-${"0".repeat(16)}`,
  workId: "test",
  title: "Test",
  head: null,
  candidates: [],
  published: [],
  createdAt: "",
  updatedAt: "",
};

const WORLD = `@@summary\nA world.\n@@file main.js\nconst SPEED = 2;\n${"// padding\n".repeat(700)}host.root.textContent = "go";\n@@file assets.json\n{}\n@@end`;
const REWRITE = WORLD.replace("SPEED = 2", "SPEED = 3");
const PATCH =
  "@@summary\nSlower.\n@@edit main.js\n<<<<<<< SEARCH\nconst SPEED = 2;\n=======\nconst SPEED = 1;\n>>>>>>> REPLACE\n@@end";

const reply = (text: string) => ({ ok: true, value: { text, usage: null } });
const written: { kind: string; parent: string | null; main: string }[] = [];

beforeEach(() => {
  chat.mockReset();
  written.length = 0;
  vi.stubGlobal("window", {
    seed: {
      works: {
        writeCandidate: async (input: {
          kind: string;
          parent: string | null;
          text: { main: string };
        }) => {
          written.push({ kind: input.kind, parent: input.parent, main: input.text.main });
          return { ok: true, value: { candidate: { id: `c00${written.length}` } } };
        },
        settleCandidate: async () => ({ ok: true, value: DRAFT }),
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function deps(passes: boolean[]) {
  return {
    check: async () => {
      const passed = passes.shift() ?? false;
      return {
        passed,
        rendered: true,
        savedState: null,
        problems: passed ? [] : [{ file: "main.js" as const, line: 1, column: 1, message: "boom" }],
      };
    },
    signal: new AbortController().signal,
    onStage: () => undefined,
    model: null,
  };
}

describe("runAttempt repairs", () => {
  it("refuses a whole-file repair, then applies an @@edit repair", async () => {
    chat
      .mockResolvedValueOnce(reply(WORLD))
      .mockResolvedValueOnce(reply(REWRITE))
      .mockResolvedValueOnce(reply(PATCH));
    const result = await runAttempt(DRAFT, "generate", "a world", deps([false, true]));
    expect(result.ok && result.value.outcome).toBe("playable");
    expect(result.ok && result.value.repairs).toBe(2);
    expect(written.map((entry) => entry.kind)).toEqual(["generate", "repair"]);
    expect(written[1]?.parent).toBe("c001");
    expect(written[1]?.main).toContain("const SPEED = 1;");

    const retry = chat.mock.calls[2]?.[0] as { messages: ChatMessage[] };
    expect(retry.messages.at(-1)?.content).toContain("A repair must not resend main.js");
    // The rejected whole file is not sent back to the model.
    expect(retry.messages.some((message) => message.content.includes("SPEED = 3"))).toBe(false);
  });

  it("stops after WORK_REPAIR_LIMIT when every repair rewrites the file", async () => {
    chat.mockResolvedValueOnce(reply(WORLD)).mockResolvedValue(reply(REWRITE));
    const result = await runAttempt(DRAFT, "generate", "a world", deps([false]));
    expect(result.ok && result.value.outcome).toBe("failed");
    expect(chat).toHaveBeenCalledTimes(1 + WORK_REPAIR_LIMIT);
    expect(written).toHaveLength(1);
  });
});
