// Display helpers shared by the Market section's panels (display only — amounts stay decimal
// strings everywhere else).

import { formatNumber, type Translate } from "@renderer/i18n";
import type { MarketPhase } from "@shared/market";

export const short = (address: string): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** A decimal string shown with up to `digits` significant figures (display only). */
export function amount(value: string, digits = 5): string {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "0";
  return number >= 1000
    ? formatNumber(Math.round(number))
    : formatNumber(Number(number.toPrecision(digits)));
}

export function phaseLabel(t: Translate, phase: MarketPhase): string {
  return t(
    phase === "live"
      ? "market.phaseLive"
      : phase === "pool"
        ? "market.phasePool"
        : phase === "ended"
          ? "market.phaseEnded"
          : "market.phaseSoon",
  );
}
