// The story on the 2D land: a gate per episode (open, locked or cleared), the interaction target
// for each open gate, and a compass at the screen edge pointing to the next episode.

import {
  type EpisodeProgress,
  episodeGate,
  episodeTarget,
  episodeUnlocked,
  nextEpisode,
  type StoryEpisode,
} from "@shared/story";
import { LAND_2D_PALETTE } from "../engine/palette";
import type { TargetPoint } from "../engine/targets";

export interface StoryView {
  /** The whole story as it stands (`storyEpisodes`): authored episodes, then the land's chapters. */
  episodes: readonly StoryEpisode[];
  progress: Readonly<Record<string, EpisodeProgress>>;
}

export interface StoryMarker {
  x: number;
  z: number;
  color: string;
  glyph: string;
  label: string;
}

export function storyMarkers(story: StoryView): StoryMarker[] {
  return story.episodes.map((episode, index) => {
    const { x, z } = episodeGate(episode);
    const cleared = story.progress[episode.id]?.cleared === true;
    const open = episodeUnlocked(story.episodes, story.progress, episode.id);
    return {
      x,
      z,
      color: cleared
        ? LAND_2D_PALETTE.episodeCleared
        : open
          ? LAND_2D_PALETTE.episodeOpen
          : LAND_2D_PALETTE.episodeLocked,
      glyph: cleared ? "✓" : open ? `${index + 1}` : "·",
      label: open || cleared ? episode.title : "",
    };
  });
}

/** Every gate can be approached; a locked one explains itself when opened. */
export function storyTargets(story: StoryView): TargetPoint[] {
  return story.episodes.map((episode) => {
    const { x, z } = episodeGate(episode);
    return {
      kind: "episode",
      id: episodeTarget(episode.id),
      label: episode.title,
      x,
      z,
      reach: 0.8,
    };
  });
}

/** Arrow and label toward the next episode, drawn only while its gate is off screen. */
export function drawStoryCompass(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tileSize: number,
  player: { x: number; z: number },
  story: StoryView,
): void {
  const next = nextEpisode(story.episodes, story.progress);
  if (next === null) return;
  const gate = episodeGate(next);
  const dx = (gate.x - player.x) * tileSize;
  const dz = (gate.z - player.z) * tileSize;
  if (Math.abs(dx) < width / 2 - tileSize && Math.abs(dz) < height / 2 - tileSize) return;
  const angle = Math.atan2(dz, dx);
  const margin = 56;
  const rx = width / 2 - margin;
  const rz = height / 2 - margin;
  const scale = Math.min(
    rx / Math.abs(Math.cos(angle) || 1e-6),
    rz / Math.abs(Math.sin(angle) || 1e-6),
  );
  const cx = width / 2 + Math.cos(angle) * scale;
  const cy = height / 2 + Math.sin(angle) * scale;
  const tiles = Math.round(Math.hypot(gate.x - player.x, gate.z - player.z));
  const label = `${next.title} · ${tiles}`;
  ctx.save();
  ctx.font = "14px sans-serif";
  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = LAND_2D_PALETTE.compassSurface;
  ctx.fillRect(cx - textWidth / 2 - 10, cy + 14, textWidth + 20, 22);
  ctx.fillStyle = LAND_2D_PALETTE.episodeOpen;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, cy + 25);
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-8, -9);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
