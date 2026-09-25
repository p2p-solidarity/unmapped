// The NPC encounter card. Every line and choice on it came from the model in this session — the
// loading and error states are real states, not a spinner over invented text (Rule 2).
//
// Picking a choice is now two beats: the model resolves the choice (it may call tools, which is the
// only way it can change the world), then the choice's own bookkeeping — karma, materials,
// atmosphere — is applied and the card closes. If the resolve turn fails, the card says so and the
// player decides whether to take the choice anyway.
//
// On open land the words were written when the place was witnessed (`dialogueWitnessed`): the card
// only reads them, and a choice is bookkeeping alone — no model is asked anything (plan.md §1.4).

import { ErrandActions } from "@renderer/app/land/ErrandActions";
import { startDialogue } from "@renderer/narrative/dialogue";
import { persistProgress } from "@renderer/narrative/persist";
import { resolveChoice } from "@renderer/narrative/resolve";
import { useEngineStore } from "@renderer/state/engineStore";
import { useSessionStore } from "@renderer/state/sessionStore";
import { useWorldStore } from "@renderer/state/worldStore";
import { Button, ErrorBlock, Surface, space, Text, zIndex } from "@renderer/ui";
import { parseLandTarget } from "@shared/land";
import type { AppError } from "@shared/result";
import type { DialogueChoice, DialogueGraph, KarmaEntry, NpcSpec } from "@shared/world";
import { useCallback, useEffect, useState } from "react";
import { columnStyle } from "./fields";

const HOTKEYS = ["1", "2", "3"] as const;
export const MAX_CHOICES = HOTKEYS.length;

export function DialogueCard() {
  const dialogue = useSessionStore((state) => state.dialogue);
  const npcId = useSessionStore((state) => state.dialogueNpcId);
  const witnessed = useSessionStore((state) => state.dialogueWitnessed);
  const speaker = useSessionStore((state) => state.dialogueSpeaker);
  const scene = useWorldStore((state) => state.scene);
  const [resolving, setResolving] = useState<DialogueChoice | null>(null);
  const [failure, setFailure] = useState<{ choice: DialogueChoice; error: AppError } | null>(null);

  const npc: NpcSpec | null =
    scene.status === "ready" && npcId !== null
      ? (scene.value.npcs.find((candidate) => candidate.id === npcId) ?? null)
      : null;

  /** The bookkeeping half: what the choice itself promises, independent of what the model did. */
  const commit = useCallback(
    async (graph: DialogueGraph, choice: DialogueChoice) => {
      const session = useSessionStore.getState();
      const world = useWorldStore.getState();
      // Where it happened: the witnessed chunk the resident lives on, or the chunk underfoot.
      const land = npcId === null ? null : parseLandTarget(npcId);
      const chunk = land?.coord ?? (witnessed ? useEngineStore.getState().chunk : null);
      const entry: KarmaEntry = {
        at: new Date().toISOString(),
        floor: world.floor,
        npcId: land?.npcId ?? npcId ?? graph.npcId,
        choice: choice.label,
        action: choice.action,
        effect: choice.effect,
        ...(chunk === null ? {} : { cx: chunk.cx, cz: chunk.cz }),
      };
      world.appendKarma(entry);
      if (choice.gives.length > 0) world.addMaterials(choice.gives);
      if (graph.mutation !== null && !witnessed) world.applyMutation(graph.mutation);

      const written = await persistProgress();
      if (!written.ok) session.toast("danger", written.error.message);
      else if (choice.effect.trim().length > 0) session.toast("info", choice.effect);

      setFailure(null);
      session.closeDialogue();
      if (choice.action === "craft" && !witnessed) session.openAltar();
    },
    [npcId, witnessed],
  );

  const choose = useCallback(
    async (graph: DialogueGraph, choice: DialogueChoice) => {
      if (npc === null || witnessed) {
        await commit(graph, choice);
        return;
      }
      setFailure(null);
      setResolving(choice);
      const resolved = await resolveChoice(npc, choice);
      // The player may have walked away while the model was acting.
      if (useSessionStore.getState().dialogueNpcId !== npcId) return;
      setResolving(null);

      if (!resolved.ok) {
        setFailure({ choice, error: resolved.error });
        return;
      }
      if (resolved.value.narration.length > 0) {
        useSessionStore.getState().toast("info", resolved.value.narration);
      }
      await commit(graph, choice);
    },
    [commit, npc, npcId, witnessed],
  );

  const ready = dialogue?.status === "ready" ? dialogue.value : null;
  const choices = ready === null ? [] : ready.choices.slice(0, MAX_CHOICES);
  const busy = resolving !== null;

  // Hotkeys are live only while a real answer is on screen and nothing is in flight; loading and
  // error states leave the keyboard to the engine.
  useEffect(() => {
    if (ready === null || busy) return;
    const live = ready.choices.slice(0, MAX_CHOICES);
    const onKeyDown = (event: KeyboardEvent) => {
      const index = HOTKEYS.indexOf(event.key as (typeof HOTKEYS)[number]);
      const choice = index < 0 ? undefined : live[index];
      if (choice === undefined) return;
      event.preventDefault();
      void choose(ready, choice);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, choose, ready]);

  if (dialogue === null || npcId === null) return null;

  const name = speaker ?? npc?.name ?? npcId;

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        justifyContent: "center",
        padding: space.xl,
        zIndex: zIndex.overlay,
        pointerEvents: "none",
      }}
    >
      <Surface
        variant="overlay"
        padding="lg"
        style={{ width: "min(720px, 100%)", pointerEvents: "auto" }}
      >
        <Text variant="label" tone="accent">
          {name}
        </Text>

        {dialogue.status === "loading" ? (
          <Text variant="body" tone="muted">
            {`${name} is thinking…`}
          </Text>
        ) : null}

        {dialogue.status === "idle" ? (
          <Text variant="body" tone="dim">
            No answer yet.
          </Text>
        ) : null}

        {dialogue.status === "error" ? (
          <div style={columnStyle}>
            <ErrorBlock error={dialogue.error} />
            <div style={{ display: "flex", gap: space.md }}>
              {witnessed ? null : (
                <Button variant="primary" onClick={() => void startDialogue(npcId)}>
                  Retry
                </Button>
              )}
              <Button variant="ghost" onClick={() => useSessionStore.getState().closeDialogue()}>
                Close
              </Button>
            </div>
          </div>
        ) : null}

        {ready !== null ? (
          <div style={columnStyle}>
            <Text variant="bodyLarge">{ready.line}</Text>
            {witnessed ? <ErrandActions npcId={npcId} /> : null}

            {resolving !== null ? (
              <Text variant="body" tone="accent">
                {`${name} is acting on "${resolving.label}"…`}
              </Text>
            ) : null}

            {failure !== null ? (
              <div style={columnStyle}>
                <ErrorBlock error={failure.error} />
                <div style={{ display: "flex", gap: space.md }}>
                  <Button variant="primary" onClick={() => void choose(ready, failure.choice)}>
                    Try that again
                  </Button>
                  <Button variant="secondary" onClick={() => void commit(ready, failure.choice)}>
                    Take the choice anyway
                  </Button>
                </div>
              </div>
            ) : null}

            {choices.map((choice, index) => (
              <Button
                key={`${choice.action}:${choice.label}`}
                fullWidth
                disabled={busy}
                hotkey={HOTKEYS[index]}
                onClick={() => void choose(ready, choice)}
              >
                {choice.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => useSessionStore.getState().closeDialogue()}
            >
              Walk away
            </Button>
          </div>
        ) : null}
      </Surface>
    </div>
  );
}
