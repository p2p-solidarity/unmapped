import { parseRules, parseScene } from "@dsl/index";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import type { SceneGraph } from "@shared/world";
import type { JSX } from "react";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Atmosphere } from "./Atmosphere";
import { Exit } from "./Entities/Exit";
import { Monster } from "./Entities/Monster";
import { Npc } from "./Entities/Npc";
import { Treasure } from "./Entities/Treasure";
import { Ground } from "./Ground";
import { Platforms } from "./Platforms";
import { Props } from "./Props";
import { PhysicsProps } from "./sandbox/PhysicsProps";
import { exitId } from "./targets";
import { Walls } from "./Walls";

/**
 * A browser gives a page about sixteen WebGL contexts. A scene gallery with several slots and three
 * candidates each asks for more than that, and the extra ones come back as "Context Lost" — blank
 * tiles. So a preview exists only while it is on screen, and is torn down when it scrolls away.
 */
function useOnScreen(): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { rootMargin: "120px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, visible];
}

export function ScenePreviewCanvas({
  sceneSource,
  rulesSource,
}: {
  sceneSource: string;
  rulesSource: string;
}): JSX.Element | null {
  const [ref, visible] = useOnScreen();
  const scene = parseScene(sceneSource);
  const rules = parseRules(rulesSource);
  if (!scene.ok || !rules.ok) return null;
  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      {visible ? (
        <Canvas
          shadows
          dpr={[1, 2]}
          frameloop="demand"
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          camera={{ fov: 55, near: 0.1, far: 240, position: [0, 9, 12] }}
          style={{ width: "100%", height: "100%" }}
        >
          <Suspense fallback={null}>
            <PreviewStage graph={scene.value} />
          </Suspense>
        </Canvas>
      ) : null}
    </div>
  );
}

/** Static authoring preview: runtime geometry and parser, without touching live play stores. */
function PreviewStage({ graph }: { graph: SceneGraph }): JSX.Element {
  const freeBodies = graph.props.filter((prop) => prop.dynamic);
  return (
    <>
      <Atmosphere graph={graph} />
      <Physics paused>
        <Ground floor={graph.floor} patches={graph.patches} />
        <Platforms platforms={graph.platforms} />
        <Walls walls={graph.walls} />
        <Props props={graph.props} />
        <PhysicsProps props={freeBodies} />
      </Physics>
      {graph.npcs.map((npc) => (
        <Npc key={npc.id} npc={npc} />
      ))}
      {graph.monsters.map((monster) => (
        <Monster key={monster.id} monster={monster} />
      ))}
      {graph.treasures.map((treasure) => (
        <Treasure key={treasure.id} treasure={treasure} opened={false} />
      ))}
      {graph.exits.map((exit) => (
        <Exit key={exitId(exit.x, exit.z)} exit={exit} />
      ))}
      <OrbitControls
        makeDefault
        minDistance={4}
        maxDistance={40}
        target={[graph.floor.width / 2, 0, graph.floor.depth / 2]}
      />
    </>
  );
}
