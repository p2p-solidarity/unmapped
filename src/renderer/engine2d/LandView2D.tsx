import {
  type ChunkStatus,
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
import type { SceneGraph } from "@shared/world";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ninjaUrl from "../../assets/cc0/ninja_blue.png";
import samuraiBlueUrl from "../../assets/cc0/samurai_blue.png";
import samuraiGreenUrl from "../../assets/cc0/samurai_green.png";
import floorUrl from "../../assets/cc0/tileset_floor.png";
import villageUrl from "../../assets/cc0/tileset_village_abandoned.png";
import { isWallTile, spawnPoint, TILE_TOP } from "../engine/colliders";
import { sceneForRun } from "../engine/combat/encounter";
import { behaviorForKit, LEGACY_TPS_KIT, resolveSceneKit } from "../engine/kits/registry";
import { landTargets } from "../engine/landTargets";
import { registerPlayerProbe } from "../engine/playerProbe";
import { nearestTarget, sceneTargets, triggersWithin, triggerTarget } from "../engine/targets";
import { isSprinting, matchesAction, moveAxis, useKeys } from "../engine/useKeys";
import type { AtlasId } from "./assetCatalog";
import { renderLandFrame, type SpriteAtlases } from "./canvasRenderer";
import { blockedByProps, cachedTerrain, walkableAt } from "./landModel";

const TILE_SIZE = 48;
const PLAYER_RADIUS = 0.22;
const MAX_DELTA = 0.05;
const FPS_INTERVAL = 0.5;
const INTERACT_KEYS = ["KeyE"] as const;

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const player = useRef<PlayerState>(initialPlayer(graph));
  const fired = useRef<Set<string>>(new Set());

  const kit: GameplayKitRules = useMemo(() => {
    if (gameplayRules === null) return LEGACY_TPS_KIT;
    const resolved = resolveSceneKit(gameplayRules, graph);
    return resolved.ok ? resolved.value : LEGACY_TPS_KIT;
  }, [gameplayRules, graph]);
  const extraTargets = useMemo(
    () => landTargets(chunks, progress, graph),
    [chunks, progress, graph],
  );
  const targets = useMemo(
    () => [...sceneTargets(graph, opened), ...extraTargets],
    [graph, opened, extraTargets],
  );

  const onPress = useCallback(
    (code: string) => {
      if (code === "KeyN") {
        useSessionStore.getState().toggleNotes(true);
        return;
      }
      if (!matchesAction(code, gameplayRules?.bindings, "interact", INTERACT_KEYS)) return;
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
  const live = useRef({ chunks, gameplayRules, graph, kit, landSeed, notes, progress, targets });
  live.current = { chunks, gameplayRules, graph, kit, landSeed, notes, progress, targets };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || atlases === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;
    let frameId = 0;
    let previous = performance.now();
    let frameCount = 0;
    let fpsElapsed = 0;
    let lastChunk = "";

    const resize = (): void => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(bounds.width * ratio));
      canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

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

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderLandFrame({
        ctx: context,
        width: canvas.width / ratio,
        height: canvas.height / ratio,
        tileSize: TILE_SIZE,
        scene: state.graph,
        seed: state.landSeed,
        player: position,
        atlases,
        chunks: state.chunks,
        progress: state.progress,
        notes: state.notes,
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
      useEngineStore.getState().setChunk(null);
      useEngineStore.getState().setNearby(null);
    };
  }, [atlases, held]);

  return (
    <>
      <canvas ref={canvasRef} style={canvasStyle} aria-label="Unwritten Land 2D open world" />
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
  if (canMove(player.x + dx, player.z)) player.x += dx;
  if (canMove(player.x, player.z + dz)) player.z += dz;
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

async function loadAtlases(): Promise<SpriteAtlases> {
  const sources: Record<AtlasId, string> = {
    floor: floorUrl,
    village: villageUrl,
    ninja: ninjaUrl,
    samuraiBlue: samuraiBlueUrl,
    samuraiGreen: samuraiGreenUrl,
  };
  const entries = await Promise.all(
    Object.entries(sources).map(async ([id, url]) => [id, await loadImage(url)] as const),
  );
  return Object.fromEntries(entries) as SpriteAtlases;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}
