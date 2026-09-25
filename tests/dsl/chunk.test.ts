import type { ChunkContext } from "@dsl/index";
import {
  CHUNK_EXAMPLE,
  chunkSpec,
  parseChunk,
  parseDialogue,
  parseErrands,
  parseScene,
  serializeDialogue,
  serializeErrands,
  serializeScene,
} from "@dsl/index";
import { loreId } from "@shared/lore";
import { describe, expect, it } from "vitest";

const ctx = (extra: Partial<ChunkContext> = {}): ChunkContext => ({
  coord: { cx: 2, cz: -1 },
  biome: "countryside",
  ground: "grass",
  hole: null,
  lore: [],
  language: "en",
  ...extra,
});

function codes(result: ReturnType<typeof parseChunk>): string[] {
  return result.ok
    ? []
    : result.error.errors.map((error) => `${error.message} ${error.hint ?? ""}`);
}

describe("chunk dialect", () => {
  it("turns the worked example into a scene, dialogues and linked lore", () => {
    const result = parseChunk(CHUNK_EXAMPLE, ctx());
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const { scene, dialogues, lore } = result.value;
    expect(scene.name).toBe("Kasumi Crossing");
    expect(scene.floor).toEqual({ width: 32, depth: 32, tile: "grass" });
    expect(scene.npcs.map((npc) => npc.id)).toEqual(["rin", "tomo"]);
    expect(dialogues.map((d) => d.npcId)).toEqual(["rin", "tomo"]);
    const custom = lore.find((node) => node.kind === "custom");
    expect(custom?.id).toBe(loreId("coin_for_the_next", { cx: 2, cz: -1 }));
    expect(custom?.links).toEqual([loreId("kasumi_crossing", { cx: 2, cz: -1 })]);

    // Stored as ordinary programs that read back identically.
    expect(parseScene(serializeScene(scene))).toEqual({ ok: true, value: scene });
    for (const dialogue of dialogues) {
      expect(parseDialogue(serializeDialogue(dialogue))).toEqual({ ok: true, value: dialogue });
    }
    expect(
      chunkSpec({ language: "en", coord: { cx: 2, cz: -1 }, hole: null, props: [], look: null }),
    ).toContain("Lore(");
  });

  it("sends back residents placed in the authored village and links to unknown lore", () => {
    const hole = parseChunk(
      CHUNK_EXAMPLE,
      ctx({ coord: { cx: 0, cz: 0 }, hole: { width: 20, depth: 20 } }),
    );
    expect(hole.ok).toBe(false);
    expect(codes(hole).join(" ")).toContain("authored village");

    const dangling = CHUNK_EXAMPLE.replace('["kasumi_crossing"], 0.5)', '["nowhere_at_all"], 0.5)');
    expect(codes(parseChunk(dangling, ctx())).join(" ")).toContain("nowhere_at_all");
  });

  it("refuses assistant voice, vague mystery and names the world already has", () => {
    const assistant = CHUNK_EXAMPLE.replace(
      "The bus only stops if somebody waves.",
      "How can I help you today?",
    );
    expect(codes(parseChunk(assistant, ctx())).join(" ")).toContain("assistant");

    const vague = CHUNK_EXAMPLE.replace(
      "where two farm roads meet",
      "humming with ancient secrets",
    );
    expect(codes(parseChunk(vague, ctx())).join(" ")).toContain("vague");

    const known = parseChunk(
      CHUNK_EXAMPLE,
      ctx({
        lore: [
          {
            id: loreId("crossing", { cx: 9, cz: 9 }),
            kind: "place",
            label: "Kasumi Crossing",
            text: "",
            coord: { cx: 9, cz: 9 },
            links: [],
            tone: 0,
          },
        ],
      }),
    );
    expect(codes(known).join(" ")).toContain("already the name");

    // Re-declaring a known custom is not a failure: it is folded into the node the world has.
    const custom = {
      id: loreId("coin_rule", { cx: 9, cz: 9 }),
      kind: "custom" as const,
      label: "A coin for the next one",
      text: "",
      coord: { cx: 9, cz: 9 },
      links: [],
      tone: 0,
    };
    const folded = parseChunk(CHUNK_EXAMPLE, ctx({ lore: [custom] }));
    if (!folded.ok) throw new Error(JSON.stringify(folded.error));
    expect(folded.value.lore.some((node) => node.kind === "custom")).toBe(false);
    const place = folded.value.lore.find((node) => node.kind === "place");
    expect(place?.links).toContain(custom.id);

    expect(codes(parseChunk(CHUNK_EXAMPLE, ctx({ language: "ja-JP" }))).join(" ")).toContain(
      "player's language",
    );
  });
});

describe("customs across the map", () => {
  it("asks a custom next to a known custom to link to it", () => {
    const neighbour = {
      id: loreId("tea_at_dusk", { cx: 1, cz: -1 }),
      kind: "custom" as const,
      label: "Tea at dusk",
      text: "Everyone stops for tea when the pole lights come on.",
      coord: { cx: 1, cz: -1 },
      links: [],
      tone: 0.4,
    };
    const unrooted = parseChunk(CHUNK_EXAMPLE, ctx({ lore: [neighbour] }));
    expect(codes(unrooted).join(" ")).toContain(neighbour.id);

    const rooted = CHUNK_EXAMPLE.replace(
      '["kasumi_crossing"], 0.5)',
      `["kasumi_crossing", "${neighbour.id}"], 0.5)`,
    );
    expect(parseChunk(rooted, ctx({ lore: [neighbour] })).ok).toBe(true);

    // A bare slug means the known node of that name.
    const bare = CHUNK_EXAMPLE.replace(
      '["kasumi_crossing"], 0.5)',
      '["kasumi_crossing", "tea_at_dusk"], 0.5)',
    );
    const resolved = parseChunk(bare, ctx({ lore: [neighbour] }));
    expect(resolved.ok && resolved.value.lore.find((n) => n.kind === "custom")?.links).toContain(
      neighbour.id,
    );
  });
});

describe("errands", () => {
  it("reads the example's errand and keepsake and stores them as a program", () => {
    const result = parseChunk(CHUNK_EXAMPLE, ctx());
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const { errands, keepsakes } = result.value;
    expect(errands).toHaveLength(1);
    expect(errands[0]).toMatchObject({ kind: "find", giver: "tomo", tile: { x: 22, z: 6 } });
    expect(keepsakes.map((item) => item.id)).toEqual(["key_charm"]);
    expect(parseErrands(serializeErrands({ errands, keepsakes }))).toEqual({
      ok: true,
      value: { errands, keepsakes },
    });
  });

  it("sends a delivery to nowhere back as a Find, and resolves a known place", () => {
    const deliver = CHUNK_EXAMPLE.replace(
      'Find("lost_key", "tomo", "I dropped the shed key somewhere by the old tree.", 22, 6,',
      'Deliver("lost_key", "tomo", "Take this letter to the shrine.", "old_shrine",',
    );
    expect(codes(parseChunk(deliver, ctx())).join(" ")).toContain("write a Find");

    const shrine = {
      id: loreId("old_shrine", { cx: 3, cz: -1 }),
      kind: "place" as const,
      label: "Old shrine",
      text: "",
      coord: { cx: 3, cz: -1 },
      links: [],
      tone: 0,
    };
    const known = parseChunk(deliver, ctx({ lore: [shrine] }));
    expect(known.ok && known.value.errands[0]).toMatchObject({ kind: "deliver", place: shrine.id });
  });
});
