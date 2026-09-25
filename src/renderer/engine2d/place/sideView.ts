// A course seen from the side in the 16-bit look: the place's sky, its walking row of ground tiles,
// the ledges (platforms) as thin blocks on posts, the low walls as stone, everyone standing on the
// ground, both ways out, the player with a facing, the foes and the last shot. It draws one frame of
// state; where anything stands is decided by `placeMotion.ts` and the fight.

import { PLACE_BACK, PLACE_GOAL } from "@shared/places";
import type { SceneGraph } from "@shared/world";
import { BIOME_PALETTE, LAND_2D_PALETTE } from "../../engine/palette";
import { PLACE_2D_PALETTE } from "../../engine/palette/place2d";
import { MONSTER_SPRITES, MONSTER_WIDTH, ROLE_SPRITES, ROLE_WIDTH } from "../actorSprites";
import { GROUND_ASSETS, PROP_ASSETS } from "../assetCatalog";
import type { SpriteAtlases } from "../canvasRenderer";
import {
  drawDoor,
  drawFigure,
  drawFoeLabel,
  drawMarker,
  drawShotLine,
  drawSprite,
  drawSpriteTop,
  drawVignette,
  walkerSprite,
} from "./placeDraw";
import type { SideBody, SideCourse } from "./placeMotion";
import type { PlaceFoe, PlaceShot } from "./usePlaceCombat";

export interface SideFrame {
  ctx: CanvasRenderingContext2D;
  atlases: SpriteAtlases;
  width: number;
  height: number;
  graph: SceneGraph;
  course: SideCourse;
  body: SideBody;
  opened: readonly string[];
  foes: readonly PlaceFoe[] | null;
  shot: PlaceShot | null;
  now: number;
}

interface Camera {
  left: number;
  groundY: number;
  tile: number;
}

/** About nine tiles of height on screen, whatever the window: the course reads the same everywhere. */
function tileSizeFor(height: number): number {
  return Math.max(36, Math.min(96, Math.round(height / 8.5)));
}

function camera(frame: SideFrame): Camera {
  const tile = tileSizeFor(frame.height);
  const span = frame.width / tile;
  const { minX, maxX } = frame.course;
  const wanted = frame.body.x - span / 2;
  // Keep the course's ends on screen edges rather than empty space, unless it is narrower than it.
  const left =
    maxX - minX + 2 <= span
      ? (minX + maxX) / 2 - span / 2
      : Math.min(maxX + 1 - span, Math.max(minX - 1, wanted));
  // Climb with the player once they are high on the ledges.
  const lift = Math.max(0, (frame.body.y + 2.4) * tile - frame.height * 0.62);
  return { left, groundY: frame.height * 0.72 + lift, tile };
}

function at(view: Camera, x: number, y: number): [number, number] {
  return [(x - view.left) * view.tile, view.groundY - y * view.tile];
}

function drawSky(frame: SideFrame, view: Camera): void {
  const { ctx, width, height, graph } = frame;
  const biome = BIOME_PALETTE[graph.biome];
  const top = graph.sky?.color ?? biome.sky;
  const bottom = graph.sky?.fog ?? biome.fog;
  const gradient = ctx.createLinearGradient(0, 0, 0, view.groundY);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, Math.min(height, view.groundY));
  // A far band behind the course, so the row does not float in open air.
  const band = ctx.createLinearGradient(0, view.groundY - view.tile * 3.2, 0, view.groundY);
  band.addColorStop(0, LAND_2D_PALETTE.vignetteClear);
  band.addColorStop(1, PLACE_2D_PALETTE.farBand);
  ctx.fillStyle = band;
  ctx.fillRect(0, view.groundY - view.tile * 3.2, width, view.tile * 3.2);
}

function drawGround(frame: SideFrame, view: Camera): void {
  const { ctx, atlases, graph, width, height } = frame;
  const asset = GROUND_ASSETS[graph.floor.tile];
  const first = Math.max(frame.course.minX, Math.floor(view.left) - 1);
  const last = Math.min(frame.course.maxX - 1, Math.ceil(view.left + width / view.tile) + 1);
  const rows = Math.ceil((height - view.groundY) / view.tile) + 1;
  for (let x = first; x <= last; x += 1) {
    const [dx] = at(view, x, 0);
    for (let row = 0; row < rows; row += 1) {
      drawSprite(ctx, atlases, asset, dx, view.groundY + row * view.tile, view.tile, view.tile);
    }
  }
  // Only the top row is walked on; the rest is the earth under it.
  const [x0] = at(view, first, 0);
  const [x1] = at(view, last + 1, 0);
  ctx.fillStyle = PLACE_2D_PALETTE.underground;
  ctx.fillRect(x0, view.groundY + view.tile * 0.35, x1 - x0, height);
}

function drawLedges(frame: SideFrame, view: Camera): void {
  const { ctx, atlases } = frame;
  for (const ledge of frame.course.ledges) {
    const [x0, top] = at(view, ledge.x0, ledge.top);
    const [x1, bottom] = at(view, ledge.x1, ledge.bottom);
    if (x1 < 0 || x0 > frame.width) continue;
    const thick = Math.max(2, bottom - top);
    if (ledge.bottom > 0.3) {
      // A post down to the ground under a floating ledge.
      const post = Math.max(2, view.tile * 0.12);
      ctx.fillStyle = PLACE_2D_PALETTE.ledgePost;
      ctx.fillRect((x0 + x1) / 2 - post / 2, bottom, post, view.groundY - bottom);
    }
    const asset = GROUND_ASSETS[ledge.tile];
    const share = Math.min(1, Math.max(0.2, ledge.top - ledge.bottom));
    for (let x = x0; x < x1 - 0.5; x += view.tile) {
      drawSpriteTop(ctx, atlases, asset, share, x, top, Math.min(view.tile, x1 - x), thick);
    }
    ctx.fillStyle = PLACE_2D_PALETTE.ledgeLip;
    ctx.fillRect(x0, top, x1 - x0, Math.max(2, view.tile / 16));
  }
}

function drawBlocks(frame: SideFrame, view: Camera): void {
  const { ctx, atlases } = frame;
  for (const block of frame.course.blocks) {
    const [x0, top] = at(view, block.x0, block.top);
    const [x1] = at(view, block.x1, 0);
    if (x1 < 0 || x0 > frame.width) continue;
    // Stone courses from the ground up; the highest one only as tall as the wall is.
    for (let course = 0; course < Math.ceil(block.top - 1e-6); course += 1) {
      const share = Math.min(1, block.top - course);
      const [, y] = at(view, 0, course + share);
      for (let x = x0; x < x1 - 0.5; x += view.tile) {
        drawSpriteTop(ctx, atlases, GROUND_ASSETS.stone, share, x, y, view.tile, share * view.tile);
      }
    }
    ctx.fillStyle = PLACE_2D_PALETTE.wallShade;
    ctx.fillRect(x0, top, x1 - x0, view.groundY - top);
  }
}

function drawExits(frame: SideFrame, view: Camera): void {
  for (const exit of frame.graph.exits) {
    const [cx, foot] = at(view, exit.x + 0.5, 0);
    if (cx < -view.tile || cx > frame.width + view.tile) continue;
    const goal = exit.to === PLACE_GOAL;
    drawDoor(
      frame.ctx,
      cx,
      foot,
      view.tile,
      goal ? PLACE_2D_PALETTE.exitGoal : PLACE_2D_PALETTE.exitBack,
      goal ? PLACE_GOAL : PLACE_BACK,
    );
  }
}

function drawStanding(frame: SideFrame, view: Camera): void {
  const { ctx, atlases, graph } = frame;
  const visible = (x: number): boolean => {
    const [cx] = at(view, x, 0);
    return cx > -view.tile * 2 && cx < frame.width + view.tile * 2;
  };
  for (const prop of graph.props) {
    const asset = PROP_ASSETS[prop.kind];
    if (asset === undefined || !visible(prop.x + 0.5)) continue;
    const [cx, foot] = at(view, prop.x + 0.5, 0);
    const width = view.tile * (asset.widthTiles ?? asset.sw / 16);
    const height = width * (asset.sh / asset.sw);
    drawSprite(ctx, atlases, asset, cx - width / 2, foot - height, width, height);
  }
  for (const treasure of graph.treasures) {
    if (!visible(treasure.x + 0.5)) continue;
    const [cx, foot] = at(view, treasure.x + 0.5, 0);
    const size = view.tile * 0.72;
    const opened = frame.opened.includes(treasure.id);
    drawMarker(ctx, cx, foot - size / 2, size, LAND_2D_PALETTE.treasure, "◇", opened);
  }
  for (const npc of graph.npcs) {
    if (!visible(npc.x + 0.5)) continue;
    const [cx, foot] = at(view, npc.x + 0.5, 0);
    drawFigure(ctx, atlases, ROLE_SPRITES[npc.role], cx, foot, view.tile * ROLE_WIDTH[npc.role]);
  }
  if (frame.foes === null) {
    // No fight in this world: the monsters simply stand where they were written.
    for (const monster of graph.monsters) {
      if (!visible(monster.x + 0.5)) continue;
      const [cx, foot] = at(view, monster.x + 0.5, 0);
      const size = view.tile * MONSTER_WIDTH[monster.kind];
      drawFigure(ctx, atlases, MONSTER_SPRITES[monster.kind], cx, foot, size);
    }
    return;
  }
  for (const foe of frame.foes) {
    if (!visible(foe.x)) continue;
    const [cx, foot] = at(view, foe.x, 0);
    const size = view.tile * MONSTER_WIDTH[foe.kind];
    drawFigure(ctx, atlases, MONSTER_SPRITES[foe.kind], cx, foot, size);
    drawFoeLabel(ctx, foe, cx, foot - size * 0.9, view.tile);
  }
}

function drawPlayer(frame: SideFrame, view: Camera): void {
  const { body } = frame;
  const [cx, foot] = at(view, body.x, body.y);
  const stepping = body.moving && body.grounded;
  // Aloft, the walker holds a mid-stride frame instead of standing stiff.
  const sprite = walkerSprite(body.facing > 0 ? "east" : "west", stepping, frame.now);
  const pose = body.grounded ? sprite : { ...sprite, sy: 16 };
  drawFigure(frame.ctx, frame.atlases, pose, cx, foot, view.tile, body.grounded);
}

/** Draws one frame; returns where the player's middle was drawn, in CSS pixels. */
export function renderSide(frame: SideFrame): [number, number] {
  const { ctx, width, height } = frame;
  const view = camera(frame);
  ctx.fillStyle = PLACE_2D_PALETTE.void;
  ctx.fillRect(0, 0, width, height);
  drawSky(frame, view);
  drawGround(frame, view);
  drawExits(frame, view);
  drawLedges(frame, view);
  drawBlocks(frame, view);
  drawStanding(frame, view);
  drawPlayer(frame, view);
  const shot = frame.shot;
  if (shot !== null) {
    drawShotLine(
      ctx,
      at(view, shot.x0, shot.y0),
      at(view, shot.x1, shot.y1),
      shot.hit,
      frame.now - shot.at,
      view.tile,
    );
  }
  drawVignette(ctx, width, height);
  return at(view, frame.body.x, frame.body.y + 0.5);
}
