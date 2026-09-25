// The last Create step, where the three verbs are deliberately different things:
//
//   Preview       — build and validate the cartridge in memory and walk any one of its scenes.
//                   Nothing is written to disk; nothing becomes playable.
//   Forge         — publish the immutable revision. A cartridge now exists in the library, with no
//                   save attached, so it can be shared or started later from Cartridges.
//   Forge & Play  — publish, then create an instance pinned to that exact revision and open it.
//
// Conflating them was the old behaviour and it hid real failures behind "it worked".

import { SandboxPreview } from "@renderer/engine/SandboxPreview";
import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import type { CapabilityResolution } from "@shared/capabilities";
import type { InstanceMeta, PublishCartridgeInput } from "@shared/cartridge";
import type { AppError } from "@shared/result";
import type { AuthoringSnapshot } from "@shared/scene-gallery";
import { type JSX, useState } from "react";
import { buildCartridge, forgeAuthoring } from "../forge";
import { previewRules } from "./createModel";

export interface ForgeStepProps {
  snapshot: AuthoringSnapshot;
  resolution: CapabilityResolution;
  busy: string | null;
  setBusy(busy: string | null): void;
  setOperationError(error: AppError | null): void;
  /** Fills in whatever was left undecided and returns the snapshot Forge will actually use. */
  prepare(): AuthoringSnapshot;
  onCreated(meta: InstanceMeta): void;
}

interface Forged {
  cartridgeId: string;
  version: string;
  contentHash: string;
  scenes: number;
  voices: number;
}

function sceneIdsOf(input: PublishCartridgeInput): string[] {
  return input.manifest.formatVersion === 2
    ? input.manifest.definition.scenePlan.orderedSceneIds
    : input.manifest.scenes.map((scene) => scene.id);
}

function voiceCount(snapshot: AuthoringSnapshot): number {
  return snapshot.gallery.slots.reduce((count, slot) => {
    const candidate = slot.candidates.find((one) => one.candidateId === slot.selectedCandidateId);
    return count + Object.keys(candidate?.dialogues ?? {}).length;
  }, 0);
}

export function ForgeStep(props: ForgeStepProps): JSX.Element {
  const { snapshot, resolution, busy, setBusy, setOperationError, prepare, onCreated } = props;
  const [preview, setPreview] = useState<PublishCartridgeInput | null>(null);
  const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);
  const [forged, setForged] = useState<Forged | null>(null);
  const [previewError, setPreviewError] = useState<AppError | null>(null);

  const runPreview = async (): Promise<void> => {
    setBusy("preview");
    setOperationError(null);
    setPreviewError(null);
    const built = await buildCartridge(prepare(), resolution);
    setBusy(null);
    if (!built.ok) {
      setPreview(null);
      setPreviewSceneId(null);
      setPreviewError(built.error);
      return;
    }
    setPreview(built.value);
    setPreviewSceneId(sceneIdsOf(built.value)[0] ?? null);
  };

  const runForge = async (play: boolean): Promise<void> => {
    setBusy(play ? "forge-play" : "forge");
    setOperationError(null);
    setPreviewError(null);
    const ready = prepare();
    const result = await forgeAuthoring(ready, resolution, play);
    setBusy(null);
    if (!result.ok) return setOperationError(result.error);
    if (result.value.instance !== null) {
      onCreated(result.value.instance);
      return;
    }
    setForged({
      cartridgeId: result.value.manifest.cartridgeId,
      version: result.value.manifest.version,
      contentHash: result.value.manifest.contentHash,
      scenes: ready.gallery.slots.length,
      voices: voiceCount(ready),
    });
  };

  const scenes = preview === null ? [] : sceneIdsOf(preview);
  const previewSource =
    preview === null || previewSceneId === null ? undefined : preview.scenes[previewSceneId];
  const scopedRules =
    preview === null || previewSource === undefined ? null : previewRules(preview, previewSource);
  const voices = voiceCount(snapshot);

  return (
    <Surface variant="card" padding="md" style={{ gap: space.md }}>
      <Text variant="label">{snapshot.draft.name || "Untitled cartridge"}</Text>
      <Text variant="body">
        {snapshot.gallery.slots.length} scenes · {resolution.contexts.length} capability contexts ·{" "}
        {resolution.selectedModules.length} locked modules ·{" "}
        {voices === 0 ? "no baked voices" : `${voices} baked voices`}
      </Text>
      {voices === 0 ? (
        <Text variant="caption" tone="dim">
          Without baked voices the NPCs of this cartridge speak only while a model is reachable.
          Write them in Story &amp; voices to publish a cartridge that plays offline.
        </Text>
      ) : null}
      <div style={{ display: "flex", gap: space.sm, flexWrap: "wrap" }}>
        <Button variant="ghost" disabled={busy !== null} onClick={() => void runPreview()}>
          {busy === "preview" ? "Validating…" : "Preview"}
        </Button>
        <Button variant="secondary" disabled={busy !== null} onClick={() => void runForge(false)}>
          {busy === "forge" ? "Forging…" : "Forge"}
        </Button>
        <Button variant="primary" disabled={busy !== null} onClick={() => void runForge(true)}>
          {busy === "forge-play" ? "Forging…" : "Forge & Play"}
        </Button>
      </div>
      <Text variant="caption" tone="dim">
        Preview validates and renders without writing anything. Forge publishes an immutable
        revision. Forge &amp; Play also creates a save pinned to it and opens the game.
      </Text>
      {previewError === null ? null : <ErrorBlock error={previewError} />}
      {forged === null ? null : (
        <Surface variant="inset" padding="sm" style={{ gap: space.xs }}>
          <Text variant="caption" tone="accent">
            {`${forged.cartridgeId}@${forged.version} published — ${forged.scenes} scenes, ${forged.voices} baked voices.`}
          </Text>
          <Text variant="caption" tone="dim" mono>
            {forged.contentHash}
          </Text>
          <Text variant="caption" tone="dim">
            It is in Cartridges. Start a save from there, or use Forge &amp; Play next time.
          </Text>
        </Surface>
      )}
      {preview === null ? null : (
        <>
          <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap", alignItems: "center" }}>
            <Text variant="caption" tone="dim">
              Walk a scene
            </Text>
            {scenes.map((sceneId) => (
              <Button
                key={sceneId}
                variant="chip"
                active={previewSceneId === sceneId}
                onClick={() => setPreviewSceneId(sceneId)}
              >
                {snapshot.gallery.slots.find((slot) => slot.slotId === sceneId)?.title ?? sceneId}
              </Button>
            ))}
          </div>
          {previewSource !== undefined && scopedRules !== null ? (
            <div style={{ height: 360 }}>
              <SandboxPreview sceneSource={previewSource} rulesSource={scopedRules} />
            </div>
          ) : (
            <Text variant="caption" tone="danger">
              This scene could not be scoped to a playable capability context.
            </Text>
          )}
        </>
      )}
    </Surface>
  );
}
