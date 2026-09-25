// Spatial navigation as a pure function over boxes: from the focused element's box, the best box in
// a direction. No DOM here, so focus.ts owns reading rectangles and this only does the geometry.

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type Direction = "up" | "down" | "left" | "right";

/** How much a sideways miss costs against distance ahead: rows first, then the nearest one. */
const SIDEWAYS = 2;
/** Centres closer than this along the direction are side by side, not ahead. */
const AHEAD = 2;

const centre = (box: Box): { x: number; y: number } => ({
  x: (box.left + box.right) / 2,
  y: (box.top + box.bottom) / 2,
});

/** Gap between two intervals (0 when they overlap). */
const gap = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.max(0, b0 - a1, a0 - b1);

/**
 * Index of the candidate to move to, or -1 when nothing lies that way. A candidate counts when its
 * centre is ahead of the current centre; the score is the distance ahead (edge to edge, 0 when they
 * overlap) plus the sideways gap weighted by SIDEWAYS, with the centre offset as the tie-break —
 * so "down" in a list is the next row, and "right" from a menu reaches the panel beside it.
 */
export function nextInDirection(
  from: Box,
  candidates: readonly Box[],
  direction: Direction,
): number {
  const origin = centre(from);
  let best = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  candidates.forEach((box, index) => {
    const point = centre(box);
    const vertical = direction === "up" || direction === "down";
    const along =
      direction === "down"
        ? point.y - origin.y
        : direction === "up"
          ? origin.y - point.y
          : direction === "right"
            ? point.x - origin.x
            : origin.x - point.x;
    if (along <= AHEAD) return;
    const ahead =
      direction === "down"
        ? box.top - from.bottom
        : direction === "up"
          ? from.top - box.bottom
          : direction === "right"
            ? box.left - from.right
            : from.left - box.right;
    const sideways = vertical
      ? gap(from.left, from.right, box.left, box.right)
      : gap(from.top, from.bottom, box.top, box.bottom);
    const offset = vertical ? Math.abs(point.x - origin.x) : Math.abs(point.y - origin.y);
    const score = Math.max(0, ahead) + SIDEWAYS * sideways + offset / 100;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}
