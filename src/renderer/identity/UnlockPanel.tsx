// F12 → World: unlocking the key that encrypts `.seed.enc` files, right where the encrypted export
// and import need it. Two honest ways, no silent magic: the player's one passkey (the same passkey
// the market uses in this window, so nobody makes a second one) or, inside F12 only, this machine's
// OS keychain. Once unlocked it says which, and a keychain unlock can let that passkey open it too.
// Errors surface with their hint. No credential id is ever shown.

import { useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, ErrorBlock, space, Text } from "@renderer/ui";
import { errored, idle, type Loadable, loading, type Result, ready } from "@shared/result";
import { type JSX, useCallback, useState } from "react";
import { addPasskeyWrapping, type UnlockedKey, unlock, unlockWithKeychain } from "./keys";
import { storedMarketPasskey } from "./passkeySign";
import { prfAvailability, storeCredentialId, storedCredentialId } from "./prf";

/**
 * The passkey this device already made in this window: the unlock's own, else the market's (one
 * linked through the system browser cannot answer here). Null when there is none yet.
 */
function devicePasskey(): string | null {
  const own = storedCredentialId();
  if (own !== null) return own;
  const market = storedMarketPasskey();
  return market !== null && market.via !== "browser" ? market.credentialId : null;
}

/** Unlock with the player's passkey: a market passkey made in this window is the one it asks for. */
function unlockWithPasskey(): Promise<Result<UnlockedKey>> {
  const existing = devicePasskey();
  if (existing !== null && storedCredentialId() === null) storeCredentialId(existing);
  return unlock();
}

const column = { display: "flex", flexDirection: "column", gap: space.sm } as const;

export function UnlockPanel(): JSX.Element {
  const t = useT();
  const unlocked = useSessionStore((state) => state.unlock);
  const [attempt, setAttempt] = useState<Loadable<null>>(idle());
  const [link, setLink] = useState<Loadable<null>>(idle());
  const passkeyAvailable = prfAvailability() === null;

  const run = useCallback(async (tryUnlock: () => Promise<Result<UnlockedKey>>) => {
    setAttempt(loading());
    const result = await tryUnlock();
    setAttempt(result.ok ? idle() : errored(result.error));
  }, []);
  const withPasskey = useCallback(() => void run(unlockWithPasskey), [run]);
  const withKeychain = useCallback(() => void run(unlockWithKeychain), [run]);
  const linkPasskey = useCallback(() => {
    setLink(loading());
    void addPasskeyWrapping(devicePasskey()).then((result) => {
      setLink(result.ok ? ready(null) : errored(result.error));
    });
  }, []);

  if (unlocked !== null) {
    const keychain = unlocked.method === "keychain";
    return (
      <div style={column}>
        <Text variant="caption" tone="success">
          {keychain ? t("identity.unlockedKeychain") : t("identity.unlockedPasskey")}
        </Text>
        {keychain && passkeyAvailable && link.status !== "ready" ? (
          <div className="row-actions">
            <Button disabled={link.status === "loading"} onClick={linkPasskey}>
              {link.status === "loading" ? t("identity.waitingPasskey") : t("identity.addPasskey")}
            </Button>
          </div>
        ) : null}
        {link.status === "ready" ? (
          <Text variant="caption" tone="muted">
            {t("identity.passkeyLinked")}
          </Text>
        ) : link.status === "error" ? (
          <ErrorBlock error={link.error} />
        ) : null}
      </div>
    );
  }

  const busy = attempt.status === "loading";
  const failed = attempt.status === "error" ? attempt.error : null;
  const keychainFirst = !passkeyAvailable || failed?.code === "prf-unsupported";
  return (
    <div style={column}>
      <Text variant="caption" tone="muted">
        {busy ? t("identity.unlocking") : t("identity.unlockNeeded")}
      </Text>
      {failed === null ? null : <ErrorBlock error={failed} />}
      <div className="row-actions">
        {passkeyAvailable ? (
          <Button
            variant={keychainFirst ? "secondary" : "primary"}
            disabled={busy}
            onClick={withPasskey}
          >
            {failed === null ? t("identity.unlockPasskey") : t("identity.retryPasskey")}
          </Button>
        ) : null}
        <Button
          variant={keychainFirst ? "primary" : "ghost"}
          disabled={busy}
          onClick={withKeychain}
        >
          {t("identity.useKeychain")}
        </Button>
      </div>
      <Text variant="caption" tone="dim">
        {t("identity.unlockNote")}
      </Text>
    </div>
  );
}
