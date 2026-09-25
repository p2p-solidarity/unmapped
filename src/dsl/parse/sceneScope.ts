// The per-program context every scene reader shares: the floor its coordinates must fit inside,
// the id scope that keeps entity ids unique, and the list of model-facing complaints.

import type { OpenUIError } from "@openuidev/lang-core";
import type { FloorSpec } from "@shared/world";
import { clampCoord } from "../limits";
import { createIdScope } from "./ids";

export interface SceneScope {
  floor: FloorSpec;
  /** Everything the converters could not use; a non-empty list fails the parse. */
  issues: OpenUIError[];
  /** Clamp a tile coordinate into the floor. */
  x(value: number): number;
  z(value: number): number;
  /** Register an id, falling back to `<prefix>_<n>` when nothing ascii survives. */
  take(raw: string, prefix: string): string;
  duplicates(): string[];
}

export function createSceneScope(floor: FloorSpec, issues: OpenUIError[]): SceneScope {
  const ids = createIdScope();
  const counts = new Map<string, number>();
  return {
    floor,
    issues,
    x: (value) => clampCoord(value, floor.width),
    z: (value) => clampCoord(value, floor.depth),
    take(raw, prefix) {
      const next = (counts.get(prefix) ?? 0) + 1;
      counts.set(prefix, next);
      return ids.take(raw, `${prefix}_${next}`);
    },
    duplicates: () => ids.duplicates(),
  };
}
