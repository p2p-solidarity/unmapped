// A dungeon seen from above in the 16-bit look, like the land: its floor tiles, the maze walls as
// raised stone, the props, people, chests and foes standing on their tiles (drawn back to front),
// both ways out, the walker with its facing and the last shot — and the dark past the walker's light,
// as the grid kit carries a lamp. One frame of state; where anything stands is decided elsewhere.

import { PLACE_BACK, PLACE_GOAL } from "@shared/places";
import type { SceneGraph } from "@shared/world";
import { LAND_2D_PALETTE } from "../../engine/palette";
import { PLACE_2D_PALETTE } from "../../engine/palette/place2d";
import type { Facing4 } from "../../engine/playerProbe";
import { MONSTER_SPRITES, MONSTER_WIDTH, ROLE_SPRITES, ROLE_WIDTH } from "../actorSprites";
import { GROUND_ASSETS, PROP_ASSETS } from "../assetCatalog";
import type { SpriteAtlases } from "../canvasRenderer";
import {
  drawFigure,
  drawFoeLabel,
  drawMarker,
  drawShotLine,
  drawSprite,
  walkerSprite,
} from "./placeDraw";
import type { PlaceFoe, PlaceShot } from "./usePlaceCombat";

export interface DungeonFrame {
  ctx: CanvasRenderingContext2D;
  atlases: SpriteAtlases;
  width: number;
  height: number;
  graph: SceneGraph;
  player: { x: number; z: number; facing: Facing4; moving: boolean };
  opened: readonly string[];
  foes: readonly PlaceFoe[] | null;
  shot: PlaceShot | null;
  now: number;
}

interface View {
  left: number;
  top: number;
  tile: number;
}

/** Tiles of light around the walker: fully lit inside, dark past the outer edge. */
const LIGHT_INNER = 3.5;
const LIGHT_OUTER = 7.5;

function tileSizeFor(width: number, height: number): number {
  return Math.max(36, Math.min(72, Math.round(Math.min(width, height) / 12)));
}

function at(view: View, x: number, z: number): [number, number] {
  return [(x - view.left) * view.tile, (z - view.top) * view.tile];
}

interface Item {
  z: number;
  draw(): void;
}

function wallTiles(graph: SceneGraph): [number, number][] {
  const tiles: [number, number][] = [];
  for (const wall of graph.walls) {
    for (let run = 0; run < Math.max(1, Math.round(wall.width)); run += 1) {
      tiles.push([Math.round(wall.x) + run, Math.round(wall.z)]);
    }
  }
  return tiles;
}

function collect(frame: DungeonFrame, view: View): Item[] {
  const { ctx, atlases, graph } = frame;
  const items: Item[] = [];
  const span = { w: frame.width / view.tile, h: frame.height / view.tile };
  const near = (x: number, z: number): boolean =>
    x > view.left - 3 &&
    x < view.left + span.w + 3 &&
    z > view.top - 3 &&
    z < view.top + span.h + 3;
  for (const [x, z] of wallTiles(graph)) {
    if (!near(x, z)) continue;
    items.push({
      z: z + 0.5,
      draw: () => {
        const [dx, dy] = at(view, x, z);
        // Walls stand up out of the floor, rising northward: a lit stone top with a bright lip,
        // then a dark front face down to the floor. The floor is often stone too, so the wall's
        // shape — not its texture — is what tells a corridor from a wall.
        const rise = view.tile * 0.35;
        const top = dy - rise;
        drawSprite(ctx, atlases, GROUND_ASSETS.stone, dx, top, view.tile, view.tile);
        ctx.fillStyle = PLACE_2D_PALETTE.wallTop;
        ctx.fillRect(dx, top, view.tile, view.tile);
        ctx.fillStyle = PLACE_2D_PALETTE.wallFace;
        ctx.fillRect(dx, top + view.tile, view.tile, rise);
        ctx.fillStyle = PLACE_2D_PALETTE.wallEdge;
        ctx.fillRect(dx, top + view.tile - 2, view.tile, 2);
      },
    });
  }
  for (const prop of graph.props) {
    const asset = PROP_ASSETS[prop.kind];
    if (asset === undefined || !near(prop.x, prop.z)) continue;
    items.push({
      z: prop.z + 0.5,
      draw: () => {
        const [cx, cy] = at(view, prop.x + 0.5, prop.z + 0.5);
        const scale = Math.max(0.65, Math.min(prop.scale, 2.2));
        const width = view.tile * (asset.widthTiles ?? asset.sw / 16) * scale;
        const height = width * (asset.sh / asset.sw);
        drawSprite(ctx, atlases, asset, cx - width / 2, cy + view.tile / 2 - height, width, height);
      },
    });
  }
  for (const exit of graph.exits) {
    const goal = exit.to === PLACE_GOAL;
    items.push({
      z: exit.z + 0.5,
      draw: () => {
        const [cx, cy] = at(view, exit.x + 0.5, exit.z + 0.5);
        const color = goal ? PLACE_2D_PALETTE.exitGoal : PLACE_2D_PALETTE.exitBack;
        drawMarker(ctx, cx, cy, view.tile * 0.8, color, goal ? PLACE_GOAL : PLACE_BACK);
      },
    });
  }
  for (const treasure of graph.treasures) {
    const opened = frame.opened.includes(treasure.id);
    items.push({
      z: treasure.z + 0.5,
      draw: () => {
        const [cx, cy] = at(view, treasure.x + 0.5, treasure.z + 0.5);
        drawMarker(ctx, cx, cy, view.tile * 0.72, LAND_2D_PALETTE.treasure, "◇", opened);
      },
    });
  }
  for (const npc of graph.npcs) {
    items.push({
      z: npc.z + 0.5,
      draw: () => {
        const [cx, cy] = at(view, npc.x + 0.5, npc.z + 0.5);
        const size = view.tile * ROLE_WIDTH[npc.role];
        drawFigure(ctx, atlases, ROLE_SPRITES[npc.role], cx, cy + view.tile * 0.4, size);
      },
    });
  }
  if (frame.foes === null) {
    for (const monster of graph.monsters) {
      items.push({
        z: monster.z + 0.5,
        draw: () => {
          const [cx, cy] = at(view, monster.x + 0.5, monster.z + 0.5);
          const size = view.tile * MONSTER_WIDTH[monster.kind];
          drawFigure(ctx, atlases, MONSTER_SPRITES[monster.kind], cx, cy + view.tile * 0.4, size);
        },
      });
    }
  }
  for (const foe of frame.foes ?? []) {
    items.push({
      z: foe.z,
      draw: () => {
        const [cx, cy] = at(view, foe.x, foe.z);
        const size = view.tile * MONSTER_WIDTH[foe.kind];
        const foot = cy + view.tile * 0.4;
        drawFigure(ctx, atlases, MONSTER_SPRITES[foe.kind], cx, foot, size);
        drawFoeLabel(ctx, foe, cx, foot - size * 0.9, view.tile);
      },
    });
  }
  const { player } = frame;
  items.push({
    z: player.z,
    draw: () => {
      const [cx, cy] = at(view, player.x, player.z);
      const sprite = walkerSprite(player.facing, player.moving, frame.now);
      drawFigure(ctx, atlases, sprite, cx, cy + view.tile / 2, view.tile);
    },
  });
  return items;
}

function drawDark(frame: DungeonFrame, view: View): void {
  const { ctx, width, height } = frame;
  const [cx, cy] = at(view, frame.player.x, frame.player.z);
  const light = ctx.createRadialGradient(
    cx,
    cy,
    view.tile * LIGHT_INNER,
    cx,
    cy,
    view.tile * LIGHT_OUTER,
  );
  light.addColorStop(0, PLACE_2D_PALETTE.lit);
  light.addColorStop(1, PLACE_2D_PALETTE.darkness);
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
}

/** Draws one frame; returns where the player's middle was drawn, in CSS pixels. */
export function renderDungeon(frame: DungeonFrame): [number, number] {
  const { ctx, atlases, graph, width, height } = frame;
  const tile = tileSizeFor(width, height);
  const view: View = {
    left: frame.player.x - width / tile / 2,
    top: frame.player.z - height / tile / 2,
    tile,
  };
  ctx.fillStyle = PLACE_2D_PALETTE.void;
  ctx.fillRect(0, 0, width, height);
  const floor = GROUND_ASSETS[graph.floor.tile];
  const x0 = Math.max(0, Math.floor(view.left) - 1);
  const z0 = Math.max(0, Math.floor(view.top) - 1);
  const x1 = Math.min(graph.floor.width - 1, Math.ceil(view.left + width / tile) + 1);
  const z1 = Math.min(graph.floor.depth - 1, Math.ceil(view.top + height / tile) + 1);
  for (let z = z0; z <= z1; z += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const [dx, dy] = at(view, x, z);
      drawSprite(ctx, atlases, floor, dx, dy, tile, tile);
    }
  }
  const [fx0, fz0] = at(view, x0, z0);
  const [fx1, fz1] = at(view, x1 + 1, z1 + 1);
  ctx.fillStyle = PLACE_2D_PALETTE.floorShade;
  ctx.fillRect(fx0, fz0, fx1 - fx0, fz1 - fz0);
  const items = collect(frame, view);
  items.sort((a, b) => a.z - b.z);
  for (const item of items) item.draw();
  const shot = frame.shot;
  if (shot !== null) {
    drawShotLine(
      ctx,
      at(view, shot.x0, shot.z0),
      at(view, shot.x1, shot.z1),
      shot.hit,
      frame.now - shot.at,
      tile,
    );
  }
  drawDark(frame, view);
  return at(view, frame.player.x, frame.player.z);
}
