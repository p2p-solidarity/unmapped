// Home is safe (@shared/safeGround): in a world with combat no foe stands in the home chunk, none
// follows the player into it, and no blow lands there. The real-time hostiles are pure code
// (engine/combat/hostiles.ts) the land drives every frame; an E2E cannot reliably catch a pack at
// the border at the wrong frame, so this drives the same code over many seeds and random walks.
// What it guards:
//   1. A hostile chasing the player follows them over the border into the home chunk.
//   2. A blow wound up outside lands after the player has stepped home (the wind-up outlives it).
//   3. A hostile notices or keeps chasing a player standing at home (a pack pacing the border).
//   4. The rule is vacuous: nobody is ever hit, so 1–3 would pass without anything being tested.

import {
  type HostileGround,
  type HostileState,
  stepHostiles,
} from "@renderer/engine/combat/hostiles";
import { CHUNK_SIZE } from "@shared/chunks";
import { isSafeGround } from "@shared/safeGround";
import { describe, expect, it } from "vitest";

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ground: HostileGround = { stand: () => true, safe: isSafeGround };
const FRAME = 1 / 30;

describe("home is safe from hostiles", () => {
  it("lands no blow wound up at a player who steps home mid-swing, over many seeds (2)", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const next = random(seed);
      const z = 4 + next() * 24;
      const roster = [
        { id: "wild_0", x: CHUNK_SIZE + 4 + next() * 2, z, radius: 0.4, level: 1 + (seed % 12) },
      ];
      const states = new Map<string, HostileState>();
      // The player waits just outside home until the swing starts, then takes one step home.
      const player = { x: CHUNK_SIZE + 0.3, z };
      let swung = false;
      let blows = 0;
      for (let frame = 0; frame < 30 * 6; frame += 1) {
        stepHostiles(states, roster, { player, delta: FRAME, ground }, () => {
          blows += 1;
          return false;
        });
        if (!swung && states.get("wild_0")?.mode === "windup") {
          swung = true;
          player.x = CHUNK_SIZE - 0.1;
        }
      }
      expect(swung, `seed ${seed}: the hostile never swung`).toBe(true);
      expect(isSafeGround(player.x, player.z)).toBe(true);
      expect(blows, `seed ${seed}: a blow landed at home`).toBe(0);
    }
  });

  it("keeps every hostile out of home and lands no blow there, over many seeds (1–4)", () => {
    let blowsOutside = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = random(seed);
      // A pack just outside the east or south border of home, where the player keeps crossing.
      const roster = Array.from({ length: 4 }, (_, index) => ({
        id: `wild_${index}`,
        x: CHUNK_SIZE + 0.5 + next() * 6,
        z: 4 + next() * 24,
        radius: 0.4,
        level: 1 + Math.floor(next() * 12),
      })).map((one, index) => (index % 2 === 0 ? one : { ...one, x: one.z, z: one.x }));
      const states = new Map<string, HostileState>();
      const player = { x: CHUNK_SIZE - 3, z: CHUNK_SIZE - 3 };
      let heading = next() * Math.PI * 2;
      for (let frame = 0; frame < 30 * 40; frame += 1) {
        if (next() < 0.03) heading = next() * Math.PI * 2;
        // Walks and stands in turns, so packs catch up and swing as the player crosses the border.
        const step = Math.floor(frame / 45) % 3 === 2 ? 0 : 3.5 * FRAME;
        player.x = Math.min(CHUNK_SIZE + 10, Math.max(20, player.x + Math.cos(heading) * step));
        player.z = Math.min(CHUNK_SIZE + 10, Math.max(20, player.z + Math.sin(heading) * step));
        const home = isSafeGround(player.x, player.z);
        const before = new Map(
          [...states].map(([id, self]) => [id, { mode: self.mode, x: self.x, z: self.z }]),
        );
        stepHostiles(states, roster, { player, delta: FRAME, ground }, () => {
          expect(home, `seed ${seed} frame ${frame}: a blow landed at home`).toBe(false);
          blowsOutside += 1;
          return false;
        });
        for (const [id, self] of states) {
          const was = before.get(id);
          const at = `seed ${seed} frame ${frame}: ${id}`;
          expect(isSafeGround(self.x, self.z), `${at} stands at home`).toBe(false);
          if (!home || was === undefined) continue;
          if (was.mode === "idle") expect(self.mode, `${at} noticed a player at home`).toBe("idle");
          if (was.mode === "chase") expect(self.mode, `${at} kept chasing`).toBe("return");
          const moved = Math.hypot(self.x - was.x, self.z - was.z) > 1e-9;
          if (moved) expect(["return", "idle"], `${at} walked on the player`).toContain(self.mode);
        }
      }
    }
    expect(blowsOutside).toBeGreaterThan(0);
    // 60 seeds of stepping hostiles take ~3 s alone; under a full parallel run that can pass the
    // default 5 s, so the invariant gets room instead of fewer seeds.
  }, 20_000);
});
