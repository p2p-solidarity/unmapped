// New Game (plan.md §1): one game, many lands. Pick a seed — a fresh one is already rolled, or type
// a friend's — and walk into that land. Nothing here needs a model: the land is generated from the
// seed, and whoever lives on it is witnessed later, when a model is reachable.

import { useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, StatePanel, Surface, space, Text, TextField } from "@renderer/ui";
import type { CartridgeManifest } from "@shared/cartridge";
import type { AppError } from "@shared/result";
import { errored, type Loadable, loading, ready } from "@shared/result";
import {
  formatSeedCode,
  isSeedCode,
  normalizeSeedCode,
  randomSeedCode,
  SEED_LENGTH,
} from "@shared/seedCode";
import { type JSX, useEffect, useState } from "react";
import { GameShell } from "./shell/GameShell";
import { openInstance } from "./useInstanceLoader";

export function SeedScreen(): JSX.Element {
  const setScreen = useSessionStore((state) => state.setScreen);
  const [game, setGame] = useState<Loadable<CartridgeManifest>>(loading());
  const [seed, setSeed] = useState(randomSeedCode);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.seed.game.base().then((result) => {
      setGame(result.ok ? ready(result.value) : errored(result.error));
    });
  }, []);

  const valid = isSeedCode(seed);
  const start = (manifest: CartridgeManifest): void => {
    setBusy(true);
    setError(null);
    void window.seed.instances
      .create({
        cartridgeId: manifest.cartridgeId,
        version: manifest.version,
        name: `${manifest.name} · ${formatSeedCode(seed)}`,
        seed,
      })
      .then((created) => {
        setBusy(false);
        if (!created.ok) {
          setError(created.error);
          return;
        }
        void openInstance(created.value.instance.meta.instanceId);
      });
  };

  return (
    <GameShell
      hints={[
        { keys: ["Esc"], label: "Back", onPress: busy ? undefined : () => setScreen("worlds") },
      ]}
    >
      <div
        style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}
      >
        <Surface variant="card" padding="xl" style={{ width: "min(560px, 92%)", gap: space.md }}>
          <StatePanel state={game} loadingText="Preparing the land…">
            {(manifest) => (
              <>
                <Text variant="title" as="h2">
                  {`${manifest.name} · New Game`}
                </Text>
                <Text variant="body" tone="muted">
                  Every seed is a different land of the same game. The same seed is the same land
                  for anyone who types it.
                </Text>
                <div style={{ display: "flex", gap: space.sm, alignItems: "flex-end" }}>
                  <TextField
                    label="Seed"
                    value={formatSeedCode(seed)}
                    maxLength={SEED_LENGTH + 1}
                    mono
                    disabled={busy}
                    autoFocus
                    onChange={(event) => setSeed(normalizeSeedCode(event.target.value))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && valid && !busy) start(manifest);
                    }}
                  />
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => setSeed(randomSeedCode())}
                  >
                    Roll
                  </Button>
                </div>
                {valid ? null : (
                  <Text variant="caption" tone="danger">
                    {`A seed is ${SEED_LENGTH} letters and digits (no I, O, 0 or 1).`}
                  </Text>
                )}
                {error === null ? null : <ErrorBlock error={error} />}
                <Button
                  variant="primary"
                  fullWidth
                  disabled={!valid || busy}
                  onClick={() => start(manifest)}
                >
                  {busy ? "Opening the land…" : "Start"}
                </Button>
              </>
            )}
          </StatePanel>
          <Button variant="ghost" disabled={busy} onClick={() => setScreen("create")}>
            Or create your own game from a story
          </Button>
        </Surface>
      </div>
    </GameShell>
  );
}
