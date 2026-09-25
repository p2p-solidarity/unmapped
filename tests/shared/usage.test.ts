// The usage ledger is read back into a world's total on every HUD refresh. What could go wrong,
// each guarded below (none of it is reachable from E2E without corrupting a real ledger):
//   1. One torn or foreign line (a crash mid-append, a newer build) makes the whole total unreadable.
//   2. A call the provider did not report is silently counted as zero tokens.
//   3. Another world's calls leak into this world's total.
//   4. The Create draft a world was built from is not counted toward it — or a link cycle
//      (draft → world → draft) never terminates.
//   5. Repair rounds of one program lose their tokens (the old `usage: null`).

import { runProgram } from "@renderer/narrative/program";
import { ok } from "@shared/result";
import {
  parseUsageLines,
  summarizeUsage,
  type UsageLine,
  type UsageRecord,
  type UsageScope,
} from "@shared/usage";
import { describe, expect, it } from "vitest";

const world: UsageScope = { kind: "instance", id: "w-1" };
const other: UsageScope = { kind: "instance", id: "w-2" };
const draft: UsageScope = { kind: "create", id: "d-0123456789abcdef" };

function call(scope: UsageScope | null, over: Partial<UsageRecord> = {}): UsageRecord {
  return {
    v: 1,
    at: "2026-09-25T00:00:00.000Z",
    purpose: "witness",
    scope,
    provider: "openai",
    model: "gpt-5-mini",
    input: 100,
    output: 40,
    cached: 20,
    ms: 1500,
    outcome: "done",
    ...over,
  };
}

const text = (lines: readonly unknown[]): string =>
  `${lines.map((line) => (typeof line === "string" ? line : JSON.stringify(line))).join("\n")}\n`;

describe("usage ledger", () => {
  it("skips a torn or foreign line instead of losing the whole total (1)", () => {
    const parsed = parseUsageLines(
      text([call(world), '{"v":1,"at":"2026', { v: 2, anything: true }, call(world)]),
    );
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.skipped).toBe(2);
    const summary = summarizeUsage(parsed.lines, world, parsed.skipped);
    expect(summary.calls).toBe(2);
    expect(summary.skipped).toBe(2);
  });

  it("counts unreported tokens as unknown, not zero (2)", () => {
    const summary = summarizeUsage(
      [call(world), call(world, { input: null, output: null, cached: null })],
      world,
    );
    expect(summary.calls).toBe(2);
    expect(summary.input).toBe(100);
    expect(summary.unreported).toBe(1);
  });

  it("keeps other worlds and untagged calls out of a world's total (3)", () => {
    const summary = summarizeUsage([call(world), call(other), call(null)], world);
    expect(summary.calls).toBe(1);
    expect(summary.byPurpose.witness?.calls).toBe(1);
  });

  it("folds the draft a world was built from into it, and survives a link cycle (4)", () => {
    const lines: UsageLine[] = [
      call(draft, { purpose: "bible", input: 500, output: 300 }),
      call(world),
      { v: 1, at: "2026-09-25T00:01:00.000Z", link: { from: draft, to: world } },
      { v: 1, at: "2026-09-25T00:02:00.000Z", link: { from: world, to: draft } },
    ];
    const summary = summarizeUsage(lines, world);
    expect(summary.calls).toBe(2);
    expect(summary.input).toBe(600);
    expect(summary.byPurpose.bible?.output).toBe(300);
    // The cycle folds both ways and still terminates.
    expect(summarizeUsage(lines, draft).calls).toBe(2);
  });

  it("sums every repair round of one program (5)", async () => {
    let round = 0;
    const program = await runProgram(
      async () => {
        round += 1;
        return ok({
          text: round < 3 ? "bad" : "good",
          usage: { prompt: 10 * round, completion: 5, cached: round === 2 ? 4 : null },
        });
      },
      {
        system: "s",
        user: "u",
        parse: (source) =>
          source === "good"
            ? ok(source)
            : { ok: false, error: { code: "dsl", message: "bad", errors: [] } },
        normalize: (raw) => raw,
        repair: () => "fix it",
      },
    );
    expect(program.ok).toBe(true);
    if (!program.ok) return;
    expect(program.value.usage).toEqual({ prompt: 60, completion: 15, cached: 4 });
  });
});
