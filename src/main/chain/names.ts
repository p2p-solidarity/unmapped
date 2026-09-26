// ENS names in the lineage tree (LineageRegistry, `<root>` = UNWRITTEN_LINEAGE_PARENT): a cartridge
// revision is `<cartridge>.<root>` (a remix hangs under its parent's name once that has one), and a
// player's save is `<save>.<cartridge>.<root>`, held by their PasskeyAccount. This file reads what a
// name says and builds the passkey batch that writes one; main reads every value it writes from disk
// (the revision's id, version, hash and lineage; the save's fingerprint) — the renderer only picks
// which revision or save. Writes go through the gas station like every other market action.

import { cartridgeLabel } from "@shared/ensNames";
import type { EnsNameStatus, SaveNameView } from "@shared/market";
import { err, ok, type Result } from "@shared/result";
import {
  type Address,
  decodeFunctionResult,
  encodeFunctionData,
  type Hex,
  namehash,
  parseAbiItem,
} from "viem";
import { readCartridgeRevision } from "../cartridges/store";
import { type SaveFingerprint, saveFingerprint } from "../instances/saveHash";
import { resolverAbi, textProfileAbi, textQuery } from "./ensCalls";
import { type AccountCall, contentHashBytes, lineageRegistry } from "./lineageCalls";
import type { MarketClients } from "./market";

const CARTRIDGE = 1;
const SAVE = 2;
const abi = lineageRegistry.abi;

interface OnChainName {
  kind: number;
  cartridgeId: string;
}

export interface Dirs {
  cartridgesDir: string;
  instancesDir: string;
}

async function nameOf(c: MarketClients, node: Hex): Promise<OnChainName> {
  return (await c.public.readContract({
    address: c.deployment.registry,
    abi,
    functionName: "nameOf",
    args: [node],
  })) as OnChainName;
}

async function texts(c: MarketClients, name: string, keys: string[]): Promise<string[]> {
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

/** The name a local revision gets: under its remix parent's name when that exists, else top level. */
async function cartridgeName(
  c: MarketClients,
  dirs: Dirs,
  cartridgeId: string,
  version: string,
): Promise<Result<{ name: string; parent: Hex; label: string; hash: string }>> {
  const revision = await readCartridgeRevision(dirs.cartridgesDir, cartridgeId, version);
  if (!revision.ok) return revision;
  const label = cartridgeLabel(cartridgeId);
  if (label === null) {
    return err(
      "ens-bad-label",
      `${cartridgeId} has no letters or digits to name.`,
      "Remix it under an id made of a–z, 0–9 and hyphens.",
    );
  }
  const root = c.deployment.parent;
  const lineage = revision.value.manifest.lineage;
  const parentLabel =
    lineage?.kind === "remix" && lineage.parent !== null
      ? cartridgeLabel(lineage.parent.cartridgeId)
      : null;
  if (parentLabel !== null && parentLabel !== label) {
    const parentName = `${parentLabel}.${root}`;
    if ((await nameOf(c, namehash(parentName))).kind === CARTRIDGE) {
      return ok({
        name: `${label}.${parentName}`,
        parent: namehash(parentName),
        label,
        hash: revision.value.manifest.contentHash,
      });
    }
  }
  return ok({
    name: `${label}.${root}`,
    parent: namehash(root),
    label,
    hash: revision.value.manifest.contentHash,
  });
}

async function holderOf(c: MarketClients, node: Hex): Promise<Address> {
  return (await c.public.readContract({
    address: c.deployment.registry,
    abi,
    functionName: "holderOf",
    args: [node],
  })) as Address;
}

async function cartridgeStatus(
  c: MarketClients,
  name: string,
  cartridgeId: string,
  hash: string,
  account: Address | null,
): Promise<EnsNameStatus> {
  const node = namehash(name);
  const onChain = await nameOf(c, node);
  const blank = { saveHash: null, progress: null };
  if (onChain.kind === 0) {
    return { name, state: "free", holder: null, mine: false, version: null, ...blank };
  }
  const holder = await holderOf(c, node);
  const mine = account !== null && holder.toLowerCase() === account.toLowerCase();
  const [version, pointedHash] = await texts(c, name, ["unwritten.version", "unwritten.hash"]);
  const sameCartridge = onChain.kind === CARTRIDGE && onChain.cartridgeId === cartridgeId;
  const state = !sameCartridge
    ? "taken"
    : pointedHash === hash
      ? "current"
      : mine
        ? "outdated"
        : "other-version";
  return { name, state, holder, mine, version: version || null, ...blank };
}

/** What the cartridge revision's ENS name says, for this passkey's account (or nobody). */
export async function cartridgeNameView(
  c: MarketClients,
  dirs: Dirs,
  cartridgeId: string,
  version: string,
  account: Address | null,
): Promise<Result<EnsNameStatus>> {
  const named = await cartridgeName(c, dirs, cartridgeId, version);
  if (!named.ok) return named;
  return ok(await cartridgeStatus(c, named.value.name, cartridgeId, named.value.hash, account));
}

function saveLabel(label: string): string | null {
  return cartridgeLabel(label);
}

const saveRecorded = parseAbiItem(
  "event SaveRecorded(bytes32 indexed node, bytes32 indexed cartridge, bytes32 saveHash, string version, string progress)",
);

/**
 * The label this save already has on chain: a save name under the cartridge that records exactly
 * this checkpoint (so a backup restored elsewhere finds its name), else the newest save name this
 * passkey's account holds there (so the player moves their own name forward). Null when neither.
 */
async function recordedLabel(
  c: MarketClients,
  cartridgeNode: Hex,
  saveHash: string,
  account: Address | null,
): Promise<string | null> {
  const logs = await c.public.getLogs({
    address: c.deployment.registry,
    event: saveRecorded,
    args: { cartridge: cartridgeNode },
    fromBlock: c.deployment.fromBlock,
  });
  const wanted = contentHashBytes(saveHash).toLowerCase();
  const newest = [...logs].reverse();
  const labelOf = async (node: Hex) =>
    (
      (await c.public.readContract({
        address: c.deployment.registry,
        abi,
        functionName: "nameOf",
        args: [node],
      })) as { label: string }
    ).label;
  const same = newest.find((log) => log.args.saveHash?.toLowerCase() === wanted);
  if (same?.args.node !== undefined) return labelOf(same.args.node);
  if (account === null) return null;
  for (const log of newest.slice(0, 20)) {
    const node = log.args.node;
    if (node === undefined) continue;
    if ((await holderOf(c, node)).toLowerCase() === account.toLowerCase()) return labelOf(node);
  }
  return null;
}

async function saveStatus(
  c: MarketClients,
  name: string,
  local: SaveFingerprint,
  account: Address | null,
): Promise<EnsNameStatus> {
  const node = namehash(name);
  const onChain = await nameOf(c, node);
  if (onChain.kind === 0) {
    return {
      name,
      state: "free",
      holder: null,
      mine: false,
      version: null,
      saveHash: null,
      progress: null,
    };
  }
  const holder = await holderOf(c, node);
  const mine = account !== null && holder.toLowerCase() === account.toLowerCase();
  const [version, saveHash, progress] = await texts(c, name, [
    "unwritten.version",
    "unwritten.save",
    "unwritten.progress",
  ]);
  // `current` is about the save, not who holds the name: a backup restored on another machine
  // (no passkey there) still reads as the checkpoint the name records.
  const state =
    onChain.kind !== SAVE
      ? "taken"
      : saveHash === local.saveHash
        ? "current"
        : mine
          ? "outdated"
          : "taken";
  return {
    name,
    state,
    holder,
    mine,
    version: version || null,
    saveHash: saveHash || null,
    progress: progress || null,
  };
}

/** A save, its cartridge's name, and what its own name says now. */
export async function saveNameView(
  c: MarketClients,
  dirs: Dirs,
  instanceId: string,
  label: string | null,
  account: Address | null,
): Promise<Result<SaveNameView>> {
  const local = await saveFingerprint(dirs.instancesDir, instanceId, dirs.cartridgesDir);
  if (!local.ok) return local;
  const { pin } = local.value;
  const named = await cartridgeName(c, dirs, pin.cartridgeId, pin.version);
  if (!named.ok) return named;
  const cartridge = await cartridgeStatus(
    c,
    named.value.name,
    pin.cartridgeId,
    named.value.hash,
    account,
  );
  const known =
    label === null && cartridge.state !== "free" && cartridge.state !== "taken"
      ? await recordedLabel(c, namehash(named.value.name), local.value.saveHash, account)
      : null;
  const chosen = saveLabel(label ?? known ?? local.value.name) ?? "my-save";
  const localView = {
    label: chosen,
    saveHash: local.value.saveHash,
    progress: local.value.progress,
    cartridgeId: pin.cartridgeId,
    version: pin.version,
  };
  // A save hangs under its cartridge's name whoever holds that name, as long as it names this cartridge.
  if (cartridge.state === "free" || cartridge.state === "taken") {
    return ok({ cartridge, save: null, local: localView });
  }
  const save = await saveStatus(c, `${chosen}.${named.value.name}`, local.value, account);
  return ok({ cartridge, save, local: localView });
}

const onRegistry = (c: MarketClients, functionName: string, args: readonly unknown[]) =>
  ({
    target: c.deployment.registry,
    value: 0n,
    data: encodeFunctionData({ abi, functionName, args } as never),
  }) as AccountCall;

/** register (a free name) or revise (the player's own name, another version). */
export async function nameCartridgeCalls(
  c: MarketClients,
  dirs: Dirs,
  account: Address,
  cartridgeId: string,
  version: string,
): Promise<Result<AccountCall[]>> {
  const named = await cartridgeName(c, dirs, cartridgeId, version);
  if (!named.ok) return named;
  const { name, parent, label, hash } = named.value;
  const status = await cartridgeStatus(c, name, cartridgeId, hash, account);
  if (status.state === "current") {
    return err("ens-name-current", `${name} already points at ${version}.`, "Nothing to do.");
  }
  if (status.state === "taken" || status.state === "other-version") {
    return err(
      "ens-name-taken",
      `${name} is held by ${status.holder}${status.state === "taken" ? " for another cartridge" : ""}.`,
      "Only its holder can point it at a new revision; remix under a different id for a name of your own.",
    );
  }
  const contentHash = contentHashBytes(hash);
  return ok([
    status.state === "free"
      ? onRegistry(c, "register", [
          { parent, label, owner: account, cartridgeId, version, contentHash },
        ])
      : onRegistry(c, "revise", [namehash(name), version, contentHash]),
  ]);
}

/** recordSave (a free label) or updateSave (the player's own save name, a later checkpoint). */
export async function nameSaveCalls(
  c: MarketClients,
  dirs: Dirs,
  account: Address,
  instanceId: string,
  label: string,
): Promise<Result<AccountCall[]>> {
  const view = await saveNameView(c, dirs, instanceId, label, account);
  if (!view.ok) return view;
  const { cartridge, save, local } = view.value;
  if (save === null) {
    return err(
      "ens-cartridge-unnamed",
      `${cartridge.name} has no name yet, so a save cannot hang under it.`,
      "Name the cartridge first (Worlds → Cartridges).",
    );
  }
  if (save.state === "current") {
    return err("ens-name-current", `${save.name} already records this save.`, "Play on first.");
  }
  if (save.state === "taken") {
    return err(
      "ens-name-taken",
      `${save.name} is held by someone else.`,
      "Pick another name for this save.",
    );
  }
  const fingerprint = await saveFingerprint(dirs.instancesDir, instanceId, dirs.cartridgesDir);
  if (!fingerprint.ok) return fingerprint;
  const { pin, progress } = fingerprint.value;
  const saveHash = contentHashBytes(local.saveHash);
  const pinned = contentHashBytes(pin.contentHash);
  return ok([
    save.state === "free"
      ? onRegistry(c, "recordSave", [
          {
            cartridge: namehash(cartridge.name),
            label: local.label,
            version: pin.version,
            contentHash: pinned,
            saveHash,
            progress,
          },
        ])
      : onRegistry(c, "updateSave", [namehash(save.name), pin.version, pinned, saveHash, progress]),
  ]);
}
