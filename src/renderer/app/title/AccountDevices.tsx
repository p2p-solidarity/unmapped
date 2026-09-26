// Settings → Account, signed in: the account's devices, approving a new device's pairing code, and
// then — only offered, never done silently (rev 6 phase 4, D1) — making that device a co-owner of
// the shared worlds this device owns (`world.addOwner`, D5). The approving device types only the code
// the new device shows; the gateway answers which key asked for it (looking up never spends the
// code), and the person compares that fingerprint with the one on the new device's screen before
// approving. Keys are public; nothing here is a secret. Adding and removing are offered only when
// this computer's key is in the account (`canChangeDevices`): the gateway refuses a statement signed
// by any other key, e.g. under a `.env` token of an account this key has left.

import { formatDateTime, useT } from "@renderer/i18n";
import { Button, ErrorBlock, space, Text, TextField } from "@renderer/ui";
import type { AccountDeviceView, AccountStatus, PairingLookup } from "@shared/gatewayApi";
import { type AppError, err, ok, type Result } from "@shared/result";
import { type JSX, useState } from "react";

interface OwnedWorld {
  worldId: string;
  name: string;
}

/** Shared worlds this device owns (attached ones only), named by their save. */
async function ownedSharedWorlds(): Promise<Result<OwnedWorld[]>> {
  const [badges, instances] = await Promise.all([
    window.seed.world.badges(),
    window.seed.instances.list(),
  ]);
  if (!badges.ok) return badges;
  const names = new Map(instances.ok ? instances.value.map((i) => [i.instanceId, i.name]) : []);
  const seen = new Map<string, OwnedWorld>();
  for (const badge of badges.value) {
    if (badge.kind !== "shared" || seen.has(badge.worldId)) continue;
    seen.set(badge.worldId, {
      worldId: badge.worldId,
      name: names.get(badge.instanceId) ?? badge.worldId,
    });
  }
  return ok([...seen.values()]);
}

/** Adds `key` as a co-owner of each world; `owner-already` counts as done. */
async function addCoOwner(worlds: OwnedWorld[], key: string): Promise<Result<number>> {
  let done = 0;
  for (const world of worlds) {
    const added = await window.seed.world.addOwner(world.worldId, key);
    if (added.ok || added.error.code === "owner-already") done += 1;
    else return err(added.error.code, `${world.name}: ${added.error.message}`, added.error.hint);
  }
  return ok(done);
}

/** Typing another device's code, looking it up, comparing fingerprints and approving it. */
function ApproveDevice({
  code,
  busy,
  found,
  lookupError,
  onCode,
  onLookUp,
  onApprove,
}: {
  code: string;
  busy: boolean;
  found: PairingLookup | null;
  lookupError: AppError | null;
  onCode(code: string): void;
  onLookUp(): void;
  onApprove(): void;
}): JSX.Element {
  const t = useT();
  return (
    <>
      <Text variant="label">{t("account.approveHeading")}</Text>
      <Text variant="caption" tone="dim">
        {t("account.approveNote")}
      </Text>
      <TextField
        label={t("account.codeField")}
        mono
        autoComplete="off"
        spellCheck={false}
        value={code}
        onChange={(event) => onCode(event.target.value)}
      />
      <div>
        <Button disabled={busy || code.trim() === ""} onClick={onLookUp}>
          {t("account.lookUp")}
        </Button>
      </div>
      {lookupError !== null ? <ErrorBlock error={lookupError} /> : null}
      {found !== null ? (
        <div
          data-pairing-found=""
          style={{ display: "flex", flexDirection: "column", gap: space.xs }}
        >
          <Text variant="caption" tone="accent" mono>
            {t("account.lookedUp", { fingerprint: found.fingerprint })}
          </Text>
          <div>
            <Button variant="primary" disabled={busy} onClick={onApprove}>
              {t("account.approve")}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function AccountDevices({
  status,
  run,
}: {
  status: AccountStatus & { session: { state: "signed-in" } };
  /** Runs an account action; answers false when it failed (the panel shows the error). */
  run(action: () => Promise<Result<AccountStatus>>): Promise<boolean>;
}): JSX.Element {
  const t = useT();
  const [code, setCode] = useState("");
  const [found, setFound] = useState<PairingLookup | null>(null);
  const [lookupError, setLookupError] = useState<AppError | null>(null);
  const [approved, setApproved] = useState<string | null>(null);
  const [offer, setOffer] = useState<OwnedWorld[] | null>(null);
  const [offerError, setOfferError] = useState<AppError | null>(null);
  const [coOwned, setCoOwned] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const canChange = status.session.canChangeDevices;

  const lookUp = async () => {
    setFound(null);
    setLookupError(null);
    setApproved(null);
    setBusy(true);
    const result = await window.seed.gateway.lookupPairing(code);
    setBusy(false);
    if (!result.ok) return setLookupError(result.error);
    setFound(result.value);
  };
  const approve = async () => {
    if (found === null) return;
    setApproved(null);
    setCoOwned(null);
    setOfferError(null);
    const added = await run(() => window.seed.gateway.approvePairing(code, found.key));
    if (!added) return;
    setApproved(found.key);
    setCode("");
    setFound(null);
    const worlds = await ownedSharedWorlds();
    setOffer(worlds.ok && worlds.value.length > 0 ? worlds.value : null);
  };
  const makeCoOwner = async () => {
    if (offer === null || approved === null) return;
    setBusy(true);
    const result = await addCoOwner(offer, approved);
    setBusy(false);
    if (!result.ok) return setOfferError(result.error);
    setCoOwned(result.value);
    setOffer(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
      <Text variant="label">{t("account.devicesHeading")}</Text>
      {status.session.devices.map((device: AccountDeviceView) => (
        <div
          key={device.key}
          style={{ display: "flex", gap: space.xs, alignItems: "center", flexWrap: "wrap" }}
        >
          <Text variant="caption" mono>
            {t("account.deviceLine", {
              fingerprint: device.fingerprint,
              date: formatDateTime(device.addedAt),
            })}
          </Text>
          {device.thisDevice ? (
            <Text variant="caption" tone="accent">
              {t("account.thisComputer")}
            </Text>
          ) : canChange ? (
            <Button
              variant="ghost"
              onClick={() => void run(() => window.seed.gateway.removeDevice(device.key))}
            >
              {t("account.removeDevice")}
            </Button>
          ) : null}
        </div>
      ))}

      {canChange ? (
        <ApproveDevice
          code={code}
          busy={busy}
          found={found}
          lookupError={lookupError}
          onCode={(next) => {
            setCode(next);
            setFound(null);
            setLookupError(null);
          }}
          onLookUp={() => void lookUp()}
          onApprove={() => void approve()}
        />
      ) : (
        <Text variant="caption" tone="dim">
          {t("account.devicesReadOnly")}
        </Text>
      )}
      {approved !== null ? (
        <Text variant="caption" tone="success">
          {t("account.approved")}
        </Text>
      ) : null}
      {offer !== null ? (
        <div
          data-co-owner-offer=""
          style={{ display: "flex", flexDirection: "column", gap: space.xs }}
        >
          <Text variant="caption">{t("account.coOwnerOffer", { n: offer.length })}</Text>
          {offer.map((world) => (
            <Text key={world.worldId} variant="caption" tone="dim">
              {world.name}
            </Text>
          ))}
          <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
            <Button disabled={busy} onClick={() => void makeCoOwner()}>
              {t("account.coOwnerYes")}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setOffer(null)}>
              {t("account.coOwnerNo")}
            </Button>
          </div>
        </div>
      ) : null}
      {coOwned !== null ? (
        <Text variant="caption" tone="success">
          {t("account.coOwnerDone", { n: coOwned })}
        </Text>
      ) : null}
      {offerError !== null ? <ErrorBlock error={offerError} /> : null}
    </div>
  );
}
