// What the ENS name lines share (a cartridge's in CartridgeEns.tsx, a save's in EnsNames.tsx, the
// player's own in PlayerName.tsx): a name's status in words, the signer's busy label, the setup note
// and how a label the player types is kept to what LineageRegistry accepts.

import { type Translate, useT } from "@renderer/i18n";
import type { EnsNameStatus } from "@shared/market";
import type { JSX } from "react";
import type { PasskeySigner } from "./usePasskeySigner";

export type T = Translate;
export type Who = (address: string | null | undefined) => string;

export const shortHash = (hash: string | null): string =>
  hash === null ? "—" : `${hash.replace(/^sha256:/, "").slice(0, 8)}…${hash.slice(-4)}`;

/**
 * A label as the player types it: lowercase a–z, 0–9 and single hyphens, at most 63 characters.
 * Unlike cartridgeLabel it keeps a trailing hyphen, so "my-" can still become "my-world".
 */
export function typedLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+/, "")
    .slice(0, 63);
}

export function statusLine(t: T, status: EnsNameStatus, who: Who): string {
  switch (status.state) {
    case "free":
      return t("market.nameFree");
    case "current":
      return t("market.nameCurrent");
    case "outdated":
      return t("market.nameOutdated", { version: status.version ?? "—" });
    case "other-version":
      return t("market.nameOtherVersion", {
        holder: who(status.holder),
        version: status.version ?? "—",
      });
    case "taken":
      return t("market.nameTaken", { holder: who(status.holder) });
  }
}

export function busyLabel(t: T, signer: PasskeySigner, idleLabel: string): string {
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

/** Setup lines shared by every block; null when names can be read here. */
export function SetupNote({ signer }: { signer: PasskeySigner }): JSX.Element | null {
  const t = useT();
  if (signer.config === null) return null;
  if (signer.config.parent === null) {
    return <span className="g-meta">{t("market.notConfigured")}</span>;
  }
  return null;
}
