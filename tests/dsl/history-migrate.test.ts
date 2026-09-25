// Migration from a pre-phase-3 save (rev 6 phase 3, WP2: D6). Silent data loss and invariants
// E2E cannot reach (Rule 0). What this file guards, written before the code:
//   1. A migration that is not byte-identical: the same files planned twice (or signed twice) give
//      other events, so a rerun or a catch-up duplicates the world instead of finding it.
//   2. A migration that touches its source: planning writes into the save it reads.
//   3. A chunk lost on the way: every chunk is either a live witness of the migrated world or
//      listed as legacyOnly, one by one — never neither. Same for notes, places and chapters.
//   4. A legacy chunk the history cannot hold (an 8 KiB+ dialogue a legacy save allowed) breaks
//      the migration or enters the log to be skipped by every fold, instead of staying legacyOnly.
//   5. A plan that main signs and sequences, yet the real verdicts and the fold refuse part of it
//      (a lore link, an errand place, a note parent or a deed that does not resolve, a place on a
//      gate): everything planned must fold live, and what could not is reported, not written.
//   6. Links rewritten wrongly: a note's contests or anchors, a chapter's story.more, a deed's ref
//      or an errand progress key pointing at the wrong event, or at nothing without a report.
//   7. A catch-up re-plan after an older build added a chunk changes the ids of what was already
//      migrated (so it would append duplicates) instead of adding only the new event.

import { planMigration } from "@dsl/history/migrate";
import { sourceDigest } from "@dsl/history/migrateSource";
import { verdictEntries } from "@dsl/history/verdict";
import { canonicalJson } from "@shared/canonical";
import { emptyNow, foldEntries } from "@shared/history/fold";
import { type LogCursor, logStart, sequenceEvent } from "@shared/history/log";
import { signEvent } from "@shared/history/sign";
import type { GenesisEvent, HistoryEvent, LogEntry, UnsignedEvent } from "@shared/history/types";
import { describe, expect, it } from "vitest";
import { deepFreeze, legacySave, OWNER_SECRET, WORK_PACK, witnessed } from "./historyLand";

function plan(files = legacySave()) {
  const planned = planMigration(files);
  if (!planned.ok) throw new Error(`${planned.error.code}: ${planned.error.message}`);
  return planned.value;
}

/** Signs and sequences a plan the way main does, then folds it with the real verdicts. */
function fold(events: readonly UnsignedEvent[]) {
  const signed = events.map((event) => signEvent(event, OWNER_SECRET) as HistoryEvent);
  let cursor: LogCursor = logStart(signed[0]?.id ?? "");
  const entries: LogEntry[] = signed.map((event, index) => {
    const entry = sequenceEvent(
      cursor,
      event,
      `2026-09-26T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
      null,
    );
    cursor = { n: entry.n, chain: entry.chain, rt: entry.rt };
    return entry;
  });
  const now = foldEntries(emptyNow(signed[0] as GenesisEvent), verdictEntries(entries));
  return { signed, now };
}

const count = (events: readonly UnsignedEvent[], kind: string) =>
  events.filter((event) => event.kind === kind).length;

describe("planMigration", () => {
  it("is byte-identical on a rerun and never writes into the save it reads (1, 2)", () => {
    const files = deepFreeze(legacySave());
    const before = JSON.stringify(files);
    const first = plan(files);
    const second = plan(files);
    expect(JSON.stringify(files)).toBe(before);
    expect(canonicalJson(second)).toBe(canonicalJson(first));
    const ids = fold(first.events).signed.map((event) => event.id);
    expect(fold(second.events).signed.map((event) => event.id)).toEqual(ids);
    expect(first.worldId).toBe(ids[0]);
    expect(first.source).toEqual(sourceDigest(files));
  });

  it("folds live under the real verdicts, with every chunk live or legacyOnly (3, 4, 5)", () => {
    const files = legacySave();
    const planned = plan(files);
    const { now, signed } = fold(planned.events);
    expect(now.ignored).toEqual([]);
    expect(Object.keys(now.events)).toHaveLength(signed.length);

    const legacyOnly = planned.legacyOnly.map(({ cx, cz }) => `${cx},${cz}`);
    expect(legacyOnly).toEqual(["5,5"]);
    expect(planned.skipped.find((one) => one.key === "5,5")).toMatchObject({
      what: "chunk",
      code: "event-invalid",
    });
    for (const chunk of files.land.chunks) {
      const key = `${chunk.cx},${chunk.cz}`;
      expect(now.chunks[key] !== undefined).toBe(!legacyOnly.includes(key));
    }
    expect(Object.keys(now.chunks).sort()).toEqual(["0,5", "3,-2", "4,-2"]);
    expect(now.chunks["4,-2"]?.index.errands[0]?.place).toBe("kasumi_crossing@3,-2");

    expect(count(planned.events, "genesis")).toBe(1);
    expect(count(planned.events, "pack")).toBe(1);
    expect(count(planned.events, "profile")).toBe(1);
    expect(count(planned.events, "note")).toBe(files.land.notes.length);
    expect(count(planned.events, "place")).toBe(2);
    expect(count(planned.events, "story.more")).toBe(1);
    expect(count(planned.events, "chapter")).toBe(4);
    expect(planned.events.every((event) => event.seen === 0)).toBe(true);
    // Only the oversized chunk and the errand on it stayed out.
    expect(planned.skipped.map((one) => `${one.what}:${one.key}`)).toEqual([
      "chunk:5,5",
      "errand:5,5:lost_key",
    ]);
  });

  it("rewrites every link to the event it names, and reports the ones that stayed out (6)", () => {
    const files = legacySave();
    const planned = plan(files);
    const { now, signed } = fold(planned.events);
    const witnessAt = (key: string) => now.chunks[key]?.live.id ?? "";
    const [n1, n2, n3, n4] = now.notes;
    expect(n1?.body.anchors).toEqual([witnessAt("3,-2")]);
    expect(n1?.body.via).toBeUndefined();
    expect(n2?.body).toMatchObject({ contests: n1?.id, name: "Visitor", via: "continent" });
    expect(n3?.body.anchors).toEqual([]);
    expect(n4?.body.contests).toBeNull();
    expect(planned.adjusted).toContainEqual({
      what: "note",
      key: "n3",
      code: "note-anchor-missing",
      detail: "kasumi_crossing@5,5",
    });
    expect(planned.adjusted).toContainEqual({
      what: "note",
      key: "n4",
      code: "note-contests-missing",
      detail: "n0-gone",
    });

    // The course stood on e1's gate: it moves, keeps its id, and the move is reported.
    const course = now.places.find((one) => one.place === "p1");
    expect(course?.body.at).not.toEqual({ cx: 2, cz: 2 });
    expect(planned.adjusted.find((one) => one.code === "place-moved")?.key).toBe("p1");
    expect(now.places.find((one) => one.place === "p2")?.body.work?.pack).toBe(WORK_PACK);

    const more = now.more.e4?.live?.id;
    expect(now.chapters.e4?.live?.body.more).toBe(more);
    expect(now.chapters.e1?.live?.body).toMatchObject({ kind: "land", more: null });
    expect(now.chapters.e2?.live?.body).toMatchObject({ kind: "work" });
    expect(now.chapters.e3?.live?.body.kind).toBe("closed");

    const deeds = signed.filter((event) => event.kind === "deed").map((event) => event.body);
    expect(deeds).toEqual([
      { what: "errand.done", ref: `${witnessAt("3,-2")}:lost_key` },
      { what: "chapter.cleared", ref: now.chapters.e1?.live?.id },
      { what: "place.crossed", ref: course?.id },
    ]);

    expect(planned.progress.worldId).toBe(planned.worldId);
    expect(planned.progress.errands).toEqual({
      [`${witnessAt("3,-2")}:lost_key`]: "done",
      [`${witnessAt("4,-2")}:lost_key`]: "accepted",
    });
    expect(planned.progress.places).toEqual({
      p1: { cleared: true },
      p2: { cleared: false, playId: "p-0123456789abcdef" },
    });
    expect(planned.progress.episodes.e1).toMatchObject({ cleared: true, met: ["mako"] });
    expect(planned.progress.episodes.e2?.playId).toBe("p-fedcba9876543210");
  });

  it("reports a legacy place whose words the history cannot hold instead of dropping it (3)", () => {
    const files = legacySave();
    const [course] = files.save.land?.places ?? [];
    if (course === undefined || course.kind === "otherworld") throw new Error("fixture changed");
    const words = Object.values(course.dialogues ?? {});
    const odd = { ...course, id: "p3", cx: -5, cz: -5, dialogues: { "Nell Two": words[0] ?? "" } };
    const land = { ...files.save.land, places: [odd] } as typeof files.save.land;
    const planned = plan({ ...files, save: { ...files.save, land } });
    expect(planned.skipped.find((one) => one.key === "p3")?.what).toBe("place");
    expect(planned.progress.places.p3).toEqual({ cleared: true });
    expect(fold(planned.events).now.ignored).toEqual([]);
  });

  it("re-plans a save an older build added to with only the new event (7)", () => {
    const files = legacySave();
    const first = plan(files);
    const added = witnessed(7, 7);
    const later = plan({
      ...files,
      land: {
        ...files.land,
        chunks: [...files.land.chunks, added.chunk],
        lore: [...files.land.lore, ...added.lore],
      },
    });
    const known = new Set(first.events.map((event) => canonicalJson(event)));
    const fresh = later.events.filter((event) => !known.has(canonicalJson(event)));
    expect(fresh.map((event) => event.kind)).toEqual(["witness"]);
    expect(later.worldId).toBe(first.worldId);
  });
});
