// Linking the player's one passkey: one button that picks its own way (`autoEnrolPath`: the system
// browser for Touch ID, since this window cannot show it, or the passkey this device already made
// in this window), and the other way folded under one small button. Shared by Settings → Your
// passkey, the Market's passkey block and the player's own name (PlayerName.tsx).

import { type StringKey, useT } from "@renderer/i18n";
import { Button, Text } from "@renderer/ui";
import { type JSX, useState } from "react";
import { AUTOFOCUS } from "../library/focus";
import { autoEnrolPath, type EnrolPath, type PasskeySigner } from "./usePasskeySigner";

/** What each way says before it is taken, and on its own (folded) button. */
const NOTE: Record<EnrolPath, StringKey> = {
  browser: "market.useBrowserNote",
  app: "market.usePasskeyNote",
};
const OTHER_WAY: Record<EnrolPath, StringKey> = {
  browser: "market.otherWayBrowser",
  app: "market.otherWayApp",
};
const TAKE_WAY: Record<EnrolPath, StringKey> = {
  browser: "market.useBrowserPasskey",
  app: "market.useAppPasskey",
};

export function EnrolPasskey({
  signer,
  autofocus = false,
}: {
  signer: PasskeySigner;
  /** The panel's first focus lands on the one button. */
  autofocus?: boolean;
}): JSX.Element {
  const t = useT();
  const [other, setOther] = useState(false);
  const path = autoEnrolPath();
  const alt: EnrolPath = path === "browser" ? "app" : "browser";
  const busy = signer.busy !== null;
  const waiting = (way: EnrolPath): string | null =>
    way === "browser" && signer.busy === "browser"
      ? t("market.waitingBrowser")
      : way === "app" && signer.busy === "passkey"
        ? t("market.signing")
        : null;
  return (
    <>
      <Text variant="caption" tone="dim">
        {t(path === "app" ? "market.useAppHaveNote" : NOTE.browser)}
      </Text>
      <div className="row-actions">
        <Button
          className={autofocus ? AUTOFOCUS : undefined}
          variant="primary"
          disabled={busy}
          onClick={() => void signer.enrol(path)}
        >
          {waiting(path) ?? t("market.setUpPasskey")}
        </Button>
        {other ? null : (
          <Button variant="ghost" disabled={busy} onClick={() => setOther(true)}>
            {t(OTHER_WAY[alt])}
          </Button>
        )}
      </div>
      {other ? (
        <>
          <Text variant="caption" tone="dim">
            {t(NOTE[alt])}
          </Text>
          <div className="row-actions">
            <Button disabled={busy} onClick={() => void signer.enrol(alt)}>
              {waiting(alt) ?? t(TAKE_WAY[alt])}
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
