// The countryside the land is made of (plan.md §2): Shōwa-era rural things, each a stack of
// primitives like every other prop. Several are tall on purpose — a chimney, a pylon, a windmill —
// because "something tall in the distance" is what the player walks toward.

import type { PropKind } from "@shared/world";
import type { PropShape } from "./props";

export type RuralPropKind = Extract<
  PropKind,
  | "utility_pole"
  | "vending_machine"
  | "bus_stop"
  | "rail_track"
  | "chimney"
  | "steel_tower"
  | "windmill"
  | "breakwater"
  | "house"
>;

const matte = (
  geo: PropShape["parts"][number]["geo"],
  offset: [number, number, number],
  size: [number, number, number],
  color: string,
): PropShape["parts"][number] => ({ geo, offset, size, color, emissive: 0 });

/** Four sleepers under two rails: one straight segment, four tiles long along z. */
const sleepers = [-1.5, -0.5, 0.5, 1.5].map((z) =>
  matte("box", [0, 0.04, z], [1.5, 0.08, 0.28], "#5b4a3c"),
);

export const RURAL_SHAPE: Record<RuralPropKind, PropShape> = {
  utility_pole: {
    parts: [
      matte("cylinder", [0, 3, 0], [0.22, 6, 0.22], "#6a5a4a"),
      matte("box", [0, 5.5, 0], [1.6, 0.12, 0.12], "#4d4238"),
      matte("box", [0, 5.1, 0], [1.1, 0.1, 0.1], "#4d4238"),
    ],
    collider: 0.15,
    colliderHeight: 6,
    light: null,
  },
  vending_machine: {
    parts: [
      matte("box", [0, 0.9, 0], [0.9, 1.8, 0.7], "#e8e4dc"),
      matte("box", [0, 1.25, 0.36], [0.72, 0.7, 0.04], "#d8f0ff"),
      matte("box", [0, 0.45, 0.36], [0.72, 0.12, 0.04], "#c0392b"),
    ],
    collider: 0.5,
    colliderHeight: 1.8,
    light: null,
  },
  bus_stop: {
    parts: [
      matte("box", [0, 2.2, 0], [2.4, 0.1, 1.3], "#8a8f96"),
      matte("box", [0, 1.1, -0.6], [2.2, 2.2, 0.08], "#b9c2c9"),
      matte("box", [0, 0.45, -0.35], [1.8, 0.1, 0.4], "#7a5b3e"),
      matte("cylinder", [1.5, 1.2, 0.5], [0.08, 2.4, 0.08], "#5d646b"),
      matte("cylinder", [1.5, 2.3, 0.5], [0.5, 0.06, 0.5], "#d9d2b0"),
    ],
    collider: 0.7,
    colliderHeight: 2.2,
    light: null,
  },
  rail_track: {
    parts: [
      ...sleepers,
      matte("box", [-0.5, 0.14, 0], [0.08, 0.12, 4], "#6e6a66"),
      matte("box", [0.5, 0.14, 0], [0.08, 0.12, 4], "#6e6a66"),
    ],
    collider: 0,
    colliderHeight: 0,
    light: null,
  },
  chimney: {
    parts: [
      matte("cylinder", [0, 4.5, 0], [1.1, 9, 1.1], "#8a4b3a"),
      matte("cylinder", [0, 8.6, 0], [1.2, 0.5, 1.2], "#3b2f2c"),
      matte("box", [0, 0.6, 0], [2, 1.2, 2], "#6f5e52"),
    ],
    collider: 0.7,
    colliderHeight: 9,
    light: null,
  },
  steel_tower: {
    parts: [
      matte("cone", [0, 7, 0], [3, 14, 3], "#5c6470"),
      matte("box", [0, 11, 0], [4.2, 0.16, 0.16], "#4a515b"),
      matte("box", [0, 8.5, 0], [5, 0.16, 0.16], "#4a515b"),
    ],
    collider: 1,
    colliderHeight: 14,
    light: null,
  },
  windmill: {
    parts: [
      matte("cylinder", [0, 2.6, 0], [0.9, 5.2, 0.9], "#e6e1d6"),
      matte("cone", [0, 5.6, 0], [1.2, 0.8, 1.2], "#7a3b30"),
      matte("box", [0, 5, 0.55], [0.18, 4.2, 0.06], "#cfc6b4"),
      matte("box", [0, 5, 0.62], [4.2, 0.18, 0.06], "#cfc6b4"),
    ],
    collider: 0.5,
    colliderHeight: 5.2,
    light: null,
  },
  breakwater: {
    parts: [
      matte("box", [0, 0.6, 0], [4, 1.2, 1.2], "#9a9c98"),
      matte("dodeca", [1.2, 0.3, 0.9], [0.9, 0.7, 0.9], "#8a8c88"),
      matte("dodeca", [-1, 0.3, 0.95], [0.8, 0.6, 0.8], "#8a8c88"),
    ],
    collider: 0.8,
    colliderHeight: 1.2,
    light: null,
  },
  house: {
    parts: [
      matte("box", [0, 1.1, 0], [3, 2.2, 3], "#a88a66"),
      matte("cone", [0, 2.8, 0], [4.2, 1.3, 4.2], "#3d4552"),
      matte("box", [0, 0.8, 1.52], [0.9, 1.6, 0.06], "#5a4232"),
      matte("box", [0.95, 1.4, 1.52], [0.6, 0.5, 0.05], "#f2d59a"),
    ],
    collider: 1.5,
    colliderHeight: 2.6,
    light: null,
  },
};
