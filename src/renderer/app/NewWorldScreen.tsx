// New Game (plan.md §9): name the world, say in one sentence what it should be, pick the language,
// and walk into it. The model writes the bible and the place you wake in; without a model this
// screen says so and offers nothing prebuilt (Rule 2). The full authoring flow lives behind Remix.

import worldForgeArt from "@renderer/assets/generated/world-forge.png";
import { makeWorld, type NewWorldStage } from "@renderer/narrative/newWorld";
import { useInferenceStore, useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, Surface, space, Text, TextField } from "@renderer/ui";
import type { AppError } from "@shared/result";
import { type JSX, useEffect, useState } from "react";
import { useRefreshProbe } from "./inferenceSync";
import { GameShell } from "./shell/GameShell";
import { openInstance } from "./useInstanceLoader";

const STAGES: Record<NewWorldStage, string> = {
  bible: "Writing the world bible…",
  origin: "Writing the place you wake in…",
  publish: "Publishing the world…",
};

function languages(): string[] {
  return [...new Set([navigator.language, "zh-TW", "ja-JP", "en-US"])];
}

export function NewWorldScreen(): JSX.Element {
  const setScreen = useSessionStore((state) => state.setScreen);
  const probe = useInferenceStore((state) => state.probe);
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [language, setLanguage] = useState(navigator.language);
  const [stage, setStage] = useState<NewWorldStage | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const refreshProbe = useRefreshProbe();

  // The probe on screen may be from app start; look again the moment the player wants a world.
  useEffect(() => {
    refreshProbe();
  }, [refreshProbe]);

  const offline: AppError | null =
    probe.status === "ready" && probe.value.reachable
      ? null
      : probe.status === "loading" || probe.status === "idle"
        ? null
        : {
            code: "new-world-no-model",
            message:
              "A new world is written by the model, and the model did not answer the last check.",
            hint: "Start a model or configure a provider in System → Inference. You can still try: a real failure will say what went wrong.",
          };
  const busy = stage !== null;
  // A stale or failed probe is a warning, not a lock: the attempt itself reports a real failure.
  const ready = name.trim().length > 0 && intent.trim().length > 0 && !busy;

  const make = (): void => {
    setError(null);
    void makeWorld({ name, intent, language }, setStage).then((result) => {
      setStage(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      void openInstance(result.value.instanceId);
    });
  };

  return (
    <GameShell
      art={worldForgeArt}
      hints={[
        { keys: ["Esc"], label: "Back", onPress: busy ? undefined : () => setScreen("worlds") },
      ]}
    >
      <div
        style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}
      >
        <Surface variant="card" padding="xl" style={{ width: "min(560px, 92%)", gap: space.md }}>
          <Text variant="title" as="h2">
            New world
          </Text>
          <TextField
            label="World name"
            value={name}
            maxLength={60}
            disabled={busy}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <TextField
            label="In one sentence, what is this land?"
            value={intent}
            maxLength={400}
            disabled={busy}
            onChange={(event) => setIntent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && ready) make();
            }}
          />
          <Text variant="caption" tone="dim">
            Language
          </Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
            {languages().map((tag) => (
              <Button
                key={tag}
                variant="secondary"
                active={language === tag}
                disabled={busy}
                onClick={() => setLanguage(tag)}
              >
                {tag}
              </Button>
            ))}
          </div>
          {offline === null ? null : (
            <>
              <ErrorBlock error={offline} />
              <Button variant="secondary" disabled={busy} onClick={refreshProbe}>
                Check the model again
              </Button>
            </>
          )}
          {error === null ? null : <ErrorBlock error={error} />}
          {stage === null ? null : (
            <Text variant="body" tone="accent">
              {STAGES[stage]}
            </Text>
          )}
          <Button variant="primary" fullWidth disabled={!ready} onClick={make}>
            {error === null ? "Make this world" : "Try again"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setScreen("remix")}>
            Remix an existing cartridge (advanced)
          </Button>
        </Surface>
      </div>
    </GameShell>
  );
}
