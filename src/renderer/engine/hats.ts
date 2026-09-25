// Headwear, one primitive list per HatKind. Offsets are relative to the head centre and authored
// for BASE_HEAD_RADIUS; `hatScale()` stretches them onto a child's oversized head or a tall NPC's
// smaller one. Pure data — no three, no React.

import type { HatKind } from "@shared/world";
import type { HumanoidPart } from "./humanoidParts";

const CROWN_POINTS = 6;
const CROWN_RADIUS = 0.17;

/** A ring of little boxes standing on the brow — a crown without a bespoke geometry. */
function crownRing(): HumanoidPart[] {
  const parts: HumanoidPart[] = [];
  for (let i = 0; i < CROWN_POINTS; i += 1) {
    const angle = (i / CROWN_POINTS) * Math.PI * 2;
    parts.push({
      id: `crown-point-${i}`,
      geo: "box",
      offset: [Math.sin(angle) * CROWN_RADIUS, 0.19, Math.cos(angle) * CROWN_RADIUS],
      size: [0.06, 0.13, 0.06],
      rotation: [0, angle, 0],
      color: "accent",
      emissive: 0.9,
    });
  }
  parts.push({
    id: "crown-band",
    geo: "cylinder",
    offset: [0, 0.13, 0],
    size: [0.4, 0.06, 0.4],
    rotation: [0, 0, 0],
    color: "accent",
    emissive: 0.6,
  });
  return parts;
}

export const HAT_SHAPE: Record<HatKind, HumanoidPart[]> = {
  none: [],
  straw: [
    {
      id: "straw-brim",
      geo: "cylinder",
      offset: [0, 0.13, 0],
      size: [0.62, 0.035, 0.62],
      rotation: [0, 0, 0],
      color: "cloth",
      emissive: 0,
    },
    {
      id: "straw-crown",
      geo: "cone",
      offset: [0, 0.2, 0],
      size: [0.42, 0.16, 0.42],
      rotation: [0, 0, 0],
      color: "cloth",
      emissive: 0,
    },
  ],
  hood: [
    {
      id: "hood-cowl",
      geo: "cone",
      offset: [0, 0.1, -0.03],
      size: [0.52, 0.46, 0.52],
      rotation: [-0.12, 0, 0],
      color: "accent",
      emissive: 0,
    },
    {
      id: "hood-collar",
      geo: "box",
      offset: [0, -0.16, -0.02],
      size: [0.4, 0.12, 0.34],
      rotation: [0, 0, 0],
      color: "accent",
      emissive: 0,
    },
  ],
  crown: crownRing(),
  helm: [
    {
      id: "helm-shell",
      geo: "box",
      offset: [0, 0.03, 0],
      size: [0.42, 0.4, 0.42],
      rotation: [0, 0, 0],
      color: "metal",
      emissive: 0,
    },
    {
      id: "helm-crest",
      geo: "box",
      offset: [0, 0.24, 0],
      size: [0.06, 0.1, 0.4],
      rotation: [0, 0, 0],
      color: "accent",
      emissive: 0.5,
    },
    {
      id: "helm-slit",
      geo: "box",
      offset: [0, 0.02, 0.21],
      size: [0.3, 0.06, 0.03],
      rotation: [0, 0, 0],
      color: "dark",
      emissive: 0,
    },
  ],
  horns: [
    {
      id: "horn-left",
      geo: "cone",
      offset: [-0.16, 0.18, 0],
      size: [0.11, 0.28, 0.11],
      rotation: [0, 0, 0.42],
      color: "accent",
      emissive: 0.2,
    },
    {
      id: "horn-right",
      geo: "cone",
      offset: [0.16, 0.18, 0],
      size: [0.11, 0.28, 0.11],
      rotation: [0, 0, -0.42],
      color: "accent",
      emissive: 0.2,
    },
  ],
  ribbon: [
    {
      id: "ribbon-knot",
      geo: "box",
      offset: [0.15, 0.16, -0.02],
      size: [0.08, 0.08, 0.08],
      rotation: [0, 0, 0.3],
      color: "accent",
      emissive: 0.3,
    },
    {
      id: "ribbon-loop-left",
      geo: "box",
      offset: [0.07, 0.21, -0.02],
      size: [0.14, 0.02, 0.09],
      rotation: [0, 0, 0.8],
      color: "accent",
      emissive: 0.3,
    },
    {
      id: "ribbon-loop-right",
      geo: "box",
      offset: [0.24, 0.19, -0.02],
      size: [0.14, 0.02, 0.09],
      rotation: [0, 0, -0.5],
      color: "accent",
      emissive: 0.3,
    },
  ],
  halo: [
    {
      id: "halo-ring",
      geo: "torus",
      offset: [0, 0.3, 0],
      size: [0.34, 0.34, 0.34],
      rotation: [Math.PI / 2, 0, 0],
      color: "glow",
      emissive: 2.4,
    },
  ],
  headband: [
    {
      id: "headband-strip",
      geo: "cylinder",
      offset: [0, 0.08, 0],
      size: [0.4, 0.06, 0.4],
      rotation: [0, 0, 0],
      color: "accent",
      emissive: 0.8,
    },
    {
      id: "headband-tail",
      geo: "box",
      offset: [0, 0.03, -0.2],
      size: [0.05, 0.2, 0.03],
      rotation: [-0.35, 0, 0],
      color: "accent",
      emissive: 0.4,
    },
  ],
};
