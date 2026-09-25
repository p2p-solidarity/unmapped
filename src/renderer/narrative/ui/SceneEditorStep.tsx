// The build step: you see the level and you click on it.
//
// This is the answer to "there is no visualised object anywhere" — the space is the interface. The
// palette on the left is what you are holding; the canvas is the level; clicking puts the thing
// where you pointed and dragging paints a run of them. Right-click or Alt-click takes it away.
//
// The framing follows the kit the modes resolved to, so a side-scroller is authored side-on (the
// Mario-Maker view) and a free 3D game is authored from an orbit.

import { EditorCanvas, type EditorFraming, type EditorTile } from "@renderer/engine";
import type { StringKey } from "@renderer/i18n";
import { useT } from "@renderer/i18n";
import { Button, colors, Surface, space, Text } from "@renderer/ui";
import { BRUSH_KINDS, type Brush, describeTile, erase, paint } from "@shared/sceneEdit";
import { MONSTER_KINDS, PROP_KINDS, type SceneGraph, TILES } from "@shared/world";
import { type JSX, useState } from "react";

const BRUSH_LABEL: Record<Brush["kind"], StringKey> = {
  platform: "brushPlatform",
  wall: "brushWall",
  prop: "brushProp",
  physics: "brushPhysics",
  monster: "brushMonster",
  treasure: "brushTreasure",
  patch: "brushPatch",
  exit: "brushExit",
};

const MAX_ELEVATION = 12;

export interface SceneEditorStepProps {
  graph: SceneGraph;
  framing: EditorFraming;
  onChange(graph: SceneGraph): void;
}

export function SceneEditorStep({ graph, framing, onChange }: SceneEditorStepProps): JSX.Element {
  const t = useT();
  const [brush, setBrush] = useState<Brush>({
    kind: framing === "side" ? "platform" : "prop",
    prop: "crate",
    monster: "slime",
    tile: "stone",
    elevation: framing === "side" ? 1 : 0,
    bounce: false,
  });
  const [hover, setHover] = useState<EditorTile | null>(null);
  const [simulating, setSimulating] = useState(false);

  const under = hover === null ? null : describeTile(graph, hover.x, hover.z);
  const freeBodies = graph.props.filter((prop) => prop.dynamic).length;
  // A prop brush and a physics brush both place props, so they share the kind picker.
  const placesProp = brush.kind === "prop" || brush.kind === "physics";

  return (
    <div className="editor">
      <Surface variant="overlay" padding="sm" style={{ gap: space.sm, overflowY: "auto" }}>
        <Text variant="label" tone="accent">
          {t("holding")}
        </Text>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {BRUSH_KINDS.map((kind) => (
            <Button
              key={kind}
              variant="chip"
              active={brush.kind === kind}
              disabled={simulating}
              onClick={() => setBrush({ ...brush, kind })}
              style={{ minHeight: 32 }}
            >
              {t(BRUSH_LABEL[kind])}
            </Button>
          ))}
        </div>

        {brush.kind === "physics" ? (
          <Text variant="caption" tone="dim">
            {t("editorPhysicsNote")}
          </Text>
        ) : null}

        {placesProp ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {PROP_KINDS.map((kind) => (
              <Button
                key={kind}
                variant="chip"
                active={brush.prop === kind}
                disabled={simulating}
                onClick={() => setBrush({ ...brush, prop: kind })}
                style={{ minHeight: 30 }}
              >
                {kind}
              </Button>
            ))}
          </div>
        ) : null}

        {brush.kind === "monster" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {MONSTER_KINDS.map((kind) => (
              <Button
                key={kind}
                variant="chip"
                active={brush.monster === kind}
                disabled={simulating}
                onClick={() => setBrush({ ...brush, monster: kind })}
                style={{ minHeight: 30 }}
              >
                {kind}
              </Button>
            ))}
          </div>
        ) : null}

        {brush.kind === "platform" || brush.kind === "wall" || brush.kind === "patch" ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {TILES.map((tile) => (
              <Button
                key={tile}
                variant="chip"
                active={brush.tile === tile}
                disabled={simulating}
                onClick={() => setBrush({ ...brush, tile })}
                style={{ minHeight: 30 }}
              >
                {tile}
              </Button>
            ))}
          </div>
        ) : null}

        {brush.kind === "platform" ? (
          <>
            <Text variant="caption" tone="dim">
              {t("editorHeight", { n: brush.elevation })}
            </Text>
            <div style={{ display: "flex", gap: 4 }}>
              <Button
                variant="chip"
                disabled={simulating}
                onClick={() => setBrush({ ...brush, elevation: Math.max(0, brush.elevation - 1) })}
                style={{ minHeight: 32 }}
              >
                −
              </Button>
              <Button
                variant="chip"
                disabled={simulating}
                onClick={() =>
                  setBrush({ ...brush, elevation: Math.min(MAX_ELEVATION, brush.elevation + 1) })
                }
                style={{ minHeight: 32 }}
              >
                +
              </Button>
              <Button
                variant="chip"
                active={brush.bounce}
                disabled={simulating}
                onClick={() => setBrush({ ...brush, bounce: !brush.bounce })}
                style={{ minHeight: 32 }}
              >
                {t("editorBounce")}
              </Button>
            </div>
          </>
        ) : null}

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {/* Running the simulation is how you find out a stack falls over before you stamp it. */}
          <Button
            variant={simulating ? "secondary" : "ghost"}
            disabled={freeBodies === 0}
            onClick={() => setSimulating((current) => !current)}
          >
            {simulating ? t("editorStopSim") : t("editorSimulate")}
          </Button>
          <Text variant="caption" tone="dim">
            {simulating
              ? t("editorSimRunning")
              : freeBodies === 0
                ? t("editorNothingDynamic")
                : t("editorHint")}
          </Text>
          <Text variant="caption" tone="muted" mono>
            {hover === null ? "—" : `${hover.x},${hover.z}${under === null ? "" : ` · ${under}`}`}
          </Text>
          <Text variant="caption" tone="dim" mono>
            {t("editorCounts", {
              platforms: graph.platforms.length,
              props: graph.props.length,
              monsters: graph.monsters.length,
            })}
          </Text>
        </div>
      </Surface>

      <div
        style={{ position: "relative", minHeight: 0, border: `1px solid ${colors.surfaceBorder}` }}
      >
        <EditorCanvas
          graph={graph}
          framing={framing}
          hover={hover}
          simulating={simulating}
          onHover={setHover}
          onPlace={(tile) => onChange(paint(graph, brush, tile.x, tile.z))}
          onErase={(tile) => onChange(erase(graph, tile.x, tile.z))}
        />
      </div>
    </div>
  );
}
