// New Game on the built-in world (plan.md §1): one game, many lands. Pick a seed — a fresh one is
// already rolled, or type a friend's — and walk into that land. Nothing here needs a model: the
// land is generated from the seed, and whoever lives on it is witnessed later, when a model is
// reachable. The land's language (what its residents say) is chosen here and kept in the save.

import { contentLanguage, languageLabel, useT } from "@renderer/i18n";
import { Button, ErrorBlock, StatePanel, space, Text, TextField } from "@renderer/ui";
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
import { type JSX, useEffect, useRef, useState } from "react";
import { languages } from "../create/IdeaStep";
import { useKeys } from "../shell/useKeys";
import { openInstance } from "../useInstanceLoader";
import { AUTOFOCUS } from "./focus";
import type { SectionProps } from "./sections";

export function NewGamePanel({ data, refresh, onClose }: SectionProps): JSX.Element {
  const t = useT();
  const [game, setGame] = useState<Loadable<CartridgeManifest>>(loading());
  const [seed, setSeed] = useState(randomSeedCode);
  const [language, setLanguage] = useState(contentLanguage);
  const [error, setError] = useState<AppError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void window.seed.game.base().then((result) => {
      if (alive) setGame(result.ok ? ready(result.value) : errored(result.error));
    });
    return () => {
      alive = false;
    };
  }, []);

  // On a fresh userData this panel installs the built-in world after the library was read, so the
  // library is read once more; otherwise Cartridges would say there are none until the next visit.
  const reread = useRef(false);
  useEffect(() => {
    if (game.status !== "ready" || data.status !== "ready" || reread.current) return;
    const { cartridgeId, version } = game.value;
    const listed = data.value.cartridges.some(
      (one) => one.cartridgeId === cartridgeId && one.version === version,
    );
    if (listed) return;
    reread.current = true;
    void refresh();
  }, [game, data, refresh]);

  useKeys({ Escape: () => (busy ? undefined : onClose()) });

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
        language,
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
    <StatePanel state={game} loadingText={t("title.preparingLand")}>
      {(manifest) => (
        <>
          <h2 className="g-heading">{t("title.newGameHeading", { name: manifest.name })}</h2>
          <Text variant="body" tone="muted">
            {t("title.seedIntro")}
          </Text>
          <div style={{ display: "flex", gap: space.sm, alignItems: "flex-end" }}>
            <TextField
              label={t("title.seedLabel")}
              value={formatSeedCode(seed)}
              maxLength={SEED_LENGTH + 1}
              mono
              disabled={busy}
              onChange={(event) => setSeed(normalizeSeedCode(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && valid && !busy) start(manifest);
              }}
            />
            <Button variant="secondary" disabled={busy} onClick={() => setSeed(randomSeedCode())}>
              {t("title.roll")}
            </Button>
          </div>
          {valid ? null : (
            <Text variant="caption" tone="danger">
              {t("title.seedInvalid", { n: SEED_LENGTH })}
            </Text>
          )}
          <Text variant="caption" tone="dim">
            {t("title.landLanguage")}
          </Text>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.xs }}>
            {languages().map((tag) => (
              <Button
                key={tag}
                variant="chip"
                active={language === tag}
                disabled={busy}
                onClick={() => setLanguage(tag)}
              >
                {`${languageLabel(tag)} · ${tag}`}
              </Button>
            ))}
          </div>
          {error === null ? null : <ErrorBlock error={error} />}
          <Button
            className={AUTOFOCUS}
            variant="primary"
            fullWidth
            disabled={!valid || busy}
            onClick={() => start(manifest)}
          >
            {busy ? t("title.openingLand") : t("title.start")}
          </Button>
        </>
      )}
    </StatePanel>
  );
}
