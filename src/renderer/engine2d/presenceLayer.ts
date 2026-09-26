// Emote bubbles (rev 6 phase 3, D17), drawn by both looks over everyone else: over the other
// players of a shared world (their emote rides their presence) and over this player (their own,
// the moment they pick it). A bubble pops in, stays EMOTE_MS and fades. Only drawing lives here.

import type { Emote } from "@shared/worldProtocol";
import { type Camera, Vector3 } from "three";
import { HD2D_PALETTE, LAND_2D_PALETTE } from "../engine/palette";
import { EMOTE_MS, type EmoteBubble, ownEmote, type RemotePlayer } from "../engine/remoteRoster";

/** What each emote shows in its bubble (and on the wheel). */
export const EMOTE_GLYPH: Readonly<Record<Emote, string>> = {
  wave: "👋",
  bow: "🙇",
  cheer: "🎉",
  laugh: "😄",
  heart: "❤️",
  sit: "🪑",
};

const POP_MS = 160;
const FADE_MS = 450;

interface Bubble {
  x: number;
  z: number;
  bubble: EmoteBubble;
}

function bubbles(
  player: { x: number; z: number } | null,
  others: readonly RemotePlayer[] | undefined,
  now: number,
): Bubble[] {
  const out: Bubble[] = [];
  for (const other of others ?? []) {
    if (other.emote != null) out.push({ x: other.x, z: other.z, bubble: other.emote });
  }
  const own = ownEmote(now);
  if (own !== null && player !== null) out.push({ x: player.x, z: player.z, bubble: own });
  return out;
}

/** Scale (pop-in) and opacity (fade-out) of a bubble `age` ms old. */
function phase(age: number): { scale: number; alpha: number } {
  const scale = age < POP_MS ? 0.6 + 0.4 * (age / POP_MS) : 1;
  const left = EMOTE_MS - age;
  return { scale, alpha: left < FADE_MS ? Math.max(0, left / FADE_MS) : 1 };
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  bottom: number,
  size: number,
  glyph: string,
  colors: { surface: string; edge: string },
): void {
  const width = size * 1.35;
  const height = size;
  const left = cx - width / 2;
  const top = bottom - height - size * 0.22;
  ctx.fillStyle = colors.surface;
  ctx.strokeStyle = colors.edge;
  ctx.lineWidth = Math.max(1, size / 18);
  ctx.beginPath();
  ctx.roundRect(left, top, width, height, size * 0.28);
  ctx.moveTo(cx - size * 0.14, top + height);
  ctx.lineTo(cx, bottom);
  ctx.lineTo(cx + size * 0.14, top + height);
  ctx.fill();
  ctx.stroke();
  ctx.font = `${Math.round(size * 0.62)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colors.edge;
  ctx.fillText(glyph, cx, top + height / 2 + size * 0.03);
}

function paint(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  base: number,
  bubble: EmoteBubble,
  now: number,
  colors: { surface: string; edge: string },
): void {
  const { scale, alpha } = phase(now - bubble.at);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  drawBubble(ctx, at.x, at.y, base * scale, EMOTE_GLYPH[bubble.kind], colors);
  ctx.restore();
}

/** The 16-bit look: the grid is centred on the walker, figures stand one tile tall. */
export function drawPresencePixel(frame: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  tileSize: number;
  player: { x: number; z: number };
  others?: readonly RemotePlayer[];
  now: number;
}): void {
  const { ctx, width, height, tileSize, player, now } = frame;
  const left = player.x - width / tileSize / 2;
  const top = player.z - height / tileSize / 2;
  const colors = { surface: LAND_2D_PALETTE.markerSurface, edge: LAND_2D_PALETTE.remote };
  for (const { x, z, bubble } of bubbles(player, frame.others, now)) {
    const sx = (x - left) * tileSize;
    const sy = (z - top) * tileSize;
    if (sx < -tileSize || sy < -tileSize || sx > width + tileSize || sy > height + tileSize * 2) {
      continue;
    }
    // Over the head, and over the name plate above it, of a one-tile figure standing on (x, z).
    paint(ctx, { x: sx, y: sy - tileSize }, tileSize * 0.72, bubble, now, colors);
  }
}

const point = new Vector3();

/** The HD-2D look: on the overlay canvas above the lens, projected through the camera. */
export function drawPresenceHd2d(
  overlay: HTMLCanvasElement,
  camera: Camera,
  size: { width: number; height: number; ratio: number },
  frame: {
    player: { x: number; z: number } | null;
    others?: readonly RemotePlayer[];
    now: number;
  },
): void {
  const list = bubbles(frame.player, frame.others, frame.now);
  if (list.length === 0) return;
  const ctx = overlay.getContext("2d");
  if (ctx === null) return;
  ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
  const colors = { surface: HD2D_PALETTE.compassSurface, edge: HD2D_PALETTE.label };
  for (const { x, z, bubble } of list) {
    point.set(x, 2.75, z).project(camera);
    if (point.z > 1 || point.x < -1.1 || point.x > 1.1 || point.y < -1.1 || point.y > 1.1) continue;
    const at = { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height };
    paint(ctx, at, 30, bubble, frame.now, colors);
  }
}
