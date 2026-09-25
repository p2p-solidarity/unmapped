// A cartridge's ENS name in the Cartridges panel: `<cartridgeId>.<parent>` on Sepolia ENSv2. The
// line reads the name live (unclaimed / this version / another version) and, on a machine with a
// signing key, claims it or points it at the selected revision. `OpenByEnsName` goes the other way:
// a name → the exact revision it points at → Play if that revision's hash is in the library.

import { errorLine, useT } from "@renderer/i18n";
import { lookupCartridgeName } from "@renderer/identity";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import type { CartridgeManifest } from "@shared/cartridge";
import { type CartridgePointer, cartridgeName, type EnsNamesConfig } from "@shared/ensNames";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import { useCallback, useEffect, useState } from "react";

const ref = (pointer: { cartridgeId: string; version: string }) =>
  `${pointer.cartridgeId}@${pointer.version}`;

/** This machine's ENS name setup, read once; null while it loads. */
export function useEnsNames(): EnsNamesConfig | null {
  const [config, setConfig] = useState<EnsNamesConfig | null>(null);
  useEffect(() => {
    void window.seed.chain.ensConfig().then(setConfig);
  }, []);
  return config;
}

interface CartridgeNameLineProps {
  manifest: CartridgeManifest;
  config: EnsNamesConfig | null;
}

export function CartridgeNameLine({ manifest, config }: CartridgeNameLineProps) {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const [record, setRecord] = useState<Loadable<CartridgePointer | null>>(idle());
  const [writing, setWriting] = useState(false);
  const name = config?.parent == null ? null : cartridgeName(manifest.cartridgeId, config.parent);

  const read = useCallback(async () => {
    if (name === null) return;
    setRecord(loading());
    const result = await lookupCartridgeName(name);
    setRecord(result.ok ? ready(result.value) : errored(result.error));
  }, [name]);

  useEffect(() => {
    void read();
  }, [read]);

  if (config === null) return null;
  if (config.parent === null) return <span className="g-meta">{t("title.ensNotSetUp")}</span>;
  if (name === null) return <span className="g-meta">{t("title.ensNoLabel")}</span>;

  const pointsHere =
    record.status === "ready" && record.value?.contentHash === manifest.contentHash;
  const claim = (): void => {
    setWriting(true);
    void window.seed.chain.claimName(manifest.cartridgeId, manifest.version).then((result) => {
      setWriting(false);
      if (!result.ok) return toast("danger", errorLine(result.error));
      toast("success", t("title.ensClaimed", { name: result.value.name, ref: ref(manifest) }));
      void read();
    });
  };

  const status =
    record.status === "loading" || record.status === "idle"
      ? t("title.ensChecking")
      : record.status === "error"
        ? errorLine(record.error)
        : record.value === null
          ? t("title.ensUnclaimed")
          : pointsHere
            ? t("title.ensPointsHere")
            : t("title.ensPointsElsewhere", { ref: ref(record.value) });

  return (
    <>
      <span className="g-meta">
        {t("title.ensName")} {name} · {writing ? t("title.ensWriting") : status}
      </span>
      {record.status !== "ready" || pointsHere ? null : config.writable ? (
        <div className="row-actions">
          <Button variant="secondary" disabled={writing} onClick={claim}>
            {record.value === null ? t("title.ensClaim") : t("title.ensRepoint")}
          </Button>
        </div>
      ) : (
        <span className="g-meta">{t("title.ensReadOnly")}</span>
      )}
    </>
  );
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
  const [found, setFound] = useState<Loadable<CartridgePointer | null>>(idle());

  const lookUp = async (): Promise<void> => {
    setFound(loading());
    const result = await lookupCartridgeName(name);
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
        {(pointer) => {
          if (pointer === null) return <Text tone="dim">{t("title.ensNotCartridge")}</Text>;
          const local = cartridges.find((manifest) => manifest.contentHash === pointer.contentHash);
          return local === undefined ? (
            <>
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
