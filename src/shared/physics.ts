// The physics version (rev 6): the code that decides what a world looks like and how it plays —
// the generated ground, fords and wildlife (./chunks), the fight formulas (./combat, ./progression,
// ./foes), the lore heat (./lore), the dungeons (./maze) and the courses of places (./places).
// A world pins the version it was made with (`RuntimePin.physicsVersion`); a build opens only the
// versions it reproduces, and two worlds on different versions never merge on a continent — they
// would not see the same land.
//
// Change what any of that code outputs and the fingerprint test (tests/shared/physics.test.ts)
// fails until PHYSICS_VERSION is bumped and the new fingerprint recorded.

import { err, ok, type Result } from "./result";

export const PHYSICS_VERSION = 1;

/** Versions this build reproduces exactly. Bumping keeps the old generators, or drops worlds. */
export const PHYSICS_SUPPORTED: readonly number[] = [1];

/** What a pin written before physics was versioned means: every such world was made on 1. */
export const LEGACY_PHYSICS_VERSION = 1;

export function physicsOf(pin: { physicsVersion?: number }): number {
  return pin.physicsVersion ?? LEGACY_PHYSICS_VERSION;
}

/** Whether this build can reproduce a world pinned to `version`. */
export function checkPhysics(version: number): Result<void> {
  if (PHYSICS_SUPPORTED.includes(version)) return ok(undefined);
  return version > PHYSICS_VERSION
    ? err(
        "physics-newer",
        `This world was made with physics ${version}; this build has ${PHYSICS_VERSION}.`,
        "Update UNMAPPED to open it.",
      )
    : err(
        "physics-unsupported",
        `This world was made with physics ${version}, which this build no longer reproduces.`,
        "Open it with the build it was made in.",
      );
}
