// Where the player stands, for the save — read on demand, never published to a store (Rule 4).
//
// The running scene registers a probe over its per-frame refs; the app layer samples it when it
// checkpoints. Unregistering keeps the final sample, so leaving Play can still save where the
// player stood after the canvas is gone.
//
// On a continent the land around this world belongs partly to other worlds, shifted into this
// world's coordinates. A spot on another world's territory is not a spot in this save's scene: off
// the continent the same coordinates are this world's own land, somewhere the player never walked.
// So a sample taken there says it is visiting instead of naming this save's scene, and the save's
// scene gate (`currentPosition` in app/usePersistWorld.ts) never stores it — every checkpoint keeps
// the last position on this world's own land. Presence and notes read only x/z, which stay live.

import { foreignAt, useEngineStore } from "@renderer/state";
import type { SavedPosition } from "@shared/cartridge";
import { chunkOf } from "@shared/chunks";
import { carryPlayerHp } from "./combat/playerWounds";

type Probe = () => SavedPosition;

/** Scene ids never contain ":", so a visiting sample can never pass for a scene of this save. */
const VISITING = "visiting:";

let probe: Probe | null = null;
let last: SavedPosition | null = null;

/** Marks a sample taken on another world's territory, as the continent stands right now. */
function placed(sample: SavedPosition): SavedPosition {
  const host = foreignAt(chunkOf(sample.x, sample.z));
  return host === null ? sample : { ...sample, sceneId: `${VISITING}${host.worldId}` };
}

/** Whether `sample` was taken on another world's land (a visitor), not on this world's own. */
export function isVisiting(sample: SavedPosition): boolean {
  return sample.sceneId.startsWith(VISITING);
}

export function registerPlayerProbe(next: Probe): () => void {
  probe = next;
  last = null;
  return () => {
    if (probe !== next) return;
    // Judged now, while the continent that leaving Play is about to close is still known.
    last = placed(next());
    probe = null;
  };
}

/** The live position, else the one taken when the scene unmounted, else null. */
export function samplePlayer(): SavedPosition | null {
  return probe === null ? last : placed(probe());
}

/**
 * Forget the parked sample — an instance is about to load. A door's travel request still pending
 * from the last walk goes too: the land view applies the current request when it mounts, which
 * would carry the player of the world being opened to where the last one's door pointed.
 */
export function clearPlayerSample(): void {
  last = null;
  // A save loaded afresh starts whole: HP is not saved, so no fight's wounds carry into it.
  carryPlayerHp(null);
  useEngineStore.setState({ teleport: null });
}

// ── Pose: which way the player faces and whether they walk, for the others who see them ─────────
// Not part of the save (a SavedPosition is persisted as-is); only the continent's presence reads it.

export type Facing4 = "north" | "south" | "east" | "west";

export interface PlayerPose {
  facing: Facing4;
  moving: boolean;
}

type PoseProbe = () => PlayerPose;

let pose: PoseProbe | null = null;

export function registerPoseProbe(next: PoseProbe): () => void {
  pose = next;
  return () => {
    if (pose === next) pose = null;
  };
}

/** The live pose, or null when no land view is drawing the player. */
export function samplePose(): PlayerPose | null {
  return pose?.() ?? null;
}
