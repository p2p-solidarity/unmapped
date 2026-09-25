import {
  type ChunkStatus,
  useEncounterStore,
  useEngineStore,
  useLandStore,
  useRunStore,
  useSessionStore,
} from "@renderer/state";
import { colors } from "@renderer/ui";
import { CHUNK_SIZE, chunkKey, chunkOf } from "@shared/chunks";
import { seedFromText } from "@shared/endless";
import type { GameplayKitRules, GameplayRules } from "@shared/gameplay";
import { landSeedOf } from "@shared/land";
import { storyEpisodes } from "@shared/story";
import type { SceneGraph } from "@shared/world";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isWallTile, spawnPoint, TILE_TOP } from "../engine/colliders";
import { sceneForRun } from "../engine/combat/encounter";
import { behaviorForKit, LEGACY_TPS_KIT, resolveSceneKit } from "../engine/kits/registry";
import { landTargets } from "../engine/landTargets";
import { registerPlayerProbe } from "../engine/playerProbe";
import { nearestTarget, sceneTargets, triggersWithin, triggerTarget } from "../engine/targets";
import { isSprinting, matchesAction, moveAxis, useKeys } from "../engine/useKeys";
import { loadAtlases } from "./atlases";
import type { SpriteAtlases } from "./canvasRenderer";
import { blockedByProps, cachedTerrain, walkableAt } from "./landModel";
import { hd2dSurface, type LandSurface, pixelSurface } from "./landSurface";
import { placeTargets } from "./placeLayer";
import { type StoryView, storyTargets } from "./storyLayer";
import { useLandCombat } from "./useLandCombat";

const PLAYER_RADIUS = 0.22;
const MAX_DELTA = 0.05;
const FPS_INTERVAL = 0.5;
const INTERACT_KEYS = ["KeyE"] as const;
/**
 * On flat land there is nothing to jump onto and no dark to light, so the keys bound to jump and
 * the flashlight pull the trigger too (as does fire's own binding, a click by default). The shot
 * flies the way the player faces.
 */
function firesOnLand(code: string, bindings: GameplayRules["bindings"] | undefined): boolean {
  return (
    matchesAction(code, bindings, "fire", ["MouseLeft"]) ||
    matchesAction(code, bindings, "jump", ["Space"]) ||
    matchesAction(code, bindings, "flashlight", ["KeyF"])
  );
}

interface PlayerState {
  x: number;
  z: number;
  yaw: number;
  facing: "north" | "south" | "east" | "west";
  moving: boolean;
}

const canvasStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  imageRendering: "pixelated",
  background: colors.bg,
} as const;

const overlayStyle = { ...canvasStyle, background: "transparent", pointerEvents: "none" } as const;

export function isOpenLand2D(scene: SceneGraph, rules: GameplayRules | null): boolean {
  if (rules === null) return true;
  const kit = resolveSceneKit(rules, scene);
  return kit.ok && behaviorForKit(kit.value.id).open;
}

export function LandView2D({
  rawGraph,
  gameplayRules,
}: {
  rawGraph: SceneGraph;
  gameplayRules: GameplayRules | null;
}): JSX.Element {
  const runSeed = useRunStore((state) => state.seed);
  const depthSeed = useSessionStore((state) => {
    const endless = state.activeInstance?.instance.save.endless;
    return endless === undefined
      ? null
      : (endless.seed ^ Math.imul(endless.depth, 0x9e3779b1)) >>> 0;
  });
  const graph = useMemo(
    () => sceneForRun(rawGraph, gameplayRules, depthSeed ?? runSeed),
    [rawGraph, gameplayRules, depthSeed, runSeed],
  );
  const landSeed = useSessionStore((state) => {
    const save = state.activeInstance?.instance.save;
    return save === undefined ? seedFromText(rawGraph.name) : landSeedOf(save);
  });
  const chunks = useLandStore((state) => state.chunks);
  const progress = useLandStore((state) => state.progress);
  const notes = useLandStore((state) => state.notes);
  const opened = useEngineStore((state) => state.openedTreasures);
  const teleport = useEngineStore((state) => state.teleport);
  const [atlases, setAtlases] = useState<SpriteAtlases | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const look = useEngineStore((state) => state.landLook);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  // Once per mount: it consumes the way back from a place.
  const [start] = useState(() => initialPlayer(graph));
  const player = useRef<PlayerState>(start);
  const fired = useRef<Set<string>>(new Set());

  const kit: GameplayKitRules = useMemo(() => {
    if (gameplayRules === null) return LEGACY_TPS_KIT;
    const resolved = resolveSceneKit(gameplayRules, graph);
    return resolved.ok ? resolved.value : LEGACY_TPS_KIT;
  }, [gameplayRules, graph]);
  const plan = useSessionStore((state) => state.activeInstance?.cartridge.story ?? null);
  const story: StoryView | null = useMemo(
    () =>
      plan === null
        ? null
        : {
            episodes: storyEpisodes(plan, progress?.storyMore),
            progress: progress?.episodes ?? {},
          },
    [plan, progress],
  );
  const places = useMemo(() => progress?.places ?? [], [progress]);
  const extraTargets = useMemo(
    () => [
      ...landTargets(chunks, progress, graph),
      ...(story === null ? [] : storyTargets(story)),
      ...placeTargets(places),
    ],
    [chunks, progress, graph, story, places],
  );
  const targets = useMemo(
    () => [...sceneTargets(graph, opened), ...extraTargets],
    [graph, opened, extraTargets],
  );

  const combat = useLandCombat({ graph, rules: gameplayRules, seed: landSeed, player });
  const combatRef = useRef(combat);
  combatRef.current = combat;

  const onPress = useCallback(
    (code: string) => {
      const bindings = gameplayRules?.bindings;
      if (combatRef.current.armed()) {
        if (firesOnLand(code, bindings)) {
          combatRef.current.fire(performance.now());
          return;
        }
        if (matchesAction(code, bindings, "end_turn", ["KeyR"])) {
          combatRef.current.passTurn();
          return;
        }
        if (matchesAction(code, bindings, "pause", ["KeyP"])) {
          useEncounterStore.getState().togglePause();
          return;
        }
      }
      if (code === "KeyN") {
        useSessionStore.getState().toggleNotes(true);
        return;
      }
      if (code === "KeyV") {
        const engine = useEngineStore.getState();
        engine.setLandLook(engine.landLook === "hd2d" ? "pixel" : "hd2d");
        return;
      }
      if (!matchesAction(code, bindings, "interact", INTERACT_KEYS)) return;
      const target = useEngineStore.getState().nearby;
      if (target !== null) useEngineStore.getState().interact(target);
    },
    [gameplayRules?.bindings],
  );
  const held = useKeys(onPress);

  useEffect(() => {
    let active = true;
    loadAtlases()
      .then((loaded) => {
        if (active) setAtlases(loaded);
      })
      .catch((error: unknown) => {
        if (active) setAssetError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    useEngineStore.getState().setCameraMode("topdown");
  }, []);

  useEffect(() => {
    const sceneId = graph.contract?.sceneId;
    if (sceneId === undefined) return;
    return registerPlayerProbe(() => ({
      sceneId,
      x: player.current.x,
      y: TILE_TOP,
      z: player.current.z,
      yaw: player.current.yaw,
    }));
  }, [graph.contract?.sceneId]);

  useEffect(() => {
    if (teleport === null) return;
    player.current.x = teleport.x;
    player.current.z = teleport.z;
  }, [teleport]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger entries reset with the floor
  useEffect(() => {
    fired.current.clear();
  }, [graph.name]);

  // Everything the loop reads that can change while walking. Witnessed chunks, notes and targets
  // update often; routing them through a ref keeps one long-lived rAF loop instead of tearing it
  // down (and blanking the HUD's chunk/nearby state) on every write.
  const live = useRef({
    chunks,
    gameplayRules,
    graph,
    kit,
    landSeed,
    notes,
    places,
    progress,
    story,
    targets,
  });
  live.current = {
    chunks,
    gameplayRules,
    graph,
    kit,
    landSeed,
    notes,
    places,
    progress,
    story,
    targets,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || atlases === null) return;
    let surface: LandSurface | null = null;
    try {
      surface =
        look === "hd2d"
          ? hd2dSurface(canvas, overlayRef.current, atlases)
          : pixelSurface(canvas, atlases);
    } catch (error) {
      // No WebGL here: say so and keep playing on the 16-bit canvas instead of a blank screen.
      const reason = error instanceof Error ? error.message : String(error);
      useSessionStore.getState().toast("danger", `HD-2D is unavailable (${reason}); using 16-bit.`);
      useEngineStore.getState().setLandLook("pixel");
      return;
    }
    if (surface === null) return;
    const draw = surface;
    let frameId = 0;
    let previous = performance.now();
    let frameCount = 0;
    let fpsElapsed = 0;
    let lastChunk = "";
    let bounds = { width: 1, height: 1 };

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      bounds = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    // A click on the land is the trigger (the keys go through useKeys).
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || useEngineStore.getState().inputLocked) return;
      const fight = combatRef.current;
      if (!fight.armed()) return;
      if (!firesOnLand("MouseLeft", live.current.gameplayRules?.bindings)) return;
      fight.fire(performance.now());
    };
    canvas.addEventListener("pointerdown", onPointerDown);

    const tick = (now: number): void => {
      const state = live.current;
      const delta = Math.min(MAX_DELTA, Math.max(0, (now - previous) / 1000));
      previous = now;
      updatePlayer(player.current, held.current, delta, state.kit, state.gameplayRules, (x, z) =>
        canStand(state.graph, state.landSeed, state.chunks, x, z),
      );
      const position = player.current;
      const coord = chunkOf(position.x, position.z);
      const key = chunkKey(coord);
      if (key !== lastChunk) {
        lastChunk = key;
        useEngineStore.getState().setChunk(coord);
      }
      useEngineStore
        .getState()
        .setNearby(
          nearestTarget(state.targets, position.x, position.z, state.kit.interactDistance),
        );
      for (const trigger of triggersWithin(state.graph.triggers, position.x, position.z)) {
        if (fired.current.has(trigger.id)) continue;
        fired.current.add(trigger.id);
        useEngineStore.getState().interact(triggerTarget(trigger, position.x, position.z));
      }

      if (!useEngineStore.getState().inputLocked) combatRef.current.step(delta);

      draw.draw({
        width: bounds.width,
        height: bounds.height,
        scene: state.graph,
        seed: state.landSeed,
        player: position,
        chunks: state.chunks,
        progress: state.progress,
        notes: state.notes,
        story: state.story,
        foes: combatRef.current.foes(),
        shot: combatRef.current.shot.current,
        places: state.places,
        now,
      });

      frameCount += 1;
      fpsElapsed += delta;
      if (fpsElapsed >= FPS_INTERVAL) {
        useEngineStore.getState().setFps(Math.round(frameCount / fpsElapsed));
        frameCount = 0;
        fpsElapsed = 0;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      draw.dispose();
      useEngineStore.getState().setChunk(null);
      useEngineStore.getState().setNearby(null);
    };
  }, [atlases, held, look]);

  return (
    <>
      {/* A canvas keeps the context it was first given, so each look gets its own element. */}
      <canvas
        key={look}
        ref={canvasRef}
        style={canvasStyle}
        aria-label={look === "hd2d" ? "Unwritten Land, HD-2D view" : "Unwritten Land, 16-bit view"}
      />
      {look === "hd2d" ? <canvas ref={overlayRef} style={overlayStyle} /> : null}
      {assetError === null ? null : (
        <div
          role="alert"
          style={{
            position: "absolute",
            left: 24,
            bottom: 72,
            maxWidth: 480,
            padding: "12px 16px",
            color: colors.text,
            background: colors.bgOverlay,
            border: `1px solid ${colors.danger}`,
          }}
        >
          {`CC0 2D assets failed to load: ${assetError}`}
        </div>
      )}
    </>
  );
}

function initialPlayer(scene: SceneGraph): PlayerState {
  // Coming back out of a place: stand at its entrance, not where the save last put the player.
  const back = useSessionStore.getState().takeLandReturn();
  if (back !== null) return { x: back.x, z: back.z, yaw: 0, facing: "south", moving: false };
  const sceneId = scene.contract?.sceneId ?? null;
  const saved = useSessionStore.getState().activeInstance?.instance.save.position;
  if (sceneId !== null && saved?.sceneId === sceneId) {
    return { x: saved.x, z: saved.z, yaw: saved.yaw, facing: "south", moving: false };
  }
  const [x, , z] = spawnPoint(scene);
  return { x, z, yaw: 0, facing: "south", moving: false };
}

function updatePlayer(
  player: PlayerState,
  held: ReadonlySet<string>,
  delta: number,
  kit: GameplayKitRules,
  rules: GameplayRules | null,
  canMove: (x: number, z: number) => boolean,
): void {
  const axis = moveAxis(held, rules?.bindings);
  const speed = isSprinting(held, rules?.bindings) ? kit.sprintSpeed : kit.moveSpeed;
  const dx = axis.strafe * speed * delta;
  const dz = -axis.forward * speed * delta;
  player.moving = dx !== 0 || dz !== 0;
  if (!player.moving) return;
  if (Math.abs(dx) > Math.abs(dz)) player.facing = dx > 0 ? "east" : "west";
  else player.facing = dz > 0 ? "south" : "north";
  player.yaw = Math.atan2(dx, dz);
  // Someone already standing inside a collider (a prop that appeared under them, a restored
  // position) must be able to walk out, or every direction is refused forever.
  const trapped = !canMove(player.x, player.z);
  if (trapped || canMove(player.x + dx, player.z)) player.x += dx;
  if (trapped || canMove(player.x, player.z + dz)) player.z += dz;
}

function canStand(
  origin: SceneGraph,
  seed: number,
  chunks: Readonly<Record<string, ChunkStatus>>,
  x: number,
  z: number,
): boolean {
  const corners = [
    [x - PLAYER_RADIUS, z - PLAYER_RADIUS],
    [x + PLAYER_RADIUS, z - PLAYER_RADIUS],
    [x - PLAYER_RADIUS, z + PLAYER_RADIUS],
    [x + PLAYER_RADIUS, z + PLAYER_RADIUS],
  ] as const;
  for (const [px, pz] of corners) {
    if (!walkableAt(origin, seed, px, pz)) return false;
    if (blockedByProps(origin.props, 0, 0, px, pz)) return false;
    const coord = chunkOf(px, pz);
    const ox = coord.cx * CHUNK_SIZE;
    const oz = coord.cz * CHUNK_SIZE;
    const terrain = cachedTerrain(seed, origin.floor, coord);
    if (blockedByProps(terrain.props, ox, oz, px, pz)) return false;
    const written = chunks[chunkKey(coord)];
    if (written?.status !== "written") continue;
    if (isWallTile(written.scene.walls, Math.floor(px) - ox, Math.floor(pz) - oz)) return false;
    if (blockedByProps(written.scene.props, ox, oz, px, pz)) return false;
  }
  return true;
}
