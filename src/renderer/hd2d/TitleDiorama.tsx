// The title screen's backdrop: the open land itself, drawn by the HD-2D renderer, with the camera
// drifting slowly across it. It is only ground and scatter from a seed — no residents, no story,
// no invented places — so it shows the game's look without pretending to be anyone's world.

import { seedFromText } from "@shared/endless";
import { type JSX, useEffect, useRef } from "react";
import { loadAtlases } from "../engine2d/atlases";
import { createHd2dRenderer, type Hd2dView } from "./renderer";

const TITLE_VIEW: Hd2dView = { pitch: 31, fov: 26, distance: 34, blur: 9 };
const EMPTY = {} as const;

const fill = { position: "absolute", inset: 0, width: "100%", height: "100%" } as const;

export function TitleDiorama({ seedText }: { seedText: string }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    let frameId = 0;
    let disposed = false;
    let dispose = (): void => {};
    const seed = seedFromText(seedText);
    loadAtlases()
      .then((atlases) => {
        if (disposed) return;
        const renderer = createHd2dRenderer(canvas, null, atlases, TITLE_VIEW);
        dispose = () => renderer.dispose();
        const started = performance.now();
        const tick = (now: number): void => {
          const t = (now - started) / 1000;
          const rect = canvas.getBoundingClientRect();
          renderer.render({
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height),
            origin: null,
            seed,
            chunks: EMPTY,
            progress: null,
            notes: [],
            story: null,
            focus: { x: 6 + t * 0.7, z: 10 + Math.sin(t * 0.05) * 8 },
            player: null,
            now,
          });
          frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
      })
      .catch((error: unknown) => {
        // Decoration only: the menu works without it, but say why it is missing.
        console.warn("[title] HD-2D backdrop unavailable:", error);
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      dispose();
    };
  }, [seedText]);

  return <canvas ref={canvasRef} style={fill} />;
}
