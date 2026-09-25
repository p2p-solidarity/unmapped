// The HD-2D lens: bloom on anything bright (lanterns, gate beams, sunlit water), a tilt-shift
// depth of field that keeps a band around the player sharp and melts the near and far land into a
// miniature, then tone mapping, a warm/cool split grade and a vignette. All passes ship with three.

import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { HD2D_GRADE } from "../engine/palette";

const TILT_SHIFT = {
  uniforms: {
    tDiffuse: { value: null },
    /** One texel along the blur direction. */
    texel: { value: new THREE.Vector2(0, 0) },
    /** Screen height (0 bottom … 1 top) that is in focus, and the half-width of the sharp band. */
    focus: { value: 0.46 },
    band: { value: 0.12 },
    /** Blur radius in texels at the far edges. */
    radius: { value: 9 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 texel;
    uniform float focus;
    uniform float band;
    uniform float radius;
    varying vec2 vUv;
    void main() {
      float away = max(0.0, abs(vUv.y - focus) - band);
      // The far land (top) blurs sooner than the near edge, like a real lens tilted over a table.
      float reach = vUv.y > focus ? 1.0 - focus - band : focus - band;
      float amount = smoothstep(0.0, max(0.05, reach), away) * radius;
      vec2 step = texel * amount / 4.0;
      vec4 sum = texture2D(tDiffuse, vUv) * 0.1633;
      sum += (texture2D(tDiffuse, vUv + step) + texture2D(tDiffuse, vUv - step)) * 0.1531;
      sum += (texture2D(tDiffuse, vUv + step * 2.0) + texture2D(tDiffuse, vUv - step * 2.0)) * 0.12245;
      sum += (texture2D(tDiffuse, vUv + step * 3.0) + texture2D(tDiffuse, vUv - step * 3.0)) * 0.0918;
      sum += (texture2D(tDiffuse, vUv + step * 4.0) + texture2D(tDiffuse, vUv - step * 4.0)) * 0.051;
      gl_FragColor = sum;
    }`,
};

const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    shadowTint: { value: new THREE.Vector3(...HD2D_GRADE.shadowTint) },
    highlightTint: { value: new THREE.Vector3(...HD2D_GRADE.highlightTint) },
    saturation: { value: HD2D_GRADE.saturation },
    vignette: { value: HD2D_GRADE.vignette },
  },
  vertexShader: TILT_SHIFT.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 shadowTint;
    uniform vec3 highlightTint;
    uniform float saturation;
    uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(luma), color, saturation);
      color *= mix(shadowTint, highlightTint, smoothstep(0.15, 0.85, luma));
      vec2 centred = vUv - 0.5;
      float edge = smoothstep(0.35, 0.95, length(centred * vec2(1.25, 1.0)));
      color *= 1.0 - edge * vignette;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), texel.a);
    }`,
};

export interface Lens {
  composer: EffectComposer;
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Where the sharp band sits (0 bottom … 1 top) and how strong the blur is. */
  setFocus(focus: number, radius: number): void;
  dispose(): void;
}

export function createLens(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): Lens {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.55, 0.86);
  composer.addPass(bloom);
  const horizontal = new ShaderPass(TILT_SHIFT);
  const vertical = new ShaderPass(TILT_SHIFT);
  composer.addPass(horizontal);
  composer.addPass(vertical);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GRADE));

  const setUniform = (pass: ShaderPass, name: string, value: unknown): void => {
    const uniform = pass.uniforms[name];
    if (uniform !== undefined) uniform.value = value;
  };

  return {
    composer,
    setSize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      bloom.resolution.set(width, height);
      const w = width * pixelRatio;
      const h = height * pixelRatio;
      setUniform(horizontal, "texel", new THREE.Vector2(1 / w, 0));
      setUniform(vertical, "texel", new THREE.Vector2(0, 1 / h));
    },
    setFocus(focus, radius) {
      for (const pass of [horizontal, vertical]) {
        setUniform(pass, "focus", focus);
        setUniform(pass, "radius", radius);
      }
    },
    dispose() {
      composer.dispose();
      bloom.dispose();
    },
  };
}
