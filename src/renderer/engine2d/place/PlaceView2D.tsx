// A place on the land played on engine2d (rev6-phase2 D5): a course seen from the side or a dungeon
// seen from above, in the land's 16-bit look. One rAF loop moves the body (`placeMotion.ts`), finds
// what is in reach (`targets` → engineStore.setNearby), turns the interact key into
// engineStore.interact (useInteractions: talk, open, the ways out → leavePlace) and feeds the one
// combat model an aim and a clock (`usePlaceCombat`). The ground is the host's `buildPlace`; nothing
// here touches the save. No player probe is registered: a place is not a spot on the land, so the
// save keeps the land position taken when the land view left.

import { type StringKey, translate, useT } from "@renderer/i18n";
import { padControlsHint, useInputDevice } from "@renderer/input";
import { useEncounterStore, useEngineStore, useSessionStore } from "@renderer/state";
import { colors, Surface, space, Text } from "@renderer/ui";
import { kitTuning } from "@shared/forge";
import type { GameplayKitRules, GameplayRules } from "@shared/gameplay";
import type { SceneGraph } from "@shared/world";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createShove } from "../../engine/combat/livePositions";
import { sceneGround } from "../../engine/combat/sceneGround";
import { behaviorForKit, resolveSceneKit } from "../../engine/kits/registry";
import { nearestTarget, sceneTargets } from "../../engine/targets";
import {
  isActionPressed,
  isSprinting,
  matchesAction,
  moveAxis,
  useKeys,
} from "../../engine/useKeys";
import { loadAtlases } from "../atlases";
import type { SpriteAtlases } from "../canvasRenderer";
import { renderDungeon } from "./dungeonView";
import { fitCanvas } from "./placeDraw";
import {
  facingVector,
  type GridBody,
  gridDirection,
  gridMaze,
  gridPosition,
  gridSpawn,
  NO_SIDE_INPUT,
  type SideBody,
  sideCourse,
  sideReach,
  sideSpawn,
  stepGrid,
  stepSide,
} from "./placeMotion";
import { renderSide } from "./sideView";
import { type PlaceAim, rowGround, usePlaceCombat } from "./usePlaceCombat";

const MAX_DELTA = 0.05;
const FPS_INTERVAL = 0.5;
/** A flat shot leaves at chest height above the soles, as in the 2.5D and top-down kits. */
const SHOT_HEIGHT = 0.6;
const INTERACT_KEYS = ["KeyE"] as const;
const JUMP_KEYS = new Set(["Space"]);

type Mode = "side" | "dungeon";

const fill = { position: "absolute", inset: 0, width: "100%", height: "100%" } as const;
const canvasStyle = { ...fill, imageRendering: "pixelated", background: colors.bg } as const;

/**
 * What pulls the trigger here: fire's own binding (a click by default) and the flashlight's (F);
 * in a dungeon, where nothing jumps, the jump key too — the land's keys, minus the one a course
 * needs for jumping.
 */
function firesHere(code: string, bindings: GameplayRules["bindings"] | undefined, mode: Mode) {
  return (
    matchesAction(code, bindings, "fire", ["MouseLeft"]) ||
    matchesAction(code, bindings, "flashlight", ["KeyF"]) ||
    (mode === "dungeon" && matchesAction(code, bindings, "jump", ["Space"]))
  );
}

function kitOf(graph: SceneGraph, rules: GameplayRules | null): GameplayKitRules {
  if (rules !== null) {
    const resolved = resolveSceneKit(rules, graph);
    if (resolved.ok) return resolved.value;
  }
  return kitTuning(graph.contract?.kit ?? "dungeon_grid@1");
}

export function PlaceView2D({
  graph,
  rules,
  title,
}: {
  graph: SceneGraph;
  rules: GameplayRules | null;
  /** The place's stored name (a chapter's title), shown with its goal. */
  title: string;
}): JSX.Element {
  const t = useT();
  // The on-screen touch controls are labelled like a pad (A, Y), so touch reads pad glyphs too.
  const pad = useInputDevice() !== "keys";
  const kit = useMemo(() => kitOf(graph, rules), [graph, rules]);
  const mode: Mode = behaviorForKit(kit.id).movement === "side" ? "side" : "dungeon";
  const course = useMemo(() => sideCourse(graph), [graph]);
  const maze = useMemo(() => gridMaze(graph), [graph]);
  const side = useRef<SideBody>(sideSpawn(course));
  const grid = useRef<GridBody>(gridSpawn(graph));
  const shove = useMemo(() => createShove(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [atlases, setAtlases] = useState<SpriteAtlases | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const opened = useEngineStore((state) => state.openedTreasures);
  const armed = useEncounterStore((state) => state.weapon !== null);
  const fighting = rules?.combat !== null && rules?.combat !== undefined;
  // In a fight the monsters move and are fought, not inspected where they were written.
  const targets = useMemo(
    () => sceneTargets(graph, opened, false).filter((one) => !(fighting && one.kind === "monster")),
    [graph, opened, fighting],
  );

  const aim = useMemo<PlaceAim>(
    () =>
      mode === "side"
        ? {
            ray: () => {
              const body = side.current;
              return {
                x: body.x,
                y: body.y + SHOT_HEIGHT,
                z: course.z,
                dx: body.facing,
                dy: 0,
                dz: 0,
              };
            },
            // Hostiles see how high the body stands: one below a ledge cannot reach up to it.
            player: () => sideReach(side.current, course),
            shove: (dx) => shove.push(dx, 0),
          }
        : {
            ray: () => {
              const at = gridPosition(grid.current);
              const { dx, dz } = facingVector(grid.current.facing);
              return { x: at.x, y: SHOT_HEIGHT, z: at.z, dx, dy: 0, dz };
            },
            player: () => gridPosition(grid.current),
          },
    [mode, course, shove],
  );
  const ground = useMemo(
    () => (mode === "side" ? rowGround(course) : sceneGround(graph)),
    [mode, course, graph],
  );
  const onRevive = useCallback(() => {
    side.current = sideSpawn(course);
    grid.current = gridSpawn(graph);
    shove.drop();
    useSessionStore.getState().toast("info", translate("placeView.revived"));
  }, [course, graph, shove]);
  const combat = usePlaceCombat({ graph, rules, aim, ground, onRevive });
  const combatRef = useRef(combat);
  combatRef.current = combat;

  const onPress = useCallback(
    (code: string) => {
      const bindings = rules?.bindings;
      const fight = combatRef.current;
      if (fight.armed()) {
        if (firesHere(code, bindings, mode)) {
          fight.fire(performance.now());
          return;
        }
        if (matchesAction(code, bindings, "end_turn", ["KeyR"])) {
          fight.passTurn();
          return;
        }
        if (matchesAction(code, bindings, "pause", ["KeyP"])) {
          useEncounterStore.getState().togglePause();
          return;
        }
      }
      if (!matchesAction(code, bindings, "interact", INTERACT_KEYS)) return;
      const target = useEngineStore.getState().nearby;
      if (target !== null) useEngineStore.getState().interact(target);
    },
    [rules?.bindings, mode],
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

  // A place is a floor of its own, as the 3D view treated it: nothing in reach or opened carries in.
  useEffect(() => {
    useEngineStore.getState().resetFloor();
  }, []);

  useEffect(() => {
    useEngineStore.getState().setCameraMode(mode === "side" ? "side" : "topdown");
  }, [mode]);

  // What the loop reads that can change while it runs; one long-lived loop reads it through a ref.
  const live = useRef({ targets, kit, rules, course, maze, graph, opened });
  live.current = { targets, kit, rules, course, maze, graph, opened };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d") ?? null;
    if (canvas === null || ctx === null || atlases === null) return;
    let frameId = 0;
    let previous = performance.now();
    let frameCount = 0;
    let fpsElapsed = 0;
    let bounds = { width: 1, height: 1 };
    // Where the player was last drawn, in CSS pixels, so a click can turn them toward it.
    let drawnAt: [number, number] = [0, 0];

    const resize = (): void => {
      const rect = canvas.getBoundingClientRect();
      bounds = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // A click fires (fire's default binding), turned first toward the side that was clicked.
    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || useEngineStore.getState().inputLocked) return;
      const fight = combatRef.current;
      if (!fight.armed() || !firesHere("MouseLeft", live.current.rules?.bindings, mode)) return;
      const rect = canvas.getBoundingClientRect();
      const dx = event.clientX - rect.left - drawnAt[0];
      const dy = event.clientY - rect.top - drawnAt[1];
      if (mode === "side") {
        if (dx !== 0) side.current = { ...side.current, facing: dx > 0 ? 1 : -1 };
      } else if (!grid.current.moving) {
        const facing =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : dy > 0 ? "south" : "north";
        grid.current = { ...grid.current, facing };
      }
      fight.fire(performance.now());
    };
    canvas.addEventListener("pointerdown", onPointerDown);

    const tick = (now: number): void => {
      const state = live.current;
      const delta = Math.min(MAX_DELTA, Math.max(0, (now - previous) / 1000));
      previous = now;
      const locked = useEngineStore.getState().inputLocked;
      const bindings = state.rules?.bindings;
      const keys = held.current;
      const axis = locked ? { forward: 0, strafe: 0 } : moveAxis(keys, bindings);
      let reach: { x: number; z: number };
      if (mode === "side") {
        const push = shove.take(delta).x;
        // The jump binding (a pad's B) jumps, and so does up, as in most side-scrollers; down lets
        // go of a ledge.
        const input = locked
          ? { ...NO_SIDE_INPUT, push }
          : {
              move: Math.sign(axis.strafe),
              jump: axis.forward > 0 || isActionPressed(keys, bindings, "jump", JUMP_KEYS),
              sprint: isSprinting(keys, bindings),
              drop: axis.forward < 0,
              push,
            };
        side.current = stepSide(side.current, input, state.course, state.kit, delta);
        reach = sideReach(side.current, state.course);
      } else {
        const direction = locked ? null : gridDirection(axis, grid.current.facing);
        grid.current = stepGrid(grid.current, direction, state.maze, state.kit.moveSpeed, delta);
        reach = gridPosition(grid.current);
      }
      const nearby = nearestTarget(state.targets, reach.x, reach.z, state.kit.interactDistance);
      useEngineStore.getState().setNearby(nearby);
      if (!locked) combatRef.current.step(delta);

      fitCanvas(canvas, ctx, bounds.width, bounds.height);
      const shared = {
        ctx,
        atlases,
        width: bounds.width,
        height: bounds.height,
        graph: state.graph,
        opened: state.opened,
        foes: combatRef.current.foes(),
        shot: combatRef.current.shot.current,
        now,
      };
      drawnAt =
        mode === "side"
          ? renderSide({ ...shared, course: state.course, body: side.current })
          : renderDungeon({
              ...shared,
              player: {
                ...gridPosition(grid.current),
                facing: grid.current.facing,
                moving: grid.current.moving,
              },
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
      useEngineStore.getState().setNearby(null);
    };
  }, [atlases, held, mode, shove]);

  const goal = graph.quests[0]?.text.trim() ?? "";
  // What the HUD's control row does not say here (dropping from a ledge, which keys fire), with the
  // pad's own line after a pad input when the input map has one.
  const hintKey: StringKey | null =
    mode === "side"
      ? armed
        ? "placeView.hintSideArmed"
        : "placeView.hintSide"
      : armed
        ? "placeView.hintDungeonArmed"
        : null;
  const hint = hintKey === null ? null : t(pad ? padControlsHint(hintKey) : hintKey);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={canvasStyle}
        aria-label={t(mode === "side" ? "placeView.viewSide" : "placeView.viewDungeon", { title })}
      />
      <Surface
        variant="overlay"
        padding="sm"
        style={{
          position: "absolute",
          left: space.md,
          bottom: space.md,
          maxWidth: "min(360px, 30vw)",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          pointerEvents: "none",
          borderLeft: `3px solid ${colors.accent}`,
        }}
      >
        <Text variant="label" tone="accent">
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          {goal.length > 0 ? t("placeView.goal", { goal }) : t("placeView.reachEnd")}
        </Text>
        {hint === null ? null : (
          <Text variant="caption" tone="dim">
            {hint}
          </Text>
        )}
      </Surface>
      {assetError === null ? null : (
        <div
          role="alert"
          style={{
            position: "absolute",
            left: space.lg,
            bottom: 120,
            maxWidth: 480,
            padding: `${space.sm}px ${space.md}px`,
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
