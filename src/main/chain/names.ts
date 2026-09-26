// ENS names in the lineage tree (LineageRegistry, `<root>` = UNWRITTEN_LINEAGE_PARENT): a cartridge
// revision is `<label>.<root>` (a remix hangs under its parent's name once that has one), and a
// player's save is `<save>.<cartridge>.<root>`, held by their PasskeyAccount. A cartridge's name is
// found by its id (nameIndex.ts), so its label is the player's choice the first time it is named.
// This file reads what a name says and builds the passkey batch that writes one; main reads every
// value it writes from disk (the revision's id, version, hash and lineage; the save's fingerprint
// and door) — the renderer only picks which revision or save and a label. Writes go through the gas
// station like every other market action.

import { doorDescription, doorFromDescription, plateOf } from "@shared/doorCode";
import { cartridgeLabel } from "@shared/ensNames";
import type { EnsNameStatus, SaveNameView } from "@shared/market";
import { err, ok, type Result } from "@shared/result";
import { type Address, encodeFunctionData, type Hex, namehash, parseAbiItem } from "viem";
import { readCartridgeRevision } from "../cartridges/store";
import { type SaveFingerprint, saveFingerprint } from "../instances/saveHash";
import { type AccountCall, contentHashBytes, lineageRegistry } from "./lineageCalls";
import type { MarketClients } from "./market";
import {
  CARTRIDGE,
  cartridgeNameById,
  holderOf,
  nameMarket,
  nameOf,
  SAVE,
  texts,
} from "./nameIndex";
import { playerNamesOf } from "./players";

const abi = lineageRegistry.abi;

export interface Dirs {
  cartridgesDir: string;
  instancesDir: string;
}

/**
 * The name a local revision has, or would get: the name already registered for its cartridge id,
 * else `<label>.<parent's name>` for a remix whose parent is named, else `<label>.<root>` — with
 * `label` the player's pick, or the id's own label.
 */
async function cartridgeName(
  c: MarketClients,
  dirs: Dirs,
  cartridgeId: string,
  version: string,
  wanted: string | null = null,
): Promise<Result<{ name: string; parent: Hex; label: string; hash: string; named: boolean }>> {
  const revision = await readCartridgeRevision(dirs.cartridgesDir, cartridgeId, version);
  if (!revision.ok) return revision;
  const hash = revision.value.manifest.contentHash;
  const existing = await cartridgeNameById(c, cartridgeId);
  if (existing !== null) {
    const [label = ""] = existing.name.split(".");
    return ok({ name: existing.name, parent: existing.parent, label, hash, named: true });
  }
  const label = wanted === null ? cartridgeLabel(cartridgeId) : cartridgeLabel(wanted);
  if (label === null) {
    return err(
      "ens-bad-label",
      `${wanted ?? cartridgeId} has no letters or digits to name.`,
      "Pick a label made of a–z, 0–9 and hyphens.",
    );
  }
  const root = c.deployment.parent;
  const lineage = revision.value.manifest.lineage;
  const parentId =
    lineage?.kind === "remix" && lineage.parent !== null ? lineage.parent.cartridgeId : null;
  const parentName = parentId === null ? null : await cartridgeNameById(c, parentId);
  const under = parentName?.name ?? root;
  return ok({ name: `${label}.${under}`, parent: namehash(under), label, hash, named: false });
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
  const blank = { saveHash: null, progress: null, door: null };
  if (onChain.kind === 0) {
    const market = { token: null, parentName: null, parentLaunched: false };
    return { name, state: "free", holder: null, mine: false, version: null, market, ...blank };
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
  const market = sameCartridge ? await nameMarket(c, name) : null;
  return { name, state, holder, mine, version: version || null, market, ...blank };
}

/** What the cartridge revision's ENS name says, for this passkey's account (or nobody). */
export async function cartridgeNameView(
  c: MarketClients,
  dirs: Dirs,
  cartridgeId: string,
  version: string,
  account: Address | null,
  label: string | null = null,
): Promise<Result<EnsNameStatus>> {
  const named = await cartridgeName(c, dirs, cartridgeId, version, label);
  if (!named.ok) return named;
  return ok(await cartridgeStatus(c, named.value.name, cartridgeId, named.value.hash, account));
}

function saveLabel(label: string): string | null {
  return cartridgeLabel(label);
}

/**
 * A new run's default label: the player's own name (or "run") and this save's id tail, e.g.
 * `kidney-muhutk0b` — one per run, so two players (or two runs) of a world never collide on a
 * default like the world's own name, and a CJK save name still gets a readable label.
 */
async function defaultSaveLabel(
  c: MarketClients,
  instanceId: string,
  account: Address | null,
): Promise<string> {
  const player = account === null ? undefined : (await playerNamesOf(c, [account]))[account];
  const base = player?.split(".")[0] ?? "run";
  const tail = instanceId.split("-").pop() ?? instanceId;
  return saveLabel(`${base.slice(0, 40)}-${tail}`) ?? "my-save";
}

const saveRecorded = parseAbiItem(
  "event SaveRecorded(bytes32 indexed node, bytes32 indexed cartridge, bytes32 saveHash, string version, string progress)",
);

/**
 * The label this save already has on chain: a save name under the cartridge that records exactly
 * this checkpoint (so a backup restored elsewhere finds its name), else the newest save name this
 * passkey's account holds there that carries this save's door (so the player moves their own
 * run's name forward, and never another run's). Null when neither.
 */
async function recordedLabel(
  c: MarketClients,
  cartridgeName: string,
  saveHash: string,
  door: string,
  account: Address | null,
): Promise<string | null> {
  const logs = await c.public.getLogs({
    address: c.deployment.registry,
    event: saveRecorded,
    args: { cartridge: namehash(cartridgeName) },
    fromBlock: c.deployment.fromBlock,
  });
  const wanted = contentHashBytes(saveHash).toLowerCase();
  const newest = [...logs].reverse();
  const labelOf = async (node: Hex) => (await nameOf(c, node)).label;
  const same = newest.find((log) => log.args.saveHash?.toLowerCase() === wanted);
  if (same?.args.node !== undefined) return labelOf(same.args.node);
  if (account === null) return null;
  for (const log of newest.slice(0, 20)) {
    const node = log.args.node;
    if (node === undefined) continue;
    if ((await holderOf(c, node)).toLowerCase() !== account.toLowerCase()) continue;
    // The same run moved on (its hash changed): its name carries this save's door. Another run of
    // the same world by the same player has another door, so it gets a name of its own.
    const record = await nameOf(c, node);
    const [description] = await texts(c, `${record.label}.${cartridgeName}`, ["description"]);
    if (doorFromDescription(description) === door) return record.label;
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
  const blank = { market: null, door: null };
  if (onChain.kind === 0) {
    return {
      name,
      state: "free",
      holder: null,
      mine: false,
      version: null,
      saveHash: null,
      progress: null,
      ...blank,
    };
  }
  const holder = await holderOf(c, node);
  const mine = account !== null && holder.toLowerCase() === account.toLowerCase();
  const [version, saveHash, progress, description] = await texts(c, name, [
    "unwritten.version",
    "unwritten.save",
    "unwritten.progress",
    "description",
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
    market: null,
    door: onChain.kind === SAVE ? doorFromDescription(description) : null,
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
      ? await recordedLabel(c, named.value.name, local.value.saveHash, plateOf(instanceId), account)
      : null;
  const chosen =
    saveLabel(label ?? known ?? "") ?? (await defaultSaveLabel(c, instanceId, account));
  const localView = {
    label: chosen,
    saveHash: local.value.saveHash,
    progress: local.value.progress,
    cartridgeId: pin.cartridgeId,
    version: pin.version,
    door: plateOf(instanceId),
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

/** register (a free name, under the label the player picked) or revise (theirs, another version). */
export async function nameCartridgeCalls(
  c: MarketClients,
  dirs: Dirs,
  account: Address,
  cartridgeId: string,
  version: string,
  wanted: string | null = null,
): Promise<Result<AccountCall[]>> {
  const named = await cartridgeName(c, dirs, cartridgeId, version, wanted);
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
      status.state === "taken"
        ? "Pick another label for this world."
        : "Only its holder can point it at a new revision; remix it for a name of your own.",
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

/**
 * recordSave (a free label) or updateSave (the player's own save name, a later checkpoint), and
 * `describe` so the name carries this save's door number (a friend can walk in by name) whenever
 * it does not yet — also on its own, for a name that already records this checkpoint.
 */
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
  const describe = onRegistry(c, "describe", [namehash(save.name), doorDescription(local.door)]);
  if (save.state === "current") {
    if (save.mine && save.door !== local.door) return ok([describe]);
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
    ...(save.door === local.door ? [] : [describe]),
  ]);
}
