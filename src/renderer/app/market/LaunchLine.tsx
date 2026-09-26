// Putting the player's own world on the market from its cartridge name: one passkey signature, and
// LineageRegistry.launch mints the world's token and opens its Uniswap auction. Main picks every
// number (LAUNCH_TERMS); this line only shows them before the player signs, and says why a world
// cannot launch yet (its parent is not on the market) or where to find it once it has.

import { formatNumber, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, Text } from "@renderer/ui";
import { type EnsNameStatus, LAUNCH_TERMS } from "@shared/market";
import type { JSX } from "react";
import { busyLabel, type T } from "./ensCommon";
import type { PasskeySigner } from "./usePasskeySigner";

/** Sepolia makes a block about every 12 seconds. */
const AUCTION_MINUTES = Math.round((LAUNCH_TERMS.auctionBlocks * 12) / 60);

function terms(t: T, parentName: string | null): string {
  const shared = {
    supply: formatNumber(Number(LAUNCH_TERMS.supply)),
    pool: formatNumber(Number(LAUNCH_TERMS.lpReserve)),
    blocks: LAUNCH_TERMS.auctionBlocks,
    min: AUCTION_MINUTES,
    raised: LAUNCH_TERMS.requiredRaised,
  };
  return parentName === null
    ? t("market.launchTerms", { ...shared, floor: LAUNCH_TERMS.floorTopLevel })
    : t("market.launchTermsRemix", {
        ...shared,
        floor: LAUNCH_TERMS.floorRemix,
        parent: parentName,
      });
}

interface LaunchLineProps {
  status: EnsNameStatus;
  cartridgeId: string;
  version: string;
  signer: PasskeySigner;
  onLaunched(): Promise<void>;
}

export function LaunchLine({
  status,
  cartridgeId,
  version,
  signer,
  onLaunched,
}: LaunchLineProps): JSX.Element | null {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const market = status.market;
  if (market === null || status.state === "free" || status.state === "taken") return null;
  if (market.token !== null) return <span className="g-meta">{t("market.launchOnMarket")}</span>;
  if (status.state !== "current" || !status.mine) return null;
  if (!market.parentLaunched) {
    return (
      <Text variant="caption" tone="dim">
        {t("market.launchParentFirst", { parent: market.parentName ?? "—" })}
      </Text>
    );
  }

  const launch = async (): Promise<void> => {
    const landed = await signer.signed(
      { kind: "launch", cartridgeId, version },
      t("market.summaryLaunch", { name: status.name }),
    );
    if (!landed) return;
    toast("success", t("market.launchDone", { name: status.name }));
    await onLaunched();
  };

  return (
    <>
      <Text variant="caption" tone="dim">
        {terms(t, market.parentName)}
      </Text>
      {signer.config?.relayer ? (
        <div className="row-actions">
          <Button variant="secondary" disabled={signer.busy !== null} onClick={() => void launch()}>
            {busyLabel(t, signer, t("market.launch"))}
          </Button>
        </div>
      ) : (
        <span className="g-meta">{t("market.readOnly")}</span>
      )}
    </>
  );
}
