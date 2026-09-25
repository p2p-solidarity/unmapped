// Lights, fog and background — plus the hot-swap crossfade. When `worldStore.mutationSeq` bumps
// (an NPC choice rewrote the sky) nothing hard-cuts: fog colour/density, background and the
// shared ground/wall material colours lerp to their new values over FADE_SECONDS while a brief
// emissive pulse runs through every prop.

import { useFrame, useThree } from "@react-three/fiber";
import { useWorldStore } from "@renderer/state";
import type { LightSpec, SceneGraph, WorldMutation } from "@shared/world";
import { type JSX, type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { floorCenter } from "./colliders";
import { emissivePulse, groundMaterial, wallMaterial } from "./geometry";
import { pointLights } from "./lights";
import { BIOME_PALETTE } from "./palette";

const FADE_SECONDS = 0.5;
const DEFAULT_FOG_DENSITY = 0.035;
const FALLBACK_AMBIENT_INTENSITY = 0.45;
/**
 * Open land is drawn two chunks (64 tiles) out. Fog at least this dense has swallowed the ground
 * by then, so the rim of the streamed chunks is never a visible edge.
 */
const OPEN_FOG_FLOOR = 0.024;
/**
 * A scene written as a night interior has no sun. Out on open land that leaves the ground nearly
 * black, so a weak light from above travels with the player — the author's sky stays, the land
 * just stops being invisible.
 */
const SKYLIGHT_INTENSITY = 5;
const SKYLIGHT_HEIGHT = 30;

interface AtmosphereValues {
  fog: THREE.Color;
  fogDensity: number;
  sky: THREE.Color;
  ground: THREE.Color;
  wall: THREE.Color;
}

interface Fade {
  from: AtmosphereValues;
  to: AtmosphereValues;
  /** 0 → 1 across FADE_SECONDS; 1 means settled. */
  t: number;
  started: boolean;
  /** True when this fade came from a world mutation, so props get the emissive pulse. */
  pulsing: boolean;
  /** Last `mutationSeq` this component reacted to. */
  seq: number;
}

interface KeyedLight {
  key: string;
  light: LightSpec;
  /** The first sun is the only shadow caster. */
  primary: boolean;
}

/**
 * Stable keys for the ambient/sun lights, which carry no ids of their own. Point lights are not
 * in here: they share one capped budget with the torches, resolved by `lights.ts`.
 */
function keyLights(lights: readonly LightSpec[]): KeyedLight[] {
  const seen = new Map<string, number>();
  let sunTaken = false;
  return lights
    .filter((light) => light.kind !== "point")
    .map((light) => {
      const base = `${light.kind}-${light.color}-${light.intensity}`;
      const nth = seen.get(base) ?? 0;
      seen.set(base, nth + 1);
      const primary = light.kind === "sun" && !sunTaken;
      if (primary) sunTaken = true;
      return { key: `${base}#${nth}`, light, primary };
    });
}

function emptyValues(): AtmosphereValues {
  return {
    fog: new THREE.Color(),
    fogDensity: DEFAULT_FOG_DENSITY,
    sky: new THREE.Color(),
    ground: new THREE.Color(),
    wall: new THREE.Color(),
  };
}

/** Target atmosphere for a graph: `sky` wins, the biome palette fills every gap. */
export function atmosphereOf(
  graph: SceneGraph,
  mutation: WorldMutation | null = null,
): AtmosphereValues {
  const palette = BIOME_PALETTE[graph.biome];
  const values = emptyValues();
  values.fog.set(mutation?.skyColor ?? (graph.sky === null ? palette.fog : graph.sky.fog));
  values.fogDensity =
    mutation?.fogDensity ?? (graph.sky === null ? DEFAULT_FOG_DENSITY : graph.sky.fogDensity);
  values.sky.set(mutation?.skyColor ?? (graph.sky === null ? palette.sky : graph.sky.color));
  values.ground.set(palette.ground);
  values.wall.set(palette.wall);
  return values;
}

function copyInto(target: AtmosphereValues, source: AtmosphereValues): void {
  target.fog.copy(source.fog);
  target.fogDensity = source.fogDensity;
  target.sky.copy(source.sky);
  target.ground.copy(source.ground);
  target.wall.copy(source.wall);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function Atmosphere({
  graph,
  follow = null,
}: {
  graph: SceneGraph;
  /** Open land: the sun and its shadow frustum travel with this position instead of the floor. */
  follow?: RefObject<THREE.Vector3> | null;
}): JSX.Element {
  const threeScene = useThree((state) => state.scene);
  const mutationSeq = useWorldStore((state) => state.mutationSeq);
  const mutation = useWorldStore((state) => state.meta?.mutation ?? null);
  const open = follow !== null;
  const target = useMemo(() => {
    const values = atmosphereOf(graph, mutation);
    if (open) values.fogDensity = Math.max(values.fogDensity, OPEN_FOG_FLOOR);
    return values;
  }, [graph, mutation, open]);
  const palette = BIOME_PALETTE[graph.biome];
  const centre = useMemo(() => floorCenter(graph.floor), [graph.floor]);

  const fog = useMemo(() => new THREE.FogExp2(new THREE.Color(), DEFAULT_FOG_DENSITY), []);
  const background = useMemo(() => new THREE.Color(), []);
  const fade = useRef<Fade>({
    from: emptyValues(),
    to: emptyValues(),
    t: 1,
    started: false,
    pulsing: false,
    seq: mutationSeq,
  });
  const lights = useMemo(() => keyLights(graph.lights), [graph.lights]);
  const points = useMemo(() => pointLights(graph), [graph]);

  useEffect(() => {
    threeScene.background = background;
    return () => {
      threeScene.background = null;
    };
  }, [threeScene, background]);

  useEffect(() => {
    const state = fade.current;
    const mutated = mutationSeq !== state.seq;
    state.seq = mutationSeq;
    if (!state.started) {
      copyInto(state.from, target);
      copyInto(state.to, target);
      state.t = 1;
      state.started = true;
      state.pulsing = false;
      fog.color.copy(target.fog);
      fog.density = target.fogDensity;
      background.copy(target.sky);
      groundMaterial.color.copy(target.ground);
      wallMaterial.color.copy(target.wall);
      return;
    }
    state.from.fog.copy(fog.color);
    state.from.fogDensity = fog.density;
    state.from.sky.copy(background);
    state.from.ground.copy(groundMaterial.color);
    state.from.wall.copy(wallMaterial.color);
    copyInto(state.to, target);
    state.t = 0;
    state.pulsing = mutated;
  }, [target, mutationSeq, fog, background]);

  useFrame((_, delta) => {
    const state = fade.current;
    if (state.t >= 1) {
      if (emissivePulse.value !== 0) emissivePulse.value = 0;
      return;
    }
    state.t = Math.min(1, state.t + delta / FADE_SECONDS);
    const k = smooth(state.t);
    fog.color.copy(state.from.fog).lerp(state.to.fog, k);
    fog.density = state.from.fogDensity + (state.to.fogDensity - state.from.fogDensity) * k;
    background.copy(state.from.sky).lerp(state.to.sky, k);
    groundMaterial.color.copy(state.from.ground).lerp(state.to.ground, k);
    wallMaterial.color.copy(state.from.wall).lerp(state.to.wall, k);
    emissivePulse.value = state.pulsing ? Math.sin(Math.PI * state.t) * 0.8 : 0;
  });

  const hasAmbient = graph.lights.some((light) => light.kind === "ambient");
  const hasSun = graph.lights.some((light) => light.kind === "sun");

  return (
    <>
      <primitive object={fog} attach="fog" />
      {!hasAmbient && (
        <ambientLight color={palette.ambient} intensity={FALLBACK_AMBIENT_INTENSITY} />
      )}
      {lights.map((entry) => (
        <SceneLight
          key={entry.key}
          light={entry.light}
          centre={centre}
          span={Math.max(graph.floor.width, graph.floor.depth)}
          primary={entry.primary}
          follow={follow}
        />
      ))}
      {follow !== null && !hasSun ? <Skylight color={palette.ambient} follow={follow} /> : null}
      {points.map((point) => (
        <pointLight
          key={point.key}
          color={point.color}
          intensity={point.intensity}
          distance={point.distance}
          decay={2}
          position={point.position}
        />
      ))}
    </>
  );
}

function Skylight({
  color,
  follow,
}: {
  color: string;
  follow: RefObject<THREE.Vector3>;
}): JSX.Element {
  const ref = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    const light = ref.current;
    if (light === null) return;
    const { x, z } = follow.current;
    light.position.set(x + SKYLIGHT_HEIGHT * 0.3, SKYLIGHT_HEIGHT, z + SKYLIGHT_HEIGHT * 0.2);
    light.target.position.set(x, 0, z);
    light.target.updateMatrixWorld();
  });
  return <directionalLight ref={ref} color={color} intensity={SKYLIGHT_INTENSITY} />;
}

function SceneLight({
  light,
  centre,
  span,
  primary,
  follow,
}: {
  light: LightSpec;
  centre: [number, number, number];
  span: number;
  primary: boolean;
  follow: RefObject<THREE.Vector3> | null;
}): JSX.Element | null {
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const reach = Math.max(span, 8);

  // Whole-tile steps, so the shadow map does not shimmer as the player walks.
  useFrame(() => {
    const sun = sunRef.current;
    if (sun === null || follow === null) return;
    const x = Math.round(follow.current.x);
    const z = Math.round(follow.current.z);
    sun.position.set(x + reach * 0.6, reach * 1.1, z + reach * 0.45);
    sun.target.position.set(x, 0, z);
    sun.target.updateMatrixWorld();
  });

  if (light.kind === "ambient") {
    return <ambientLight color={light.color} intensity={light.intensity} />;
  }
  if (light.kind === "sun") {
    return (
      <directionalLight
        ref={sunRef}
        color={light.color}
        intensity={light.intensity}
        castShadow={primary}
        position={[centre[0] + reach * 0.6, reach * 1.1, centre[2] + reach * 0.45]}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={1}
        shadow-camera-far={reach * 3}
        shadow-camera-left={-reach}
        shadow-camera-right={reach}
        shadow-camera-top={reach}
        shadow-camera-bottom={-reach}
        shadow-bias={-0.0008}
      />
    );
  }
  // Point lights are placed by `lights.ts` inside the shared budget, never here.
  return null;
}
