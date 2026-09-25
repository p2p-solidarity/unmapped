import { translate } from "@renderer/i18n";
import {
  useContinentStore,
  useEncounterStore,
  useEngineStore,
  useLandStore,
  useRunStore,
  useSessionStore,
} from "@renderer/state";
import { colors } from "@renderer/ui";
import { chunkKey, chunkOf } from "@shared/chunks";
import { seedFromText } from "@shared/endless";
import type { GameplayKitRules, GameplayRules } from "@shared/gameplay";
import { landSeedOf } from "@shared/land";
import { nextEpisode, storyEpisodes } from "@shared/story";
import type { SceneGraph } from "@shared/world";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { spawnPoint, TILE_TOP } from "../engine/colliders";
import { sceneForRun } from "../engine/combat/encounter";
import { behaviorForKit, LEGACY_TPS_KIT, resolveSceneKit } from "../engine/kits/registry";
import { landTargets } from "../engine/landTargets";
import { registerPlayerProbe, registerPoseProbe } from "../engine/playerProbe";
import { getRemotePlayers } from "../engine/remoteRoster";
import { nearestTarget, sceneTargets, triggersWithin, triggerTarget } from "../engine/targets";
import { isSprinting, matchesAction, moveAxis, useKeys } from "../engine/useKeys";
import { loadAtlases } from "./atlases";
import type { SpriteAtlases } from "./canvasRenderer";
import { chapterScene, readChapter } from "./chapterLayer";
import { continentMarkers, continentTargets, mergeChunks, mergeNotes } from "./continentLayer";
import { landLightAt } from "./landLight";
import { canStandAt } from "./landModel";
import { hd2dSurface, type LandSurface, pixelSurface } from "./landSurface";
import { placeTargets } from "./placeLayer";
import { type StoryView, storyTargets } from "./storyLayer";
import { useLandCombat } from "./useLandCombat";
import { findPath, type Point, type Route, STUCK_SECONDS, steer } from "./walkTo";

const MAX_DELTA = 0.05;
/** How close (tiles) a click must land to a person, a door or a foe to mean it. */
const CLICK_REACH = 0.75;
/** Heights (tiles) a click is tested at: figures stand up, so their bodies cover ground behind. */
const CLICK_HEIGHTS = [0, 0.6, 1.2] as const;
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
  onFelled,
}: {
  rawGraph: SceneGraph;
  gameplayRules: GameplayRules | null;
  /** A combatant fell on the land (the app records a story chapter's foes). */
  onFelled?: (id: string) => void;
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
  const ownChunks = useLandStore((state) => state.chunks);
  const progress = useLandStore((state) => state.progress);
  const ownNotes = useLandStore((state) => state.notes);
  // On a continent, other worlds' land stands beside this one, already in its coordinates.
  const land = useContinentStore((state) => state.territory);
  const foreignChunks = useContinentStore((state) => state.chunks);
  const foreignNotes = useContinentStore((state) => state.notes);
  const worlds = useContinentStore((state) => state.worlds);
  const anchor = useContinentStore((state) => state.anchor);
  const self = useSessionStore((state) => state.playerProfile?.displayName ?? "");
  const chunks = useMemo(
    () => mergeChunks(ownChunks, foreignChunks, land),
    [ownChunks, foreignChunks, land],
  );
  const notes = useMemo(
    () => mergeNotes(ownNotes, foreignNotes, land),
    [ownNotes, foreignNotes, land],
  );
  const continent = useMemo(
    () => continentMarkers({ anchor, self, worlds }),
    [anchor, self, worlds],
  );
  const opened = useEngineStore((state) => state.openedTreasures);
  const teleport = useEngineStore((state) => state.teleport);
  const [atlases, setAtlases] = useState<SpriteAtlases | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const look = useEngineStore((state) => state.landLook);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  // Once per mount: it reads the way back from a place (consumed after mount, never in render).
  const [start] = useState(() => initialPlayer(graph));
  const player = useRef<PlayerState>(start);
  // A door request made before this view existed belongs to an earlier walk; only later ones move.
  const teleportAtMount = useRef(teleport?.seq ?? null);
  const fired = useRef<Set<string>>(new Set());
  const route = useRef<Route | null>(null);

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
  // The story's current chapter, standing around its gate (a climb or a maze is entered instead).
  const chapter = useMemo(() => {
    const next = story === null ? null : nextEpisode(story.episodes, story.progress);
    const stage = next === null ? null : (story?.progress[next.id]?.stage ?? null);
    const draft = stage?.kind === "land" ? readChapter(stage.source) : null;
    if (next === null || stage === null || draft === null) return null;
    return chapterScene(next, stage, draft, (x, z) =>
      canStandAt(graph, landSeed, chunks, x + 0.5, z + 0.5, land),
    );
  }, [story, graph, landSeed, chunks, land]);
  const extraTargets = useMemo(
    () => [
      ...landTargets(chunks, progress, graph),
      ...(story === null ? [] : storyTargets(story)),
      ...placeTargets(places),
      ...continentTargets(worlds),
      // Its foes are fought, not talked to: only its people and treasures are targets.
      ...(chapter === null ? [] : sceneTargets({ ...chapter, monsters: [] }, [], false)),
    ],
    [chunks, progress, graph, story, places, chapter, worlds],
  );
  const targets = useMemo(
    () => [...sceneTargets(graph, opened, false), ...extraTargets],
    [graph, opened, extraTargets],
  );

  // Rebuilt only when who stands in the chapter changes, not on every talk or find.
  const foeKey = chapter?.monsters.map((monster) => monster.id).join(",") ?? "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: foeKey is the roster's identity
  const extra = useMemo(() => chapter?.monsters ?? [], [foeKey]);
  const combat = useLandCombat({
    graph,
    rules: gameplayRules,
    seed: landSeed,
    land,
    player,
    extra,
    ...(onFelled === undefined ? {} : { onFelled }),
  });
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

  // Presence: the others on the continent see which way this player faces and whether they walk.
  useEffect(
    () =>
      registerPoseProbe(() => ({
        facing: player.current.facing,
        moving: player.current.moving,
      })),
    [],
  );

  useEffect(() => {
    if (teleport === null || teleport.seq === teleportAtMount.current) return;
    player.current.x = teleport.x;
    player.current.z = teleport.z;
  }, [teleport]);

  useEffect(() => {
    useSessionStore.getState().takeLandReturn();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger entries reset with the floor
  useEffect(() => {
    fired.current.clear();
  }, [graph.name]);

  // Everything the loop reads that can change while walking. Witnessed chunks, notes and targets
  // update often; routing them through a ref keeps one long-lived rAF loop instead of tearing it
  // down (and blanking the HUD's chunk/nearby state) on every write.
  const live = useRef({
    chapter,
    chunks,
    continent,
    gameplayRules,
    graph,
    kit,
    land,
    landSeed,
    notes,
    places,
    progress,
    story,
    targets,
  });
  live.current = {
    chapter,
    chunks,
    continent,
    gameplayRules,
    graph,
    kit,
    land,
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
      useSessionStore.getState().toast("danger", translate("land.hd2dUnavailable", { reason }));
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
    // A click on the land: a foe under it is shot (when armed); anything else is walked to — a
    // person, a treasure, a gate or a door is used on arrival, plain ground is just reached.
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || useEngineStore.getState().inputLocked) return;
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const ground = draw.pick(sx, sy);
      if (ground === null) return;
      const under = <T extends Point>(items: readonly T[]): T | null =>
        closest(
          items,
          CLICK_HEIGHTS.map((height) => draw.pick(sx, sy, height) ?? ground),
        );
      const state = live.current;
      const fight = combatRef.current;
      if (fight.armed() && firesOnLand("MouseLeft", state.gameplayRules?.bindings)) {
        const foe = under(fight.foes() ?? []);
        if (foe !== null) {
          route.current = null;
          face(player.current, foe.x - player.current.x, foe.z - player.current.z);
          fight.fire(performance.now());
          return;
        }
      }
      const target = under(state.targets);
      const points = findPath(player.current, target ?? ground, (x, z) =>
        canStandAt(state.graph, state.landSeed, state.chunks, x, z, state.land),
      );
      route.current =
        points === null
          ? null
          : {
              points,
              target: target?.id ?? null,
              stopWithin: target === null ? 0 : Math.max(0.3, state.kit.interactDistance - 0.5),
              stuck: 0,
            };
    };
    canvas.addEventListener("pointerdown", onPointerDown);

    const tick = (now: number): void => {
      const state = live.current;
      const delta = Math.min(MAX_DELTA, Math.max(0, (now - previous) / 1000));
      previous = now;
      const bindings = state.gameplayRules?.bindings;
      const keys = moveAxis(held.current, bindings);
      const speed = isSprinting(held.current, bindings)
        ? state.kit.sprintSpeed
        : state.kit.moveSpeed;
      // The keys, or anything that takes the controls away (a dialogue, a panel), end a walk.
      if (keys.strafe !== 0 || keys.forward !== 0 || useEngineStore.getState().inputLocked) {
        route.current = null;
      }
      const walk = route.current;
      let axis = keys;
      let arrived: string | null = null;
      if (walk !== null) {
        const next = steer(walk, player.current, speed * delta);
        if (next === null) {
          route.current = null;
          arrived = walk.target;
        } else axis = next;
      }
      const before = { x: player.current.x, z: player.current.z };
      updatePlayer(player.current, axis, speed, delta, (x, z) =>
        canStandAt(state.graph, state.landSeed, state.chunks, x, z, state.land),
      );
      const position = player.current;
      // A walk that stops getting anywhere (something moved into the way) is given up.
      if (walk !== null && route.current === walk) {
        const moved = Math.hypot(position.x - before.x, position.z - before.z);
        walk.stuck = moved < speed * delta * 0.25 ? walk.stuck + delta : 0;
        if (walk.stuck > STUCK_SECONDS) route.current = null;
      }
      const coord = chunkOf(position.x, position.z);
      const key = chunkKey(coord);
      if (key !== lastChunk) {
        lastChunk = key;
        useEngineStore.getState().setChunk(coord);
      }
      const nearby = nearestTarget(
        state.targets,
        position.x,
        position.z,
        state.kit.interactDistance,
      );
      useEngineStore.getState().setNearby(nearby);
      // Walked up to what was clicked: use it, as E would.
      if (arrived !== null && nearby?.id === arrived) useEngineStore.getState().interact(nearby);
      for (const trigger of triggersWithin(state.graph.triggers, position.x, position.z)) {
        if (fired.current.has(trigger.id)) continue;
        fired.current.add(trigger.id);
        useEngineStore.getState().interact(triggerTarget(trigger, position.x, position.z));
      }

      if (!useEngineStore.getState().inputLocked) {
        combatRef.current.step(delta, (x, z) =>
          canStandAt(state.graph, state.landSeed, state.chunks, x, z, state.land),
        );
      }

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
        chapter: state.chapter,
        goal: route.current?.points.at(-1) ?? null,
        land: state.land,
        others: getRemotePlayers(),
        continent: state.continent,
        light: landLightAt(position.x, position.z, now),
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
        aria-label={translate(look === "hd2d" ? "land.viewHd2d" : "land.viewPixel")}
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
          {translate("land.assetsFailed", { reason: assetError })}
        </div>
      )}
    </>
  );
}

function initialPlayer(scene: SceneGraph): PlayerState {
  // Coming back out of a place: stand at its entrance, not where the save last put the player.
  // Only read here: a store write during render would re-render other components mid-render.
  const back = useSessionStore.getState().landReturn;
  if (back !== null) return { x: back.x, z: back.z, yaw: 0, facing: "south", moving: false };
  const sceneId = scene.contract?.sceneId ?? null;
  const saved = useSessionStore.getState().activeInstance?.instance.save.position;
  if (sceneId !== null && saved?.sceneId === sceneId) {
    return { x: saved.x, z: saved.z, yaw: saved.yaw, facing: "south", moving: false };
  }
  const [x, , z] = spawnPoint(scene);
  return { x, z, yaw: 0, facing: "south", moving: false };
}

/** The item of `items` nearest any of the `points`, if one lies within CLICK_REACH. */
function closest<T extends Point>(items: readonly T[], points: readonly Point[]): T | null {
  let best: { item: T; distance: number } | null = null;
  for (const item of items) {
    for (const point of points) {
      const distance = Math.hypot(item.x - point.x, item.z - point.z);
      if (distance <= CLICK_REACH && (best === null || distance < best.distance)) {
        best = { item, distance };
      }
    }
  }
  return best?.item ?? null;
}

/** Turns the walker to face along (dx, dz), as walking that way would. */
function face(player: PlayerState, dx: number, dz: number): void {
  if (dx === 0 && dz === 0) return;
  if (Math.abs(dx) > Math.abs(dz)) player.facing = dx > 0 ? "east" : "west";
  else player.facing = dz > 0 ? "south" : "north";
  player.yaw = Math.atan2(dx, dz);
}

function updatePlayer(
  player: PlayerState,
  axis: { strafe: number; forward: number },
  speed: number,
  delta: number,
  canMove: (x: number, z: number) => boolean,
): void {
  const dx = axis.strafe * speed * delta;
  const dz = -axis.forward * speed * delta;
  player.moving = dx !== 0 || dz !== 0;
  if (!player.moving) return;
  face(player, dx, dz);
  // Someone already standing inside a collider (a prop that appeared under them, a restored
  // position) must be able to walk out, or every direction is refused forever.
  const trapped = !canMove(player.x, player.z);
  if (trapped || canMove(player.x + dx, player.z)) player.x += dx;
  if (trapped || canMove(player.x, player.z + dz)) player.z += dz;
}
