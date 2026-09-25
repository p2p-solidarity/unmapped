// Test-only builders for the history DSL tests (rev 6 phase 3, WP2): witnessed chunks written
// from the DSL's own worked examples, and a pre-phase-3 save that holds one of everything D6
// migrates. Imported only by tests/dsl/history-*.test.ts (Rule 2: fixtures never reach app code).

import type { MigrationFiles } from "@dsl/history/migrateSource";
import {
  CHAPTER_EXAMPLE,
  CHUNK_EXAMPLE,
  PLACE_EXAMPLE,
  parseChunk,
  parsePlace,
  serializeDialogue,
  serializeErrands,
  serializeScene,
} from "@dsl/index";
import type { RuntimePin } from "@shared/cartridge";
import { sha256Bytes } from "@shared/history/ids";
import { authorKeyFor } from "@shared/history/sign";
import type { LandNote, LandProgress, WitnessedChunk } from "@shared/land";
import type { LoreNode } from "@shared/lore";
import type { StoryEpisode } from "@shared/story";
import type { KarmaEntry } from "@shared/world";

export const OWNER_SECRET = sha256Bytes("history-dsl:owner");
export const OWNER = authorKeyFor(OWNER_SECRET);
const hash = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}` as const;
export const CARTRIDGE_HASH = hash("c");
export const WORK_HASH = hash("a");
export const WORK_PACK = hash("b");

export interface Witnessed {
  chunk: WitnessedChunk;
  lore: LoreNode[];
}

/** The Chunk example witnessed at (cx, cz) against `graph`, stored as the legacy land stores it. */
export function witnessed(
  cx: number,
  cz: number,
  graph: readonly LoreNode[] = [],
  source = CHUNK_EXAMPLE,
): Witnessed {
  const draft = parseChunk(source, {
    coord: { cx, cz },
    biome: "countryside",
    ground: "grass",
    hole: null,
    lore: graph,
    language: "en",
  });
  if (!draft.ok) throw new Error(JSON.stringify(draft.error.errors));
  const { scene, dialogues, errands, keepsakes, lore } = draft.value;
  return {
    chunk: {
      cx,
      cz,
      scene: serializeScene(scene),
      dialogues: Object.fromEntries(dialogues.map((d) => [d.npcId, serializeDialogue(d)])),
      ...(errands.length === 0 ? {} : { errands: serializeErrands({ errands, keepsakes }) }),
    },
    lore,
  };
}

/**
 * The Chunk example renamed (the world already remembers its names), its custom a variation of
 * the one at `place`'s chunk, and its errand a Deliver to `place` (a place lore id there).
 */
export function delivering(cx: number, cz: number, place: string, graph: readonly LoreNode[]) {
  const source = CHUNK_EXAMPLE.replaceAll("Kasumi Crossing", "Heron Ford")
    .replaceAll("kasumi_crossing", "heron_ford")
    .replace(
      'Lore("coin_for_the_next", "custom", "A coin for the next one"',
      'Lore("pebble_for_the_next", "custom", "A pebble for the next one"',
    )
    .replace(
      '["heron_ford"], 0.5)',
      `["heron_ford", "${place.replace("kasumi_crossing", "coin_for_the_next")}"], 0.5)`,
    )
    .replace(", rin_node", "")
    .replace(/^rin_node = .*\n/m, "")
    .replace(
      /^lost_key = Find\(.*$/m,
      `lost_key = Deliver("lost_key", "tomo", "Take the bell to the crossing.", "${place}", "key_charm", "Thank you.")`,
    );
  return witnessed(cx, cz, graph, source);
}

/** A chunk whose first resident's words are longer than a history event may carry (8 KiB). */
export function oversized(cx: number, cz: number): Witnessed {
  const { chunk, lore } = witnessed(cx, cz);
  const [npc = "", words = ""] = Object.entries(chunk.dialogues)[0] ?? [];
  const long = words.replace(/^(root = Dialogue\("[a-z_]+", )"[^"]*"/, `$1"${"x".repeat(9000)}"`);
  return { chunk: { ...chunk, dialogues: { ...chunk.dialogues, [npc]: long } }, lore };
}

function placeProgram(): { source: string; dialogues: Record<string, string> } {
  const place = parsePlace(PLACE_EXAMPLE, { language: "en" });
  if (!place.ok) throw new Error(JSON.stringify(place.error.errors));
  return {
    source: serializeScene(place.value.graph),
    dialogues: Object.fromEntries(
      place.value.dialogues.map((d) => [d.npcId, serializeDialogue(d)]),
    ),
  };
}

const EPISODES: StoryEpisode[] = [
  { id: "e1", title: "Tidewater Steps", place: "Steps", kind: "meet", brief: "b", cx: 2, cz: 2 },
  { id: "e2", title: "The Salt Game", place: "Pier", kind: "game", brief: "b", cx: -2, cz: 3 },
  { id: "e3", title: "Unfinished", place: "Dune", kind: "search", brief: "b", cx: 0, cz: -3 },
];
const MORE: StoryEpisode = {
  id: "e4",
  title: "Lantern Cellar",
  place: "Cellar",
  kind: "maze",
  brief: "b",
  cx: 4,
  cz: 4,
};

const karma = (
  choice: string,
  action: KarmaEntry["action"],
  cx: number,
  cz: number,
  at: string,
): KarmaEntry => ({ at, floor: 1, npcId: null, choice, action, effect: "", cx, cz });

function note(id: string, author: string, cx: number, cz: number, extra: Partial<LandNote>) {
  return {
    id,
    author,
    at: `2026-09-26T0${id.slice(-1)}:30:00.000Z`,
    coord: { cx, cz, x: 4, z: 5 },
    anchors: [],
    text: `note ${id}`,
    contests: null,
    ...extra,
  } satisfies LandNote;
}

/**
 * A pre-phase-3 save with one of everything D6 migrates: chunks with lore and errands (one lore-
 * less, one oversized), own, visitor and dangling notes, a place on a gate and an otherworld,
 * a continued chapter, land / work / closed / place chapters, karma and legacy errands.
 */
export function legacySave(): MigrationFiles {
  const a = witnessed(3, -2);
  const b = delivering(4, -2, "kasumi_crossing@3,-2", a.lore);
  const c = witnessed(0, 5);
  const d = oversized(5, 5);
  const inside = placeProgram();
  const land: LandProgress = {
    errands: { "3,-2:lost_key": "done", "4,-2:lost_key": "accepted", "5,5:lost_key": "accepted" },
    home: { cx: 0, cz: 0, keepsakes: [] },
    door: [null, null, null, null],
    storyMore: [MORE],
    places: [
      {
        id: "p1",
        title: "Rope Course",
        cx: 2,
        cz: 2,
        cleared: true,
        kind: "side",
        seed: 9,
        ...inside,
      },
      {
        id: "p2",
        title: "Tide Game",
        cx: 5,
        cz: 1,
        cleared: false,
        kind: "otherworld",
        work: { workId: "tide-game", version: "1.0.0", contentHash: WORK_HASH },
        playId: "p-0123456789abcdef",
      },
    ],
    episodes: {
      e1: {
        draftId: null,
        work: null,
        playId: null,
        cleared: true,
        summary: "done",
        stage: {
          kind: "land",
          source: CHAPTER_EXAMPLE,
          seed: 3,
          found: [],
          felled: [],
          met: ["mako"],
        },
      },
      e2: {
        draftId: "d-0123456789abcdef",
        work: { workId: "tide-game", version: "1.0.0", contentHash: WORK_HASH },
        playId: "p-fedcba9876543210",
        cleared: false,
        summary: null,
      },
      e3: {
        draftId: "d-00000000000000aa",
        work: null,
        playId: null,
        cleared: false,
        summary: null,
      },
      e4: {
        draftId: null,
        work: null,
        playId: null,
        cleared: false,
        summary: null,
        stage: { kind: "dungeon", ...inside, seed: 4, found: [], felled: [], met: [] },
      },
    },
  };
  const notes = [
    note("n1", "Mira", 3, -2, { anchors: ["kasumi_crossing@3,-2"] }),
    note("n2", "Visitor", 3, -2, { contests: "n1" }),
    note("n3", "Mira", 5, 5, { anchors: ["kasumi_crossing@5,5"] }),
    note("n4", "Mira", 0, 5, { contests: "n0-gone" }),
  ];
  const chunks = [a, b, c, d];
  const pin = {
    cartridge: { cartridgeId: "glass-harbor", version: "1.2.0", contentHash: CARTRIDGE_HASH },
  } as RuntimePin;
  return {
    owner: OWNER,
    profileName: "Mira",
    meta: {
      instanceId: "glass-harbor-1",
      name: "Glass Harbor",
      createdAt: "2026-09-26T08:00:00.000Z",
      runtimePin: pin,
    },
    save: { seed: "K7QM-2PXD", language: "en", land },
    karma: [
      karma("Kasumi Crossing", "witness", 3, -2, "2026-09-26T10:02:00.000Z"),
      karma("Heron Ford", "witness", 4, -2, "2026-09-26T11:02:00.000Z"),
      karma("Mira", "note", 3, -2, "2026-09-26T12:02:00.000Z"),
      karma("Mira", "note", 5, 5, "2026-09-26T13:02:00.000Z"),
      karma("Mira", "note", 0, 5, "2026-09-26T14:02:00.000Z"),
      karma("finished lost_key", "request", 3, -2, "2026-09-26T10:03:00.000Z"),
      karma("cleared chapter Tidewater Steps", "witness", 2, 2, "2026-09-26T10:04:00.000Z"),
      karma("crossed Rope Course", "witness", 2, 2, "2026-09-26T10:05:00.000Z"),
      karma("crossed Rope Course", "witness", 2, 2, "2026-09-26T10:06:00.000Z"),
    ],
    cartridge: {
      bible: null,
      story: { episodes: EPISODES },
      pack: { pack: hash("d"), bytes: 4096 },
    },
    workPacks: { "tide-game@1.0.0": { contentHash: WORK_HASH, pack: WORK_PACK } },
    land: {
      chunks: chunks.map((one) => one.chunk),
      lore: chunks.flatMap((one) => (one === c ? [] : one.lore)),
      notes,
    },
    sources: {
      chunkFiles: chunks.flatMap(({ chunk }) => [
        { path: `${chunk.cx}_${chunk.cz}/scene.oui`, bytes: chunk.scene },
        ...Object.entries(chunk.dialogues).map(([id, words]) => ({
          path: `${chunk.cx}_${chunk.cz}/dialogue/${id}.oui`,
          bytes: words,
        })),
      ]),
      lore: "lore.jsonl",
      notes: "notes.jsonl",
    },
  };
}

/** Freezes a value and everything in it, so a write anywhere inside throws. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}
