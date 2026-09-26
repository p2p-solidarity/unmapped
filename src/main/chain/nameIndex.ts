// What the lineage name tree holds, read back from the chain: every name LineageRegistry registered
// (its NameRegistered events), each name's record (`nameOf`), holder and text records. A cartridge
// revision's name is found by its cartridge id, not by a label derived from it, so a player may pick
// the label the first time a world is named (a world called 霧之森 can be `misty-forest.<root>`),
// and a remix finds its parent's name the same way. The earliest name registered for an id is that
// cartridge's name. Reads are cached for a short while; every write through the Market clears it.

import type { NameMarket } from "@shared/market";
import {
  type Address,
  decodeFunctionResult,
  type Hex,
  namehash,
  parseAbiItem,
  zeroAddress,
} from "viem";
import { resolverAbi, textProfileAbi, textQuery } from "./ensCalls";
import { lineageRegistry } from "./lineageCalls";
import { dnsName, type MarketClients } from "./market";

export const CARTRIDGE = 1;
export const SAVE = 2;
const abi = lineageRegistry.abi;
const TTL_MS = 20_000;

export interface OnChainName {
  parent: Hex;
  kind: number;
  label: string;
  cartridgeId: string;
  token: Address;
}

export interface Registered {
  node: Hex;
  parent: Hex;
  kind: number;
  name: string;
}

const registeredEvent = parseAbiItem(
  "event NameRegistered(bytes32 indexed node, bytes32 indexed parent, address indexed owner, uint8 kind, bytes dnsName)",
);

let cache: { at: number; registry: string; names: Promise<Registered[]> } | null = null;
/** A name's cartridge id never changes once registered, so this one is kept for good. */
const cartridgeIds = new Map<Hex, string>();

/** Forget what was read, after a write this app made (or to see someone else's at once). */
export function forgetNames(): void {
  cache = null;
}

/** Every name in the tree, oldest first. */
export function registeredNames(c: MarketClients): Promise<Registered[]> {
  const now = Date.now();
  if (cache !== null && cache.registry === c.deployment.registry && now - cache.at < TTL_MS) {
    return cache.names;
  }
  const names = c.public
    .getLogs({
      address: c.deployment.registry,
      event: registeredEvent,
      fromBlock: c.deployment.fromBlock,
    })
    .then((logs) =>
      logs.map((log) => ({
        node: log.args.node as Hex,
        parent: log.args.parent as Hex,
        kind: Number(log.args.kind),
        name: dnsName(log.args.dnsName as Hex),
      })),
    );
  cache = { at: now, registry: c.deployment.registry, names };
  names.catch(() => {
    if (cache?.names === names) cache = null;
  });
  return names;
}

export async function nameOf(c: MarketClients, node: Hex): Promise<OnChainName> {
  return (await c.public.readContract({
    address: c.deployment.registry,
    abi,
    functionName: "nameOf",
    args: [node],
  })) as OnChainName;
}

export async function holderOf(c: MarketClients, node: Hex): Promise<Address> {
  return (await c.public.readContract({
    address: c.deployment.registry,
    abi,
    functionName: "holderOf",
    args: [node],
  })) as Address;
}

/** Text records of a name (empty strings for missing ones). */
export async function texts(c: MarketClients, name: string, keys: string[]): Promise<string[]> {
  const resolver = (await c.public.readContract({
    address: c.deployment.registry,
    abi,
    functionName: "resolver",
  })) as Address;
  return Promise.all(
    keys.map(async (key) => {
      const query = textQuery(name, key);
      try {
        const data = await c.public.readContract({
          address: resolver,
          abi: resolverAbi,
          functionName: "resolve",
          args: [query.name, query.data],
        });
        return decodeFunctionResult({ abi: textProfileAbi, functionName: "text", data });
      } catch {
        return "";
      }
    }),
  );
}

async function cartridgeIdOf(c: MarketClients, node: Hex): Promise<string> {
  const known = cartridgeIds.get(node);
  if (known !== undefined) return known;
  const id = (await nameOf(c, node)).cartridgeId;
  cartridgeIds.set(node, id);
  return id;
}

/** The name registered for this cartridge id (the earliest, if several), or null. */
export async function cartridgeNameById(
  c: MarketClients,
  cartridgeId: string,
): Promise<Registered | null> {
  const cartridges = (await registeredNames(c)).filter((n) => n.kind === CARTRIDGE);
  const ids = await Promise.all(cartridges.map((n) => cartridgeIdOf(c, n.node)));
  return cartridges.find((_, index) => ids[index] === cartridgeId) ?? null;
}

/** Whether a cartridge name is on the market, and whether it may launch (its parent first). */
export async function nameMarket(c: MarketClients, name: string): Promise<NameMarket> {
  const own = await nameOf(c, namehash(name));
  const parentName = name.split(".").slice(1).join(".");
  const topLevel = parentName === c.deployment.parent;
  const parentToken = topLevel ? zeroAddress : (await nameOf(c, namehash(parentName))).token;
  return {
    token: own.kind === CARTRIDGE && own.token !== zeroAddress ? own.token : null,
    parentName: topLevel ? null : parentName,
    parentLaunched: topLevel || parentToken !== zeroAddress,
  };
}
