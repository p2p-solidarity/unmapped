// `land.places` once otherworlds (異界) exist. Only failures an E2E run cannot reach are here:
//
// 1. Silent data loss: a save written before otherworlds (a course or a dungeon, with or without
//    its residents' words) no longer parses, so every checkpoint and restore of it fails.
// 2. Silent data loss: an otherworld place loses its `playId` on the way through the schema, so the
//    pinned progress in work-plays/ is orphaned and the player starts over.
// 3. Untrusted input: an otherworld without an exact work ref, or with a path-like work id or
//    version, a malformed content hash or a malformed play id, is accepted (those ids become paths
//    in main).
// 4. Untrusted input: an otherworld carrying a Scene program (`source`/`seed`) is accepted, so
//    something could try to build or parse a Scene for it.
// 5. Untrusted input: a place of a kind the engine does not have is accepted.

import { landProgressSchema } from "@main/instances/schemas";
import { describe, expect, it } from "vitest";

const LAND = {
  errands: {},
  home: { cx: 0, cz: 0, keepsakes: [] },
  door: [null, null, null, null],
};

const OLD_COURSE = {
  id: "p1",
  kind: "side",
  title: "Lantern Cellar",
  cx: 2,
  cz: -1,
  seed: 7,
  source: 'root = Scene("Lantern Cellar", "abyss", [])\n',
  cleared: true,
};

const OLD_DUNGEON_WITH_WORDS = {
  id: "p2",
  kind: "dungeon",
  title: "Salt Mine",
  cx: -3,
  cz: 1,
  seed: 4294967295,
  source: 'root = Scene("Salt Mine", "abyss", [])\n',
  dialogues: { nell: 'root = Dialogue("nell", "Mind the rats.", [])\n' },
  cleared: false,
};

const OTHERWORLD = {
  id: "p3",
  kind: "otherworld",
  title: "Key Maze",
  cx: 1,
  cz: 1,
  work: {
    workId: "key-maze",
    version: "1.0.0",
    contentHash: `sha256:${"a".repeat(64)}`,
  },
  playId: `p-${"0123456789abcdef"}`,
  cleared: false,
};

function parses(places: unknown[]): boolean {
  return landProgressSchema.safeParse({ ...LAND, places }).success;
}

describe("land.places with otherworlds", () => {
  it("still reads places saved before otherworlds existed, unchanged (1)", () => {
    const parsed = landProgressSchema.parse({
      ...LAND,
      places: [OLD_COURSE, OLD_DUNGEON_WITH_WORDS],
    });
    expect(parsed.places).toEqual([OLD_COURSE, OLD_DUNGEON_WITH_WORDS]);
  });

  it("round-trips an otherworld with and without its pinned play (2)", () => {
    const { playId: _unplayed, ...fresh } = OTHERWORLD;
    const parsed = landProgressSchema.parse({
      ...LAND,
      places: [OTHERWORLD, { ...fresh, id: "p4" }],
    });
    expect(parsed.places).toEqual([OTHERWORLD, { ...fresh, id: "p4" }]);
    expect(JSON.parse(JSON.stringify(parsed)).places[0].playId).toBe(OTHERWORLD.playId);
  });

  it("refuses an otherworld without an exact, well-formed work ref or play id (3)", () => {
    const { work: _work, ...noWork } = OTHERWORLD;
    expect(parses([noWork])).toBe(false);
    for (const work of [
      { ...OTHERWORLD.work, workId: "../works" },
      { ...OTHERWORLD.work, version: "../1.0.0" },
      { ...OTHERWORLD.work, version: "latest" },
      { ...OTHERWORLD.work, contentHash: "sha256:xyz" },
      { workId: "key-maze", version: "1.0.0" },
      { ...OTHERWORLD.work, path: "/etc" },
    ]) {
      expect(parses([{ ...OTHERWORLD, work }])).toBe(false);
    }
    expect(parses([{ ...OTHERWORLD, playId: "../p-0123456789abcdef" }])).toBe(false);
    expect(parses([{ ...OTHERWORLD, playId: null }])).toBe(false);
  });

  it("refuses an otherworld that carries a Scene program (4)", () => {
    expect(parses([{ ...OTHERWORLD, source: OLD_COURSE.source }])).toBe(false);
    expect(parses([{ ...OTHERWORLD, seed: 3 }])).toBe(false);
    expect(parses([{ ...OLD_COURSE, work: OTHERWORLD.work }])).toBe(false);
  });

  it("refuses a kind the engine does not have (5)", () => {
    expect(parses([{ ...OTHERWORLD, kind: "portal" }])).toBe(false);
    expect(parses([{ ...OLD_COURSE, kind: "otherworld" }])).toBe(false);
  });
});
