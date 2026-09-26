// Signing with the player's one passkey, for anything on chain: market actions and ENS names. Every
// action goes prepare (main builds the batch) → sign (the passkey, one prompt; in the system browser
// for Touch ID) → submit (the gas station pays). The renderer never sees a key or an RPC — only the
// digest to sign and what the browser page should say. `after` runs once something landed.
//
// Linking picks its own way (`autoEnrolPath`): this window cannot show Touch ID, so the system
// browser is the default; a device that already made a passkey in this window (F12's unlock) links
// that same one here, so the player never ends up with two.

import { errorLine } from "@renderer/i18n";
import {
  type MarketPasskey,
  marketPasskey,
  prfAvailability,
  rememberMarketPasskey,
  signMarketChallenge,
  storedCredentialId,
  storedMarketPasskey,
} from "@renderer/identity";
import { useSessionStore } from "@renderer/state";
import type { MarketAction, MarketConfig, MarketReceipt } from "@shared/market";
import type { Result } from "@shared/result";
import { useCallback, useEffect, useRef, useState } from "react";

export type MarketBusy = null | "passkey" | "signing" | "sending" | "browser";
export type EnrolPath = "browser" | "app";

/**
 * How this device links the player's passkey: in this window when it already holds one made here
 * (reusing it), else through the system browser (Touch ID).
 */
export function autoEnrolPath(): EnrolPath {
  return prfAvailability() === null && storedCredentialId() !== null ? "app" : "browser";
}

export interface PasskeySigner {
  config: MarketConfig | null;
  passkey: MarketPasskey | null;
  busy: MarketBusy;
  lastTx: string | null;
  /** Links the passkey: in the system browser (Touch ID) or in this window (a security key). */
  enrol(via: EnrolPath): Promise<MarketPasskey | null>;
  /** A passkey-signed action (`summary` is what the browser page shows); true once on chain. */
  signed(action: MarketAction, summary: string): Promise<boolean>;
  /** An action anyone may take, carried by the gas station without a signature. */
  relayed(run: () => Promise<Result<MarketReceipt>>): Promise<MarketReceipt | null>;
}

export function usePasskeySigner(after?: () => Promise<void> | void): PasskeySigner {
  const toast = useSessionStore((state) => state.toast);
  const [config, setConfig] = useState<MarketConfig | null>(null);
  const [passkey, setPasskey] = useState<MarketPasskey | null>(() => storedMarketPasskey());
  const [busy, setBusy] = useState<MarketBusy>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const afterRef = useRef(after);
  afterRef.current = after;

  useEffect(() => {
    void window.seed.market.config().then(setConfig);
  }, []);

  const landed = useCallback(async (receipt: MarketReceipt) => {
    setLastTx(receipt.txHashes.at(-1) ?? null);
    await afterRef.current?.();
  }, []);

  const enrol = useCallback(
    async (via: EnrolPath): Promise<MarketPasskey | null> => {
      setBusy(via === "browser" ? "browser" : "passkey");
      const result =
        via === "browser"
          ? await window.seed.market
              .link()
              .then((linked) =>
                linked.ok
                  ? { ...linked, value: { ...linked.value, via: "browser" as const } }
                  : linked,
              )
          : await marketPasskey();
      setBusy(null);
      if (!result.ok) {
        toast("danger", errorLine(result.error));
        return null;
      }
      rememberMarketPasskey(result.value);
      setPasskey(result.value);
      return result.value;
    },
    [toast],
  );

  const signed = useCallback(
    async (action: MarketAction, summary: string): Promise<boolean> => {
      const key = passkey ?? (await enrol(autoEnrolPath()));
      if (key === null) return false;
      setBusy("sending");
      const prepared = await window.seed.market.prepare(key.key, action);
      if (!prepared.ok) {
        setBusy(null);
        toast("danger", errorLine(prepared.error));
        return false;
      }
      let sent: Result<MarketReceipt>;
      if (key.via === "browser") {
        setBusy("browser");
        sent = await window.seed.market.signInBrowser({
          preparedId: prepared.value.id,
          credentialId: key.credentialId,
          summary,
        });
      } else {
        setBusy("signing");
        const auth = await signMarketChallenge(key, prepared.value.challenge);
        if (!auth.ok) {
          setBusy(null);
          toast("danger", errorLine(auth.error));
          return false;
        }
        setBusy("sending");
        sent = await window.seed.market.submit({ id: prepared.value.id, auth: auth.value });
      }
      setBusy(null);
      if (!sent.ok) {
        toast("danger", errorLine(sent.error));
        return false;
      }
      await landed(sent.value);
      return true;
    },
    [enrol, landed, passkey, toast],
  );

  const relayed = useCallback(
    async (run: () => Promise<Result<MarketReceipt>>): Promise<MarketReceipt | null> => {
      setBusy("sending");
      const result = await run();
      setBusy(null);
      if (!result.ok) {
        toast("danger", errorLine(result.error));
        return null;
      }
      await landed(result.value);
      return result.value;
    },
    [landed, toast],
  );

  return { config, passkey, busy, lastTx, enrol, signed, relayed };
}
