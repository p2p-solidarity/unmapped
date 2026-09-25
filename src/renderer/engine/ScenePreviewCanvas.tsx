import { parseRules, parseScene } from "@dsl/index";
import { Canvas } from "@react-three/fiber";
import type { JSX } from "react";
import { Suspense } from "react";
import * as THREE from "three";
import { Stage } from "./GameCanvas";

export function ScenePreviewCanvas({
  sceneSource,
  rulesSource,
}: {
  sceneSource: string;
  rulesSource: string;
}): JSX.Element | null {
  const scene = parseScene(sceneSource);
  const rules = parseRules(rulesSource);
  if (!scene.ok || !rules.ok) return null;
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      camera={{ fov: 55, near: 0.1, far: 240, position: [0, 9, 12] }}
      style={{ width: "100%", height: "100%" }}
    >
      <Suspense fallback={null}>
        <Stage graph={scene.value} gameplayRules={rules.value} />
      </Suspense>
    </Canvas>
  );
}
