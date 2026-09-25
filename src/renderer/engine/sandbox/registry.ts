// Live handles on the scene's free bodies, so the physics gun can find what you are pointing at.
//
// Per-frame data, so it is a module-level map rather than a store (Rule 4): the gun reads every
// body's position on the frame it fires and nothing about that belongs in React. There is exactly
// one <GameCanvas> at a time, which is the same lifetime the geometry cache already assumes.

import type { RapierRigidBody } from "@react-three/rapier";

export interface SandboxBody {
  id: string;
  body: RapierRigidBody;
  /** Grab radius in world units, generous enough that a click near the edge still catches. */
  radius: number;
}

const bodies = new Map<string, SandboxBody>();

/** Registers a body and returns the unregister, so a component can call it from an effect. */
export function registerBody(entry: SandboxBody): () => void {
  bodies.set(entry.id, entry);
  return () => {
    // Only drop our own entry: a remount can register the replacement before this runs.
    if (bodies.get(entry.id) === entry) bodies.delete(entry.id);
  };
}

export function sandboxBodies(): SandboxBody[] {
  return [...bodies.values()];
}

export function sandboxBody(id: string): SandboxBody | null {
  return bodies.get(id) ?? null;
}

/** A prop's stable id. Props have no id of their own, so their tile is the identity. */
export function bodyId(x: number, z: number, index: number): string {
  return `body_${x}_${z}_${index}`;
}
