import { HAT_SHAPE } from "@renderer/engine/hats";
import { HELD_SHAPE } from "@renderer/engine/held";
import {
  angleDelta,
  BODY_PROPORTION,
  FACE_TILES,
  facesHidden,
  faceYaw,
  type HumanoidPart,
  handGrip,
  hatScale,
  headCenterY,
  heldScale,
  hipY,
  humanoidHeight,
  shoulderY,
} from "@renderer/engine/humanoidParts";
import { BODY_KINDS, HAT_KINDS, HELD_KINDS } from "@shared/world";
import { describe, expect, it } from "vitest";

const GEO_KEYS = new Set([
  "box",
  "cone",
  "cylinder",
  "sphere",
  "dodeca",
  "octa",
  "torus",
  "arc",
  "wedge",
]);
const PART_COLORS = new Set(["body", "accent", "skin", "dark", "metal", "wood", "cloth", "glow"]);

function checkParts(parts: readonly HumanoidPart[], label: string): void {
  const ids = new Set<string>();
  for (const part of parts) {
    expect(ids.has(part.id), `${label}.${part.id} is unique`).toBe(false);
    ids.add(part.id);
    expect(GEO_KEYS.has(part.geo), `${label}.${part.id}.geo`).toBe(true);
    expect(PART_COLORS.has(part.color), `${label}.${part.id}.color`).toBe(true);
    expect(part.offset, `${label}.${part.id}.offset`).toHaveLength(3);
    expect(part.size, `${label}.${part.id}.size`).toHaveLength(3);
    expect(part.rotation, `${label}.${part.id}.rotation`).toHaveLength(3);
    for (const n of part.size) expect(n, `${label}.${part.id}.size > 0`).toBeGreaterThan(0);
    for (const n of [...part.offset, ...part.rotation]) expect(Number.isFinite(n)).toBe(true);
    expect(part.emissive, `${label}.${part.id}.emissive`).toBeGreaterThanOrEqual(0);
  }
}

describe("body proportions", () => {
  it("covers every BodyKind with positive, finite measurements", () => {
    for (const body of BODY_KINDS) {
      const p = BODY_PROPORTION[body];
      expect(p, body).toBeDefined();
      for (const [key, value] of Object.entries(p)) {
        expect(Number.isFinite(value), `${body}.${key}`).toBe(true);
        if (key === "lean") expect(value, `${body}.lean`).toBeGreaterThanOrEqual(0);
        else expect(value, `${body}.${key}`).toBeGreaterThan(0);
      }
    }
    expect(Object.keys(BODY_PROPORTION)).toHaveLength(BODY_KINDS.length);
  });

  it("stacks the skeleton in a walkable order for every build", () => {
    for (const body of BODY_KINDS) {
      const p = BODY_PROPORTION[body];
      expect(hipY(p), body).toBeCloseTo(p.legLength);
      // Shoulders sit inside the torso, the head above it, and the hands never reach the floor.
      expect(shoulderY(p), `${body} shoulder`).toBeLessThan(p.torsoHeight);
      expect(shoulderY(p), `${body} shoulder`).toBeGreaterThan(p.torsoHeight / 2);
      expect(headCenterY(p), `${body} head`).toBeGreaterThan(p.torsoHeight);
      expect(hipY(p) + shoulderY(p) - p.armLength, `${body} hand`).toBeGreaterThan(0);
      expect(humanoidHeight(p), `${body} height`).toBeGreaterThan(0.6);
    }
  });

  it("makes the child short with a big head and the tall build tallest", () => {
    const heights = BODY_KINDS.map((body) => humanoidHeight(BODY_PROPORTION[body]));
    const child = humanoidHeight(BODY_PROPORTION.child);
    const tall = humanoidHeight(BODY_PROPORTION.tall);
    expect(child).toBe(Math.min(...heights));
    expect(tall).toBe(Math.max(...heights));
    expect(BODY_PROPORTION.child.headRadius / child).toBeGreaterThan(
      BODY_PROPORTION.slim.headRadius / humanoidHeight(BODY_PROPORTION.slim),
    );
  });

  it("gives the stout build the widest torso and the elder the only real hunch", () => {
    for (const body of BODY_KINDS) {
      if (body === "stout") continue;
      expect(BODY_PROPORTION.stout.torsoWidth, body).toBeGreaterThan(
        BODY_PROPORTION[body].torsoWidth,
      );
      if (body !== "elder") {
        expect(BODY_PROPORTION.elder.lean, body).toBeGreaterThan(BODY_PROPORTION[body].lean);
      }
    }
  });

  it("anchors the right hand on the arm for every build", () => {
    for (const body of BODY_KINDS) {
      const p = BODY_PROPORTION[body];
      const grip = handGrip(p);
      expect(grip[0], `${body} grip x`).toBeCloseTo(p.armSpread);
      expect(grip[1], `${body} grip y`).toBeCloseTo(shoulderY(p) - p.armLength);
      expect(heldScale(p), `${body} held scale`).toBeGreaterThan(0.5);
      expect(hatScale(p), `${body} hat scale`).toBeGreaterThan(0.5);
    }
  });
});

describe("hats", () => {
  it("covers every HatKind with valid parts", () => {
    for (const hat of HAT_KINDS) {
      const parts = HAT_SHAPE[hat];
      expect(parts, hat).toBeDefined();
      checkParts(parts, `hat.${hat}`);
    }
    expect(Object.keys(HAT_SHAPE)).toHaveLength(HAT_KINDS.length);
  });

  it("draws nothing for `none` and something for every other kind", () => {
    expect(HAT_SHAPE.none).toHaveLength(0);
    for (const hat of HAT_KINDS) {
      if (hat === "none") continue;
      expect(HAT_SHAPE[hat].length, hat).toBeGreaterThan(0);
    }
  });

  it("hides the face behind a helm and nothing else", () => {
    for (const hat of HAT_KINDS) expect(facesHidden(hat), hat).toBe(hat === "helm");
  });

  it("keeps the halo emissive so it reads as light, not plastic", () => {
    expect(HAT_SHAPE.halo.every((part) => part.emissive > 1)).toBe(true);
    expect(HAT_SHAPE.halo.some((part) => part.geo === "torus")).toBe(true);
  });
});

describe("held items", () => {
  it("covers every HeldKind with valid parts", () => {
    for (const held of HELD_KINDS) {
      const parts = HELD_SHAPE[held];
      expect(parts, held).toBeDefined();
      checkParts(parts, `held.${held}`);
    }
    expect(Object.keys(HELD_SHAPE)).toHaveLength(HELD_KINDS.length);
  });

  it("draws nothing for `none` and something for every other kind", () => {
    expect(HELD_SHAPE.none).toHaveLength(0);
    for (const held of HELD_KINDS) {
      if (held === "none") continue;
      expect(HELD_SHAPE[held].length, held).toBeGreaterThan(0);
    }
  });

  it("puts the glow on the staff orb and the lantern core", () => {
    expect(HELD_SHAPE.staff.some((part) => part.color === "glow" && part.emissive > 1)).toBe(true);
    expect(HELD_SHAPE.lantern.some((part) => part.color === "glow" && part.emissive > 1)).toBe(
      true,
    );
  });

  it("keeps the spear the longest thing anyone carries", () => {
    const reach = (kind: keyof typeof HELD_SHAPE): number =>
      HELD_SHAPE[kind].reduce((max, part) => Math.max(max, part.offset[1] + part.size[1] / 2), 0);
    for (const held of HELD_KINDS) {
      if (held === "spear") continue;
      expect(reach("spear"), held).toBeGreaterThan(reach(held));
    }
  });
});

describe("faceYaw", () => {
  it("turns toward the player inside the reach and gives up outside it", () => {
    expect(faceYaw(4, 4, 4, 6)).toBeCloseTo(0);
    expect(faceYaw(4, 4, 6, 4)).toBeCloseTo(Math.PI / 2);
    expect(faceYaw(4, 4, 4, 2)).toBeCloseTo(Math.PI);
    expect(faceYaw(4, 4, 4, 4 + FACE_TILES)).toBeCloseTo(0);
    expect(faceYaw(4, 4, 4, 4 + FACE_TILES + 0.001)).toBeNull();
    expect(faceYaw(4, 4, 99, 99)).toBeNull();
  });

  it("ignores a player standing exactly on the humanoid (no yaw to compute)", () => {
    expect(faceYaw(4, 4, 4, 4)).toBeNull();
  });
});

describe("angleDelta", () => {
  it("always takes the short way round", () => {
    expect(angleDelta(0, 0.5)).toBeCloseTo(0.5);
    expect(angleDelta(0, -0.5)).toBeCloseTo(-0.5);
    expect(angleDelta(3, -3)).toBeCloseTo(Math.PI * 2 - 6);
    expect(Math.abs(angleDelta(0, Math.PI * 4 + 1))).toBeLessThanOrEqual(Math.PI);
  });
});
