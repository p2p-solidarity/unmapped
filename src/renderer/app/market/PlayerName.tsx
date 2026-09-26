// The player's own ENS name, `<label>.players.<root>`, held by their passkey's account (main/chain/
// players.ts): claimed once with one passkey confirmation, and then shown wherever that account holds
// a name or owns a world. The name is also the natural player name — what friends see in the game —
// so a claim sets it on this device, and a device that plays under another name is offered the
// switch. No address, key or credential is shown here (the Market keeps the account's address in
// its folded details).

import { useT } from "@renderer/i18n";
import { playerName, setPlayerName } from "@renderer/net";
import { useSessionStore } from "@renderer/state";
import { Button, StatePanel, Text, TextField } from "@renderer/ui";
import { cartridgeLabel } from "@shared/ensNames";
import type { PlayerView } from "@shared/market";
import { errored, idle, type Loadable, loading, ready } from "@shared/result";
import { type JSX, useCallback, useEffect, useRef, useState } from "react";
import { EnrolPasskey } from "./EnrolPasskey";
import { busyLabel, SetupNote, typedLabel } from "./ensCommon";
import type { PasskeySigner } from "./usePasskeySigner";
import { rememberPlayerName } from "./usePlayerNames";

/** A view and the label it was asked about, so a reply for an older label never acts. */
interface Asked {
  label: string | null;
  player: PlayerView;
}

/** The label this device's player name suggests (an earlier player name drops its tree). */
const suggested = (name: string): string | null =>
  cartridgeLabel(name.replace(/\.players\..*$/, ""));

export function PlayerName({ signer }: { signer: PasskeySigner }): JSX.Element | null {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const [deviceName, setDeviceName] = useState(() => playerName());
  const [typed, setTyped] = useState<string | null>(null);
  const [asked, setAsked] = useState<Loadable<Asked>>(idle());
  const seq = useRef(0);
  const key = signer.passkey?.key ?? null;
  const label = typed === null ? suggested(deviceName) : cartridgeLabel(typed);
  const invalid = typed !== null && label === null;
  const delay = typed === null ? 0 : 500;

  const read = useCallback(async () => {
    if (key === null) return;
    const at = ++seq.current;
    setAsked((before) => (before.status === "ready" ? before : loading()));
    const result = await window.seed.market.playerName(key, label);
    if (at !== seq.current) return;
    setAsked(result.ok ? ready({ label, player: result.value }) : errored(result.error));
  }, [key, label]);
  // After a signature that first linked the passkey, the handler's own `read` still has no key:
  // re-read through the newest one.
  const latestRead = useRef(read);
  latestRead.current = read;

  useEffect(() => {
    if (!signer.config?.parent || key === null || invalid) return;
    const timer = window.setTimeout(() => void read(), delay);
    return () => window.clearTimeout(timer);
  }, [read, delay, invalid, key, signer.config]);

  if (signer.config === null) return null;
  if (signer.config.parent === null) return <SetupNote signer={signer} />;
  if (key === null) {
    return (
      <>
        <Text tone="dim">{t("market.playerNeedsPasskey")}</Text>
        <EnrolPasskey signer={signer} />
      </>
    );
  }

  const adoptName = (name: string): void => {
    setPlayerName(name);
    setDeviceName(playerName());
  };
  const claim = async (account: string, name: string, chosen: string): Promise<void> => {
    const landed = await signer.signed(
      { kind: "name-player", label: chosen },
      t("market.summaryNamePlayer", { name }),
    );
    if (!landed) return;
    // Other players on a continent see the player name: the claimed name becomes it at once.
    adoptName(name);
    rememberPlayerName(account, name);
    toast("success", t("market.playerClaimed", { name }));
    setTyped(null);
    await latestRead.current();
  };
  return (
    <StatePanel state={asked} loadingText={t("market.nameChecking")}>
      {({ label: askedLabel, player }) => {
        if (player.directory === null) {
          return (
            <Text variant="caption" tone="dim">
              {t("market.playerNoDirectory")}
            </Text>
          );
        }
        if (player.name !== null) {
          const name = player.name;
          return (
            <>
              <Text variant="title">{name}</Text>
              {deviceName === name ? null : (
                <>
                  <span className="g-meta">
                    {t("market.playerDeviceName", { name: deviceName })}
                  </span>
                  <div className="row-actions">
                    <Button onClick={() => adoptName(name)}>{t("market.playerUseName")}</Button>
                  </div>
                </>
              )}
            </>
          );
        }
        const candidate = askedLabel === label && !invalid ? player.candidate : null;
        const free = candidate?.state === "free";
        return (
          <>
            <Text variant="caption" tone="dim">
              {t("market.playerIntro")}
            </Text>
            <div className="row-actions">
              <TextField
                label={t("market.playerLabel")}
                value={typed ?? label ?? ""}
                mono
                spellCheck={false}
                autoCapitalize="none"
                autoCorrect="off"
                disabled={signer.busy !== null}
                onChange={(event) => setTyped(typedLabel(event.target.value))}
              />
              {signer.config?.relayer ? (
                <Button
                  variant="primary"
                  disabled={signer.busy !== null || !free || label === null}
                  onClick={() => {
                    if (candidate !== null && label !== null) {
                      void claim(player.account, candidate.name, label);
                    }
                  }}
                >
                  {busyLabel(t, signer, t("market.playerClaim"))}
                </Button>
              ) : null}
            </div>
            <span className="g-meta">
              {invalid || label === null
                ? t("market.labelInvalid")
                : candidate === null
                  ? t("market.nameChecking")
                  : free
                    ? t("market.playerFree", { name: candidate.name })
                    : t("market.playerTaken", { name: candidate.name })}
            </span>
            {signer.config?.relayer ? null : <span className="g-meta">{t("market.readOnly")}</span>}
          </>
        );
      }}
    </StatePanel>
  );
}
