// The editor viewport: the scene as it will actually look, with a cursor you can point at a tile.
//
// It renders through the same components Play uses, so what you place is what you get — there is
// no second, simpler "editor look" that can drift from the real thing. Physics is mounted but
// paused: the colliders exist for the renderers that need them, and nothing falls over while you
// are building — until you press play, which runs the same simulation Play does so a stack of
// crates can be tested where it stands.
//
// Two framings, because the two things people want to build are not the same. `side` is the
// Mario-Maker view: the camera looks along -Z at a flat lane, and a click lands on the tile you
// see. `orbit` is the sandbox view: you fly around and drop things on the floor.

import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import type { SceneGraph } from "@shared/world";
import { type JSX, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Atmosphere } from "../Atmosphere";
import { TILE_TOP } from "../colliders";
import { Exit } from "../Entities/Exit";
import { Monster } from "../Entities/Monster";
import { Npc } from "../Entities/Npc";
import { Treasure } from "../Entities/Treasure";
import { Ground } from "../Ground";
import { Platforms } from "../Platforms";
import { Props } from "../Props";
import { PhysicsProps } from "../sandbox/PhysicsProps";
import { Walls } from "../Walls";

export type EditorFraming = "side" | "orbit" | "top";

export interface EditorTile {
  x: number;
  z: number;
  /** Height in tiles above the floor, from where the ray crossed. 0 on the ground. */
  y: number;
}

export interface EditorCanvasProps {
  graph: SceneGraph;
  framing: EditorFraming;
  /** Tile under the cursor, or null when the pointer is off the floor. */
  hover: EditorTile | null;
  onHover(tile: EditorTile | null): void;
  onPlace(tile: EditorTile): void;
  /** Alt/right click: take away whatever is on that tile. */
  onErase(tile: EditorTile): void;
  /**
   * Runs the physics instead of holding it still, so a stack of crates can be knocked over before
   * the cartridge is stamped. Nothing is written back: turning it off remounts the bodies at the
   * tiles the graph says they are on, so a test run can never damage the level.
   */
  simulating: boolean;
}

/** Frames the whole floor, so a bigger map zooms out instead of running off the edge. */
function EditorCamera({ graph, framing }: { graph: SceneGraph; framing: EditorFraming }): null {
  const camera = useThree((state) => state.camera);
  const { width, depth } = graph.floor;

  useEffect(() => {
    const centre = new THREE.Vector3(width / 2, TILE_TOP, depth / 2);
    const span = Math.max(width, depth);
    if (framing === "side") {
      // Straight on, like a level strip: no perspective skew across the lane.
      camera.position.set(centre.x, centre.y + span * 0.28, centre.z + span * 1.05);
    } else if (framing === "top") {
      camera.position.set(centre.x, centre.y + span * 1.15, centre.z + 0.01);
    } else {
      camera.position.set(centre.x + span * 0.62, centre.y + span * 0.72, centre.z + span * 0.9);
    }
    camera.lookAt(centre);
    camera.updateProjectionMatrix();
  }, [camera, width, depth, framing]);

  return null;
}

/**
 * An invisible sheet over the floor that turns a pointer position into a tile. This is the whole
 * interaction: no coordinate fields, no numeric nudging — you point at the place and click.
 */
function PlacementPlane({
  graph,
  onHover,
  onPlace,
  onErase,
}: {
  graph: SceneGraph;
  onHover(tile: EditorTile | null): void;
  onPlace(tile: EditorTile): void;
  onErase(tile: EditorTile): void;
}): JSX.Element {
  const { width, depth } = graph.floor;
  const dragging = useRef(false);

  const toTile = (event: ThreeEvent<PointerEvent>): EditorTile | null => {
    const x = Math.floor(event.point.x);
    const z = Math.floor(event.point.z);
    if (x < 0 || z < 0 || x >= width || z >= depth) return null;
    return { x, z, y: 0 };
  };

  return (
    <mesh
      position={[width / 2, TILE_TOP + 0.001, depth / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerMove={(event) => {
        event.stopPropagation();
        const tile = toTile(event);
        onHover(tile);
        // Dragging paints a run of tiles, which is how anyone actually builds a platform.
        if (dragging.current && tile !== null) onPlace(tile);
      }}
      onPointerOut={() => {
        dragging.current = false;
        onHover(null);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        const tile = toTile(event);
        if (tile === null) return;
        if (event.nativeEvent.button === 2 || event.nativeEvent.altKey) {
          onErase(tile);
          return;
        }
        dragging.current = true;
        onPlace(tile);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
    >
      <planeGeometry args={[width, depth]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** The tile under the cursor, drawn as a bright outline on the ground. */
function Cursor({ tile }: { tile: EditorTile | null }): JSX.Element | null {
  if (tile === null) return null;
  return (
    <mesh
      position={[tile.x + 0.5, TILE_TOP + 0.02 + tile.y, tile.z + 0.5]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <planeGeometry args={[0.96, 0.96]} />
      <meshBasicMaterial color="#7fd4ff" transparent opacity={0.45} depthWrite={false} />
    </mesh>
  );
}

/** A faint tile grid, so "one click = one tile" is visible before you click. */
function TileGrid({ graph }: { graph: SceneGraph }): JSX.Element {
  const { width, depth } = graph.floor;
  const geometry = useMemo(() => {
    const points: number[] = [];
    const y = TILE_TOP + 0.005;
    for (let x = 0; x <= width; x += 1) points.push(x, y, 0, x, y, depth);
    for (let z = 0; z <= depth; z += 1) points.push(0, y, z, width, y, z);
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return buffer;
  }, [width, depth]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#8fb6d8" transparent opacity={0.16} />
    </lineSegments>
  );
}

export function EditorCanvas({
  graph,
  framing,
  hover,
  onHover,
  onPlace,
  onErase,
  simulating,
}: EditorCanvasProps): JSX.Element {
  const freeBodies = graph.props.filter((prop) => prop.dynamic);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.15 }}
      camera={{ fov: 50, near: 0.1, far: 400 }}
      style={{ width: "100%", height: "100%", borderRadius: 2 }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Atmosphere graph={graph} />
      {/* Paused while building; the key remounts every body at its authored tile on stop. */}
      <Physics key={simulating ? "run" : "build"} paused={!simulating}>
        <Ground floor={graph.floor} patches={graph.patches} />
        <Platforms platforms={graph.platforms} />
        <Walls walls={graph.walls} />
        <Props props={graph.props} />
        <PhysicsProps props={freeBodies} />
      </Physics>

      {graph.npcs.map((npc) => (
        <Npc key={npc.id} npc={npc} />
      ))}
      {graph.monsters.map((monster) => (
        <Monster key={monster.id} monster={monster} />
      ))}
      {graph.treasures.map((treasure) => (
        <Treasure key={treasure.id} treasure={treasure} opened={false} />
      ))}
      {graph.exits.map((exit) => (
        <Exit key={`${exit.x},${exit.z}`} exit={exit} />
      ))}

      {/* While the simulation runs the bodies are not on their tiles, so painting is off: a
          click would land somewhere the level no longer looks like. */}
      {simulating ? null : (
        <>
          <TileGrid graph={graph} />
          <Cursor tile={hover} />
          <PlacementPlane graph={graph} onHover={onHover} onPlace={onPlace} onErase={onErase} />
        </>
      )}
      <EditorCamera graph={graph} framing={framing} />
    </Canvas>
  );
}
