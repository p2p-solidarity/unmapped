// What the open-land loop draws onto: the 16-bit canvas or the HD-2D diorama. Movement, collision
// and targets stay in LandView2D; a surface only turns one frame of land state into pixels.

import type { ChunkStatus } from "@renderer/state";
import type { LandNote, LandProgress } from "@shared/land";
import type { LandPlace } from "@shared/places";
import type { SceneGraph } from "@shared/world";
import { createHd2dRenderer } from "../hd2d/renderer";
import { type Player2D, renderLandFrame, type SpriteAtlases } from "./canvasRenderer";
import type { StoryView } from "./storyLayer";
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
  now: number;
}

export interface LandSurface {
  draw(frame: SurfaceFrame): void;
  dispose(): void;
}

const TILE_SIZE = 48;

export function pixelSurface(
  canvas: HTMLCanvasElement,
  atlases: SpriteAtlases,
): LandSurface | null {
  const ctx = canvas.getContext("2d");
  if (ctx === null) return null;
  return {
    draw(frame) {
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
        focus: frame.player,
        player: frame.player,
        now: frame.now,
      });
    },
    dispose: () => renderer.dispose(),
  };
}
