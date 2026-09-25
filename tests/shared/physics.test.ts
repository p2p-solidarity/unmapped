// Physics is versioned (@shared/physics): a world pins the version it was made on, and a continent
// refuses to merge worlds on different versions. That promise breaks silently when someone changes
// terrain, fight or lore code without bumping the version. What this guards, over many seeds:
//   1. The ground, fords, props and wildlife of the land change (a world's land moves under it).
//   2. A fight formula changes (the same save hits and gets hit differently).
//   3. Lore heat or dungeon generation changes (the same world prompts or plays differently).
//   4. The version is bumped without recording what the new physics produces.
// When this fails on purpose: bump PHYSICS_VERSION, keep the old generators reachable for worlds
// pinned to the old one (PHYSICS_SUPPORTED), and record the new fingerprint below.

import { createHash } from "node:crypto";
import { chunkTerrain, groundAt, isFord, wildMonsters } from "@shared/chunks";
import { applyDamage, monsterHp } from "@shared/combat";
import { seedFromText } from "@shared/endless";
import { foeDamage, foeSpeed } from "@shared/foes";
import { activate, type LoreNode, regionalTone } from "@shared/lore";
import { generateMaze } from "@shared/maze";
import { checkPhysics, PHYSICS_SUPPORTED, PHYSICS_VERSION } from "@shared/physics";
import { awardKill, damageAtLevel, levelFor, NEW_RUN } from "@shared/progression";
import type { Tile } from "@shared/world";
import { describe, expect, it } from "vitest";

/** What each physics version produces. Never edit an entry; add one for a new version. */
const RECORDED: Record<number, string> = {
  1: "sha256:3f8a852e7e03aac940620b07964a4e908353b66be0f71af69348ca359d1730f6",
};

const SEEDS = [0, 1, 12_345, seedFromText("aether-land"), seedFromText("K7QM-2PXD")];
const COORDS = [
  { cx: 0, cz: 0 },
  { cx: 1, cz: 0 },
  { cx: -1, cz: 2 },
  { cx: 3, cz: -4 },
  { cx: 10, cz: 10 },
];
const BASES: readonly Tile[] = ["grass", "sand", "snow"];

function land(): unknown[] {
  const out: unknown[] = [];
  for (const seed of SEEDS) {
    for (const base of BASES) {
      const origin = { floor: { width: 16, depth: 16, tile: base } };
      for (const coord of COORDS) {
        out.push(chunkTerrain({ seed, coord, origin }), wildMonsters(seed, coord, origin));
      }
      for (let wx = -40; wx <= 40; wx += 7) {
        for (let wz = -40; wz <= 40; wz += 9) out.push(groundAt(seed, wx, wz, base));
      }
    }
  }
  for (let wx = -48; wx <= 48; wx += 3) out.push(isFord(wx, 16), isFord(16, wx), isFord(wx, wx));
  return out;
}

function fights(): unknown[] {
  const out: unknown[] = [];
  const combat = { playerHp: 120, monsterHpBase: 30, monsterHpPerLevel: 6 };
  for (const level of [1, 2, 5, 12, 30]) {
    out.push(monsterHp(combat.monsterHpBase, combat.monsterHpPerLevel, level));
    out.push(foeDamage(combat, level), foeSpeed(level), damageAtLevel(12, level));
    out.push(levelFor(level * 37, 10));
    out.push(
      awardKill(
        NEW_RUN,
        [
          { kind: "score_run", value: 10 },
          { kind: "stat_growth", value: 5 },
        ],
        level,
      ),
    );
  }
  const foe = { id: "a", hp: 40, maxHp: 40, x: 0, z: 0, radius: 0.4, height: 1 };
  out.push(applyDamage(foe, 17.6), applyDamage(foe, 99));
  return out;
}

function loreAndPlaces(): unknown[] {
  const node = (id: string, cx: number, cz: number, links: string[] = []): LoreNode => ({
    id: `${id}@${cx},${cz}`,
    kind: "place",
    label: id,
    text: "",
    coord: { cx, cz },
    links,
    tone: (cx - cz) / 10,
  });
  const graph = [
    node("a", 0, 0),
    node("b", 1, 0, ["a@0,0"]),
    node("c", 3, 3, ["b@1,0"]),
    node("d", -2, 5),
  ];
  const hot = activate(graph, { coord: { cx: 1, cz: 1 }, karma: [] });
  const mazes = SEEDS.map((seed) =>
    generateMaze({
      width: 21,
      depth: 15,
      seed,
      entrance: { x: 1, z: 1 },
      exit: { x: 19, z: 13 },
      braid: 30,
    }),
  );
  return [hot, regionalTone(hot), mazes];
}

function fingerprint(): string {
  const text = JSON.stringify({ land: land(), fights: fights(), more: loreAndPlaces() });
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

describe("physics version", () => {
  it("has recorded what the current physics produces (4)", () => {
    expect(
      RECORDED[PHYSICS_VERSION],
      `record the fingerprint of physics ${PHYSICS_VERSION}`,
    ).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(PHYSICS_SUPPORTED).toContain(PHYSICS_VERSION);
  });

  it("produces exactly the recorded land, fights, lore and dungeons (1–3)", () => {
    expect(
      fingerprint(),
      "terrain, combat, lore or maze output changed: bump PHYSICS_VERSION and record it",
    ).toBe(RECORDED[PHYSICS_VERSION]);
  });

  it("refuses to open a world made on physics this build does not have", () => {
    expect(checkPhysics(PHYSICS_VERSION).ok).toBe(true);
    const newer = checkPhysics(PHYSICS_VERSION + 1);
    expect(newer.ok ? null : newer.error.code).toBe("physics-newer");
    const gone = checkPhysics(0);
    expect(gone.ok ? null : gone.error.code).toBe("physics-unsupported");
  });
});
