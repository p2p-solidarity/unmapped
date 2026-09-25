// The far view (plan.md §11): open-land fog swallows the ground a couple of chunks out, but
// "something tall in the distance" is the reason to walk. Past the drawn chunks, the tall things —
// rare giant trees from the terrain, and the landmarks people built on witnessed chunks — are drawn
// again as flat silhouettes that ignore the fog.
//
// Terrain landmarks are derived from the seed like everything else in `@shared/chunks`, cached by
// chunk so crossing into a new chunk only computes the new rim.

import { useLandStore } from "@renderer/state";
import {
  CHUNK_SIZE,
  type ChunkCoord,
  chunkDistance,
  chunkKey,
  chunksAround,
  chunkTerrain,
} from "@shared/chunks";
import type { FloorSpec, PropKind } from "@shared/world";
import { type JSX, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { tileToWorld } from "./colliders";
import { UNIT_CONE, UNIT_CYLINDER } from "./geometry";
import { ENTITY_PALETTE } from "./palette";

/** Rings of chunks whose tall things stay visible. Camera `far` (240) bounds this too. */
export const FAR_RADIUS = 6;
/** Rings close enough that the real meshes are still readable through the fog. */
const NEAR_RINGS = 1;
const GIANT_SCALE = 3;
const MAX_SILHOUETTES = 256;

/** Built by people and tall enough to read from far away: [width, height] of the silhouette. */
const TALL: Partial<Record<PropKind, [number, number]>> = {
  chimney: [1.2, 9],
  steel_tower: [3, 14],
  windmill: [1.2, 6],
  house: [3, 3.4],
};

interface Silhouette {
  x: number;
  z: number;
  width: number;
  height: number;
  cone: boolean;
}

const terrainCache = new Map<string, Silhouette[]>();

function giantTrees(seed: number, coord: ChunkCoord, floor: FloorSpec): Silhouette[] {
  const key = `${seed}:${floor.tile}:${floor.width}x${floor.depth}:${chunkKey(coord)}`;
  const cached = terrainCache.get(key);
  if (cached !== undefined) return cached;
  const trees = chunkTerrain({ seed, coord, origin: { floor } })
    .props.filter((prop) => prop.kind === "tree" && prop.scale >= GIANT_SCALE)
    .map((prop) => {
      const [x, z] = tileToWorld(prop.x, prop.z);
      return {
        x: coord.cx * CHUNK_SIZE + x,
        z: coord.cz * CHUNK_SIZE + z,
        width: 1.5 * prop.scale,
        height: 3 * prop.scale,
        cone: true,
      };
    });
  terrainCache.set(key, trees);
  return trees;
}

export function FarLand({
  centre,
  seed,
  floor,
}: {
  centre: ChunkCoord;
  seed: number;
  floor: FloorSpec;
}): JSX.Element {
  const chunks = useLandStore((state) => state.chunks);
  const shapes = useMemo(() => {
    const out: Silhouette[] = [];
    for (const coord of chunksAround(centre, FAR_RADIUS)) {
      if (chunkDistance(coord, centre) <= NEAR_RINGS) continue;
      out.push(...giantTrees(seed, coord, floor));
      const chunk = chunks[chunkKey(coord)];
      if (chunk?.status !== "written") continue;
      for (const prop of chunk.scene.props) {
        const size = TALL[prop.kind];
        if (size === undefined) continue;
        const [x, z] = tileToWorld(prop.x, prop.z);
        out.push({
          x: coord.cx * CHUNK_SIZE + x,
          z: coord.cz * CHUNK_SIZE + z,
          width: size[0] * prop.scale,
          height: size[1] * prop.scale,
          cone: prop.kind === "steel_tower",
        });
      }
    }
    return out.slice(0, MAX_SILHOUETTES);
  }, [centre, seed, floor, chunks]);

  return (
    <>
      <Batch shapes={shapes.filter((shape) => shape.cone)} geometry={UNIT_CONE} />
      <Batch shapes={shapes.filter((shape) => !shape.cone)} geometry={UNIT_CYLINDER} />
    </>
  );
}

const silhouetteMaterial = new THREE.MeshBasicMaterial({
  color: ENTITY_PALETTE.farSilhouette,
  fog: false,
});

function Batch({
  shapes,
  geometry,
}: {
  shapes: readonly Silhouette[];
  geometry: THREE.BufferGeometry;
}): JSX.Element | null {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = shapes.length;
  useLayoutEffect(() => {
    const target = mesh.current;
    if (target === null || count === 0) return;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    shapes.forEach((shape, index) => {
      position.set(shape.x, shape.height / 2, shape.z);
      scale.set(shape.width, shape.height, shape.width);
      matrix.compose(position, rotation, scale);
      target.setMatrixAt(index, matrix);
    });
    target.count = count;
    target.instanceMatrix.needsUpdate = true;
    target.computeBoundingSphere();
  }, [shapes, count]);
  if (count === 0) return null;
  return (
    <instancedMesh
      key={`far-${count}`}
      ref={mesh}
      args={[geometry, silhouetteMaterial, count]}
      frustumCulled={false}
    />
  );
}
