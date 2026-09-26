// ENS names in the lineage tree, written with the player's passkey (no wallet; the gas station
// pays): a cartridge revision's name (CartridgeEns.tsx, shown in Worlds → Cartridges and right after
// Create builds a world) and the player's own save (`<save>.<cartridge>.<root>`, shown in Worlds →
// Saves), which also carries the save's door number so friends can walk in by name. Main reads
// every value that goes on chain from disk; this only shows what a name says and asks for the one
// signature.

import { useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import { cartridgeLabel } from "@shared/ensNames";
import type { EnsNameStatus, SaveNameView } from "@shared/market";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import {
  busyLabel,
  SetupNote,
  shortHash,
  statusLine,
  type T,
  typedLabel,
  type Who,
} from "./ensCommon";
import { type PasskeySigner, usePasskeySigner } from "./usePasskeySigner";
import { usePlayerNames } from "./usePlayerNames";

export { CartridgeEnsLine } from "./CartridgeEns";

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

/** The door number a save's name carries, next to the save's own. */
function doorLine(t: T, save: EnsNameStatus, own: string): string {
  if (save.state === "free") return t("market.saveDoorNote", { door: own });
  if (save.door === own) return t("market.saveDoor", { door: own });
  if (save.door !== null) return t("market.saveDoorOther", { door: save.door, own });
  return t("market.saveDoorNone", { own });
}

/** A save's own ENS name: record it, move it to the save's latest checkpoint, or give it the door. */
export function SaveEnsBlock({ instanceId }: { instanceId: string }): JSX.Element | null {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const signer = usePasskeySigner();
  const [label, setLabel] = useState<string | null>(null);
  const [view, setView] = useState<Loadable<SaveNameView>>(idle());
  const key = signer.passkey?.key ?? null;
  // What main is asked about: the typed label, normalised; nothing is asked while it has none.
  const asking = label === null ? null : cartridgeLabel(label);
  const invalid = label !== null && asking === null;

  const seq = useRef(0);

  const read = useCallback(async () => {
    const at = ++seq.current;
    setView((before) => (before.status === "ready" ? before : loading()));
    const result = await window.seed.market.saveName(instanceId, asking, key);
    // Only the newest answer lands: an older label's reply never replaces the one asked last.
    if (at === seq.current) setView(result.ok ? ready(result.value) : errored(result.error));
  }, [instanceId, asking, key]);
  // After a signature that first linked the passkey, the handler's own `read` still has no key:
  // re-read through the newest one.
  const latestRead = useRef(read);
  latestRead.current = read;

  useEffect(() => {
    if (!signer.config?.parent || invalid) return;
    const timer = window.setTimeout(() => void read(), asking === null ? 0 : 500);
    return () => window.clearTimeout(timer);
  }, [read, asking, invalid, signer.config]);

  const current = view.status === "ready" ? view.value : null;
  const who = usePlayerNames([current?.cartridge.holder, current?.save?.holder]);

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
    if (ok) await latestRead.current();
  };
  const record = async (v: SaveNameView, save: EnsNameStatus): Promise<void> => {
    const ok = await signer.signed(
      { kind: "name-save", instanceId, label: v.local.label },
      save.state === "free"
        ? t("market.summaryRecordSave", { name: save.name })
        : save.state === "current"
          ? t("market.summaryDoor", { name: save.name, door: v.local.door })
          : t("market.summaryUpdateSave", { name: save.name }),
    );
    if (ok) {
      toast("success", t("market.nameDone", { name: save.name }));
      await latestRead.current();
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
              {`${t("title.ensName")} ${v.cartridge.name} · ${statusLine(t, v.cartridge, who)}`}
            </span>
            {v.save === null ? (
              v.cartridge.state === "taken" ? (
                <Text tone="dim">{t("market.saveCartridgeTaken", { name: v.cartridge.name })}</Text>
              ) : (
                <>
                  <Text tone="dim">
                    {t("market.saveNeedsCartridge", { name: v.cartridge.name })}
                  </Text>
                  {cartridgeLabel(v.local.cartridgeId)?.startsWith("xn-") ? (
                    <Text variant="caption" tone="dim">
                      {t("market.saveCartridgeLabelHint")}
                    </Text>
                  ) : null}
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
                who={who}
                v={v}
                save={v.save}
                label={label ?? v.local.label}
                fresh={!invalid && (asking === null || asking === v.local.label)}
                invalid={invalid}
                onLabel={(text) => setLabel(typedLabel(text))}
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
  who: Who;
  v: SaveNameView;
  save: EnsNameStatus;
  label: string;
  /** The status shown is for the label in the field (not one typed a moment ago). */
  fresh: boolean;
  /** The field holds no letters or digits, so nothing is asked. */
  invalid: boolean;
  onLabel(text: string): void;
  signer: PasskeySigner;
  onRecord(): void;
}

function SaveNameRow(props: SaveNameRowProps) {
  const { t, who, v, save, label, fresh, invalid, onLabel, signer, onRecord } = props;
  const writable = save.state === "free" || save.state === "outdated";
  // A name that records this checkpoint but not this save's door gets the door on its own.
  const doorOnly = save.mine && save.state === "current" && save.door !== v.local.door;
  const relayer = signer.config?.relayer === true;
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
        {(writable || doorOnly) && relayer ? (
          <Button variant="primary" disabled={signer.busy !== null || !fresh} onClick={onRecord}>
            {busyLabel(
              t,
              signer,
              save.state === "free"
                ? t("market.saveRecord")
                : doorOnly
                  ? t("market.saveDoorButton")
                  : t("market.saveUpdate"),
            )}
          </Button>
        ) : null}
      </div>
      {invalid ? (
        <Text variant="caption" tone="danger">
          {t("market.labelInvalid")}
        </Text>
      ) : (
        <span className="g-meta">{fresh ? saveStatusLine(t, save) : t("market.nameChecking")}</span>
      )}
      <span className="g-meta">
        {t("market.saveLocal", { progress: v.local.progress, hash: shortHash(v.local.saveHash) })}
      </span>
      {save.state === "taken" ? null : (
        <span className="g-meta">{doorLine(t, save, v.local.door)}</span>
      )}
      {(writable || doorOnly) && !relayer ? (
        <span className="g-meta">{t("market.readOnly")}</span>
      ) : null}
      {save.mine || save.state === "free" ? (
        <Text variant="caption" tone="dim">
          {t("market.saveNote")}
        </Text>
      ) : (
        <span className="g-meta">{t("market.saveHeldBy", { holder: who(save.holder) })}</span>
      )}
    </>
  );
}
