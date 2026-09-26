// ENS names in the lineage tree, written with the player's passkey (no wallet; the gas station
// pays): a cartridge revision's name (`<cartridge>.<root>`, shown in Worlds → Cartridges) and the
// player's own save (`<save>.<cartridge>.<root>`, shown in Worlds → Saves). Main reads every value
// that goes on chain from disk; this only shows what a name says and asks for the one signature.

import { errorLine, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import type { CartridgeManifest } from "@shared/cartridge";
import { cartridgeLabel } from "@shared/ensNames";
import type { EnsNameStatus, SaveNameView } from "@shared/market";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import { type JSX, useCallback, useEffect, useState } from "react";
import { short } from "./format";
import { type PasskeySigner, usePasskeySigner } from "./usePasskeySigner";

type T = ReturnType<typeof useT>;

const shortHash = (hash: string | null): string =>
  hash === null ? "—" : `${hash.replace(/^sha256:/, "").slice(0, 8)}…${hash.slice(-4)}`;

function statusLine(t: T, status: EnsNameStatus): string {
  switch (status.state) {
    case "free":
      return t("market.nameFree");
    case "current":
      return t("market.nameCurrent");
    case "outdated":
      return t("market.nameOutdated", { version: status.version ?? "—" });
    case "other-version":
      return t("market.nameOtherVersion", {
        holder: short(status.holder ?? ""),
        version: status.version ?? "—",
      });
    case "taken":
      return t("market.nameTaken", { holder: short(status.holder ?? "") });
  }
}

function busyLabel(t: T, signer: PasskeySigner, idleLabel: string): string {
  switch (signer.busy) {
    case "browser":
      return t("market.waitingBrowser");
    case "signing":
    case "passkey":
      return t("market.signing");
    case "sending":
      return t("market.sending");
    default:
      return idleLabel;
  }
}

/** Setup lines shared by both blocks; null when names can be read here. */
function SetupNote({ signer }: { signer: PasskeySigner }): JSX.Element | null {
  const t = useT();
  if (signer.config === null) return null;
  if (signer.config.parent === null) {
    return <span className="g-meta">{t("market.notConfigured")}</span>;
  }
  return null;
}

/** A cartridge revision's ENS name, and the passkey action that names it or points it here. */
export function CartridgeEnsLine({
  manifest,
}: {
  manifest: CartridgeManifest;
}): JSX.Element | null {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const signer = usePasskeySigner();
  const [status, setStatus] = useState<Loadable<EnsNameStatus>>(idle());
  const key = signer.passkey?.key ?? null;
  const { cartridgeId, version } = manifest;

  const read = useCallback(async () => {
    setStatus(loading());
    const result = await window.seed.market.cartridgeName(cartridgeId, version, key);
    setStatus(result.ok ? ready(result.value) : errored(result.error));
  }, [cartridgeId, version, key]);

  useEffect(() => {
    if (signer.config?.parent) void read();
  }, [read, signer.config]);

  if (signer.config === null) return null;
  if (signer.config.parent === null) return <SetupNote signer={signer} />;
  const current = status.status === "ready" ? status.value : null;
  const writable = current !== null && (current.state === "free" || current.state === "outdated");

  const write = async (): Promise<void> => {
    if (current === null) return;
    const ok = await signer.signed(
      { kind: "name-cartridge", cartridgeId, version },
      t("market.summaryNameCartridge", { name: current.name, ref: `${cartridgeId}@${version}` }),
    );
    if (ok) {
      toast("success", t("market.nameDone", { name: current.name }));
      await read();
    }
  };

  return (
    <>
      <span className="g-meta">
        {status.status === "ready"
          ? `${t("title.ensName")} ${status.value.name} · ${statusLine(t, status.value)}`
          : status.status === "error"
            ? errorLine(status.error)
            : `${t("title.ensName")} · ${t("market.nameChecking")}`}
      </span>
      {!writable || current === null ? null : signer.config.relayer ? (
        <div className="row-actions">
          <Button variant="secondary" disabled={signer.busy !== null} onClick={() => void write()}>
            {busyLabel(
              t,
              signer,
              current.state === "free" ? t("market.nameRegister") : t("market.nameRepoint"),
            )}
          </Button>
        </div>
      ) : (
        <span className="g-meta">{t("market.readOnly")}</span>
      )}
    </>
  );
}

function saveStatusLine(t: T, save: EnsNameStatus): string {
  switch (save.state) {
    case "free":
      return t("market.saveFree", { name: save.name });
    case "current":
      return t("market.saveCurrent", { name: save.name });
    case "outdated":
      return t("market.saveOutdated", { name: save.name, progress: save.progress ?? "—" });
    default:
      return t("market.saveTaken", { name: save.name });
  }
}

/** A save's own ENS name: record it, or move it to the save's latest checkpoint. */
export function SaveEnsBlock({ instanceId }: { instanceId: string }): JSX.Element | null {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const signer = usePasskeySigner();
  const [label, setLabel] = useState<string | null>(null);
  const [view, setView] = useState<Loadable<SaveNameView>>(idle());
  const key = signer.passkey?.key ?? null;

  const read = useCallback(async () => {
    setView((before) => (before.status === "ready" ? before : loading()));
    const result = await window.seed.market.saveName(instanceId, label, key);
    setView(result.ok ? ready(result.value) : errored(result.error));
  }, [instanceId, label, key]);

  useEffect(() => {
    if (!signer.config?.parent) return;
    const timer = window.setTimeout(() => void read(), label === null ? 0 : 500);
    return () => window.clearTimeout(timer);
  }, [read, label, signer.config]);

  if (signer.config === null) return null;
  if (signer.config.parent === null) return <SetupNote signer={signer} />;
  const relayer = signer.config.relayer;

  const nameCartridge = async (v: SaveNameView): Promise<void> => {
    const ok = await signer.signed(
      { kind: "name-cartridge", cartridgeId: v.local.cartridgeId, version: v.local.version },
      t("market.summaryNameCartridge", {
        name: v.cartridge.name,
        ref: `${v.local.cartridgeId}@${v.local.version}`,
      }),
    );
    if (ok) await read();
  };
  const record = async (v: SaveNameView, save: EnsNameStatus): Promise<void> => {
    const ok = await signer.signed(
      { kind: "name-save", instanceId, label: v.local.label },
      save.state === "free"
        ? t("market.summaryRecordSave", { name: save.name })
        : t("market.summaryUpdateSave", { name: save.name }),
    );
    if (ok) {
      toast("success", t("market.nameDone", { name: save.name }));
      await read();
    }
  };

  return (
    <div className="detail">
      <Text variant="label" tone="muted">
        {t("market.saveHeading")}
      </Text>
      <StatePanel state={view} loadingText={t("market.nameChecking")}>
        {(v) => (
          <>
            <span className="g-meta">
              {`${t("title.ensName")} ${v.cartridge.name} · ${statusLine(t, v.cartridge)}`}
            </span>
            {v.save === null ? (
              v.cartridge.state === "taken" ? (
                <Text tone="dim">{t("market.saveCartridgeTaken", { name: v.cartridge.name })}</Text>
              ) : (
                <>
                  <Text tone="dim">
                    {t("market.saveNeedsCartridge", { name: v.cartridge.name })}
                  </Text>
                  {relayer ? (
                    <div className="row-actions">
                      <Button
                        variant="secondary"
                        disabled={signer.busy !== null}
                        onClick={() => void nameCartridge(v)}
                      >
                        {busyLabel(t, signer, t("market.saveNameCartridge"))}
                      </Button>
                    </div>
                  ) : (
                    <span className="g-meta">{t("market.readOnly")}</span>
                  )}
                </>
              )
            ) : (
              <SaveNameRow
                t={t}
                v={v}
                save={v.save}
                label={label ?? v.local.label}
                onLabel={(text) => setLabel(cartridgeLabel(text) ?? text.toLowerCase())}
                signer={signer}
                onRecord={() => void record(v, v.save as EnsNameStatus)}
              />
            )}
          </>
        )}
      </StatePanel>
    </div>
  );
}

interface SaveNameRowProps {
  t: T;
  v: SaveNameView;
  save: EnsNameStatus;
  label: string;
  onLabel(text: string): void;
  signer: PasskeySigner;
  onRecord(): void;
}

function SaveNameRow({ t, v, save, label, onLabel, signer, onRecord }: SaveNameRowProps) {
  const writable = save.state === "free" || save.state === "outdated";
  return (
    <>
      <div className="row-actions">
        <TextField
          id="save-ens-label"
          label={t("market.saveLabel")}
          value={label}
          mono
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          disabled={save.state === "outdated" || save.state === "current"}
          onChange={(event) => onLabel(event.target.value)}
        />
        {writable && signer.config?.relayer ? (
          <Button variant="primary" disabled={signer.busy !== null} onClick={onRecord}>
            {busyLabel(
              t,
              signer,
              save.state === "free" ? t("market.saveRecord") : t("market.saveUpdate"),
            )}
          </Button>
        ) : null}
      </div>
      <span className="g-meta">{saveStatusLine(t, save)}</span>
      <span className="g-meta">
        {t("market.saveLocal", { progress: v.local.progress, hash: shortHash(v.local.saveHash) })}
      </span>
      {writable && !signer.config?.relayer ? (
        <span className="g-meta">{t("market.readOnly")}</span>
      ) : null}
      {save.mine || save.state === "free" ? (
        <Text variant="caption" tone="dim">
          {t("market.saveNote")}
        </Text>
      ) : (
        <span className="g-meta">
          {t("market.saveHeldBy", { holder: short(save.holder ?? "") })}
        </span>
      )}
    </>
  );
}
