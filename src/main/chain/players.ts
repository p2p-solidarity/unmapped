// A player's own ENS name: `<label>.players.<root>`, held by their PasskeyAccount. The operator
// registers the directory `players.<root>` once (`bun run lineage:demo players`); a player claims a
// label under it with LineageRegistry.recordSave, the same call that names a save, so the name is a
// real emancipated ENSv2 token the player can transfer — and its `unwritten.save` record is the
// sha256 of the passkey's public key, so anyone can check which passkey it was claimed with. The
// registry has no player kind of its own; the directory is how the app tells a player name from a
// save (docs/plans/lineage-market.md). One name per account: the app refuses a second claim.

import { hashText } from "@shared/content-hash";
import { cartridgeLabel } from "@shared/ensNames";
import type { EnsNameStatus, MarketKey, PlayerView } from "@shared/market";
import { err, ok, type Result } from "@shared/result";
import { type Address, encodeFunctionData, type Hex, namehash, parseAbiItem } from "viem";
import { type AccountCall, contentHashBytes, lineageRegistry } from "./lineageCalls";
import type { MarketClients } from "./market";
import { CARTRIDGE, holderOf, nameOf, SAVE, texts } from "./nameIndex";

const DIRECTORY_LABEL = "players";
/** Short and plain: the registry's progress record, read by anyone who looks the name up. */
const PLAYER_LINE = "UNMAPPED player";
/** Short enough that `<label>.players.<root>` fits a continent's 80-character name. */
const MAX_PLAYER_LABEL = 32;
const TTL_MS = 20_000;

const saveRecorded = parseAbiItem(
  "event SaveRecorded(bytes32 indexed node, bytes32 indexed cartridge, bytes32 saveHash, string version, string progress)",
);

export const directoryName = (c: MarketClients): string =>
  `${DIRECTORY_LABEL}.${c.deployment.parent}`;

async function directoryExists(c: MarketClients): Promise<boolean> {
  const directory = await nameOf(c, namehash(directoryName(c)));
  return directory.kind === CARTRIDGE;
}

let cache: { at: number; holders: Promise<Map<string, string>> } | null = null;

export function forgetPlayers(): void {
  cache = null;
}

/** Each account's player name, the first it claimed (lowercased address → name). */
function playerHolders(c: MarketClients): Promise<Map<string, string>> {
  const now = Date.now();
  if (cache !== null && now - cache.at < TTL_MS) return cache.holders;
  const holders = (async () => {
    const logs = await c.public.getLogs({
      address: c.deployment.registry,
      event: saveRecorded,
      args: { cartridge: namehash(directoryName(c)) },
      fromBlock: c.deployment.fromBlock,
    });
    const nodes = [...new Set(logs.map((log) => log.args.node as Hex))];
    const found = await Promise.all(
      nodes.map(async (node) => {
        const [record, holder] = await Promise.all([nameOf(c, node), holderOf(c, node)]);
        return record.kind === SAVE ? { holder, label: record.label } : null;
      }),
    );
    const map = new Map<string, string>();
    for (const entry of found) {
      if (entry === null || map.has(entry.holder.toLowerCase())) continue;
      map.set(entry.holder.toLowerCase(), `${entry.label}.${directoryName(c)}`);
    }
    return map;
  })();
  cache = { at: now, holders };
  holders.catch(() => {
    if (cache?.holders === holders) cache = null;
  });
  return holders;
}

/** The player names these accounts hold, for "held by" lines and a continent's name tags. */
export async function playerNamesOf(
  c: MarketClients,
  addresses: string[],
): Promise<Record<string, string>> {
  if (!(await directoryExists(c))) return {};
  const holders = await playerHolders(c);
  const out: Record<string, string> = {};
  for (const address of addresses) {
    const name = holders.get(address.toLowerCase());
    if (name !== undefined) out[address] = name;
  }
  return out;
}

async function candidate(c: MarketClients, label: string): Promise<EnsNameStatus> {
  const name = `${label}.${directoryName(c)}`;
  const record = await nameOf(c, namehash(name));
  const holder = record.kind === 0 ? null : await holderOf(c, namehash(name));
  return {
    name,
    state: record.kind === 0 ? "free" : "taken",
    holder,
    mine: false,
    version: null,
    saveHash: null,
    progress: null,
    market: null,
    door: null,
  };
}

/** The player's account, the name it holds, and — before a claim — whether `label` is free. */
export async function playerView(
  c: MarketClients,
  account: Address,
  label: string | null,
): Promise<Result<PlayerView>> {
  if (!(await directoryExists(c))) {
    return ok({ account, directory: null, name: null, candidate: null });
  }
  const name = (await playerHolders(c)).get(account.toLowerCase()) ?? null;
  const wanted = label === null ? null : cartridgeLabel(label.slice(0, MAX_PLAYER_LABEL));
  return ok({
    account,
    directory: directoryName(c),
    name,
    candidate: name === null && wanted !== null ? await candidate(c, wanted) : null,
  });
}

/** recordSave under the directory: the label, held by the account, pinned to the passkey's key. */
export async function namePlayerCalls(
  c: MarketClients,
  account: Address,
  key: MarketKey,
  label: string,
): Promise<Result<AccountCall[]>> {
  const view = await playerView(c, account, label);
  if (!view.ok) return view;
  if (view.value.directory === null) {
    return err(
      "ens-players-missing",
      `${directoryName(c)} is not registered yet, so no player name can hang under it.`,
      "The operator registers it once with `bun run lineage:demo players`.",
    );
  }
  if (view.value.name !== null) {
    return err(
      "ens-player-named",
      `This passkey's account already holds ${view.value.name}.`,
      "One player name per account; transfer it from an ENS app to change hands.",
    );
  }
  const status = view.value.candidate;
  if (status === null) {
    return err("ens-bad-label", `${label} has no letters or digits to name.`, "Pick another.");
  }
  if (status.state !== "free") {
    return err("ens-name-taken", `${status.name} is held by someone else.`, "Pick another name.");
  }
  const directory = directoryName(c);
  const [version, hash] = await texts(c, directory, ["unwritten.version", "unwritten.hash"]);
  const keyHash = await hashText(`${key.qx.toLowerCase()}${key.qy.slice(2).toLowerCase()}`);
  return ok([
    {
      target: c.deployment.registry,
      value: 0n,
      data: encodeFunctionData({
        abi: lineageRegistry.abi,
        functionName: "recordSave",
        args: [
          {
            cartridge: namehash(directory),
            label: status.name.split(".")[0] ?? label,
            version: version || "1",
            contentHash: contentHashBytes(hash || keyHash),
            saveHash: contentHashBytes(keyHash),
            progress: PLAYER_LINE,
          },
        ],
      } as never),
    },
  ]);
}
