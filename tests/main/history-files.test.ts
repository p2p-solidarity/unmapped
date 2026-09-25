// A world's history files (rev 6 phase 3, D1) — isolated because the failures are crashes and
// damaged disks, which E2E cannot produce on cue.
//
// Failure modes guarded here (each test names one):
// 1. A crash while rewriting outbox.jsonl leaves it half-written or empty, silently dropping own
//    events that were never sequenced.
// 2. A leftover temp file from a crashed write is read as (part of) the outbox.
// 3. A torn last line of log.jsonl (crash mid-append) makes the whole world unreadable, or is kept
//    and the next append glues onto it, corrupting entry n + 1.
// 4. A complete last entry that only lost its newline is thrown away (a sequenced event lost).
// 5. A damaged line in the middle of the log is "repaired" (dropped or rewritten) instead of
//    stopping the world with `history-log-invalid`.
// 6. Dismissing a refused event deletes it from refused.jsonl.

import { chmod, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendDismissed,
  appendLog,
  appendRefused,
  readLog,
  readOutbox,
  readRefused,
  writeOutbox,
} from "@main/histories/logStore";
import { sha256Bytes } from "@shared/history/ids";
import { logStart, sequenceEvent } from "@shared/history/log";
import { authorKeyFor, signEvent } from "@shared/history/sign";
import type { GenesisEvent, HistoryEvent, LogEntry } from "@shared/history/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SECRET = sha256Bytes("history-files:owner");
const AUTHOR = authorKeyFor(SECRET);
const AT = "2026-09-27T08:00:00.000Z";

let root = "";

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "unmapped-history-files-"));
});

afterEach(async () => {
  await chmod(root, 0o700).catch(() => undefined);
  await rm(root, { recursive: true, force: true });
});

function genesis(): GenesisEvent {
  return signEvent(
    {
      v: 1,
      world: "",
      kind: "genesis",
      author: AUTHOR,
      at: AT,
      seen: 0,
      body: {
        name: "Files",
        cartridge: {
          cartridgeId: "v2-world",
          version: "2.0.0",
          contentHash: `sha256:${"c".repeat(64)}`,
        },
        seed: "v2-world",
        language: "en",
        physicsVersion: 1,
        createdAt: AT,
        access: "friends",
        gates: [],
        from: { instanceId: "files-1" },
      },
    },
    SECRET,
  );
}

function note(world: string, text: string): HistoryEvent {
  return signEvent(
    {
      v: 1,
      world,
      kind: "note",
      author: AUTHOR,
      at: AT,
      seen: 1,
      body: { coord: { cx: 1, cz: 1, x: 2, z: 3 }, anchors: [], text, contests: null, name: "Ann" },
    },
    SECRET,
  );
}

function logOf(count: number): { world: string; entries: LogEntry[] } {
  const first = genesis();
  let cursor = logStart(first.id);
  const entries: LogEntry[] = [];
  const events: HistoryEvent[] = [first];
  for (let index = 1; index < count; index += 1) events.push(note(first.id, `note ${index}`));
  for (const event of events) {
    const entry = sequenceEvent(cursor, event, AT, null);
    entries.push(entry);
    cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
  }
  return { world: first.id, entries };
}

function code(result: { ok: boolean; error?: { code: string } }): string {
  return result.ok ? "ok" : (result.error?.code ?? "?");
}

describe("outbox.jsonl", () => {
  it("keeps the whole previous queue when a rewrite fails (1)", async () => {
    const { world } = logOf(1);
    const queued = [note(world, "first"), note(world, "second")];
    await writeOutbox(root, queued);
    await chmod(root, 0o500);
    await expect(writeOutbox(root, [...queued, note(world, "third")])).rejects.toThrow();
    await chmod(root, 0o700);
    const read = await readOutbox(root);
    expect(read.ok && read.value.map((event) => event.id)).toEqual(queued.map((event) => event.id));
  });

  it("ignores a temp file a crashed write left behind (2)", async () => {
    const { world } = logOf(1);
    const queued = [note(world, "kept")];
    await writeOutbox(root, queued);
    await writeFile(join(root, "outbox.jsonl.abc123.tmp"), '{"id":"h');
    const read = await readOutbox(root);
    expect(read.ok && read.value.map((event) => event.id)).toEqual([queued[0]?.id]);
    await writeOutbox(root, []);
    const empty = await readOutbox(root);
    expect(empty.ok && empty.value).toEqual([]);
  });
});

describe("log.jsonl", () => {
  it("cuts a torn last line and appends cleanly after it (3)", async () => {
    const { entries } = logOf(4);
    await appendLog(root, entries.slice(0, 3));
    const whole = await readFile(join(root, "log.jsonl"), "utf8");
    const torn = JSON.stringify(entries[3]).slice(0, 40);
    await writeFile(join(root, "log.jsonl"), `${whole}${torn}`);
    const read = await readLog(root);
    expect(read.ok && read.value.map((entry) => entry.n)).toEqual([1, 2, 3]);
    await appendLog(root, entries.slice(3));
    const again = await readLog(root);
    expect(again.ok && again.value.map((entry) => entry.n)).toEqual([1, 2, 3, 4]);
  });

  it("keeps a complete last entry that lost only its newline (4)", async () => {
    const { entries } = logOf(3);
    const text = entries.map((entry) => JSON.stringify(entry)).join("\n");
    await writeFile(join(root, "log.jsonl"), text);
    const read = await readLog(root);
    expect(read.ok && read.value.map((entry) => entry.n)).toEqual([1, 2, 3]);
    expect((await readFile(join(root, "log.jsonl"), "utf8")).endsWith("\n")).toBe(true);
  });

  it("stops on a damaged middle line and leaves the file as it is (5)", async () => {
    const { entries } = logOf(3);
    const lines = entries.map((entry) => JSON.stringify(entry));
    const damaged = `${lines[0]}\n${lines[1]?.replace('"n":2', '"n":"two"')}\n${lines[2]}\n`;
    await writeFile(join(root, "log.jsonl"), damaged);
    expect(code(await readLog(root))).toBe("history-log-invalid");
    expect(await readFile(join(root, "log.jsonl"), "utf8")).toBe(damaged);
  });
});

describe("refused.jsonl", () => {
  it("only grows: a dismissal hides a refusal and deletes nothing (6)", async () => {
    const { world } = logOf(1);
    const [first, second] = [note(world, "one"), note(world, "two")];
    const error = { code: "quota-events", message: "Too many events today." };
    await appendRefused(root, [
      { event: first, error, at: AT },
      { event: second, error, at: AT },
    ]);
    const before = (await readFile(join(root, "refused.jsonl"), "utf8")).split("\n").length;
    await appendDismissed(root, first.id, AT);
    const listed = await readRefused(root);
    expect(listed.ok && listed.value.active.map((one) => one.event.id)).toEqual([second.id]);
    expect(listed.ok && listed.value.total).toBe(2);
    const after = await readFile(join(root, "refused.jsonl"), "utf8");
    expect(after.split("\n").length).toBe(before + 1);
    expect(after).toContain(first.id);
    expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
