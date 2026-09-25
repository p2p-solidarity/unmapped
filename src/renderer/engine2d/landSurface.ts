// What the open-land loop draws onto: the 16-bit canvas or the HD-2D diorama. Movement, collision
// and targets stay in LandView2D; a surface only turns one frame of land state into pixels.

import type { ChunkStatus } from "@renderer/state";
import type { TerritoryMap } from "@shared/continent";
import type { LandNote, LandProgress } from "@shared/land";
import type { LandPlace } from "@shared/places";
import type { SceneGraph } from "@shared/world";
import type { RemotePlayer } from "../engine/remoteRoster";
import { createHd2dRenderer } from "../hd2d/renderer";
import { type Player2D, renderLandFrame, type SpriteAtlases } from "./canvasRenderer";
import type { DayLight } from "./dayClock";
import type { StoryMarker, StoryView } from "./storyLayer";
import type { Foe, ShotTrace } from "./useLandCombat";

export interface SurfaceFrame {
  width: number;
  height: number;
  scene: SceneGraph;
  seed: number;
  player: Player2D;
  chunks: Readonly<Record<string, ChunkStatus>>;
  progress: LandProgress | null;
  notes: readonly LandNote[];
  story: StoryView | null;
  /** Living hostiles near the player, or null when the cartridge has no combat. */
  foes: readonly Foe[] | null;
  /** The last shot, drawn for a moment after it is fired. */
  shot: ShotTrace | null;
  places: readonly LandPlace[];
  /** The story chapter being played around its gate, in world tiles; null when there is none. */
  chapter: SceneGraph | null;
  /** Where a click sent the walker, or null. */
  goal: { x: number; z: number } | null;
  /** On a continent: whose ground each chunk is; null when not merged. */
  land: TerritoryMap | null;
  /** Other players on the continent, in this world's tiles. */
  others: readonly RemotePlayer[];
  /** Offset markers and doors of the continent's worlds. */
  continent: readonly StoryMarker[];
  light: DayLight;
  now: number;
}

export interface LandSurface {
  draw(frame: SurfaceFrame): void;
  /**
   * The land point under canvas position (x, y) in CSS pixels, as last drawn, at `height` tiles
   * above the ground (a click on someone's head lands behind their feet); null off the land.
   */
  pick(x: number, y: number, height?: number): { x: number; z: number } | null;
  dispose(): void;
}

const TILE_SIZE = 48;

export function pixelSurface(
  canvas: HTMLCanvasElement,
  atlases: SpriteAtlases,
): LandSurface | null {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;
  let last: { x: number; z: number; width: number; height: number } | null = null;
  return {
    draw(frame) {
      last = { x: frame.player.x, z: frame.player.z, width: frame.width, height: frame.height };
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(frame.width * ratio));
      const height = Math.max(1, Math.round(frame.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderLandFrame({ ...frame, ctx, tileSize: TILE_SIZE, atlases });
    },
    // The 16-bit view is a flat grid centred on the walker; what stands up is drawn northward.
    pick(x, y, height = 0) {
      if (last === null) return null;
      return {
        x: last.x + (x - last.width / 2) / TILE_SIZE,
        z: last.z + (y - last.height / 2) / TILE_SIZE + height,
      };
    },
    dispose() {},
  };
}

/** Throws when WebGL is unavailable; the caller reports it and falls back to the 16-bit view. */
export function hd2dSurface(
  canvas: HTMLCanvasElement,
  overlay: HTMLCanvasElement | null,
  atlases: SpriteAtlases,
): LandSurface {
  const renderer = createHd2dRenderer(canvas, overlay, atlases);
  return {
    draw(frame) {
      renderer.render({
        width: frame.width,
        height: frame.height,
        origin: frame.scene,
        seed: frame.seed,
        chunks: frame.chunks,
        progress: frame.progress,
        notes: frame.notes,
        story: frame.story,
        foes: frame.foes,
        shot: frame.shot,
        places: frame.places,
        chapter: frame.chapter,
        goal: frame.goal,
        land: frame.land,
        others: frame.others,
        continent: frame.continent,
        light: frame.light,
        focus: frame.player,
        player: frame.player,
        now: frame.now,
      });
    },
    pick: (x, y, height) => renderer.pick(x, y, height),
    dispose: () => renderer.dispose(),
  };
}
