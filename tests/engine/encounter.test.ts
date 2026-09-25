import { spawnPoint, TILE_TOP, tileToWorld } from "@renderer/engine/colliders";
import {
  aimDirection,
  buildEncounter,
  chooseVictim,
  FPS_EYE_HEIGHT,
  PLAYER_ID,
  shotBlockers,
  shotDirection,
  shotOrigin,
} from "@renderer/engine/combat/encounter";
import { hitscan } from "@shared/combat";
import type { GameplayRules } from "@shared/gameplay";
import { describe, expect, it } from "vitest";
import { makeScene, wall } from "./fixtures";

const KIT = {
  id: "fps_puzzle@1",
  moveSpeed: 4,
  sprintSpeed: 6,
  jumpSpeed: 0,
  gravity: 15,
  interactDistance: 3,
  cameraFov: 75,
  lookSensitivity: 0.0022,
  cameraDistance: 0,
} as const;

function rules(overrides: Partial<GameplayRules> = {}): GameplayRules {
  return {
    defaultKit: "fps_puzzle@1",
    physics: "grounded",
    kits: [{ ...KIT }],
    bindings: {},
    timing: { system: "turn_based", resolution: "per_player", turnSeconds: 0 },
    combat: { playerHp: 100, monsterHpBase: 30, monsterHpPerLevel: 10 },
    party: null,
    generation: null,
    progression: [],
    weapons: [
      {
        id: "rifle",
        name: "Rifle",
        kind: "gun",
        damage: 22,
        range: 24,
        cooldownMs: 300,
        magazine: 12,
      },
    ],
    ...overrides,
  };
}

const monsters = [
  { id: "drone_a", kind: "drone", x: 4, z: 6, level: 1, weakness: "cold", size: 1, color: null },
  { id: "golem_a", kind: "golem", x: 8, z: 9, level: 3, weakness: "salt", size: 1.4, color: null },
] as const;

const scene = makeScene({ monsters: [...monsters] });

describe("buildEncounter", () => {
  it("gives the player and every monster hit points taken from the rules", () => {
    const built = buildEncounter(scene, rules());
    expect(built).not.toBeNull();
    if (built === null) return;

    const you = built.combatants.find((one) => one.id === PLAYER_ID);
    expect(you).toMatchObject({ side: "party", hp: 100, maxHp: 100 });
    // 30 base, +10 per level above 1.
    expect(built.combatants.find((one) => one.id === "drone_a")?.hp).toBe(30);
    expect(built.combatants.find((one) => one.id === "golem_a")?.hp).toBe(50);
  });

  it("scales the hit box with the monster's silhouette so a big target is easier to hit", () => {
    const built = buildEncounter(scene, rules());
    const small = built?.combatants.find((one) => one.id === "drone_a");
    const large = built?.combatants.find((one) => one.id === "golem_a");
    expect(large?.radius ?? 0).toBeGreaterThan(small?.radius ?? 0);
  });

  it("adds the squad the rules declared and nobody else", () => {
    const solo = buildEncounter(scene, rules());
    expect(solo?.combatants.filter((one) => one.side === "party")).toHaveLength(1);

    const squad = buildEncounter(
      scene,
      rules({ party: { size: 2, memberHp: 60, memberSpeed: 8 } }),
    );
    const allies = squad?.combatants.filter((one) => one.side === "party" && one.id !== PLAYER_ID);
    expect(allies).toHaveLength(2);
    expect(allies?.every((one) => one.hp === 60)).toBe(true);
    // They stand apart, not stacked on one tile.
    expect(new Set(allies?.map((one) => one.x)).size).toBe(2);
  });

  it("arms the player with the first declared weapon", () => {
    expect(buildEncounter(scene, rules())?.weapon?.id).toBe("rifle");
    expect(buildEncounter(scene, rules({ weapons: [] }))?.weapon).toBeNull();
  });

  it("starts the turn order the rules asked for", () => {
    expect(buildEncounter(scene, rules())?.turn.system).toBe("turn_based");
    expect(buildEncounter(scene, rules({ timing: null }))?.turn.system).toBe("realtime");
  });

  it("builds no encounter at all when there is nothing to fight or no combat declared", () => {
    expect(buildEncounter(makeScene({ monsters: [] }), rules())).toBeNull();
    expect(buildEncounter(scene, rules({ combat: null }))).toBeNull();
    expect(buildEncounter(scene, null)).toBeNull();
  });

  it("puts every combatant in world units, where the renderer draws it", () => {
    const built = buildEncounter(
      scene,
      rules({ party: { size: 2, memberHp: 60, memberSpeed: 8 } }),
    );
    const drone = built?.combatants.find((one) => one.id === "drone_a");
    expect([drone?.x, drone?.z]).toEqual(tileToWorld(4, 6));
    const [spawnX, , spawnZ] = spawnPoint(scene);
    const allies = built?.combatants.filter((one) => one.id.startsWith("ally_")) ?? [];
    for (const ally of allies) {
      expect(ally.z).toBe(spawnZ);
      expect(Math.abs(ally.x - spawnX)).toBeCloseTo(1.2);
    }
  });

  it("is deterministic, which the turn order depends on", () => {
    const a = buildEncounter(scene, rules({ party: { size: 3, memberHp: 60, memberSpeed: 8 } }));
    const b = buildEncounter(scene, rules({ party: { size: 3, memberHp: 60, memberSpeed: 8 } }));
    expect(a?.combatants.map((one) => one.id)).toEqual(b?.combatants.map((one) => one.id));
  });
});

describe("aimDirection", () => {
  it("looks down -Z when the rig is centred", () => {
    const aim = aimDirection(0, 0);
    expect(aim.dx).toBeCloseTo(0);
    expect(aim.dy).toBeCloseTo(0);
    expect(aim.dz).toBeCloseTo(-1);
  });

  it("turns left for a positive yaw and down for a positive pitch", () => {
    expect(aimDirection(Math.PI / 2, 0).dx).toBeCloseTo(-1);
    expect(aimDirection(0, Math.PI / 4).dy).toBeCloseTo(-Math.SQRT1_2);
  });

  it("always returns a unit vector, so hitscan distances are real tiles", () => {
    for (const [yaw, pitch] of [
      [0.3, 0.2],
      [-1.2, -0.6],
      [2.7, 1.1],
    ]) {
      const aim = aimDirection(yaw ?? 0, pitch ?? 0);
      expect(Math.hypot(aim.dx, aim.dy, aim.dz)).toBeCloseTo(1);
    }
  });
});

describe("shotDirection", () => {
  it("shoots down the camera in first and third person", () => {
    // Looking left (yaw = +90°) sends the shot left, not along the body.
    const aim = shotDirection("camera", Math.PI / 2, 0, 0);
    expect(aim.dx).toBeCloseTo(-1);
    expect(aim.dz).toBeCloseTo(0);
  });

  it("shoots where the body faces in a side-on game, not where the camera looks", () => {
    // The side camera sits at a fixed angle; aiming down it would fire into the background.
    const facingRight = shotDirection("side", 0, 0, Math.PI / 2);
    expect(facingRight.dx).toBeCloseTo(-1);
    expect(facingRight.dy).toBeCloseTo(0);
  });

  it("keeps a flat shot in top-down and grid games", () => {
    for (const movement of ["topdown", "grid"] as const) {
      expect(shotDirection(movement, 0.7, 1.2, 0).dy).toBeCloseTo(0);
    }
  });
});

describe("aiming against the drawn scene", () => {
  const drone = {
    id: "drone_a",
    kind: "drone",
    x: 4,
    z: 1,
    level: 1,
    weakness: "cold",
    size: 1,
    color: null,
  } as const;

  /** First-person shot from the spawn eye straight at a world point. */
  function shotAt(graph: ReturnType<typeof makeScene>, x: number, y: number, z: number) {
    const [px, py, pz] = spawnPoint(graph);
    const origin = shotOrigin("camera", { x: px, y: py, z: pz });
    return { ...origin, dx: x - origin.x, dy: y - origin.y, dz: z - origin.z };
  }

  it("starts a camera shot at the first-person eye, not below it", () => {
    const [px, py, pz] = spawnPoint(scene);
    expect(shotOrigin("camera", { x: px, y: py, z: pz }).y).toBeCloseTo(
      py + FPS_EYE_HEIGHT - TILE_TOP,
    );
  });

  it("hits a monster when the reticle is on its drawn body, and a wall in between stops it", () => {
    const open = makeScene({ monsters: [{ ...drone }] });
    const built = buildEncounter(open, rules());
    const hostiles = built?.combatants.filter((one) => one.side === "hostile") ?? [];
    const [bodyX, bodyZ] = tileToWorld(drone.x, drone.z);
    const weapon = rules().weapons[0];
    if (weapon === undefined) throw new Error("fixture has a weapon");
    const ray = shotAt(open, bodyX, 0.7, bodyZ);
    expect(hitscan(ray, weapon, hostiles)?.combatantId).toBe("drone_a");

    // Spawn is tile (4, 4); a wall across z = 2 stands between it and the drone at z = 1.
    const covered = shotBlockers([wall(2, 2, 5, 2)]);
    expect(hitscan(ray, weapon, hostiles, covered)).toBeNull();
  });

  it("maps walls into the hitscan frame", () => {
    const [box] = shotBlockers([wall(3, 4, 2, 2)]);
    const expected = [3, 0, 4, 5, 2, 5];
    [...(box?.min ?? []), ...(box?.max ?? [])].forEach((value, index) => {
      expect(value).toBeCloseTo(expected[index] ?? Number.NaN);
    });
  });

  it("lets the computer shoot only at a foe it can see", () => {
    const weapon = rules().weapons[0];
    if (weapon === undefined) throw new Error("fixture has a weapon");
    const body = { hp: 10, maxHp: 10, radius: 0.3, height: 1.6 };
    const self = { id: "drone_a", x: 4.5, z: 1.5, ...body };
    const near = { id: PLAYER_ID, x: 4.5, z: 4.5, ...body };
    const far = { id: "ally_1", x: 8.5, z: 1.5, ...body };
    expect(chooseVictim(self, [near, far], weapon, [])).toBe(PLAYER_ID);
    const cover = shotBlockers([wall(2, 2, 5, 2)]);
    expect(chooseVictim(self, [near, far], weapon, cover)).toBe("ally_1");
    expect(chooseVictim(self, [near], weapon, cover)).toBeNull();
  });
});
