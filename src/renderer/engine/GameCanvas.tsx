// The engine entry point: a full-viewport R3F canvas that renders exactly what `worldStore.scene`
// holds and nothing else. idle / loading / error render nothing at all — the app layer owns the
// <StatePanel> for those states (Rule 2: never a plausible placeholder).

import { Canvas, useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import {
  useEncounterStore,
  useEngineStore,
  useLandStore,
  useRunStore,
  useSessionStore,
  useWorldStore,
} from "@renderer/state";
import { seedFromText } from "@shared/endless";
import type { GameplayKitRules, GameplayRules } from "@shared/gameplay";
import { landSeedOf } from "@shared/land";
import type { SceneGraph } from "@shared/world";
import { type JSX, type RefObject, Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Atmosphere } from "./Atmosphere";
import { CameraRig, defaultRig, type RigState } from "./CameraRig";
import { ChunkField } from "./ChunkField";
import { spawnPoint, type Vec3 } from "./colliders";
import { CombatControl } from "./combat/CombatControl";
import { sceneForRun } from "./combat/encounter";
import { Squad } from "./combat/Squad";
import { Exit } from "./Entities/Exit";
import { Monster } from "./Entities/Monster";
import { Npc } from "./Entities/Npc";
import { Treasure } from "./Entities/Treasure";
import { FpsKitFeatures } from "./FpsKitFeatures";
import { Ground } from "./Ground";
import { HomeYard } from "./HomeYard";
import { behaviorForKit, LEGACY_TPS_KIT, resolveSceneKit } from "./kits/registry";
import { LandNotes } from "./LandNotes";
import { landTargets } from "./landTargets";
import { Platforms } from "./Platforms";
import { Player } from "./Player";
import { Props } from "./Props";
import { isDebugEnabled, Proximity } from "./Proximity";
import { registerPlayerProbe } from "./playerProbe";
import { RemotePlayers } from "./RemotePlayers";
import { PhysGun } from "./sandbox/PhysGun";
import { PhysicsProps } from "./sandbox/PhysicsProps";
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

/**
 * With no props it plays the loaded scene. A place on the land passes its own built scene and the
 * rules its kit plays under; its ground is final, so no run layout is applied on top (`prepared`).
 */
export function GameCanvas(
  props: { graph?: SceneGraph; rules?: GameplayRules | null } = {},
): JSX.Element {
  const loaded = useWorldStore((state) => state.scene);
  const loadedRules = useWorldStore((state) => state.gameplayRules);
  const scene: typeof loaded =
    props.graph === undefined ? loaded : { status: "ready", value: props.graph };
  const gameplayRules = props.rules === undefined ? loadedRules : props.rules;
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
        <Stage
          graph={scene.value}
          gameplayRules={gameplayRules}
          prepared={props.graph !== undefined}
        />
      </Suspense>
    </Canvas>
  );
}

export function Stage({
  graph: rawGraph,
  gameplayRules,
  prepared = false,
}: {
  graph: SceneGraph;
  gameplayRules: GameplayRules | null;
  /** The scene's layout is already final (a place): no generated or shuffled layout on top. */
  prepared?: boolean;
}): JSX.Element {
  // An authored scene's generated layout comes from the run's own seed. A floor in the endless
  // depths must come back identical after a reload, so it uses its save's seed and depth instead.
  const runSeed = useRunStore((state) => state.seed);
  const depthSeed = useSessionStore((state) => {
    const endless = state.activeInstance?.instance.save.endless;
    return endless === undefined
      ? null
      : (endless.seed ^ Math.imul(endless.depth, 0x9e3779b1)) >>> 0;
  });
  const seed = depthSeed ?? runSeed;
  // Geography belongs to the world seed: the same seed is the same land for everyone who walks it,
  // so a place means the same thing on every machine (plan.md §1).
  const landSeed = useSessionStore((state) => {
    const save = state.activeInstance?.instance.save;
    return save === undefined ? seedFromText(rawGraph.name) : landSeedOf(save);
  });
  const graph = useMemo(
    () => (prepared ? rawGraph : sceneForRun(rawGraph, gameplayRules, seed)),
    [rawGraph, gameplayRules, seed, prepared],
  );
  const player = useRef<THREE.Vector3>(new THREE.Vector3());
  // Which way the body points. In side-on and top-down games this, not the camera, is the aim.
  const facing = useRef(0);
  const rig = useRef<RigState>(defaultRig());
  const seeded = useRef(false);
  const debug = useMemo(() => isDebugEnabled(), []);
  const kit: GameplayKitRules = useMemo(() => {
    if (gameplayRules === null) return LEGACY_TPS_KIT;
    const resolved = resolveSceneKit(gameplayRules, graph);
    return resolved.ok ? resolved.value : LEGACY_TPS_KIT;
  }, [gameplayRules, graph]);
  const behavior = behaviorForKit(kit.id);
  // A scene with free bodies in it is a sandbox; nothing else has to declare it. The props the
  // author marked dynamic are both the thing being simulated and the reason the gun exists.
  const freeBodies = useMemo(() => graph.props.filter((prop) => prop.dynamic), [graph.props]);
  const land = useLandStore((state) => state.chunks);
  const progress = useLandStore((state) => state.progress);
  const residents = useMemo(
    () => (behavior.open ? landTargets(land, progress, graph) : []),
    [behavior.open, land, progress, graph],
  );

  // On open land the save remembers where the player stood; anywhere else they start at spawn.
  const sceneId = graph.contract?.sceneId ?? null;
  const resume = useMemo(() => {
    if (!behavior.open || sceneId === null) return null;
    const saved = useSessionStore.getState().activeInstance?.instance.save.position;
    return saved !== undefined && saved.sceneId === sceneId ? saved : null;
  }, [behavior.open, sceneId]);
  const spawn: Vec3 = useMemo(
    () => (resume === null ? spawnPoint(graph) : [resume.x, resume.y, resume.z]),
    [resume, graph],
  );

  useEffect(() => {
    useEngineStore.getState().setCameraMode(behavior.camera);
  }, [behavior.camera]);

  useEffect(() => {
    if (!behavior.open || sceneId === null) return;
    return registerPlayerProbe(() => ({
      sceneId,
      x: player.current.x,
      y: player.current.y,
      z: player.current.z,
      yaw: rig.current.yaw,
    }));
  }, [behavior.open, sceneId]);

  if (!seeded.current) {
    seeded.current = true;
    const [x, y, z] = spawn;
    player.current.set(x, y, z);
    if (resume !== null) rig.current.yaw = resume.yaw;
  }

  return (
    <>
      <Atmosphere graph={graph} follow={behavior.open ? player : null} />
      <Physics gravity={GRAVITY} timeStep="vary" debug={debug}>
        <Ground floor={graph.floor} patches={graph.patches} />
        {behavior.open ? <ChunkField origin={graph} seed={landSeed} player={player} /> : null}
        {behavior.open ? <HomeYard origin={graph} /> : null}
        {behavior.open ? <LandNotes /> : null}
        <Platforms platforms={graph.platforms} />
        <Walls walls={graph.walls} />
        <Props props={graph.props} />
        <PhysicsProps props={freeBodies} />
        <Player
          graph={graph}
          player={player}
          facing={facing}
          rig={rig}
          kit={kit}
          behavior={behavior}
          spawn={spawn}
          bindings={gameplayRules?.bindings}
        />
      </Physics>
      <CombatControl
        graph={graph}
        rules={gameplayRules}
        player={player}
        facing={facing}
        rig={rig}
        movement={behavior.movement}
      />
      {freeBodies.length > 0 ? <PhysGun bindings={gameplayRules?.bindings} /> : null}
      <Squad player={player} />
      {behavior.open ? <RemotePlayers /> : null}
      <SceneEntities graph={graph} player={player} />
      <CameraRig
        player={player}
        rig={rig}
        kit={kit}
        switchable={behavior.open}
        bindings={gameplayRules?.bindings}
      />
      {behavior.flashlight ? <FpsKitFeatures bindings={gameplayRules?.bindings} /> : null}
      <Proximity graph={graph} player={player} radius={kit.interactDistance} extra={residents} />
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
  const combatants = useEncounterStore((state) => state.combatants);
  const downed = new Set(combatants.filter((one) => one.hp <= 0).map((one) => one.id));
  return (
    <>
      {graph.npcs.map((npc) => (
        <Npc key={npc.id} npc={npc} player={player} />
      ))}
      {graph.monsters
        .filter((monster) => !downed.has(monster.id))
        .map((monster) => (
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
