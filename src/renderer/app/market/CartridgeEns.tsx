// A cartridge revision's ENS name (`<label>.<root>`, or `<label>.<parent's name>` for a remix), read
// live and written with the player's passkey (the gas station pays). The first time a world is
// named the player picks its label — prefilled from its id, which reads oddly for a name in another
// script — and after that the name is found by cartridge id, so the label never changes. A name the
// player holds can be pointed at this revision and put on the market (LaunchLine).

import { errorLine, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, Text, TextField } from "@renderer/ui";
import type { CartridgeManifest } from "@shared/cartridge";
import { cartridgeLabel } from "@shared/ensNames";
import type { EnsNameStatus } from "@shared/market";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { busyLabel, SetupNote, statusLine, typedLabel } from "./ensCommon";
import { LaunchLine } from "./LaunchLine";
import { usePasskeySigner } from "./usePasskeySigner";
import { usePlayerNames } from "./usePlayerNames";

/** A status and the label it was asked about (null: the id's own), so a stale one never acts. */
interface Asked {
  label: string | null;
  status: EnsNameStatus;
}

export function CartridgeEnsLine({
  manifest,
}: {
  manifest: CartridgeManifest;
}): JSX.Element | null {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const signer = usePasskeySigner();
  const [typed, setTyped] = useState<string | null>(null);
  const [asked, setAsked] = useState<Loadable<Asked>>(idle());
  const seq = useRef(0);
  const key = signer.passkey?.key ?? null;
  const { cartridgeId, version } = manifest;
  const own = cartridgeLabel(cartridgeId);
  // What main is asked about: the player's label once they type one, else the id's own (null).
  const label = typed === null ? null : cartridgeLabel(typed);
  const invalid = typed !== null && label === null;
  const delay = typed === null ? 0 : 500;

  const read = useCallback(async () => {
    const at = ++seq.current;
    setAsked((before) => (before.status === "ready" ? before : loading()));
    const result = await window.seed.market.cartridgeName(cartridgeId, version, key, label);
    if (at !== seq.current) return;
    setAsked(result.ok ? ready({ label, status: result.value }) : errored(result.error));
  }, [cartridgeId, version, key, label]);
  // After a signature that first linked the passkey, the handler's own `read` still has no key:
  // re-read through the newest one.
  const latestRead = useRef(read);
  latestRead.current = read;

  useEffect(() => {
    if (!signer.config?.parent || invalid) return;
    const timer = window.setTimeout(() => void read(), delay);
    return () => window.clearTimeout(timer);
  }, [read, delay, invalid, signer.config]);

  const current = asked.status === "ready" ? asked.value.status : null;
  const who = usePlayerNames([current?.holder]);

  if (signer.config === null) return null;
  if (signer.config.parent === null) return <SetupNote signer={signer} />;
  const fresh = asked.status === "ready" && asked.value.label === label && !invalid;
  const status = fresh ? current : null;
  // The label is the player's to pick while nobody holds the name (or it names another cartridge).
  const choosing =
    typed !== null ||
    (current !== null && (current.state === "free" || current.state === "taken")) ||
    (asked.status === "error" && asked.error.code === "ens-bad-label");
  const writable = status !== null && (status.state === "free" || status.state === "outdated");
  const chosen = label ?? own;

  const write = async (): Promise<void> => {
    if (status === null) return;
    const landed = await signer.signed(
      {
        kind: "name-cartridge",
        cartridgeId,
        version,
        ...(status.state === "free" && chosen !== null ? { label: chosen } : {}),
      },
      t("market.summaryNameCartridge", { name: status.name, ref: `${cartridgeId}@${version}` }),
    );
    if (!landed) return;
    toast("success", t("market.nameDone", { name: status.name }));
    setTyped(null);
    await latestRead.current();
  };

  // A bad label or a failed read is said once, under the field, while the player is choosing.
  const line =
    status !== null
      ? `${t("title.ensName")} ${status.name} · ${statusLine(t, status, who)}`
      : asked.status === "error"
        ? choosing
          ? t("title.ensName")
          : errorLine(asked.error)
        : invalid
          ? t("title.ensName")
          : `${t("title.ensName")} · ${t("market.nameChecking")}`;
  const action =
    !writable || status === null ? null : signer.config.relayer ? (
      <Button variant="secondary" disabled={signer.busy !== null} onClick={() => void write()}>
        {busyLabel(
          t,
          signer,
          status.state === "free" ? t("market.nameRegister") : t("market.nameRepoint"),
        )}
      </Button>
    ) : null;

  return (
    <>
      <span className="g-meta">{line}</span>
      {choosing ? (
        <>
          <div className="row-actions">
            <TextField
              label={t("market.cartridgeLabel", { world: manifest.name })}
              value={typed ?? own ?? ""}
              mono
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              disabled={signer.busy !== null}
              onChange={(event) => setTyped(typedLabel(event.target.value))}
            />
            {action}
          </div>
          {(typed ?? own)?.startsWith("xn-") ? (
            <Text variant="caption" tone="dim">
              {t("market.labelPunycode")}
            </Text>
          ) : null}
          {invalid ? (
            <Text variant="caption" tone="danger">
              {t("market.labelInvalid")}
            </Text>
          ) : asked.status === "error" ? (
            <Text variant="caption" tone="danger">
              {errorLine(asked.error)}
            </Text>
          ) : status?.state === "taken" ? (
            <Text variant="caption" tone="danger">
              {t("market.labelTaken")}
            </Text>
          ) : (
            <Text variant="caption" tone="dim">
              {t("market.labelFixed")}
            </Text>
          )}
        </>
      ) : action === null ? null : (
        <div className="row-actions">{action}</div>
      )}
      {writable && !signer.config.relayer ? (
        <span className="g-meta">{t("market.readOnly")}</span>
      ) : null}
      {status === null ? null : (
        <LaunchLine
          status={status}
          cartridgeId={cartridgeId}
          version={version}
          signer={signer}
          onLaunched={() => latestRead.current()}
        />
      )}
    </>
  );
}
