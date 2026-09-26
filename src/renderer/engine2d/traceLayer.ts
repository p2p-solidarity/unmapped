// What the world's history leaves on the land, drawn the same by both looks (rev 6 phase 3, WP5):
// mist over the chunks the land store marks fogged (thick) or fading (thin), with a legend's name
// over a fogged one; signposts; and the gifts nobody has taken yet. The mist is a grid of soft
// puffs laid over the chunk's 32 × 32 tiles, so the 16-bit canvas and the HD-2D overlay put it in
// the same place and the same shape. Which chunks are in mist is the store's (the fold's beats,
// renderer/history), never worked out here: only drawing lives in this file.

import type { ChunkMarks } from "@renderer/history";
import { translateIn, useLanguageStore } from "@renderer/i18n";
import { useLandStore } from "@renderer/state";
import { fontStacks } from "@renderer/ui";
import { CHUNK_SIZE, chunkOf } from "@shared/chunks";
import type { Folded, GiftNow, SignpostBody, TileCoord } from "@shared/history/types";
import { useMemo } from "react";
import { type Camera, Vector3 } from "three";
import { MIST_PALETTE } from "../engine/palette/mist";

export interface MistPatch {
  cx: number;
  cz: number;
  /** Fogged (a beat returned it to fog); else fading toward it. */
  thick: boolean;
  /** The legend's name over a fogged chunk ("傳說 · …"), or null. */
  label: string | null;
}

export interface SignSpot {
  x: number;
  z: number;
  text: string;
  /** The centre of the chunk it points to, in tiles. */
  toward: { x: number; z: number } | null;
  pending: boolean;
}

export interface GiftSpot {
  x: number;
  z: number;
  pending: boolean;
}

export interface TraceFrame {
  mist: MistPatch[];
  signs: SignSpot[];
  gifts: GiftSpot[];
}

export const NO_TRACES: TraceFrame = { mist: [], signs: [], gifts: [] };

const centreOf = (coord: TileCoord) => ({
  x: coord.cx * CHUNK_SIZE + coord.x + 0.5,
  z: coord.cz * CHUNK_SIZE + coord.z + 0.5,
});

/** The land store's marks, signposts and gifts as the layer draws them. */
export function traceFrameOf(
  marks: Readonly<Record<string, ChunkMarks>>,
  signposts: readonly Folded<SignpostBody>[],
  gifts: readonly GiftNow[],
  legend: (name: string) => string,
): TraceFrame {
  const mist: MistPatch[] = [];
  for (const [key, mark] of Object.entries(marks)) {
    if (!mark.fogged && !mark.fading) continue;
    const [cx = 0, cz = 0] = key.split(",").map(Number);
    const name = mark.fogged && !mark.hidden ? (mark.live?.name ?? null) : null;
    mist.push({ cx, cz, thick: mark.fogged, label: name === null ? null : legend(name) });
  }
  return {
    mist,
    signs: signposts.map((sign) => ({
      ...centreOf(sign.body.coord),
      text: sign.body.text,
      toward:
        sign.body.toward === null
          ? null
          : {
              x: sign.body.toward.cx * CHUNK_SIZE + CHUNK_SIZE / 2,
              z: sign.body.toward.cz * CHUNK_SIZE + CHUNK_SIZE / 2,
            },
      pending: sign.pending,
    })),
    gifts: gifts
      .filter((gift) => gift.taken === null)
      .map((gift) => ({ ...centreOf(gift.body.coord), pending: gift.pending })),
  };
}

/** The frame's traces, rebuilt only when the land store's history view (or the language) moves. */
export function useTraceFrame(): TraceFrame {
  const marks = useLandStore((state) => state.marks);
  const signposts = useLandStore((state) => state.signposts);
  const gifts = useLandStore((state) => state.gifts);
  const language = useLanguageStore((state) => state.language);
  return useMemo(() => {
    const legend = (name: string) => translateIn(language, "traces.legend", { name });
    const frame = traceFrameOf(marks, signposts, gifts, legend);
    return frame.mist.length + frame.signs.length + frame.gifts.length === 0 ? NO_TRACES : frame;
  }, [marks, signposts, gifts, language]);
}

// ── Mist ──────────────────────────────────────────────────────────────────────────────────────

const PUFFS = 8;
const PUFF_STEP = CHUNK_SIZE / PUFFS;
/** Tiles from a puff's centre to where it has faded out. */
const PUFF_RADIUS = 3.8;
let puffSprite: HTMLCanvasElement | null = null;

function puff(): HTMLCanvasElement {
  if (puffSprite !== null) return puffSprite;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, MIST_PALETTE.puff);
    gradient.addColorStop(0.55, MIST_PALETTE.puff);
    gradient.addColorStop(1, MIST_PALETTE.puffClear);
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  }
  puffSprite = canvas;
  return canvas;
}

interface Puff {
  x: number;
  z: number;
  alpha: number;
}

/** One patch's puffs, overwritten in place every call: the draw loops read them at once. */
const PUFF_SCRATCH: Puff[] = Array.from({ length: PUFFS * PUFFS }, () => ({
  x: 0,
  z: 0,
  alpha: 0,
}));

/**
 * The puffs of one patch, drifting slowly; the rim is fainter so the edge is soft. Returns the
 * shared scratch (no allocation per frame), valid until the next call.
 */
function puffsOf(patch: MistPatch, now: number): readonly Puff[] {
  const peak = patch.thick ? MIST_PALETTE.thickAlpha : MIST_PALETTE.thinAlpha;
  const drift = now / 2600;
  for (let i = 0; i < PUFFS; i += 1) {
    for (let j = 0; j < PUFFS; j += 1) {
      const rim = i === 0 || j === 0 || i === PUFFS - 1 || j === PUFFS - 1;
      const breathe = 0.85 + 0.15 * Math.sin(drift * 1.4 + i * 0.9 + j * 1.3);
      const one = PUFF_SCRATCH[i * PUFFS + j] as Puff;
      one.x =
        patch.cx * CHUNK_SIZE + PUFF_STEP * (i + 0.5) + Math.sin(drift + i * 1.7 + j * 0.6) * 0.7;
      one.z = patch.cz * CHUNK_SIZE + PUFF_STEP * (j + 0.5) + Math.cos(drift * 0.8 + j * 1.3) * 0.7;
      one.alpha = peak * (rim ? 0.6 : 1) * breathe;
    }
  }
  return PUFF_SCRATCH;
}

/** Patches whose chunk lies within `reach` chunks of (x, z): the only ones that can be on screen. */
function patchesNear(frame: TraceFrame, x: number, z: number, reach: number): MistPatch[] {
  const at = chunkOf(x, z);
  return frame.mist.filter(
    (patch) => Math.abs(patch.cx - at.cx) <= reach && Math.abs(patch.cz - at.cz) <= reach,
  );
}

function labelFont(size: number): string {
  return `600 ${Math.round(size)}px ${fontStacks(useLanguageStore.getState().language).family}`;
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  colors: { fill: string; shadow: string },
): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.font = labelFont(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = colors.shadow;
  ctx.shadowBlur = 6;
  ctx.fillStyle = colors.fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ── Signposts and gifts (the same figure in both looks, `tile` pixels to a tile) ──────────────

/** A post with a board; `angle` (screen radians) turns the arrow on it, `text` floats above. */
function drawSignpost(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  tile: number,
  look: { pending: boolean; angle: number | null; text: string | null },
): void {
  const post = Math.max(2, tile * 0.1);
  const boardW = tile * 0.78;
  const boardH = tile * 0.3;
  const boardTop = base - tile * 0.86;
  ctx.save();
  ctx.fillStyle = MIST_PALETTE.signpostPost;
  ctx.fillRect(x - post / 2, boardTop, post, base - boardTop);
  ctx.fillStyle = MIST_PALETTE.signpostBoard;
  ctx.strokeStyle = look.pending ? MIST_PALETTE.pendingEdge : MIST_PALETTE.signpostEdge;
  ctx.lineWidth = Math.max(1, tile / 24);
  if (look.pending) ctx.setLineDash([Math.max(2, tile / 12), Math.max(2, tile / 16)]);
  ctx.fillRect(x - boardW / 2, boardTop, boardW, boardH);
  ctx.strokeRect(x - boardW / 2, boardTop, boardW, boardH);
  ctx.setLineDash([]);
  if (look.angle !== null) arrow(ctx, x, boardTop + boardH / 2, boardH * 0.8, look.angle);
  ctx.restore();
  if (look.text !== null) {
    const colors = { fill: MIST_PALETTE.label, shadow: MIST_PALETTE.labelShadow };
    drawLabel(ctx, look.text, x, boardTop - tile * 0.22, Math.max(11, tile * 0.28), colors);
  }
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = MIST_PALETTE.signpostInk;
  ctx.fillStyle = MIST_PALETTE.signpostInk;
  ctx.lineWidth = Math.max(1, size / 6);
  ctx.beginPath();
  ctx.moveTo(-size * 0.8, 0);
  ctx.lineTo(size * 0.35, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size * 0.8, 0);
  ctx.lineTo(size * 0.3, -size * 0.35);
  ctx.lineTo(size * 0.3, size * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGift(
  ctx: CanvasRenderingContext2D,
  x: number,
  base: number,
  tile: number,
  gift: GiftSpot,
  now: number,
): void {
  const size = tile * 0.46;
  const bob = Math.sin(now / 420 + x) * tile * 0.03;
  const top = base - size - tile * 0.06 + bob;
  ctx.save();
  ctx.globalAlpha = gift.pending ? 0.7 : 1;
  ctx.fillStyle = MIST_PALETTE.giftShadow;
  ctx.beginPath();
  ctx.ellipse(x, base, size * 0.55, size * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = MIST_PALETTE.giftBox;
  ctx.fillRect(x - size / 2, top + size * 0.25, size, size * 0.75);
  ctx.fillStyle = MIST_PALETTE.giftLid;
  ctx.fillRect(x - size * 0.56, top + size * 0.12, size * 1.12, size * 0.22);
  ctx.fillStyle = MIST_PALETTE.giftRibbon;
  ctx.fillRect(x - size * 0.08, top + size * 0.12, size * 0.16, size * 0.88);
  ctx.beginPath();
  ctx.ellipse(x - size * 0.16, top + size * 0.06, size * 0.16, size * 0.1, -0.5, 0, Math.PI * 2);
  ctx.ellipse(x + size * 0.16, top + size * 0.06, size * 0.16, size * 0.1, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Signpost words show only near the walker, so a busy crossroads stays readable. */
const LABEL_REACH = 7;

// ── The 16-bit look ───────────────────────────────────────────────────────────────────────────

interface PixelFrame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  tileSize: number;
  player: { x: number; z: number };
  traces?: TraceFrame;
  now: number;
}

/** Signposts and gifts as figures that sort with everything else standing on the land. */
export function traceItemsPixel(frame: PixelFrame): { z: number; draw(): void }[] {
  const traces = frame.traces;
  if (traces === undefined || (traces.signs.length === 0 && traces.gifts.length === 0)) return [];
  const { ctx, width, height, tileSize, player } = frame;
  const left = player.x - width / tileSize / 2;
  const top = player.z - height / tileSize / 2;
  const onScreen = (x: number, z: number): [number, number] | null => {
    const sx = (x - left) * tileSize;
    const sy = (z - top) * tileSize;
    return sx < -tileSize * 3 ||
      sy < -tileSize ||
      sx > width + tileSize * 3 ||
      sy > height + tileSize
      ? null
      : [sx, sy];
  };
  const items: { z: number; draw(): void }[] = [];
  for (const sign of traces.signs) {
    const at = onScreen(sign.x, sign.z);
    if (at === null) continue;
    const near = Math.abs(sign.x - player.x) + Math.abs(sign.z - player.z) <= LABEL_REACH;
    // Seen from above, the way to its target on screen is the way on the ground.
    const angle =
      sign.toward === null ? null : Math.atan2(sign.toward.z - sign.z, sign.toward.x - sign.x);
    const look = { pending: sign.pending, angle, text: near ? sign.text : null };
    items.push({
      z: sign.z,
      draw: () => drawSignpost(ctx, at[0], at[1] + tileSize * 0.4, tileSize, look),
    });
  }
  for (const gift of traces.gifts) {
    const at = onScreen(gift.x, gift.z);
    if (at === null) continue;
    items.push({
      z: gift.z,
      draw: () => drawGift(ctx, at[0], at[1] + tileSize * 0.4, tileSize, gift, frame.now),
    });
  }
  return items;
}

/** The mist, over everything standing in it, and each legend's name. */
export function drawMistPixel(frame: PixelFrame): void {
  const traces = frame.traces;
  if (traces === undefined || traces.mist.length === 0) return;
  const { ctx, width, height, tileSize, player, now } = frame;
  const left = player.x - width / tileSize / 2;
  const top = player.z - height / tileSize / 2;
  const radius = PUFF_RADIUS * tileSize;
  const sprite = puff();
  const reach = Math.ceil(Math.max(width, height) / tileSize / CHUNK_SIZE / 2) + 1;
  const patches = patchesNear(traces, player.x, player.z, reach);
  ctx.save();
  for (const patch of patches) {
    for (const one of puffsOf(patch, now)) {
      const sx = (one.x - left) * tileSize;
      const sy = (one.z - top) * tileSize;
      if (sx < -radius || sy < -radius || sx > width + radius || sy > height + radius) continue;
      ctx.globalAlpha = one.alpha;
      ctx.drawImage(sprite, sx - radius, sy - radius, radius * 2, radius * 2);
    }
  }
  ctx.restore();
  for (const patch of patches) {
    if (patch.label === null) continue;
    const sx = (patch.cx * CHUNK_SIZE + CHUNK_SIZE / 2 - left) * tileSize;
    const sy = (patch.cz * CHUNK_SIZE + CHUNK_SIZE / 2 - top) * tileSize;
    if (sx < -width || sy < -height || sx > width * 2 || sy > height * 2) continue;
    const colors = { fill: MIST_PALETTE.legend, shadow: MIST_PALETTE.legendShadow };
    drawLabel(ctx, patch.label, sx, sy, Math.max(14, tileSize * 0.42), colors);
  }
}

// ── The HD-2D look: on the overlay canvas, projected through the camera ───────────────────────

/** The part of the land the HD-2D camera shows around its focus (its chunk reach, in tiles). */
const WINDOW = { side: 34, north: 34, south: 16 };
const point = new Vector3();

function project(
  camera: Camera,
  x: number,
  y: number,
  z: number,
  size: { width: number; height: number },
) {
  point.set(x, y, z).project(camera);
  if (point.z > 1) return null;
  return { x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height };
}

export function drawTracesHd2d(
  overlay: HTMLCanvasElement,
  camera: Camera,
  size: { width: number; height: number; ratio: number },
  frame: { focus: { x: number; z: number }; traces?: TraceFrame; now: number },
): void {
  const traces = frame.traces;
  if (traces === undefined || traces === NO_TRACES) return;
  if (traces.mist.length + traces.signs.length + traces.gifts.length === 0) return;
  const ctx = overlay.getContext("2d");
  if (ctx === null) return;
  ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
  const { focus, now } = frame;
  const inWindow = (x: number, z: number, margin = 0): boolean =>
    x >= focus.x - WINDOW.side - margin &&
    x <= focus.x + WINDOW.side + margin &&
    z >= focus.z - WINDOW.north - margin &&
    z <= focus.z + WINDOW.south;
  const sprite = puff();
  const patches = patchesNear(traces, focus.x, focus.z, 2);
  for (const patch of patches) {
    for (const one of puffsOf(patch, now)) {
      if (!inWindow(one.x, one.z, PUFF_RADIUS)) continue;
      const centre = project(camera, one.x, 0.5, one.z, size);
      const rim = project(camera, one.x + PUFF_RADIUS, 0.5, one.z, size);
      if (centre === null || rim === null) continue;
      const radius = Math.hypot(rim.x - centre.x, rim.y - centre.y);
      ctx.globalAlpha = one.alpha;
      ctx.drawImage(sprite, centre.x - radius, centre.y - radius, radius * 2, radius * 2);
    }
  }
  ctx.globalAlpha = 1;
  for (const patch of patches) {
    if (patch.label === null) continue;
    const x = patch.cx * CHUNK_SIZE + CHUNK_SIZE / 2;
    const z = patch.cz * CHUNK_SIZE + CHUNK_SIZE / 2;
    if (!inWindow(x, z)) continue;
    const at = project(camera, x, 1.4, z, size);
    const colors = { fill: MIST_PALETTE.legend, shadow: MIST_PALETTE.legendShadow };
    if (at !== null) drawLabel(ctx, patch.label, at.x, at.y, 17, colors);
  }
  // Far first, so a nearer figure is drawn over one behind it.
  const figures = [
    ...traces.signs.map((sign) => ({ z: sign.z, sign, gift: null })),
    ...traces.gifts.map((gift) => ({ z: gift.z, sign: null, gift })),
  ].sort((a, b) => a.z - b.z);
  for (const figure of figures) {
    const spot = figure.sign ?? figure.gift;
    if (spot === null || !inWindow(spot.x, spot.z)) continue;
    const base = project(camera, spot.x, 0.05, spot.z, size);
    const up = project(camera, spot.x, 1.05, spot.z, size);
    if (base === null || up === null) continue;
    const tile = Math.max(8, base.y - up.y);
    if (figure.gift !== null) {
      drawGift(ctx, base.x, base.y, tile, figure.gift, now);
      continue;
    }
    const sign = figure.sign;
    if (sign === null) continue;
    const near = Math.abs(sign.x - focus.x) + Math.abs(sign.z - focus.z) <= LABEL_REACH;
    // The arrow points along the ground toward the target: one tile that way, through the lens.
    const way = sign.toward === null ? null : stepToward(sign, sign.toward);
    const ahead = way === null ? null : project(camera, way.x, 0.05, way.z, size);
    const angle = ahead === null ? null : Math.atan2(ahead.y - base.y, ahead.x - base.x);
    drawSignpost(ctx, base.x, base.y, tile, {
      pending: sign.pending,
      angle,
      text: near ? sign.text : null,
    });
  }
}

/** One tile from `from` toward `to` (null when they are the same spot). */
function stepToward(from: { x: number; z: number }, to: { x: number; z: number }) {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz);
  return length < 0.01 ? null : { x: from.x + dx / length, z: from.z + dz / length };
}
