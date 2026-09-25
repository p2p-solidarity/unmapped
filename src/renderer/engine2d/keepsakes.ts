// Keepsakes on the shelf at home (plan.md §7): what the player set there from the door, one per
// pedestal along the row north of where they wake (`shelfPosition`), each under its name. Every
// other pedestal stands one step further back, so neighbouring names never run into each other.
// The same spots feed the 16-bit land (here) and the HD-2D land (hd2d/keepsakes.ts).

import type { LandProgress } from "@shared/land";
import type { SceneGraph } from "@shared/world";
import { shelfPosition } from "../engine/home";
import { LAND_2D_PALETTE } from "../engine/palette";

/** How far back (north) every other pedestal stands, in tiles. */
const BACK_ROW = 0.7;
/** Longest name a pedestal shows; a longer one ends in an ellipsis. */
const LABEL_CHARS = 8;

export interface KeepsakeSpot {
  key: string;
  x: number;
  z: number;
  label: string;
}

function label(name: string): string {
  const chars = [...name.trim()];
  if (chars.length <= LABEL_CHARS) return chars.join("");
  return `${chars.slice(0, LABEL_CHARS - 1).join("")}…`;
}

/** Where each keepsake on the shelf stands, in world tiles; none without a home. */
export function keepsakeSpots(
  origin: SceneGraph,
  progress: Pick<LandProgress, "home"> | null,
): KeepsakeSpot[] {
  if (progress === null) return [];
  return progress.home.keepsakes.map((item, index) => {
    const [x, z] = shelfPosition(origin, progress.home, index);
    return {
      key: `keepsake:${index}:${item.id}`,
      x,
      z: z - (index % 2 === 1 ? BACK_ROW : 0),
      label: label(item.name),
    };
  });
}

interface ShelfFrame {
  ctx: CanvasRenderingContext2D;
  scene: SceneGraph;
  progress: LandProgress | null;
}

interface ShelfView {
  left: number;
  top: number;
  tileSize: number;
  width: number;
  height: number;
}

/** The 16-bit shelf: a wooden pedestal per keepsake, the keepsake on it and its name above. */
export function keepsakeItems(frame: ShelfFrame, view: ShelfView): { z: number; draw(): void }[] {
  const tiles = { x: view.width / view.tileSize, z: view.height / view.tileSize };
  return keepsakeSpots(frame.scene, frame.progress)
    .filter(
      (spot) =>
        spot.x >= view.left - 2 &&
        spot.z >= view.top - 2 &&
        spot.x <= view.left + tiles.x + 2 &&
        spot.z <= view.top + tiles.z + 2,
    )
    .map((spot) => ({
      z: spot.z,
      draw: () => {
        const { ctx } = frame;
        const size = view.tileSize;
        const cx = (spot.x - view.left) * size;
        const cy = (spot.z - view.top) * size;
        const width = size * 0.56;
        const tall = size * 0.34;
        ctx.fillStyle = LAND_2D_PALETTE.door;
        ctx.fillRect(cx - width / 2, cy + size * 0.1, width, tall);
        ctx.strokeStyle = LAND_2D_PALETTE.markerSurface;
        ctx.lineWidth = Math.max(1, size / 16);
        ctx.strokeRect(cx - width / 2, cy + size * 0.1, width, tall);
        ctx.fillStyle = LAND_2D_PALETTE.treasure;
        ctx.font = `${Math.round(size * 0.46)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✦", cx, cy - size * 0.08);
        ctx.fillStyle = LAND_2D_PALETTE.note;
        ctx.font = `${Math.round(size * 0.28)}px sans-serif`;
        ctx.fillText(spot.label, cx, cy - size * 0.55);
      },
    }));
}
