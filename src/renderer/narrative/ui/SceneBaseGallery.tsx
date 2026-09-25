// Scene Base Gallery (plan.md §2.1): pick the space before anything else.
//
// A base is the material language and the two tiles the author owns — where you start and where
// you leave. What sits between them is either the base's own composition or, when the modes asked
// for generation, the maze generator's.

import { serializeRules, serializeScene } from "@dsl";
import { ScenePreviewCanvas } from "@renderer/engine/ScenePreviewCanvas";
import { useT } from "@renderer/i18n";
import { Button, colors, space, Text } from "@renderer/ui";
import type { CapabilityProfile } from "@shared/capabilities";
import { rulesFor, sceneFor } from "@shared/forge";
import { rollBases, type SceneBase } from "@shared/scene-bases";
import { type JSX, useMemo } from "react";

export interface SceneBaseGalleryProps {
  selectedId: string | null;
  generated: boolean;
  profile: CapabilityProfile | null;
  rerollSeed?: number;
  onReroll?(seed: number): void;
  onSelect(base: SceneBase): void;
}

export function SceneBaseGallery({
  selectedId,
  generated,
  profile,
  rerollSeed,
  onReroll,
  onSelect,
}: SceneBaseGalleryProps): JSX.Element {
  const t = useT();
  // Each roll varies the size, the ground, the prop mix and where the exit sits, so the gallery is
  // a supply of spaces rather than a fixed handful of rooms.
  const seed = rerollSeed ?? 1;
  const bases = useMemo(() => rollBases(seed), [seed]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md, minHeight: 0 }}>
      <Text variant="caption" tone="dim">
        {generated ? t("baseIntroGenerated") : t("baseIntroAuthored")}
      </Text>

      <Button variant="ghost" onClick={() => onReroll?.(Math.floor(Math.random() * 2 ** 31))}>
        {`🎲 ${t("rollBases")}`}
      </Button>

      <div className="g-scroll forge-grid forge-grid--materials">
        {bases.map((base) => {
          const currentProfile = profile;
          const graph =
            currentProfile === null
              ? null
              : sceneFor({
                  base,
                  profile: currentProfile,
                  sceneId: "preview",
                  title: base.name,
                  monsters: 0,
                });
          return (
            <Button
              key={base.id}
              variant="tile"
              active={selectedId === base.id}
              onClick={() => onSelect(base)}
              style={{ minHeight: 250, padding: 0, overflow: "hidden" }}
            >
              {graph === null ? null : (
                <span
                  data-scene-preview
                  style={{ display: "block", width: "100%", height: 170, pointerEvents: "auto" }}
                >
                  <ScenePreviewCanvas
                    sceneSource={serializeScene(graph)}
                    rulesSource={serializeRules(rulesFor(currentProfile as CapabilityProfile))}
                  />
                </span>
              )}
              <span className="tile-body" style={{ padding: space.sm }}>
                <strong>{base.name}</strong>
                <small>{base.tagline}</small>
                <small
                  style={{ color: colors.textDim }}
                >{`${base.width}×${base.depth} · ${base.biome}`}</small>
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
