// The engine entry point: a full-viewport R3F canvas that renders exactly what `worldStore.scene`
// holds and nothing else. idle / loading / error render nothing at all — the app layer owns the
// <StatePanel> for those states (Rule 2: never a plausible placeholder).

import { Canvas, useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { useEngineStore, useWorldStore } from "@renderer/state";
import type { GameplayKitRules, GameplayRules } from "@shared/gameplay";
import type { SceneGraph } from "@shared/world";
import { type JSX, type RefObject, Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { Atmosphere } from "./Atmosphere";
import { CameraRig, defaultRig, type RigState } from "./CameraRig";
import { spawnPoint } from "./colliders";
import { Exit } from "./Entities/Exit";
import { Monster } from "./Entities/Monster";
import { Npc } from "./Entities/Npc";
import { Treasure } from "./Entities/Treasure";
import { Ground } from "./Ground";
import { LEGACY_TPS_KIT, resolveSceneKit } from "./kits/registry";
import { Platforms } from "./Platforms";
import { Player } from "./Player";
import { Props } from "./Props";
import { isDebugEnabled, Proximity } from "./Proximity";
import { exitId } from "./targets";
import { Walls } from "./Walls";

const FPS_INTERVAL = 0.5;
const GRAVITY: [number, number, number] = [0, -9.81, 0];

const canvasStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
} as const;

export function GameCanvas(): JSX.Element {
  const scene = useWorldStore((state) => state.scene);
  const gameplayRules = useWorldStore((state) => state.gameplayRules);
  // The contract returns JSX.Element, and idle/loading/error must render nothing at all — the app
  // layer owns the <StatePanel> for those states.
  // biome-ignore lint/complexity/noUselessFragments: "render nothing" while returning JSX.Element
  if (scene.status !== "ready") return <></>;
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.15,
      }}
      camera={{ fov: 55, near: 0.1, far: 240, position: [0, 9, 12] }}
      style={canvasStyle}
    >
      <Suspense fallback={null}>
        <Stage graph={scene.value} gameplayRules={gameplayRules} />
      </Suspense>
    </Canvas>
  );
}

function Stage({
  graph,
  gameplayRules,
}: {
  graph: SceneGraph;
  gameplayRules: GameplayRules | null;
}): JSX.Element {
  const player = useRef<THREE.Vector3>(new THREE.Vector3());
  const rig = useRef<RigState>(defaultRig());
  const seeded = useRef(false);
  const debug = useMemo(() => isDebugEnabled(), []);
  const kit: GameplayKitRules = useMemo(() => {
    if (gameplayRules === null) return LEGACY_TPS_KIT;
    const resolved = resolveSceneKit(gameplayRules, graph);
    return resolved.ok ? resolved.value : LEGACY_TPS_KIT;
  }, [gameplayRules, graph]);

  if (!seeded.current) {
    seeded.current = true;
    const [x, y, z] = spawnPoint(graph);
    player.current.set(x, y, z);
  }

  return (
    <>
      <Atmosphere graph={graph} />
      <Physics gravity={GRAVITY} timeStep="vary" debug={debug}>
        <Ground floor={graph.floor} patches={graph.patches} />
        <Platforms platforms={graph.platforms} />
        <Walls walls={graph.walls} />
        <Props props={graph.props} />
        <Player
          graph={graph}
          player={player}
          rig={rig}
          kit={kit}
          bindings={gameplayRules?.bindings}
        />
      </Physics>
      <SceneEntities graph={graph} player={player} />
      <CameraRig player={player} rig={rig} kit={kit} />
      <Proximity graph={graph} player={player} radius={kit.interactDistance} />
      <FpsMeter />
    </>
  );
}

function SceneEntities({
  graph,
  player,
}: {
  graph: SceneGraph;
  player: RefObject<THREE.Vector3>;
}): JSX.Element {
  const opened = useEngineStore((state) => state.openedTreasures);
  return (
    <>
      {graph.npcs.map((npc) => (
        <Npc key={npc.id} npc={npc} player={player} />
      ))}
      {graph.monsters.map((monster) => (
        <Monster key={monster.id} monster={monster} />
      ))}
      {graph.treasures.map((treasure) => (
        <Treasure key={treasure.id} treasure={treasure} opened={opened.includes(treasure.id)} />
      ))}
      {graph.exits.map((exit) => (
        <Exit key={exitId(exit.x, exit.z)} exit={exit} />
      ))}
    </>
  );
}

/** Publishes the frame rate at most twice per second — never per frame. */
function FpsMeter(): null {
  const frames = useRef(0);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    frames.current += 1;
    elapsed.current += delta;
    if (elapsed.current < FPS_INTERVAL) return;
    useEngineStore.getState().setFps(Math.round(frames.current / elapsed.current));
    frames.current = 0;
    elapsed.current = 0;
  });

  return null;
}
