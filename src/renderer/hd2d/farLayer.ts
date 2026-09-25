// Distant trees and built landmarks on the HD-2D horizon. Their silhouettes are shared textures;
// the mesh list changes only when the land changes, while their colour follows the daylight.

import { CHUNK_SIZE } from "@shared/chunks";
import * as THREE from "three";
import { HD2D_PALETTE, LANDMARK_MASK } from "../engine/palette";
import { FarField, LANDMARK_KINDS, type Landmark, paintSilhouettes } from "../engine2d/farLand";
import { floorOf } from "./content";
import type { Hd2dFrame } from "./renderer";

export function createFarLayer(scene: THREE.Scene): {
  sync(frame: Hd2dFrame): void;
  dispose(): void;
} {
  const group = new THREE.Group();
  scene.add(group);
  const field = new FarField();
  let previous: readonly Landmark[] | null = null;
  const sheet = paintSilhouettes(LANDMARK_MASK);
  const materials = LANDMARK_KINDS.map((_, index) => {
    const cell = document.createElement("canvas");
    cell.width = 128;
    cell.height = 128;
    cell.getContext("2d")?.drawImage(sheet, index * 128, 0, 128, 128, 0, 0, 128, 128);
    const map = new THREE.CanvasTexture(cell);
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      fog: false,
      color: HD2D_PALETTE.haze,
    });
  });
  const geometry = new THREE.PlaneGeometry(1, 1);
  return {
    sync(frame) {
      const landmarks = field.around(
        {
          seed: frame.seed,
          floor: floorOf(frame),
          land: frame.land ?? null,
          chunks: frame.chunks,
          origin: frame.origin,
        },
        Math.floor(frame.focus.x / CHUNK_SIZE),
        Math.floor(frame.focus.z / CHUNK_SIZE),
      );
      if (landmarks !== previous) {
        previous = landmarks;
        group.clear();
        for (const mark of landmarks) {
          if (Math.hypot(mark.x - frame.focus.x, mark.z - frame.focus.z) < 12) continue;
          const material = materials[LANDMARK_KINDS.indexOf(mark.kind)];
          if (material === undefined) continue;
          const mesh = new THREE.Mesh(geometry, material);
          mesh.scale.set(mark.height * (mark.kind === "tower" ? 0.5 : 0.9), mark.height, 1);
          mesh.position.set(mark.x, mark.height / 2, mark.z);
          group.add(mesh);
        }
      }
      if (frame.light !== undefined) {
        const [r, g, b] = frame.light.far;
        for (const material of materials) material.color.setRGB(r, g, b, THREE.SRGBColorSpace);
      }
    },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      for (const material of materials) {
        material.map?.dispose();
        material.dispose();
      }
    },
  };
}
