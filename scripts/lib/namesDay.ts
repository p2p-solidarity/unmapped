// The name-first half of the lineage market's dry run (scripts/lineage-market.ts, checks 9 and 10):
// a cartridge named with no market, a remix that waits for its parent, and a save held by the
// passkey account that recorded it. Every node is checked against viem's `namehash`, so the tree the
// registry keeps is the tree ENS resolves.

import {
  type Abi,
  type Address,
  encodeFunctionData,
  type Hex,
  keccak256,
  namehash,
  parseEventLogs,
  toHex,
} from "viem";
import { type AccountCall, lineageRegistry } from "../../src/main/chain/lineageCalls";
import { call, type Exec, expectRevert, read } from "./chainExec";
import { passkeyExecute } from "./passkeyRelay";
import type { SoftPasskey } from "./softPasskey";

export interface NamesDayInput {
  exec: Exec;
  registry: Address;
  accounts: Address;
  player: SoftPasskey;
  playerAccount: Address;
  parentName: string;
  rootNode: Hex;
  zeldaNode: Hex;
  launch: Record<string, bigint>;
  stranger: Address;
  text: (name: string, key: string) => Promise<string>;
}

const say = (line: string) => process.stdout.write(`${line}\n`);
const abi = lineageRegistry.abi as Abi;

function nodeOf(logs: Parameters<typeof parseEventLogs>[0]["logs"], what: string): Hex {
  const [event] = parseEventLogs({ abi, eventName: "NameRegistered", logs }) as unknown as {
    args: { node: Hex };
  }[];
  if (event === undefined) throw new Error(`no NameRegistered for ${what}`);
  return event.args.node;
}

export async function namesAndSaves(input: NamesDayInput): Promise<void> {
  const { exec, registry, parentName, text } = input;
  const me = exec.account;
  const onRegistry = (functionName: string, args: readonly unknown[]): AccountCall => ({
    target: registry,
    value: 0n,
    data: encodeFunctionData({ abi, functionName, args }),
  });
  say("\nNames and saves");
  if (input.rootNode !== namehash(parentName)) throw new Error("rootNode is not namehash(parent)");

  // A cartridge named with no market resolves to its revision (9).
  const atlasHash = keccak256(toHex("atlas"));
  const atlasNode = nodeOf(
    await exec.send(
      call(registry, abi, "register", [
        {
          parent: input.rootNode,
          label: "atlas",
          owner: me,
          cartridgeId: "atlas",
          version: "1.0.0",
          contentHash: atlasHash,
        },
      ]),
      "name the cartridge atlas (no market)",
    ),
    "atlas",
  );
  const atlasName = `atlas.${parentName}`;
  if (atlasNode !== namehash(atlasName)) throw new Error("atlas's node is not its namehash");
  if ((await text(atlasName, "unwritten.kind")) !== "cartridge") {
    throw new Error("atlas is not a cartridge");
  }
  if ((await text(atlasName, "unwritten.hash")) !== `sha256:${atlasHash.slice(2)}`) {
    throw new Error("atlas does not resolve to its revision");
  }
  say(`    ${atlasName} → cartridge atlas 1.0.0, no market`);
  await expectRevert(
    "a launch by someone who does not hold the name",
    exec.read(call(registry, abi, "launch", [atlasNode, input.launch]), input.stranger),
  );
  const globeNode = nodeOf(
    await exec.send(
      call(registry, abi, "register", [
        {
          parent: atlasNode,
          label: "globe",
          owner: me,
          cartridgeId: "globe",
          version: "1",
          contentHash: keccak256(toHex("globe")),
        },
      ]),
      "name a remix of atlas (globe.atlas)",
    ),
    "globe",
  );
  if (globeNode !== namehash(`globe.${atlasName}`))
    throw new Error("globe's node is not its namehash");
  await expectRevert(
    "a remix launched before its parent",
    exec.read(call(registry, abi, "launch", [globeNode, input.launch])),
  );

  // A save is its player's (10): recorded and moved only by its passkey account; it has no children.
  const zeldaHash = keccak256(toHex("zelda"));
  const saveHash = keccak256(toHex("a save file"));
  const recorded = await passkeyExecute(
    exec,
    input.accounts,
    input.player,
    [
      onRegistry("recordSave", [
        {
          cartridge: input.zeldaNode,
          label: "kidney",
          version: "1",
          contentHash: zeldaHash,
          saveHash,
          progress: "Chapter 1 of 3",
        },
      ]),
    ],
    "passkey signs: record its save as kidney.zelda",
  );
  const saveName = `kidney.zelda.${parentName}`;
  const saveNode = nodeOf(recorded.logs, "the save");
  if (saveNode !== namehash(saveName)) throw new Error("the save's node is not its namehash");
  const holder = (await read(exec, registry, abi, "holderOf", [saveNode])) as Address;
  if (holder.toLowerCase() !== input.playerAccount.toLowerCase()) {
    throw new Error("the save is not held by the passkey account");
  }
  if ((await text(saveName, "unwritten.save")) !== `sha256:${saveHash.slice(2)}`) {
    throw new Error("the save does not resolve to its hash");
  }
  if ((await text(saveName, "unwritten.cartridge")) !== "zelda-dry-run") {
    throw new Error("the save does not name its cartridge");
  }
  say(
    `    ${saveName} → held by the passkey account, ${await text(saveName, "unwritten.progress")}`,
  );
  await passkeyExecute(
    exec,
    input.accounts,
    input.player,
    [
      onRegistry("updateSave", [
        saveNode,
        "1",
        zeldaHash,
        keccak256(toHex("a later save file")),
        "Chapter 2 of 3",
      ]),
    ],
    "passkey signs: move the save to a later checkpoint",
  );
  if ((await text(saveName, "unwritten.progress")) !== "Chapter 2 of 3") {
    throw new Error("the update was lost");
  }
  await expectRevert(
    "a save moved by someone who does not hold it",
    exec.read(call(registry, abi, "updateSave", [saveNode, "1", zeldaHash, saveHash, "rewound"])),
  );
  await expectRevert(
    "a name under a save",
    exec.read(
      call(registry, abi, "register", [
        {
          parent: saveNode,
          label: "child",
          owner: me,
          cartridgeId: "x",
          version: "1",
          contentHash: saveHash,
        },
      ]),
    ),
  );
}
