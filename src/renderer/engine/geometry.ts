// Module-level geometry/material cache. Instanced meshes and entity primitives all pull from
// here so a re-render never allocates a BufferGeometry or a Material. There is exactly one
// <GameCanvas> at a time, so module scope is the right lifetime.

import type { PropKind, Tile } from "@shared/world";
import * as THREE from "three";
import { type GeoKey, PROP_SHAPE, TILE_TINT } from "./palette";
import { PATCH_PULSE } from "./patches";

// ── Geometries (all unit-sized; instance matrices carry the real size) ───────────────────────

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
export const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 7);
export const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
export const UNIT_SPHERE = new THREE.SphereGeometry(0.5, 12, 8);
export const UNIT_DODECA = new THREE.DodecahedronGeometry(0.5, 0);
export const UNIT_OCTA = new THREE.OctahedronGeometry(0.5, 0);
/** Closed ring in the XY plane (halos, hoops). */
export const UNIT_TORUS = new THREE.TorusGeometry(0.5, 0.075, 6, 20);
/** Open ring: a bow's limb, the gap facing +X. */
export const UNIT_ARC = new THREE.TorusGeometry(0.5, 0.05, 5, 14, Math.PI * 1.25);
/** Flat pie slice lying in the XZ plane — fans, skirts. */
export const UNIT_WEDGE = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false, 0, Math.PI * 0.8);

const GEOMETRIES: Record<GeoKey, THREE.BufferGeometry> = {
  box: UNIT_BOX,
  cone: UNIT_CONE,
  cylinder: UNIT_CYLINDER,
  sphere: UNIT_SPHERE,
  dodeca: UNIT_DODECA,
  octa: UNIT_OCTA,
  torus: UNIT_TORUS,
  arc: UNIT_ARC,
  wedge: UNIT_WEDGE,
};

export function geometryFor(key: GeoKey): THREE.BufferGeometry {
  return GEOMETRIES[key];
}

/** Entity primitives that are not part of the prop table. */
export const PLAYER_CAPSULE = new THREE.CapsuleGeometry(0.3, 1, 6, 12);
export const BODY_CAPSULE = new THREE.CapsuleGeometry(0.28, 0.7, 6, 10);
export const SLIM_CAPSULE = new THREE.CapsuleGeometry(0.16, 0.85, 6, 8);
export const PORTAL_RING = new THREE.TorusGeometry(0.62, 0.11, 8, 28);
export const DEBUG_RING = new THREE.RingGeometry(0.92, 1, 24);

// ── Shared materials mutated by <Atmosphere> during a biome crossfade ────────────────────────

export const groundMaterial = new THREE.MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
export const wallMaterial = new THREE.MeshStandardMaterial({ roughness: 0.86, metalness: 0.02 });

/** 0…1 emissive kick applied to every prop right after a world mutation. */
export const emissivePulse = { value: 0 };

// ── Material cache ───────────────────────────────────────────────────────────────────────────

const materials = new Map<string, THREE.MeshStandardMaterial>();

/** Cached standard material. `emissive` is the base intensity; 0 means a matte surface. */
export function standardMaterial(color: string, emissive = 0): THREE.MeshStandardMaterial {
  const key = `${color}|${emissive}`;
  const cached = materials.get(key);
  if (cached !== undefined) return cached;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: emissive > 0 ? 0.35 : 0.8,
    metalness: 0,
  });
  if (emissive > 0) {
    material.emissive = new THREE.Color(color);
    material.emissiveIntensity = emissive;
  }
  materials.set(key, material);
  return material;
}

const translucentMaterials = new Map<string, THREE.MeshStandardMaterial>();

/**
 * Cached see-through material — editor drafts and monster auras. `opacity` is the alpha, so the
 * caller keeps the "is this real geometry or a preview" decision in one place.
 */
export function translucentMaterial(
  color: string,
  opacity: number,
  emissive = 0,
): THREE.MeshStandardMaterial {
  const key = `${color}|${opacity}|${emissive}`;
  const cached = translucentMaterials.get(key);
  if (cached !== undefined) return cached;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: 0.4,
    metalness: 0,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  if (emissive > 0) {
    material.emissive = new THREE.Color(color);
    material.emissiveIntensity = emissive;
  }
  translucentMaterials.set(key, material);
  return material;
}

const tileMaterials = new Map<Tile, THREE.MeshStandardMaterial>();

/**
 * One material per patch tile kind. The colour lives on the material (so <Ground> can oscillate
 * water/lava from a single place) and the per-tile value jitter rides on the instance colour.
 */
export function tileMaterial(tile: Tile): THREE.MeshStandardMaterial {
  const cached = tileMaterials.get(tile);
  if (cached !== undefined) return cached;
  const pulse = PATCH_PULSE[tile];
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(TILE_TINT[tile]),
    roughness: pulse === undefined ? 0.9 : 0.25,
    metalness: 0,
  });
  material.emissive = new THREE.Color(TILE_TINT[tile]);
  material.emissiveIntensity = pulse === undefined ? 0 : pulse.base;
  tileMaterials.set(tile, material);
  return material;
}

const propMaterials = new Map<string, THREE.MeshStandardMaterial>();

/**
 * One material per (prop kind, part). Instance colours carry the per-prop tint, so the material
 * stays white and only holds the emissive channel.
 */
export function propMaterial(kind: PropKind, part: number): THREE.MeshStandardMaterial {
  const key = `${kind}:${part}`;
  const cached = propMaterials.get(key);
  if (cached !== undefined) return cached;
  const spec = PROP_SHAPE[kind].parts[part];
  const emissive = spec === undefined ? 0 : spec.emissive;
  const material = new THREE.MeshStandardMaterial({
    roughness: emissive > 0 ? 0.3 : 0.85,
    metalness: 0,
  });
  // Every part carries an emissive colour (intensity 0 for matte ones) so the mutation pulse in
  // <Props> can lift the whole scene without swapping materials.
  material.emissive = spec === undefined ? new THREE.Color() : new THREE.Color(spec.color);
  material.emissiveIntensity = emissive;
  propMaterials.set(key, material);
  return material;
}

/** Base emissive intensity of a prop part, so the pulse can be added on top of it. */
export function propEmissiveBase(kind: PropKind, part: number): number {
  return PROP_SHAPE[kind].parts[part]?.emissive ?? 0;
}

// ── Colour helpers ───────────────────────────────────────────────────────────────────────────

/**
 * Deterministic 0…1 value from tile coordinates — the per-tile jitter has to survive re-renders
 * and hot-swaps, so it can never come from Math.random().
 */
export function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Tile/wall tint as an instance-colour *modulation*: normalised so its brightest channel is 1,
 * then jittered. Multiplied by the (crossfading) material colour it shifts hue without darkening.
 */
export function tintModulation(hex: string, jitter: number, target: THREE.Color): THREE.Color {
  target.set(hex);
  const peak = Math.max(target.r, target.g, target.b, 0.001);
  target.multiplyScalar(jitter / peak);
  return target;
}
