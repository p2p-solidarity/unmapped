// Settings → Your passkey: the player's one passkey, in plain words. What it is, whether it is set
// up, one button that links it (EnrolPasskey picks the way: the system browser for Touch ID, or the
// passkey this device already made in this window), and then the player's own name (PlayerName).
// It exists only where the ENS tree is set up (`market.config().parent`); without it nothing here
// signs anything, so nothing about passkeys is shown at all. No credential id, key or address.

import { useT } from "@renderer/i18n";
import { space, Text } from "@renderer/ui";
import type { JSX } from "react";
import { EnrolPasskey } from "../market/EnrolPasskey";
import { PlayerName } from "../market/PlayerName";
import { usePasskeySigner } from "../market/usePasskeySigner";

export function PasskeyPanel(): JSX.Element | null {
  const t = useT();
  const signer = usePasskeySigner();
  if (signer.config === null || signer.config.parent === null) return null;
  const linked = signer.passkey !== null;
  return (
    <section
      data-passkey={linked ? "set" : "none"}
      style={{ display: "flex", flexDirection: "column", gap: space.sm }}
    >
      <Text variant="label">{t("identity.passkeyHeading")}</Text>
      <Text variant="caption" tone="dim">
        {t("identity.passkeyWhat")}
      </Text>
      <Text variant="body" tone={linked ? "success" : "muted"}>
        {linked ? t("identity.passkeySet") : t("identity.passkeyNone")}
      </Text>
      {linked ? <PlayerName signer={signer} /> : <EnrolPasskey signer={signer} />}
    </section>
  );
}
