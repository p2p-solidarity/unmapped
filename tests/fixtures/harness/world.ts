// A loaded world, as the harness sees it. Test-only (Rule 2: no sample world reaches app code).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { WorldSnapshot } from "@harness";
import { makeScene } from "../../engine/fixtures";

export function makeWorld(overrides: Partial<WorldSnapshot> = {}): WorldSnapshot {
  return {
    genesis: {
      archetype: "quest",
      physics: "gentle",
      language: "ja-JP",
      seed: 7,
      intent: "find the one who put out the lanterns",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    meta: {
      id: "w1",
      name: "Lantern Vigil",
      archetype: "quest",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      floor: 3,
      mutation: null,
      flags: { gate_7_open: true, lanterns_lit: 2 },
      mods: [],
    },
    scene: makeScene({
      name: "The Drowned Archive",
      biome: "abyss",
      npcs: [
        {
          id: "mira",
          name: "Mira",
          x: 4,
          z: 6,
          role: "elder",
          mood: "mournful",
          color: "#8899aa",
          body: "elder",
          hat: "hood",
          held: "lantern",
          accent: "#d9b06a",
        },
      ],
      monsters: [
        {
          id: "shade_a",
          kind: "shade",
          x: 9,
          z: 2,
          level: 4,
          weakness: "lantern light",
          size: 1.5,
          color: null,
        },
      ],
      quests: [{ id: "lantern-vigil", text: "Relight the seven lanterns before dawn." }],
    }),
    karma: [
      {
        at: "2026-01-02T00:00:00.000Z",
        floor: 2,
        npcId: "mira",
        choice: "give the oil",
        action: "trade",
        effect: "the fog thinned",
      },
    ],
    inventory: {
      items: [
        {
          id: "lantern",
          name: "Tidewarden's Lantern",
          kind: "charm",
          power: 30,
          perk: "burns underwater",
          curse: null,
          meshDna: ["lamp_body"],
          archetype: ["water"],
          flavor: "warm in the hand",
        },
      ],
      materials: ["lantern oil", "river iron"],
    },
    floor: 3,
    ...overrides,
  };
}

/** Read one fixture file from `tests/fixtures/harness/`. */
export function harnessFixture(name: string): string {
  return readFileSync(join(import.meta.dirname, name), "utf8");
}
