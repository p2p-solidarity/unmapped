// The floor: one InstancedMesh of width × depth boxes (1 × 0.2 × 1) plus a single fixed cuboid
// collider covering the whole rectangle. Per-tile value jitter is hashed from the coordinates so
// the surface looks hand-placed and stays identical across re-renders and hot-swaps.
//
// `graph.patches` paint tile overrides on top: the base mesh skips those tiles and one instanced
// mesh per patch tile kind fills them PATCH_DROP lower, so a pond or a lava pool reads as a
// recess instead of a decal. Water and lava breathe through their shared material — one uniform
// per tile kind per frame, never a per-instance write and never React state.

import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import type { ChunkHole } from "@shared/chunks";
import type { FloorSpec, PatchSpec, Tile } from "@shared/world";
import { type JSX, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { floorBox, TILE_THICKNESS } from "./colliders";
import { groundMaterial, hash2, tileMaterial, tintModulation, UNIT_BOX } from "./geometry";
import { TILE_TINT } from "./palette";
import {
  coveredKeys,
  groupPatchTiles,
  type PatchTile,
  patchCenterY,
  patchKey,
  patchTiles,
  pulseIntensity,
} from "./patches";

const JITTER_FLOOR = 0.88;
const JITTER_RANGE = 0.2;

export function Ground({
  floor,
  patches,
  hole = null,
  solid = true,
}: {
  floor: FloorSpec;
  patches: readonly PatchSpec[];
  /** Tiles an authored scene already draws; a generated chunk leaves them out (open land only). */
  hole?: ChunkHole | null;
  /** False for distant chunks: drawn, but nothing can reach them to collide. */
  solid?: boolean;
}): JSX.Element {
  const box = useMemo(() => floorBox(floor), [floor]);
  const tiles = useMemo(() => patchTiles(floor, patches), [floor, patches]);
  const covered = useMemo(() => {
    const keys = coveredKeys(tiles);
    if (hole === null) return keys;
    for (let z = 0; z < hole.depth; z += 1) {
      for (let x = 0; x < hole.width; x += 1) keys.add(patchKey(x, z));
    }
    return keys;
  }, [tiles, hole]);
  const groups = useMemo(() => [...groupPatchTiles(tiles)], [tiles]);
  const liquids = useMemo(() => groups.map(([tile]) => tile), [groups]);

  // Liquid shimmer: one emissive write per tile kind per frame, shared by every instance.
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    for (const tile of liquids) {
      const intensity = pulseIntensity(tile, t);
      if (intensity === null) continue;
      tileMaterial(tile).emissiveIntensity = intensity;
    }
  });

  return (
    <>
      <BaseFloor floor={floor} covered={covered} />
      {groups.map(([tile, items]) => (
        <PatchInstances key={`patch-${tile}`} tile={tile} items={items} />
      ))}
      {solid ? (
        <RigidBody type="fixed" colliders={false} position={box.center}>
          <CuboidCollider args={box.half} friction={0.6} />
        </RigidBody>
      ) : null}
    </>
  );
}

function BaseFloor({
  floor,
  covered,
}: {
  floor: FloorSpec;
  covered: ReadonlySet<string>;
}): JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const width = Math.max(0, Math.floor(floor.width));
  const depth = Math.max(0, Math.floor(floor.depth));
  const count = Math.max(0, width * depth - covered.size);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, TILE_THICKNESS, 1);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const color = new THREE.Color();
    const tint = TILE_TINT[floor.tile];
    let index = 0;
    for (let z = 0; z < depth; z += 1) {
      for (let x = 0; x < width; x += 1) {
        if (covered.has(patchKey(x, z))) continue;
        position.set(x + 0.5, 0, z + 0.5);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(
          index,
          tintModulation(tint, JITTER_FLOOR + hash2(x, z) * JITTER_RANGE, color),
        );
        index += 1;
      }
    }
    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [width, depth, covered, floor.tile]);

  return (
    <instancedMesh
      key={`floor-${count}`}
      ref={meshRef}
      args={[UNIT_BOX, groundMaterial, Math.max(count, 1)]}
      receiveShadow
      frustumCulled={false}
    />
  );
}

function PatchInstances({ tile, items }: { tile: Tile; items: readonly PatchTile[] }): JSX.Element {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = items.length;
  const centerY = patchCenterY();

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh === null) return;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, TILE_THICKNESS, 1);
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const color = new THREE.Color();
    items.forEach((item, index) => {
      position.set(item.x + 0.5, centerY, item.z + 0.5);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(index, matrix);
      color.setScalar(JITTER_FLOOR + hash2(item.x, item.z) * JITTER_RANGE);
      mesh.setColorAt(index, color);
    });
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items, count, centerY]);

  return (
    <instancedMesh
      key={`patch-${tile}-${count}`}
      ref={meshRef}
      args={[UNIT_BOX, tileMaterial(tile), Math.max(count, 1)]}
      receiveShadow
      frustumCulled={false}
    />
  );
}
