// Proximity publisher. Runs every frame but only touches the store when the *identity* of the
// nearest target changes, so zustand sees a handful of writes per minute, not 60 per second.
// Triggers are separate: entering one fires `interact({ kind: "trigger" })` once per floor.

import { useFrame } from "@react-three/fiber";
import { useEngineStore } from "@renderer/state";
import type { SceneGraph } from "@shared/world";
import { type JSX, type RefObject, useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import { TILE_TOP } from "./colliders";
import { DEBUG_RING, standardMaterial } from "./geometry";
import { ENTITY_PALETTE } from "./palette";
import {
  nearestTarget,
  sceneTargets,
  type TargetPoint,
  triggersWithin,
  triggerTarget,
} from "./targets";

const NO_TARGETS: readonly TargetPoint[] = [];

/** Debug rings for the otherwise invisible trigger volumes: append `?debug` to the renderer URL. */
export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("debug");
}

export function Proximity({
  graph,
  player,
  radius,
  extra = NO_TARGETS,
}: {
  graph: SceneGraph;
  player: RefObject<THREE.Vector3>;
  radius?: number;
  /** Targets outside the scene graph — residents of witnessed open land. */
  extra?: readonly TargetPoint[];
}): JSX.Element | null {
  const opened = useEngineStore((state) => state.openedTreasures);
  const targets = useMemo(() => [...sceneTargets(graph, opened), ...extra], [graph, opened, extra]);
  const lastKey = useRef<string | null>(null);
  const fired = useRef<Set<string>>(new Set());
  const debug = useMemo(() => isDebugEnabled(), []);
  const floorKey = graph.name;

  // Fired triggers and the last nearby target are per-floor state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: floorKey is the deliberate trigger
  useEffect(() => {
    lastKey.current = null;
    fired.current.clear();
  }, [floorKey]);

  useFrame(() => {
    const position = player.current;
    const nearest = nearestTarget(targets, position.x, position.z, radius);
    const key = nearest === null ? null : `${nearest.kind}:${nearest.id}`;
    if (key !== lastKey.current) {
      lastKey.current = key;
      useEngineStore.getState().setNearby(nearest);
    }
    for (const trigger of triggersWithin(graph.triggers, position.x, position.z)) {
      if (fired.current.has(trigger.id)) continue;
      fired.current.add(trigger.id);
      useEngineStore.getState().interact(triggerTarget(trigger, position.x, position.z));
    }
  });

  if (!debug || graph.triggers.length === 0) return null;

  return (
    <>
      {graph.triggers.map((trigger) => (
        <mesh
          key={`trigger-${trigger.id}`}
          geometry={DEBUG_RING}
          material={standardMaterial(ENTITY_PALETTE.triggerDebug, 0.8)}
          position={[trigger.x + 0.5, TILE_TOP + 0.02, trigger.z + 0.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[Math.max(trigger.radius, 0.2), Math.max(trigger.radius, 0.2), 1]}
        />
      ))}
    </>
  );
}
