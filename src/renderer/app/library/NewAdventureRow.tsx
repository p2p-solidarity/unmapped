// Row 0 of My worlds: 開始新的冒險 on the built-in world (plan.md §1: one game, many lands). One
// press starts it on a fresh random land, written in the UI language. Under 更多: the land's
// language, a seed of the player's own (a friend's seed is the same land), and what the built-in
// world offers besides (versions, drafts, its ENS name). Nothing here needs a model.

import { contentLanguage, languageLabel, useT } from "@renderer/i18n";
import { Button, ErrorBlock, space, Text, TextField } from "@renderer/ui";
import type { CartridgeManifest } from "@shared/cartridge";
import type { AppError, Loadable } from "@shared/result";
import {
  formatSeedCode,
  isSeedCode,
  normalizeSeedCode,
  randomSeedCode,
  SEED_LENGTH,
} from "@shared/seedCode";
import { type JSX, useState } from "react";
import { languages } from "../create/IdeaStep";
import { WorldMore } from "../title/CartridgesPanel";
import { openInstance } from "../useInstanceLoader";
import { AUTOFOCUS } from "./focus";
import type { WorldGroup } from "./rows";
import { newAdventure } from "./startWorld";
import { type RowContext, WorldRowShell } from "./WorldRow";

const wrap = { display: "flex", flexWrap: "wrap", gap: space.xs } as const;

export function NewAdventureRow({
  game,
  group,
  context,
}: {
  /** The built-in world (main installs it once); its newest revision. */
  game: Loadable<CartridgeManifest>;
  group: WorldGroup | null;
  context: RowContext;
}): JSX.Element {
  const t = useT();
  const { busy, setBusy } = context;
  // Empty = a fresh random land at the press of 開始.
  const [seed, setSeed] = useState("");
  const [language, setLanguage] = useState(contentLanguage);
  const [error, setError] = useState<AppError | null>(null);
  const [starting, setStarting] = useState(false);
  const manifest = game.status === "ready" ? game.value : null;
  const seedOk = seed === "" || isSeedCode(seed);

  const start = (): void => {
    if (manifest === null || busy || !seedOk) return;
    setBusy(true);
    setStarting(true);
    setError(null);
    void newAdventure(manifest, seed === "" ? randomSeedCode() : seed, language).then((made) => {
      setBusy(false);
      setStarting(false);
      if (!made.ok) {
        setError(made.error);
        return;
      }
      void openInstance(made.value);
    });
  };

  return (
    <WorldRowShell
      name={t("library.newAdventure")}
      action={
        <Button
          className={AUTOFOCUS}
          variant="primary"
          disabled={manifest === null || busy || !seedOk}
          onClick={start}
        >
          {starting
            ? t("title.openingLand")
            : game.status === "loading"
              ? t("title.preparingLand")
              : t("title.start")}
        </Button>
      }
      below={
        game.status === "error" ? (
          <ErrorBlock error={game.error} />
        ) : error !== null ? (
          <ErrorBlock error={error} />
        ) : seedOk ? null : (
          // Under the row, not in 更多: 開始 waits on it even with 更多 closed.
          <Text variant="caption" tone="danger">
            {t("title.seedInvalid", { n: SEED_LENGTH })}
          </Text>
        )
      }
    >
      {() => (
        <>
          <Text variant="caption" tone="dim">
            {t("title.landLanguage")}
          </Text>
          <div style={wrap}>
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
          <Text variant="caption" tone="dim">
            {t("title.seedIntro")}
          </Text>
          <div style={{ ...wrap, alignItems: "flex-end" }}>
            <TextField
              label={t("title.seedLabel")}
              value={formatSeedCode(seed)}
              maxLength={SEED_LENGTH + 1}
              mono
              disabled={busy}
              onChange={(event) => setSeed(normalizeSeedCode(event.target.value))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.repeat) start();
              }}
            />
            <Button variant="secondary" disabled={busy} onClick={() => setSeed(randomSeedCode())}>
              {t("title.roll")}
            </Button>
          </div>
          {group === null || manifest === null ? null : (
            <WorldMore group={group} plays={manifest} {...context} />
          )}
        </>
      )}
    </WorldRowShell>
  );
}
