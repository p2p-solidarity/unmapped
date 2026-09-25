import { parseRules, parseScene } from "@dsl/index";
import { Canvas } from "@react-three/fiber";
import { errorLine, translate, useT } from "@renderer/i18n";
import { useEncounterStore, useEngineStore, useWorldStore } from "@renderer/state";
import { Button, colors, space, Text } from "@renderer/ui";
import type { GameplayRules } from "@shared/gameplay";
import type { SceneGraph } from "@shared/world";
import { Suspense, useEffect, useState } from "react";
import * as THREE from "three";
import { Stage } from "./GameCanvas";

export function SandboxApp() {
  const [content, setContent] = useState<{ scene: SceneGraph; rules: GameplayRules } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const weapon = useEncounterStore((state) => state.weapon);
  const ammo = useEncounterStore((state) => state.ammo);
  const turn = useEncounterStore((state) => state.turn);
  const t = useT();
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        event.origin !== window.location.origin ||
        event.data?.type !== "aether-sandbox-load"
      )
        return;
      const { sceneSource, rulesSource } = event.data;
      if (
        typeof sceneSource !== "string" ||
        typeof rulesSource !== "string" ||
        sceneSource.length > 4 * 1024 * 1024 ||
        rulesSource.length > 4 * 1024 * 1024
      ) {
        setError(translate("hud.playtestInvalid"));
        return;
      }
      const scene = parseScene(sceneSource);
      const rules = parseRules(rulesSource);
      if (!scene.ok || !rules.ok) {
        setError(
          !scene.ok
            ? errorLine(scene.error)
            : !rules.ok
              ? errorLine(rules.error)
              : translate("hud.invalidContent"),
        );
        return;
      }
      useWorldStore.setState({
        sceneSource,
        scene: { status: "ready", value: scene.value },
        gameplayRules: rules.value,
        origin: null,
        meta: null,
        genesis: null,
      });
      useEngineStore.getState().resetFloor();
      useEngineStore.getState().setInputLocked(false);
      setError(null);
      setContent({ scene: scene.value, rules: rules.value });
      setRun((value) => value + 1);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage(
      { type: "aether-sandbox-ready" },
      window.location.protocol === "file:" ? "*" : window.location.origin,
    );
    return () => window.removeEventListener("message", receive);
  }, []);
  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", background: colors.bg }}>
      {content && !error ? (
        <Canvas
          key={run}
          shadows
          dpr={[1, 2]}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          camera={{ fov: 55, near: 0.1, far: 240, position: [0, 9, 12] }}
        >
          <Suspense fallback={null}>
            <Stage graph={content.scene} gameplayRules={content.rules} />
          </Suspense>
        </Canvas>
      ) : (
        <Text>{error ?? t("hud.loadingPlaytest")}</Text>
      )}
      <div
        style={{
          position: "absolute",
          left: space.sm,
          top: space.sm,
          right: space.sm,
          display: "flex",
          gap: space.sm,
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        <Text variant="caption">{t("hud.playtestHint")}</Text>
        <div style={{ pointerEvents: "auto" }}>
          <Button variant="secondary" onClick={() => setRun((value) => value + 1)}>
            {t("hud.reset")}
          </Button>
        </div>
      </div>
      <div
        style={{ position: "absolute", bottom: space.md, left: space.md, pointerEvents: "none" }}
      >
        <Text variant="caption">
          {weapon ? t("hud.ammo", { weapon: weapon.name, ammo: ammo ?? "∞" }) : ""}{" "}
          {turn ? `· ${turn.system} / ${turn.phase}` : ""}
        </Text>
      </div>
    </div>
  );
}
