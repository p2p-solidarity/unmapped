// Launching a player's own world from the app: LineageRegistry.launch on a cartridge name the
// player's passkey account holds. The registry mints the world's token and hands it to Uniswap's
// LBPStrategy, which runs a Continuous Clearing Auction priced in the parent world's token (USDC at
// the top level) and graduates into a v4 pool under LineageHook. Main picks every parameter from
// LAUNCH_TERMS — the renderer only says which revision — and checks here what the contract would
// refuse anyway, so the player reads a reason instead of a reverted simulation.

import { LAUNCH_TERMS } from "@shared/market";
import { err, ok, type Result } from "@shared/result";
import { type Address, encodeFunctionData, namehash, parseUnits } from "viem";
import { type AccountCall, auctionPrices, lineageRegistry } from "./lineageCalls";
import { decimalsOf, type MarketClients, USDC } from "./market";
import { nameOf } from "./nameIndex";
import { cartridgeNameView, type Dirs } from "./names";

/** "0.01" → [1n, 100n]: a decimal floor as a fraction, for auctionPrices. */
function fraction(text: string): [bigint, bigint] {
  const [whole = "0", decimals = ""] = text.split(".");
  const denominator = 10n ** BigInt(decimals.length);
  return [BigInt(whole) * denominator + BigInt(decimals || "0"), denominator];
}

export async function launchCalls(
  c: MarketClients,
  dirs: Dirs,
  account: Address,
  cartridgeId: string,
  version: string,
): Promise<Result<AccountCall[]>> {
  const view = await cartridgeNameView(c, dirs, cartridgeId, version, account);
  if (!view.ok) return view;
  const status = view.value;
  if (status.state === "free") {
    return err(
      "market-launch-unnamed",
      `${status.name} is not registered yet.`,
      "Name the world first; a world goes on the market under its ENS name.",
    );
  }
  if (!status.mine || status.market === null) {
    return err(
      "market-launch-not-holder",
      `${status.name} is held by ${status.holder ?? "someone else"}.`,
      "Only the name's holder can put it on the market.",
    );
  }
  if (status.market.token !== null) {
    return err(
      "market-launch-done",
      `${status.name} is already on the market.`,
      "Find it in Worlds → Market.",
    );
  }
  if (!status.market.parentLaunched) {
    return err(
      "market-parent-not-launched",
      `${status.market.parentName ?? "Its parent"} is not on the market yet.`,
      "A remix trades in its parent's token, so the parent launches first.",
    );
  }
  const node = namehash(status.name);
  const parentToken =
    status.market.parentName === null
      ? null
      : (await nameOf(c, namehash(status.market.parentName))).token;
  const currency = parentToken ?? USDC;
  const decimals = decimalsOf(currency);
  const [numerator, denominator] = fraction(
    parentToken === null ? LAUNCH_TERMS.floorTopLevel : LAUNCH_TERMS.floorRemix,
  );
  const prices = auctionPrices(numerator, denominator, decimals, 18);
  return ok([
    {
      target: c.deployment.registry,
      value: 0n,
      data: encodeFunctionData({
        abi: lineageRegistry.abi,
        functionName: "launch",
        args: [
          node,
          {
            supply: parseUnits(LAUNCH_TERMS.supply, 18),
            lpReserve: parseUnits(LAUNCH_TERMS.lpReserve, 18),
            auctionBlocks: BigInt(LAUNCH_TERMS.auctionBlocks),
            floorPriceQ96: prices.floorPriceQ96,
            tickSpacingQ96: prices.tickSpacingQ96,
            requiredCurrencyRaised: parseUnits(LAUNCH_TERMS.requiredRaised, decimals),
          },
        ],
      } as never),
    },
  ]);
}
