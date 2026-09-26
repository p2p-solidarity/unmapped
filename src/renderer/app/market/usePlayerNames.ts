// Player names instead of 0x…: whoever holds a name, owns a world or trades on the market may have
// claimed `<label>.players.<root>` (main/chain/players.ts). Addresses asked for in one render are
// batched into one `market.playerNames` call and remembered for the session; an address with no
// name (or a lookup that failed) keeps its short form. Display only — nothing here is trusted.

import { useCallback, useEffect, useState } from "react";
import { short } from "./format";

const ADDRESS = /^0x[0-9a-f]{40}$/;
/** main accepts at most this many addresses per call. */
const BATCH = 64;

/** Lowercased address → its player name, or null when it has none (or could not be read). */
const known = new Map<string, string | null>();
const queued = new Set<string>();
const listeners = new Set<() => void>();
let timer: number | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

async function flush(): Promise<void> {
  timer = null;
  const batch = [...queued];
  queued.clear();
  for (let at = 0; at < batch.length; at += BATCH) {
    const chunk = batch.slice(at, at + BATCH);
    const result = await window.seed.market.playerNames(chunk);
    const found = new Map(
      Object.entries(result.ok ? result.value : {}).map(([address, name]) => [
        address.toLowerCase(),
        name,
      ]),
    );
    for (const address of chunk) known.set(address, found.get(address) ?? null);
  }
  notify();
}

function ask(address: string): void {
  const lower = address.toLowerCase();
  if (!ADDRESS.test(lower) || known.has(lower) || queued.has(lower)) return;
  queued.add(lower);
  if (timer === null) timer = window.setTimeout(() => void flush(), 30);
}

/** The account just claimed `name` (main's own list may take a moment to show it). */
export function rememberPlayerName(address: string, name: string): void {
  known.set(address.toLowerCase(), name);
  notify();
}

/** `name (0xabcd…1234)` when the address has a player name, else `0xabcd…1234`. */
export function holderLabel(address: string | null | undefined): string {
  if (address === null || address === undefined || address === "") return "—";
  const name = known.get(address.toLowerCase()) ?? null;
  return name === null ? short(address) : `${name} (${short(address)})`;
}

/**
 * Looks up these addresses' player names (once per session) and re-renders when they arrive.
 * Returns `holderLabel`, bound to the latest names.
 */
export function usePlayerNames(
  addresses: readonly (string | null | undefined)[],
): (address: string | null | undefined) => string {
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    const listener = () => setSeen((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const wanted = addresses.filter((a): a is string => typeof a === "string" && a !== "").join(",");
  useEffect(() => {
    if (wanted === "") return;
    for (const address of wanted.split(",")) ask(address);
  }, [wanted]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `seen` re-binds it when names arrive
  return useCallback((address) => holderLabel(address), [seen]);
}
