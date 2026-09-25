import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { plateOf } from "@renderer/net/codes";
import {
  publishChunks,
  publishNotes,
  publishWorld,
  readContinent,
  removeWorld,
} from "@renderer/net/continentDoc";
import { buildContinentView } from "@renderer/net/continentView";
import { CHUNK_SIZE } from "@shared/chunks";
import { CONTINENT_PROTOCOL, type ContinentWorldEntry } from "@shared/continent";
import type { LandNote } from "@shared/land";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

const scene = readFileSync(resolve(__dirname, "../fixtures/dsl/valid-scene.oui"), "utf8");

function entry(worldId: string, joinedAt: number, owner: string): ContinentWorldEntry {
  return {
    protocol: CONTINENT_PROTOCOL,
    worldId,
    owner,
    title: `${owner}'s land`,
    anchor: { cx: 0, cz: 0 },
    joinedAt,
    seed: joinedAt,
    origin: scene,
    originDialogues: {},
    home: { cx: 0, cz: 0, keepsakes: [{ id: "bell", name: "Brass bell" }] },
    door: [null, null, null, null],
  };
}

/** Two documents that exchange every update, as the room would. */
function pair(): [Y.Doc, Y.Doc] {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "remote") Y.applyUpdate(b, update, "remote");
  });
  b.on("update", (update: Uint8Array, origin: unknown) => {
    if (origin !== "remote") Y.applyUpdate(a, update, "remote");
  });
  return [a, b];
}

const note: LandNote = {
  id: "n1",
  author: "Bo",
  at: "2026-09-26T00:00:00.000Z",
  coord: { cx: 0, cz: 0, x: 3, z: 4 },
  anchors: [],
  text: "The bell rang twice.",
  contests: null,
};

describe("continent document", () => {
  it("merges two worlds that both asked for the origin into one layout", () => {
    const [a, b] = pair();
    publishWorld(a, entry("world-a", 10, "Ai"));
    publishWorld(b, entry("world-b", 20, "Bo"));
    const viewA = buildContinentView(readContinent(a), "world-a", new Set(["world-b"]));
    const viewB = buildContinentView(readContinent(b), "world-b", new Set(["world-a"]));
    expect(viewA?.anchor).toEqual({ cx: 0, cz: 0 });
    expect(viewB?.anchor).not.toEqual({ cx: 0, cz: 0 });
    // Each sees the other's origin exactly where the other's anchor says, in its own coordinates.
    const other = viewA?.worlds[0];
    expect(other?.owner).toBe("Bo");
    expect(other?.online).toBe(true);
    expect(other?.shift).toEqual(viewB?.anchor);
    expect(viewB?.worlds[0]?.shift).toEqual({
      cx: 0 - (viewB?.anchor.cx ?? 0),
      cz: 0 - (viewB?.anchor.cz ?? 0),
    });
  });

  it("shows another world's witnessed chunks and notes shifted, without its errands or foes", () => {
    const [a, b] = pair();
    publishWorld(a, entry("world-a", 10, "Ai"));
    publishWorld(b, { ...entry("world-b", 20, "Bo"), anchor: { cx: 6, cz: 0 } });
    publishChunks(b, "world-b", [
      { cx: 1, cz: 0, scene, dialogues: { hana_inn: 'root = Dialogue("Hana", "Hi.", [])' } },
    ]);
    publishNotes(b, "world-b", [note]);
    const view = buildContinentView(readContinent(a), "world-a", new Set());
    const written = view?.chunks["7,0"];
    expect(written?.status).toBe("written");
    if (written?.status === "written") {
      expect(written.errands).toBeNull();
      expect(written.dialogues.hana_inn).toContain("Hana");
    }
    const home = view?.chunks["6,0"];
    expect(home?.status === "written" && home.scene.monsters.length).toBe(0);
    expect(view?.notes[0]?.coord).toMatchObject({ cx: 6, cz: 0, x: 3, z: 4 });
    expect(view?.worlds[0]?.originTile).toEqual({ x: 6 * CHUNK_SIZE, z: 0 });
    expect(view?.worlds[0]?.keepsakes).toEqual(["Brass bell"]);
  });

  it("writes a chunk once: the first witness is what the place is", () => {
    const doc = new Y.Doc();
    publishChunks(doc, "w", [{ cx: 2, cz: 2, scene, dialogues: {} }]);
    publishChunks(doc, "w", [{ cx: 2, cz: 2, scene: "root = nonsense", dialogues: {} }]);
    expect(readContinent(doc).chunks.get("w")?.[0]?.scene).toBe(scene);
  });

  it("drops what does not validate and forgets a world that left", () => {
    const [a, b] = pair();
    publishWorld(a, entry("world-a", 10, "Ai"));
    b.getMap("worlds").set("world-x", { protocol: 999, worldId: "world-x" });
    b.getMap("worlds").set("world-y", { ...entry("world-y", 30, "Cy"), worldId: "spoofed" });
    expect(readContinent(a).worlds.map((w) => w.worldId)).toEqual(["world-a"]);
    publishWorld(b, entry("world-b", 20, "Bo"));
    removeWorld(b, "world-b");
    expect(readContinent(a).worlds.map((w) => w.worldId)).toEqual(["world-a"]);
  });

  it("gives every world a door number that stays the same", () => {
    expect(plateOf("instance-123")).toBe(plateOf("instance-123"));
    expect(plateOf("instance-123")).not.toBe(plateOf("instance-124"));
    expect(plateOf("instance-123")).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
