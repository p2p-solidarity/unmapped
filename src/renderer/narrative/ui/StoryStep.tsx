// Story & voices. Both are written after the scenes are chosen and neither may change a layout:
// the story is metadata over the existing scene order, and the voices are one Dialogue program per
// NPC of each selected scene, baked into the cartridge so it plays with no model running.

import { Button, ErrorBlock, Surface, space, Text } from "@renderer/ui";
import type { AppError } from "@shared/result";
import type { AuthoringSnapshot } from "@shared/scene-gallery";
import { type JSX, useState } from "react";
import { generateNarrativeLayer } from "../narrativeLayer";
import { bakeVoices, type VoiceProgress } from "../voices";

export interface StoryStepProps {
  snapshot: AuthoringSnapshot;
  busy: string | null;
  setBusy(busy: string | null): void;
  setOperationError(error: AppError | null): void;
  save(change: (current: AuthoringSnapshot) => AuthoringSnapshot): void;
}

function bakedCount(snapshot: AuthoringSnapshot): { baked: number; people: number } {
  let baked = 0;
  let people = 0;
  for (const slot of snapshot.gallery.slots) {
    const candidate = slot.candidates.find((one) => one.candidateId === slot.selectedCandidateId);
    if (candidate === undefined) continue;
    baked += Object.keys(candidate.dialogues).length;
    // Counting NPCs means parsing, which the gallery already did; the scene program's own NPC
    // statements are the cheapest honest proxy here.
    people += (candidate.sceneSource.match(/^\s*\w+\s*=\s*NPC\(/gm) ?? []).length;
  }
  return { baked, people };
}

export function StoryStep({
  snapshot,
  busy,
  setBusy,
  setOperationError,
  save,
}: StoryStepProps): JSX.Element {
  const [progress, setProgress] = useState<VoiceProgress | null>(null);
  const incomplete = snapshot.gallery.slots.some((slot) => slot.selectedCandidateId === null);
  const { baked, people } = bakedCount(snapshot);

  const writeStory = async (): Promise<void> => {
    setBusy("story");
    setOperationError(null);
    const result = await generateNarrativeLayer(snapshot.gallery.slots, navigator.language);
    setBusy(null);
    if (!result.ok) return setOperationError(result.error);
    save((current) => ({ ...current, narrative: result.value }));
  };

  const writeVoices = async (): Promise<void> => {
    setBusy("voices");
    setOperationError(null);
    setProgress(null);
    const result = await bakeVoices(
      snapshot.gallery.slots,
      {
        language: navigator.language,
        intent: snapshot.narrative?.premise || snapshot.draft.brief,
      },
      setProgress,
    );
    setBusy(null);
    setProgress(null);
    if (!result.ok) return setOperationError(result.error);
    save((current) => ({
      ...current,
      gallery: {
        ...current.gallery,
        slots: current.gallery.slots.map((slot) => {
          const voices = result.value[slot.slotId];
          if (voices === undefined) return slot;
          return {
            ...slot,
            candidates: slot.candidates.map((candidate) =>
              candidate.candidateId === slot.selectedCandidateId
                ? { ...candidate, dialogues: voices }
                : candidate,
            ),
          };
        }),
      },
    }));
  };

  return (
    <div style={{ display: "grid", gap: space.md }}>
      <Surface variant="card" padding="md" style={{ gap: space.md }}>
        <Text variant="label">Story</Text>
        <Text variant="body">
          Story is added only after every space is selected. It cannot alter scene layout, routes,
          capabilities, or saves.
        </Text>
        <Button
          variant="secondary"
          disabled={busy !== null || incomplete}
          onClick={() => void writeStory()}
        >
          {busy === "story"
            ? "Writing…"
            : snapshot.narrative === null
              ? "Generate story"
              : "Regenerate story"}
        </Button>
        {snapshot.narrative === null ? (
          <Text variant="caption" tone="dim">
            Optional — you can forge a mechanics-first cartridge without story.
          </Text>
        ) : (
          <>
            <Text variant="label">{snapshot.narrative.premise}</Text>
            {snapshot.narrative.scenes.map((scene) => (
              <Text key={scene.sceneId} variant="caption">
                {scene.title}: {scene.objective}
              </Text>
            ))}
          </>
        )}
      </Surface>

      <Surface variant="card" padding="md" style={{ gap: space.md }}>
        <Text variant="label">Voices</Text>
        <Text variant="body">
          One written conversation per person in every selected scene, published with the cartridge.
          Whoever plays it hears the same people you did, with no model running.
        </Text>
        <Button
          variant="secondary"
          disabled={busy !== null || incomplete || people === 0}
          onClick={() => void writeVoices()}
        >
          {busy === "voices" ? "Writing…" : baked === 0 ? "Write every voice" : "Write the rest"}
        </Button>
        {progress === null ? (
          <Text variant="caption" tone={baked > 0 ? "accent" : "dim"}>
            {people === 0
              ? "No selected scene has anyone in it yet."
              : `${baked} of ${people} people have been written.`}
          </Text>
        ) : (
          <Text variant="caption" tone="accent">
            {`${progress.done}/${progress.total} — ${progress.npcName} in ${progress.sceneTitle}`}
          </Text>
        )}
      </Surface>
      {incomplete ? (
        <ErrorBlock
          error={{
            code: "story-scenes-incomplete",
            message: "Every scene needs one selected candidate first.",
            hint: "Go back to Scenes and pick (or generate) one for each.",
          }}
        />
      ) : null}
    </div>
  );
}
