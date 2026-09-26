// Worlds → Market: the lineage market on Sepolia, played with the player's one passkey. Their
// passkey block (their own ENS name, test USDC, holdings; the account's address folded under
// Advanced), every launched world with its auction or pool, and the chosen world's actions
// (WorldDetail). No wallet: the passkey confirms, main relays.

import { useT } from "@renderer/i18n";
import { Button, StatePanel, Text } from "@renderer/ui";
import type { MarketView, MarketWorld } from "@shared/market";
import { type JSX, useRef, useState } from "react";
import { AUTOFOCUS, useArrowFocus } from "../library/focus";
import type { SectionProps } from "../library/sections";
import { useKeys } from "../shell/useKeys";
import { EnrolPasskey } from "./EnrolPasskey";
import { amount, phaseLabel, short } from "./format";
import { PlayerName } from "./PlayerName";
import { type MarketState, useMarket } from "./useMarket";
import { WorldDetail } from "./WorldDetail";

function worldPrice(world: MarketWorld): string {
  return `${amount(world.poolPrice ?? world.clearing)} ${world.currencySymbol}`;
}

function Account({ market, view }: { market: MarketState; view: MarketView }): JSX.Element {
  const t = useT();
  const [more, setMore] = useState(false);
  const account = view.account;
  const busy = market.busy !== null;
  if (market.passkey === null || account === null) {
    return (
      <div className="detail">
        <Text variant="label" tone="muted">
          {t("market.accountHeading")}
        </Text>
        <EnrolPasskey signer={market} autofocus />
      </div>
    );
  }
  const key = market.passkey.key;
  return (
    <div className="detail">
      <Text variant="label" tone="muted">
        {t("market.accountHeading")}
      </Text>
      <PlayerName signer={market} />
      <Text variant="title">{t("market.usdc", { amount: amount(account.usdc) })}</Text>
      {account.holdings.length === 0 ? null : (
        <span className="g-meta">
          {account.holdings
            .map((holding) =>
              t("market.holding", { amount: amount(holding.amount), symbol: holding.symbol }),
            )
            .join(" · ")}
        </span>
      )}
      <div className="row-actions">
        <Button
          disabled={busy || market.config?.relayer !== true}
          onClick={() => void market.relayed(() => window.seed.market.faucet(key))}
        >
          {t("market.faucet")}
        </Button>
        <Button variant="ghost" onClick={() => setMore(!more)}>
          {`${more ? "▾" : "▸"} ${t("market.accountMore")}`}
        </Button>
      </div>
      {more ? (
        <span className="g-meta">
          {t("market.address", { address: short(account.address) })}
          {account.deployed ? "" : ` · ${t("market.notDeployed")}`}
        </span>
      ) : null}
    </div>
  );
}

export function MarketPanel({ onClose }: SectionProps): JSX.Element {
  const t = useT();
  const market = useMarket();
  const [selected, setSelected] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useKeys({ Escape: () => (selected !== null ? setSelected(null) : onClose()) });
  useArrowFocus(listRef);

  return (
    <>
      <h2 className="g-heading">{t("library.sectionMarket")}</h2>
      <Text variant="caption" tone="dim">
        {t("market.intro")}
      </Text>
      {market.config !== null && market.config.parent !== null && !market.config.relayer ? (
        <Text variant="caption" tone="muted">
          {t("market.readOnly")}
        </Text>
      ) : null}
      <StatePanel state={market.view} loadingText={t("market.reading")}>
        {(view) => {
          const world = view.worlds.find((w) => w.token === selected) ?? null;
          return (
            <>
              <Account market={market} view={view} />
              <Text variant="label" tone="muted">
                {t("market.worldsHeading")}
              </Text>
              {view.worlds.length === 0 ? (
                <Text tone="dim">{t("market.noWorlds")}</Text>
              ) : (
                <div className="carts g-scroll" ref={listRef}>
                  {view.worlds.map((w, index) => (
                    <Button
                      key={w.token}
                      className={
                        index === 0 && market.passkey !== null
                          ? `cart-row ${AUTOFOCUS}`
                          : "cart-row"
                      }
                      variant="tile"
                      active={w.token === selected}
                      onClick={() => setSelected(w.token === selected ? null : w.token)}
                    >
                      <strong>{w.name}</strong>
                      <span className="g-meta">
                        {`${phaseLabel(t, w.phase)} · ${worldPrice(w)}/${w.symbol}`}
                      </span>
                    </Button>
                  ))}
                </div>
              )}
              {world === null ? null : (
                <WorldDetail key={world.token} market={market} view={view} world={world} />
              )}
            </>
          );
        }}
      </StatePanel>
    </>
  );
}
