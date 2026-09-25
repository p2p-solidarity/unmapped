// Cloud shadows: a soft noise map drifting across the ground, darkening what it passes over.
// Patched into the ground materials' shader so it costs one texture sample per pixel.

import * as THREE from "three";
import { tileHash } from "./assets";

const SIZE = 128;
const CELL = 16;

export interface CloudShade {
  time: { value: number };
  map: THREE.Texture;
  /** Adds the drifting shade to a ground material (call once per material). */
  apply(material: THREE.Material): void;
  dispose(): void;
}

export function createCloudShade(): CloudShade {
  // Tileable value noise: a lattice that wraps, smoothed by the GPU's bilinear filter.
  const cells = SIZE / CELL;
  const data = new Uint8Array(cells * cells * 4);
  for (let j = 0; j < cells; j += 1) {
    for (let i = 0; i < cells; i += 1) {
      const value = Math.round(tileHash(i, j, 41) * 255);
      data.set([value, value, value, 255], (j * cells + i) * 4);
    }
  }
  const map = new THREE.DataTexture(data, cells, cells);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  const time = { value: 0 };

  return {
    time,
    map,
    apply(material) {
      material.onBeforeCompile = (shader) => {
        shader.uniforms.cloudTime = time;
        shader.uniforms.cloudMap = { value: map };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec2 vCloud;")
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvCloud = (modelMatrix * vec4(transformed, 1.0)).xz;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform float cloudTime;\nuniform sampler2D cloudMap;\nvarying vec2 vCloud;",
          )
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            vec2 cloudUv = vCloud * 0.011 + vec2(cloudTime * 0.0035, cloudTime * 0.0021);
            float cloud = texture2D(cloudMap, cloudUv).r * 0.65 + texture2D(cloudMap, cloudUv * 2.3).r * 0.35;
            diffuseColor.rgb *= mix(1.0, 0.68, smoothstep(0.52, 0.78, cloud));`,
          );
      };
    },
    dispose() {
      map.dispose();
    },
  };
}
