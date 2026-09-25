// The point-light budget. Scene `Light(point)` declarations and torch props compete for the same
// eight slots; anything past the cap is dropped dimmest-first so the brightest lanterns survive.
// Pure maths — <Atmosphere> only turns the placements into <pointLight> elements.

import type { FloorSpec, LightSpec, PropSpec, SceneGraph } from "@shared/world";
import { floorCenter, type Vec3 } from "./colliders";
import { PROP_SHAPE } from "./palette";

/** Forward+deferred cost is linear in lit sources; eight is the budget the scene may spend. */
export const MAX_POINT_LIGHTS = 8;
/** Lantern height of a placed point light, in world units above the floor top. */
export const POINT_LIGHT_HEIGHT = 1.6;
/** A point light with no x/z lights the whole floor, so it hangs higher. */
export const CENTRE_LIGHT_HEIGHT = 3.5;
/** LightSpec intensities are authored 0…1-ish; three needs physical units. */
export const POINT_GAIN = 12;
export const TORCH_INTENSITY = 6;
export const TORCH_DISTANCE = 9;

export interface PointLightPlacement {
  key: string;
  color: string;
  /** Final three.js intensity, already gained. */
  intensity: number;
  distance: number;
  position: Vec3;
}

/** Point lights declared by the scene. Ambient and sun lights are handled by <Atmosphere>. */
export function scenePointLights(
  lights: readonly LightSpec[],
  floor: FloorSpec,
): PointLightPlacement[] {
  const centre = floorCenter(floor);
  const span = Math.max(floor.width, floor.depth, 8);
  const placements: PointLightPlacement[] = [];
  lights.forEach((light, index) => {
    if (light.kind !== "point") return;
    const { x, z } = light;
    const placed = x !== null && z !== null;
    const position: Vec3 = placed
      ? [x + 0.5, POINT_LIGHT_HEIGHT, z + 0.5]
      : [centre[0], CENTRE_LIGHT_HEIGHT, centre[2]];
    placements.push({
      key: `scene-${index}-${light.color}`,
      color: light.color,
      intensity: Math.max(0, light.intensity) * POINT_GAIN,
      distance: placed ? Math.max(6, span * 0.6) : span,
      position,
    });
  });
  return placements;
}

/** Torch props carry their own lantern light, placed at the flame. */
export function torchPointLights(props: readonly PropSpec[]): PointLightPlacement[] {
  const placements: PointLightPlacement[] = [];
  props.forEach((prop, index) => {
    const shape = PROP_SHAPE[prop.kind];
    if (shape.light === null) return;
    const flame = shape.parts[shape.parts.length - 1];
    const size = prop.scale > 0 ? prop.scale : 1;
    const y = flame === undefined ? 1 : flame.offset[1];
    placements.push({
      key: `torch-${index}-${prop.x}-${prop.z}`,
      color: shape.light,
      intensity: TORCH_INTENSITY,
      distance: TORCH_DISTANCE,
      position: [prop.x + 0.5, y * size, prop.z + 0.5],
    });
  });
  return placements;
}

/**
 * Keeps the `max` brightest placements and restores the original order, so React keys never
 * shuffle when one light changes intensity. Ties keep the earlier entry.
 */
export function capPointLights(
  placements: readonly PointLightPlacement[],
  max = MAX_POINT_LIGHTS,
): PointLightPlacement[] {
  if (placements.length <= max) return [...placements];
  const ranked = placements
    .map((placement, index) => ({ placement, index }))
    .sort((a, b) =>
      a.placement.intensity === b.placement.intensity
        ? a.index - b.index
        : b.placement.intensity - a.placement.intensity,
    )
    .slice(0, max);
  return ranked.sort((a, b) => a.index - b.index).map((entry) => entry.placement);
}

/** Every point light the scene gets to keep: declared lights first, then torches. */
export function pointLights(graph: SceneGraph, max = MAX_POINT_LIGHTS): PointLightPlacement[] {
  return capPointLights(
    [...scenePointLights(graph.lights, graph.floor), ...torchPointLights(graph.props)],
    max,
  );
}
