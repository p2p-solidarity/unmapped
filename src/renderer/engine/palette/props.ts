// Prop meshes: every PropKind as a small stack of primitives with its own hex colours (Rule 3
// allows literals in this directory only). geometry.ts caches the primitives; Props.tsx turns the
// table into instanced matrices, colours and colliders.

import type { PropKind } from "@shared/world";
import { RURAL_SHAPE } from "./rural";

/** Primitive keys resolved to cached three geometries by `geometry.ts`. */
export type GeoKey =
  | "box"
  | "cone"
  | "cylinder"
  | "sphere"
  | "dodeca"
  | "octa"
  | "torus"
  | "arc"
  | "wedge";

export interface PropPart {
  geo: GeoKey;
  /** Centre offset from the tile centre, in world units at scale 1 (y measured from ground top). */
  offset: [number, number, number];
  /** Full size in world units at scale 1. */
  size: [number, number, number];
  color: string;
  /** Emissive intensity; 0 means a matte part. */
  emissive: number;
}

export interface PropShape {
  parts: PropPart[];
  /** Cylinder collider radius at scale 1. 0 = walk-through (flowers, mushrooms). */
  collider: number;
  /** Cylinder collider full height at scale 1. */
  colliderHeight: number;
  /** Non-null for props that add a point light (torches only). */
  light: string | null;
}

export const PROP_SHAPE: Record<PropKind, PropShape> = {
  tree: {
    parts: [
      {
        geo: "cylinder",
        offset: [0, 0.5, 0],
        size: [0.28, 1, 0.28],
        color: "#6b4a2f",
        emissive: 0,
      },
      { geo: "cone", offset: [0, 1.7, 0], size: [1.5, 1.6, 1.5], color: "#3f7a3a", emissive: 0 },
      { geo: "cone", offset: [0, 2.4, 0], size: [1.1, 1.1, 1.1], color: "#4e8f45", emissive: 0 },
    ],
    collider: 0.35,
    colliderHeight: 1.2,
    light: null,
  },
  rock: {
    parts: [
      { geo: "dodeca", offset: [0, 0.3, 0], size: [0.9, 0.7, 0.9], color: "#8c8f99", emissive: 0 },
      {
        geo: "dodeca",
        offset: [0.35, 0.14, -0.25],
        size: [0.5, 0.4, 0.5],
        color: "#7a7d87",
        emissive: 0,
      },
    ],
    collider: 0.4,
    colliderHeight: 0.6,
    light: null,
  },
  torch: {
    parts: [
      {
        geo: "cylinder",
        offset: [0, 0.65, 0],
        size: [0.12, 1.3, 0.12],
        color: "#5a4632",
        emissive: 0,
      },
      {
        geo: "sphere",
        offset: [0, 1.42, 0],
        size: [0.34, 0.42, 0.34],
        color: "#ffb648",
        emissive: 1.6,
      },
    ],
    collider: 0.16,
    colliderHeight: 1.3,
    light: "#ffa53c",
  },
  crate: {
    parts: [
      { geo: "box", offset: [0, 0.4, 0], size: [0.8, 0.8, 0.8], color: "#a2743f", emissive: 0 },
      { geo: "box", offset: [0, 0.83, 0], size: [0.86, 0.1, 0.86], color: "#6f4c28", emissive: 0 },
    ],
    collider: 0.42,
    colliderHeight: 0.9,
    light: null,
  },
  altar: {
    parts: [
      { geo: "box", offset: [0, 0.15, 0], size: [1.2, 0.3, 1.2], color: "#6c6a78", emissive: 0 },
      { geo: "box", offset: [0, 0.48, 0], size: [0.9, 0.35, 0.9], color: "#7d7a8a", emissive: 0 },
      { geo: "box", offset: [0, 0.72, 0], size: [0.7, 0.12, 0.7], color: "#b39bff", emissive: 1.3 },
    ],
    collider: 0.55,
    colliderHeight: 0.8,
    light: null,
  },
  well: {
    parts: [
      {
        geo: "cylinder",
        offset: [0, 0.3, 0],
        size: [1.1, 0.6, 1.1],
        color: "#7e7a72",
        emissive: 0,
      },
      {
        geo: "cylinder",
        offset: [0, 0.62, 0],
        size: [0.85, 0.06, 0.85],
        color: "#10131f",
        emissive: 0,
      },
      {
        geo: "box",
        offset: [-0.45, 0.55, 0],
        size: [0.12, 1.1, 0.12],
        color: "#6b4a2f",
        emissive: 0,
      },
      {
        geo: "box",
        offset: [0.45, 0.55, 0],
        size: [0.12, 1.1, 0.12],
        color: "#6b4a2f",
        emissive: 0,
      },
      { geo: "cone", offset: [0, 1.32, 0], size: [1.4, 0.5, 1.4], color: "#5a4030", emissive: 0 },
    ],
    collider: 0.55,
    colliderHeight: 0.7,
    light: null,
  },
  statue: {
    parts: [
      { geo: "box", offset: [0, 0.15, 0], size: [0.9, 0.3, 0.9], color: "#8a8694", emissive: 0 },
      {
        geo: "cylinder",
        offset: [0, 0.9, 0],
        size: [0.5, 1.2, 0.5],
        color: "#9a97a6",
        emissive: 0,
      },
      {
        geo: "sphere",
        offset: [0, 1.72, 0],
        size: [0.42, 0.42, 0.42],
        color: "#a8a5b4",
        emissive: 0,
      },
    ],
    collider: 0.4,
    colliderHeight: 1.6,
    light: null,
  },
  pillar: {
    parts: [
      { geo: "box", offset: [0, 0.1, 0], size: [0.9, 0.2, 0.9], color: "#8f8b98", emissive: 0 },
      {
        geo: "cylinder",
        offset: [0, 1.3, 0],
        size: [0.55, 2.2, 0.55],
        color: "#a09cab",
        emissive: 0,
      },
      { geo: "box", offset: [0, 2.5, 0], size: [0.9, 0.2, 0.9], color: "#8f8b98", emissive: 0 },
    ],
    collider: 0.35,
    colliderHeight: 2.6,
    light: null,
  },
  fence: {
    parts: [
      { geo: "box", offset: [0, 0.7, 0], size: [1, 0.1, 0.12], color: "#8a6a44", emissive: 0 },
      { geo: "box", offset: [0, 0.42, 0], size: [1, 0.1, 0.12], color: "#8a6a44", emissive: 0 },
      {
        geo: "box",
        offset: [-0.45, 0.48, 0],
        size: [0.14, 0.95, 0.14],
        color: "#77582f",
        emissive: 0,
      },
      {
        geo: "box",
        offset: [0.45, 0.48, 0],
        size: [0.14, 0.95, 0.14],
        color: "#77582f",
        emissive: 0,
      },
    ],
    collider: 0.3,
    colliderHeight: 0.95,
    light: null,
  },
  flower: {
    parts: [
      {
        geo: "cylinder",
        offset: [0, 0.18, 0],
        size: [0.05, 0.35, 0.05],
        color: "#4e8f45",
        emissive: 0,
      },
      {
        geo: "sphere",
        offset: [0, 0.4, 0],
        size: [0.22, 0.18, 0.22],
        color: "#ff8fbf",
        emissive: 0.3,
      },
    ],
    collider: 0,
    colliderHeight: 0,
    light: null,
  },
  mushroom: {
    parts: [
      {
        geo: "cylinder",
        offset: [0, 0.15, 0],
        size: [0.14, 0.3, 0.14],
        color: "#e8dcc0",
        emissive: 0,
      },
      {
        geo: "sphere",
        offset: [0, 0.33, 0],
        size: [0.46, 0.34, 0.46],
        color: "#d2543f",
        emissive: 0.25,
      },
    ],
    collider: 0,
    colliderHeight: 0,
    light: null,
  },
  signpost: {
    parts: [
      {
        geo: "cylinder",
        offset: [0, 0.55, 0],
        size: [0.12, 1.1, 0.12],
        color: "#7a5a3a",
        emissive: 0,
      },
      { geo: "box", offset: [0, 1, 0], size: [0.9, 0.35, 0.08], color: "#b08a58", emissive: 0 },
    ],
    collider: 0.15,
    colliderHeight: 1.1,
    light: null,
  },
  machine_gear: {
    parts: [
      { geo: "torus", offset: [0, 1.05, 0], size: [1.7, 1.7, 0.5], color: "#8f7650", emissive: 0 },
      {
        geo: "cylinder",
        offset: [0, 1.05, 0],
        size: [0.42, 0.42, 0.42],
        color: "#3a4654",
        emissive: 0,
      },
      { geo: "box", offset: [0, 1.05, 0], size: [1.45, 0.14, 0.2], color: "#a58b5e", emissive: 0 },
      { geo: "box", offset: [0, 1.05, 0], size: [0.14, 1.45, 0.2], color: "#a58b5e", emissive: 0 },
    ],
    collider: 0.62,
    colliderHeight: 1.8,
    light: null,
  },
  conveyor: {
    parts: [
      { geo: "box", offset: [0, 0.28, 0], size: [1.8, 0.18, 0.82], color: "#293848", emissive: 0 },
      { geo: "box", offset: [0, 0.4, 0], size: [1.62, 0.08, 0.64], color: "#4d6372", emissive: 0 },
      {
        geo: "cylinder",
        offset: [-0.7, 0.22, 0],
        size: [0.28, 0.9, 0.28],
        color: "#101c27",
        emissive: 0,
      },
      {
        geo: "cylinder",
        offset: [0.7, 0.22, 0],
        size: [0.28, 0.9, 0.28],
        color: "#101c27",
        emissive: 0,
      },
      {
        geo: "box",
        offset: [0, 0.48, -0.38],
        size: [1.78, 0.08, 0.07],
        color: "#00dff2",
        emissive: 1.1,
      },
    ],
    collider: 0.72,
    colliderHeight: 0.5,
    light: null,
  },
  boiler: {
    parts: [
      {
        geo: "cylinder",
        offset: [0, 0.95, 0],
        size: [1.18, 1.9, 1.18],
        color: "#5a4537",
        emissive: 0,
      },
      {
        geo: "torus",
        offset: [0, 1.1, 0.58],
        size: [0.58, 0.58, 0.3],
        color: "#d58b42",
        emissive: 0.65,
      },
      { geo: "box", offset: [0, 0.18, 0], size: [1.35, 0.2, 1.35], color: "#252d35", emissive: 0 },
      {
        geo: "cylinder",
        offset: [0, 2.18, 0],
        size: [0.34, 0.62, 0.34],
        color: "#343f49",
        emissive: 0,
      },
    ],
    collider: 0.62,
    colliderHeight: 2.25,
    light: null,
  },
  pipe_stack: {
    parts: [
      {
        geo: "cylinder",
        offset: [-0.3, 1, 0],
        size: [0.28, 2, 0.28],
        color: "#52606c",
        emissive: 0,
      },
      {
        geo: "cylinder",
        offset: [0, 1.35, 0.05],
        size: [0.34, 2.7, 0.34],
        color: "#6f5946",
        emissive: 0,
      },
      {
        geo: "cylinder",
        offset: [0.34, 0.82, -0.08],
        size: [0.24, 1.64, 0.24],
        color: "#45545f",
        emissive: 0,
      },
      {
        geo: "torus",
        offset: [0, 0.75, 0.24],
        size: [0.42, 0.42, 0.2],
        color: "#00dff2",
        emissive: 0.85,
      },
    ],
    collider: 0.42,
    colliderHeight: 2.7,
    light: null,
  },
  crane: {
    parts: [
      { geo: "box", offset: [0, 1.35, 0], size: [0.22, 2.7, 0.22], color: "#7d633c", emissive: 0 },
      {
        geo: "box",
        offset: [0.6, 2.62, 0],
        size: [1.42, 0.18, 0.18],
        color: "#aa8247",
        emissive: 0,
      },
      {
        geo: "cylinder",
        offset: [1.18, 2.08, 0],
        size: [0.08, 1.05, 0.08],
        color: "#202a32",
        emissive: 0,
      },
      {
        geo: "octa",
        offset: [1.18, 1.48, 0],
        size: [0.34, 0.45, 0.34],
        color: "#ffad4d",
        emissive: 0.7,
      },
    ],
    collider: 0.28,
    colliderHeight: 2.7,
    light: null,
  },
  reactor: {
    parts: [
      {
        geo: "cylinder",
        offset: [0, 0.42, 0],
        size: [1.35, 0.84, 1.35],
        color: "#263441",
        emissive: 0,
      },
      {
        geo: "sphere",
        offset: [0, 1.45, 0],
        size: [1.08, 1.08, 1.08],
        color: "#36e8ff",
        emissive: 2.2,
      },
      {
        geo: "torus",
        offset: [0, 1.45, 0],
        size: [1.52, 1.52, 0.28],
        color: "#b59054",
        emissive: 0.1,
      },
      { geo: "box", offset: [0, 2.42, 0], size: [0.84, 0.18, 0.84], color: "#394a58", emissive: 0 },
    ],
    collider: 0.7,
    colliderHeight: 2.5,
    light: null,
  },
  ...RURAL_SHAPE,
};

// ── Monsters ─────────────────────────────────────────────────────────────────────────────────
