// One 32 × 32 chunk of HD-2D ground: the floor tiles painted once into a pixel texture (worn
// variants and a soft light/shade wash so a meadow does not read as one stamp) laid over tiles at
// their surface height — rocky ground as plateaus, liquids and the void in basins — with a cliff
// or earth bank wherever a tile stands above its neighbour.

import { CHUNK_SIZE, type ChunkCoord } from "@shared/chunks";
import type { Tile } from "@shared/world";
import * as THREE from "three";
import { HD2D_PALETTE } from "../engine/palette";
import type { SpriteAtlases } from "../engine2d/canvasRenderer";
import { GROUND_LOOK, type SheetRect, SUNKEN, TILE_HEIGHT, tileHash } from "./assets";

const TEXELS = 16;
const WORN_SHARE = 0.1;
/** Lattice spacing (tiles) of the soft light/shade wash laid over the floor. */
const WASH_STEP = 4;

export interface GroundMaterials {
  sunken: Partial<Record<Tile, THREE.Material>>;
  /** Vertex-coloured cliffs and banks. */
  bank: THREE.Material;
  /** Called on each chunk's own floor material (it carries that chunk's painted texture). */
  decorateFloor(material: THREE.Material): void;
}

export interface GroundChunk {
  group: THREE.Group;
  dispose(): void;
}

export type TileAt = (wx: number, wz: number) => Tile;

export function buildGroundChunk(
  coord: ChunkCoord,
  tileAt: TileAt,
  atlases: SpriteAtlases,
  materials: GroundMaterials,
): GroundChunk {
  const ox = coord.cx * CHUNK_SIZE;
  const oz = coord.cz * CHUNK_SIZE;
  const tiles: Tile[] = [];
  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) tiles.push(tileAt(ox + x, oz + z));
  }
  const group = new THREE.Group();
  group.name = `ground ${coord.cx},${coord.cz}`;
  const owned: Array<{ dispose(): void }> = [];

  const texture = paintFloor(tiles, ox, oz, atlases);
  const floorMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    color: HD2D_PALETTE.groundTint,
    roughness: 0.94,
    metalness: 0,
  });
  materials.decorateFloor(floorMaterial);
  owned.push(texture, floorMaterial);
  const floorGeometry = topGeometry(tiles, ox, oz);
  if (floorGeometry !== null) {
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.receiveShadow = true;
    floor.castShadow = true;
    group.add(floor);
    owned.push(floorGeometry);
  }

  for (const kind of SUNKEN) {
    const material = materials.sunken[kind];
    if (material === undefined) continue;
    const geometry = basinGeometry(tiles, kind, ox, oz, TILE_HEIGHT[kind]);
    if (geometry === null) continue;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = kind !== "void";
    group.add(mesh);
    owned.push(geometry);
  }

  const banks = cliffGeometry(tiles, ox, oz, tileAt);
  if (banks !== null) {
    const mesh = new THREE.Mesh(banks, materials.bank);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
    owned.push(banks);
  }

  return {
    group,
    dispose: () => {
      for (const item of owned) item.dispose();
    },
  };
}

function paintFloor(
  tiles: readonly Tile[],
  ox: number,
  oz: number,
  atlases: SpriteAtlases,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CHUNK_SIZE * TEXELS;
  canvas.height = CHUNK_SIZE * TEXELS;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.imageSmoothingEnabled = false;
    for (let z = 0; z < CHUNK_SIZE; z += 1) {
      for (let x = 0; x < CHUNK_SIZE; x += 1) {
        const tile = tiles[z * CHUNK_SIZE + x] ?? "grass";
        if (SUNKEN.has(tile)) continue;
        const look = GROUND_LOOK[tile];
        const roll = tileHash(ox + x, oz + z, 3);
        const rect: SheetRect =
          roll < WORN_SHARE && look.worn.length > 0
            ? (look.worn[Math.floor((roll / WORN_SHARE) * look.worn.length)] ?? look.plain)
            : look.plain;
        const dx = x * TEXELS;
        const dy = z * TEXELS;
        ctx.drawImage(atlases[rect.atlas], rect.sx, rect.sy, rect.sw, rect.sh, dx, dy, 16, 16);
      }
    }
    paintWash(ctx, ox, oz, 11, HD2D_PALETTE.tileShade);
    paintWash(ctx, ox, oz, 29, HD2D_PALETTE.tileLight);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  return texture;
}

/**
 * A soft wash of one colour whose strength follows smooth world-space noise: samples every
 * WASH_STEP tiles, scaled up with smoothing, so lusher and drier patches drift across chunk
 * borders instead of switching per tile.
 */
function paintWash(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oz: number,
  salt: number,
  color: string,
): void {
  const samples = CHUNK_SIZE / WASH_STEP + 1;
  const wash = document.createElement("canvas");
  wash.width = samples;
  wash.height = samples;
  const washCtx = wash.getContext("2d");
  if (washCtx === null) return;
  washCtx.fillStyle = color;
  for (let j = 0; j < samples; j += 1) {
    for (let i = 0; i < samples; i += 1) {
      washCtx.globalAlpha = tileHash(ox + i * WASH_STEP, oz + j * WASH_STEP, salt);
      washCtx.fillRect(i, j, 1, 1);
    }
  }
  const cell = WASH_STEP * TEXELS;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Only over floor that is there: basins stay cut out.
  ctx.globalCompositeOperation = "source-atop";
  ctx.drawImage(wash, -cell / 2, -cell / 2, samples * cell, samples * cell);
  ctx.restore();
}

/** The floor's walkable faces: row runs of equal height, mapped into the chunk's painted texture. */
function topGeometry(tiles: readonly Tile[], ox: number, oz: number): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const heightOf = (x: number, z: number): number | null => {
    const tile = tiles[z * CHUNK_SIZE + x];
    return tile === undefined || SUNKEN.has(tile) ? null : TILE_HEIGHT[tile];
  };
  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    let x = 0;
    while (x < CHUNK_SIZE) {
      const y = heightOf(x, z);
      if (y === null) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < CHUNK_SIZE && heightOf(end, z) === y) end += 1;
      const base = positions.length / 3;
      positions.push(
        ox + x,
        y,
        oz + z,
        ox + end,
        y,
        oz + z,
        ox + end,
        y,
        oz + z + 1,
        ox + x,
        y,
        oz + z + 1,
      );
      const u0 = x / CHUNK_SIZE;
      const u1 = end / CHUNK_SIZE;
      const v0 = 1 - z / CHUNK_SIZE;
      const v1 = 1 - (z + 1) / CHUNK_SIZE;
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      x = end;
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Flat quads at `y` over every tile of one sunken kind, merged into row runs. */
function basinGeometry(
  tiles: readonly Tile[],
  kind: Tile,
  ox: number,
  oz: number,
  y: number,
): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    let x = 0;
    while (x < CHUNK_SIZE) {
      if (tiles[z * CHUNK_SIZE + x] !== kind) {
        x += 1;
        continue;
      }
      let end = x + 1;
      while (end < CHUNK_SIZE && tiles[z * CHUNK_SIZE + end] === kind) end += 1;
      const base = positions.length / 3;
      const x0 = ox + x;
      const x1 = ox + end;
      const z0 = oz + z;
      const z1 = z0 + 1;
      positions.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
      uvs.push(0, 1, end - x, 1, end - x, 0, 0, 0);
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      x = end;
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const SIDES = [
  // neighbour offset, the edge's two corners (as tile-local offsets), outward normal
  { dx: 0, dz: 1, a: [1, 1], b: [0, 1], n: [0, 1] },
  { dx: 0, dz: -1, a: [0, 0], b: [1, 0], n: [0, -1] },
  { dx: 1, dz: 0, a: [1, 0], b: [1, 1], n: [1, 0] },
  { dx: -1, dz: 0, a: [0, 1], b: [0, 0], n: [-1, 0] },
] as const;

/**
 * A vertical face wherever a tile stands above its neighbour, facing that neighbour: rock cliffs
 * under plateaus, earth banks around basins. Faces the camera cannot see are culled by the GPU.
 */
function cliffGeometry(
  tiles: readonly Tile[],
  ox: number,
  oz: number,
  tileAt: TileAt,
): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const bank = [new THREE.Color(HD2D_PALETTE.bankTop), new THREE.Color(HD2D_PALETTE.bankBottom)];
  const cliff = [new THREE.Color(HD2D_PALETTE.cliffTop), new THREE.Color(HD2D_PALETTE.cliffBottom)];
  for (let z = 0; z < CHUNK_SIZE; z += 1) {
    for (let x = 0; x < CHUNK_SIZE; x += 1) {
      const tile = tiles[z * CHUNK_SIZE + x] ?? "grass";
      if (SUNKEN.has(tile)) continue;
      const height = TILE_HEIGHT[tile];
      for (const side of SIDES) {
        const nx = x + side.dx;
        const nz = z + side.dz;
        const inside = nx >= 0 && nz >= 0 && nx < CHUNK_SIZE && nz < CHUNK_SIZE;
        const neighbour = inside ? tiles[nz * CHUNK_SIZE + nx] : tileAt(ox + nx, oz + nz);
        if (neighbour === undefined) continue;
        const below = TILE_HEIGHT[neighbour];
        if (below >= height - 0.02) continue;
        const [top, bottom] = tile === "stone" ? cliff : bank;
        if (top === undefined || bottom === undefined) continue;
        const base = positions.length / 3;
        const ax = ox + x + side.a[0];
        const az = oz + z + side.a[1];
        const bx = ox + x + side.b[0];
        const bz = oz + z + side.b[1];
        positions.push(ax, height, az, bx, height, bz, bx, below, bz, ax, below, az);
        for (let i = 0; i < 4; i += 1) normals.push(side.n[0], 0, side.n[1]);
        // Every other tile is a shade darker so a long cliff reads as stacked stones, not a slab.
        const shade = tileHash(ox + x, oz + z, 17) < 0.5 ? 1 : 0.86;
        for (const color of [top, top, bottom, bottom]) {
          colors.push(color.r * shade, color.g * shade, color.b * shade);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}
