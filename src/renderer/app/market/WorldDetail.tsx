// One world on the market: its auction (bid with the passkey), its end (settle — open to anyone),
// an end below its required raise (no pool ever; a bidder with open bids can have them refunded),
// or its Uniswap pool (buy through its ancestors with the passkey; pay out the royalties its ENS
// name holder is owed). The last transaction links to Sepolia Etherscan.

import { errorLine, useT } from "@renderer/i18n";
import { useSessionStore } from "@renderer/state";
import { Button, Text, TextField } from "@renderer/ui";
import { type MarketView, type MarketWorld, SEPOLIA_TX } from "@shared/market";
import { type JSX, useState } from "react";
import { amount, phaseLabel } from "./format";
import type { MarketState } from "./useMarket";
import { usePlayerNames } from "./usePlayerNames";

const AMOUNT = /^\d{1,12}(\.\d{1,18})?$/;

/** The world's line from its first-generation ancestor down to itself, by ENS label. */
function lineage(view: MarketView, world: MarketWorld): string {
  const names: string[] = [];
  let at: MarketWorld | undefined = world;
  while (at !== undefined) {
    names.unshift(at.name.split(".")[0] ?? at.name);
    const parent: string | null = at.parent;
    at = parent === null ? undefined : view.worlds.find((w) => w.token === parent);
  }
  return ["USDC", ...names].join(" → ");
}

export function WorldDetail({
  market,
  view,
  world,
}: {
  market: MarketState;
  view: MarketView;
  world: MarketWorld;
}): JSX.Element {
  const t = useT();
  const toast = useSessionStore((state) => state.toast);
  const [bid, setBid] = useState("");
  const [spend, setSpend] = useState("");
  const busy = market.busy !== null;
  const canAct = market.config?.relayer === true;
  const bids = view.account?.bids.filter((b) => b.world === world.token) ?? [];
  const openBids = bids.some((b) => b.state === "open");
  const owed = Number(world.owedToken) > 0 || Number(world.owedCurrency) > 0;
  const who = usePlayerNames([world.owner]);

  const placeBid = async (): Promise<void> => {
    const landed = await market.signed(
      { kind: "bid", world: world.token, amount: bid },
      t("market.summaryBid", { amount: bid, currency: world.currencySymbol, name: world.name }),
    );
    if (!landed) return;
    toast(
      "success",
      t("market.bidDone", { amount: bid, currency: world.currencySymbol, name: world.name }),
    );
    setBid("");
  };
  const buy = async (): Promise<void> => {
    const landed = await market.signed(
      { kind: "buy", world: world.token, usdc: spend },
      t("market.summaryBuy", { name: world.name, amount: spend }),
    );
    if (!landed) return;
    toast("success", t("market.buyDone", { name: world.name, amount: spend }));
    setSpend("");
  };
  // On a failed auction main's settle exits every open bid (a full refund) and sends nothing else.
  const settle = async (): Promise<void> => {
    const receipt = await market.relayed(() => window.seed.market.settle(world.token));
    if (receipt === null) return;
    const done = world.phase === "failed" ? "market.refundDone" : "market.settleDone";
    toast("success", t(done, { n: receipt.txHashes.length }));
  };
  const payOut = async (): Promise<void> => {
    const receipt = await market.relayed(() => window.seed.market.royalties(world.token));
    if (receipt !== null) toast("success", t("market.royaltiesDone"));
  };

  return (
    <div className="detail">
      <Text variant="title">{world.name}</Text>
      <span className="g-meta">
        {`${phaseLabel(t, world.phase)} · $${world.symbol} · ${t("market.owner", { owner: who(world.owner) })}`}
      </span>
      {world.phase === "pool" && world.poolPrice !== null ? (
        <Text>
          {t("market.poolPrice", {
            price: amount(world.poolPrice),
            currency: world.currencySymbol,
            symbol: world.symbol,
          })}
        </Text>
      ) : (
        <>
          <Text>
            {t("market.clearing", {
              price: amount(world.clearing),
              currency: world.currencySymbol,
              symbol: world.symbol,
              floor: amount(world.floor),
            })}
          </Text>
          <span className="g-meta">
            {world.required === null
              ? t("market.raised", {
                  amount: amount(world.raised),
                  currency: world.currencySymbol,
                  n: world.bids,
                })
              : t("market.raisedOf", {
                  amount: amount(world.raised),
                  required: amount(world.required),
                  currency: world.currencySymbol,
                  n: world.bids,
                })}
            {world.phase === "live"
              ? ` · ${t("market.blocksLeft", { n: world.blocksLeft, min: Math.ceil((world.blocksLeft * 12) / 60) })}`
              : ""}
          </span>
        </>
      )}

      {world.phase === "live" ? (
        <>
          {world.parent === null ? null : (
            <Text variant="caption" tone="muted">
              {t("market.bidNeedsParent", { currency: world.currencySymbol })}
            </Text>
          )}
          <div className="row-actions">
            <TextField
              id="market-bid-amount"
              label={t("market.bidLabel", { currency: world.currencySymbol })}
              value={bid}
              inputMode="decimal"
              mono
              onChange={(event) => setBid(event.target.value.trim())}
            />
            <Button
              variant="primary"
              disabled={busy || !canAct || !AMOUNT.test(bid)}
              onClick={() => void placeBid()}
            >
              {market.busy === "browser"
                ? t("market.waitingBrowser")
                : market.busy === "signing"
                  ? t("market.signing")
                  : market.busy === "sending"
                    ? t("market.sending")
                    : t("market.bidButton")}
            </Button>
          </div>
          <Text variant="caption" tone="dim">
            {t("market.bidHelp")}
          </Text>
        </>
      ) : null}

      {world.phase === "ended" ? (
        <>
          <Text variant="caption" tone="dim">
            {t("market.settleHelp")}
          </Text>
          <div className="row-actions">
            <Button variant="primary" disabled={busy || !canAct} onClick={() => void settle()}>
              {market.busy === "sending" ? t("market.sending") : t("market.settle")}
            </Button>
          </div>
        </>
      ) : null}

      {world.phase === "failed" ? (
        <>
          <Text variant="caption" tone="dim">
            {t("market.failedHelp")}
          </Text>
          {openBids ? (
            <>
              <Text variant="caption" tone="dim">
                {t("market.refundHelp")}
              </Text>
              <div className="row-actions">
                <Button variant="primary" disabled={busy || !canAct} onClick={() => void settle()}>
                  {market.busy === "sending" ? t("market.sending") : t("market.refund")}
                </Button>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {world.phase === "pool" ? (
        <>
          <div className="row-actions">
            <TextField
              id="market-buy-amount"
              label={t("market.buyLabel")}
              value={spend}
              inputMode="decimal"
              mono
              onChange={(event) => setSpend(event.target.value.trim())}
            />
            <Button
              variant="primary"
              disabled={busy || !canAct || !AMOUNT.test(spend)}
              onClick={() => void buy()}
            >
              {market.busy === "browser"
                ? t("market.waitingBrowser")
                : market.busy === "signing"
                  ? t("market.signing")
                  : market.busy === "sending"
                    ? t("market.sending")
                    : t("market.buyButton")}
            </Button>
          </div>
          <Text variant="caption" tone="dim">
            {t("market.buyHelp", { path: lineage(view, world) })}
          </Text>
          {owed ? (
            <div className="row-actions">
              <span className="g-meta">
                {t("market.royalties", {
                  token: amount(world.owedToken),
                  symbol: world.symbol,
                  currency: amount(world.owedCurrency),
                  currencySymbol: world.currencySymbol,
                })}
              </span>
              <Button disabled={busy || !canAct} onClick={() => void payOut()}>
                {t("market.payRoyalties")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {bids.length === 0 ? null : (
        <>
          <Text variant="label" tone="muted">
            {t("market.yourBids")}
          </Text>
          {bids.map((b) => (
            <span key={b.id} className="g-meta">
              {t("market.bidRow", {
                id: b.id,
                amount: `${amount(b.amount)} ${world.currencySymbol}`,
                state: t(
                  b.state === "claimed"
                    ? "market.bidClaimed"
                    : b.state === "exited"
                      ? world.phase === "failed"
                        ? "market.bidRefunded"
                        : "market.bidExited"
                      : "market.bidOpen",
                ),
              })}
            </span>
          ))}
        </>
      )}

      {market.lastTx === null ? null : (
        <div className="row-actions">
          <Button
            variant="ghost"
            onClick={() =>
              void window.seed.app.openExternal(`${SEPOLIA_TX}${market.lastTx}`).then((opened) => {
                if (!opened.ok) toast("danger", errorLine(opened.error));
              })
            }
          >
            {t("market.viewTx")}
          </Button>
        </div>
      )}
    </div>
  );
}
