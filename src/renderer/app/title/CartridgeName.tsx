// A cartridge's ENS name in the Cartridges panel. The line is the lineage tree's name for the
// selected revision (`<cartridge>.<root>`, market/EnsNames.tsx): read live, and named or pointed at
// this revision with the player's passkey (the gas station pays). `OpenByEnsName` goes the other
// way: a name → the exact revision it points at (and, for a save's name, its checkpoint) → Play if
// that revision's hash is in the library.

import { useT } from "@renderer/i18n";
import { lookupEnsName } from "@renderer/identity";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import type { CartridgeManifest } from "@shared/cartridge";
import type { EnsLookup } from "@shared/ensNames";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import { useState } from "react";
import { CartridgeEnsLine } from "../market/EnsNames";

const ref = (pointer: { cartridgeId: string; version: string }) =>
  `${pointer.cartridgeId}@${pointer.version}`;

const shortHash = (hash: string): string =>
  `${hash.replace(/^sha256:/, "").slice(0, 8)}…${hash.slice(-4)}`;

export function CartridgeNameLine({ manifest }: { manifest: CartridgeManifest }) {
  return <CartridgeEnsLine manifest={manifest} />;
}

interface OpenByEnsNameProps {
  cartridges: CartridgeManifest[];
  busy: boolean;
  onPlay(manifest: CartridgeManifest): void;
  onImport(): void;
}

export function OpenByEnsName({ cartridges, busy, onPlay, onImport }: OpenByEnsNameProps) {
  const t = useT();
  const [name, setName] = useState("");
  const [found, setFound] = useState<Loadable<EnsLookup | null>>(idle());

  const lookUp = async (): Promise<void> => {
    setFound(loading());
    const result = await lookupEnsName(name);
    setFound(result.ok ? ready(result.value) : errored(result.error));
  };

  return (
    <div className="detail">
      <Text variant="label" tone="muted">
        {t("title.ensOpenHeading")}
      </Text>
      <div className="row-actions">
        <TextField
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("title.ensOpenPlaceholder")}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          mono
        />
        <Button
          variant="secondary"
          disabled={name.trim().length === 0 || found.status === "loading"}
          onClick={() => void lookUp()}
        >
          {t("title.ensLookUp")}
        </Button>
      </div>
      <StatePanel
        state={found}
        idleText={t("title.ensOpenIdle")}
        loadingText={t("title.ensChecking")}
      >
        {(found) => {
          if (found === null) return <Text tone="dim">{t("title.ensNotCartridge")}</Text>;
          const { pointer, save } = found;
          const local = cartridges.find((manifest) => manifest.contentHash === pointer.contentHash);
          const saveLine =
            save === null ? null : (
              <span className="g-meta">
                {t("market.lookupSave", {
                  ref: ref(pointer),
                  progress: save.progress,
                  hash: shortHash(save.saveHash),
                })}
              </span>
            );
          return local === undefined ? (
            <>
              {saveLine}
              <span className="g-meta">
                {t("title.ensNotInLibrary", { ref: ref(pointer), hash: pointer.contentHash })}
              </span>
              <div className="row-actions">
                <Button variant="ghost" disabled={busy} onClick={onImport}>
                  {t("title.importCartridge")}
                </Button>
              </div>
            </>
          ) : (
            <>
              {saveLine}
              <span className="g-meta">{t("title.ensInLibrary", { ref: ref(pointer) })}</span>
              <div className="row-actions">
                <Button variant="primary" disabled={busy} onClick={() => onPlay(local)}>
                  {t("common.play")}
                </Button>
              </div>
            </>
          );
        }}
      </StatePanel>
    </div>
  );
}
