// Linking the player's passkey to the market: Touch ID through the system browser (Electron cannot
// show it itself) or a security key in the app. Shared by the Market's account block and the
// player's own name (PlayerName.tsx).

import { useT } from "@renderer/i18n";
import { Button, Text } from "@renderer/ui";
import type { JSX } from "react";
import { AUTOFOCUS } from "../library/focus";
import type { PasskeySigner } from "./usePasskeySigner";

export function EnrolPasskey({
  signer,
  autofocus = false,
}: {
  signer: PasskeySigner;
  /** The panel's first focus lands on the Touch ID button. */
  autofocus?: boolean;
}): JSX.Element {
  const t = useT();
  const busy = signer.busy !== null;
  return (
    <>
      <Text variant="caption" tone="dim">
        {t("market.useBrowserNote")}
      </Text>
      <div className="row-actions">
        <Button
          className={autofocus ? AUTOFOCUS : undefined}
          variant="primary"
          disabled={busy}
          onClick={() => void signer.enrol("browser")}
        >
          {signer.busy === "browser" ? t("market.waitingBrowser") : t("market.useBrowserPasskey")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void signer.enrol("app")}>
          {signer.busy === "passkey" ? t("market.signing") : t("market.useAppPasskey")}
        </Button>
      </div>
      <Text variant="caption" tone="dim">
        {t("market.usePasskeyNote")}
      </Text>
    </>
  );
}
