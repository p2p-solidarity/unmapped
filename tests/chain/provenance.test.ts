// WorldProvenance (rev 6 phase 4, D6) in an in-process EVM, and the offline half that decides
// whether a stream counts. Only what E2E cannot reach (Rule 0): on-chain encoding, untrusted chain
// data, crypto and silent loss. The worlds are real service logs (tests/service/support). What this
// file guards, written before the code:
//   1. Encoding: a world id, key, content hash, chain or signature does not survive bytes32 / bytes
//      and back, so a reader compares another world or fingerprint than the service recorded.
//   2. A stream opens twice for one (recorder, world), so its signatures could be swapped later.
//   3. A beat lands in a stream never opened, or in another recorder's stream.
//   4. `upTo` falls or repeats, between batches or inside one, so a stream rewinds; a refused batch
//      half-applies.
//   5. Arrays of different lengths are silently truncated, or a signature is not 64 bytes.
//   6. A stream counts that must not: signatures replayed by another sender, for another chain or
//      contract, under a key no admitted `sequencer` entry installs, or with another world's genesis.
//   7. Main's reader walks `prevBlock` wrongly and loses beats (several in one block, gaps between).
//   8. A copy that forked (an equivocating service), or that is shorter, reads as "matches".
//   9. The service records a world that did not ask for it, or records without its full chain env.
//  10. The committed artifact is not what the current source compiles to.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createEVM, type EVMRunCallOpts } from "@ethereumjs/evm";
import { Address, hexToBytes } from "@ethereumjs/util";
import { DAY_MS } from "@shared/history/ids";
import { sequenceEvent, verifyLog } from "@shared/history/log";
import type { GenesisEvent, LogEntry } from "@shared/history/types";
import {
  beatRecords,
  compareProvenance,
  type Hex,
  idToBytes32,
  keyToBytes32,
  localBeats,
  type OpenedStream,
  openStreamArgs,
  readOpened,
  readRecorded,
  recordBeatsArgs,
  signStream,
  streamTrust,
} from "@shared/provenance";
import {
  type Abi,
  decodeErrorResult,
  decodeEventLog,
  decodeFunctionResult,
  encodeDeployData,
  encodeFunctionData,
} from "viem";
import { beforeAll, describe, expect, it } from "vitest";
import { verdictEntries } from "../../src/dsl/history/verdict";
import { compareWithChain, type ProvenanceReader } from "../../src/main/chain/provenance";
import { beatPass } from "../../src/service/beats";
import type { ProvenanceChain } from "../../src/service/chain/client";
import { chainEnv } from "../../src/service/chain/config";
import { ProvenanceRecorder } from "../../src/service/chain/recorder";
import { attach, Client, LocalWorld, makeService, OWNER, sign } from "../service/support";

const artifact = JSON.parse(readFileSync("contracts/WorldProvenance.json", "utf8")) as {
  abi: Abi;
  bytecode: Hex;
};
const abi = artifact.abi;
const CHAIN_ID = 11155111;
const RECORDER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const hex = (bytes: Uint8Array | undefined): Hex => `0x${Buffer.from(bytes ?? []).toString("hex")}`;

let evm: Awaited<ReturnType<typeof createEVM>>;
let contract: Hex;
/** Every log the contract emitted, by the block it was emitted in. */
const emitted = new Map<bigint, { topics: Hex[]; data: Hex }[]>();

const blockAt = (number: bigint): NonNullable<EVMRunCallOpts["block"]> => ({
  header: {
    number,
    coinbase: new Address(new Uint8Array(20)),
    timestamp: 1_790_000_000n + number * 12n,
    difficulty: 0n,
    prevRandao: new Uint8Array(32),
    gasLimit: 30_000_000n,
    slotNumber: 0n,
    getBlobGasPrice: () => undefined,
  },
});

async function send(functionName: string, args: readonly unknown[], from = RECORDER, block = 1n) {
  const caller = new Address(hexToBytes(from as Hex));
  const result = await evm.runCall({
    to: new Address(hexToBytes(contract)),
    caller,
    origin: caller,
    data: hexToBytes(encodeFunctionData({ abi, functionName, args })),
    gasLimit: 5_000_000n,
    block: blockAt(block),
  });
  const { exceptionError, returnValue, logs } = result.execResult;
  if (exceptionError !== undefined) {
    return decodeErrorResult({ abi, data: hex(returnValue) }).errorName;
  }
  const kept = emitted.get(block) ?? [];
  for (const [, topics, data] of logs ?? [])
    kept.push({ topics: topics.map(hex), data: hex(data) });
  emitted.set(block, kept);
  return "ok";
}

async function view(functionName: string, args: readonly unknown[]): Promise<unknown> {
  const result = await evm.runCall({
    to: new Address(hexToBytes(contract)),
    data: hexToBytes(encodeFunctionData({ abi, functionName, args })),
    gasLimit: 5_000_000n,
  });
  return decodeFunctionResult({ abi, functionName, data: hex(result.execResult.returnValue) });
}

function decoded(block: bigint) {
  return (emitted.get(block) ?? []).map(
    (log) =>
      decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] }) as unknown as {
        eventName: string;
        args: Record<string, unknown>;
      },
  );
}

/** Main's reader over this EVM: views for state, one block of logs at a time. */
const reader: ProvenanceReader = {
  get contract() {
    return contract;
  },
  chainId: async () => CHAIN_ID,
  recorders: async (world, key, start, count) => {
    const [page, total] = (await view("recorders", [world, key, BigInt(start), BigInt(count)])) as [
      readonly string[],
      bigint,
    ];
    return { page: [...page], total: Number(total) };
  },
  stream: async (recorder, world) =>
    (await view("streamOf", [recorder, world])) as {
      open: boolean;
      openedBlock: bigint;
      lastBlock: bigint;
    },
  opened: async (recorder, world, block) => {
    const event = decoded(block).find(
      ({ eventName, args }) =>
        eventName === "StreamOpened" &&
        String(args.recorder).toLowerCase() === recorder.toLowerCase() &&
        args.worldId === world,
    );
    return event === undefined ? null : readOpened(event.args as Parameters<typeof readOpened>[0]);
  },
  beatsAt: async (recorder, world, block) =>
    decoded(block).flatMap(({ eventName, args }) => {
      if (eventName !== "BeatRecorded" || args.worldId !== world) return [];
      if (String(args.recorder).toLowerCase() !== recorder.toLowerCase()) return [];
      const beat = readRecorded(args as Parameters<typeof readRecorded>[0]);
      return beat === null ? [] : [{ beat, prevBlock: args.prevBlock as bigint }];
    }),
};

/** A world attached to a real hub, beaten three times a week apart, with a profile between. */
function beatenWorld() {
  const service = makeService();
  const local = new LocalWorld();
  local.write("profile", { name: "Mira" }, OWNER, local.entries[0]?.rt ?? "");
  const owner = new Client(service.hub, OWNER);
  attach(owner, local);
  for (let week = 0; week < 3; week += 1) {
    if (week > 0) service.clock.ms += 7 * DAY_MS;
    expect(beatPass(service.hub)[0]?.n).not.toBeNull();
    const head = service.hub.worlds.get(local.id)?.head.n ?? 0;
    owner.submit(local.id, sign(local.id, "profile", { name: `Mira ${week}` }, OWNER, head));
  }
  const held = service.hub.worlds.get(local.id);
  if (held === undefined) throw new Error("the service does not hold the world");
  const entries: LogEntry[] = [];
  for (let n = 1; n <= held.head.n; n += 1) {
    const entry = held.entryAt(n);
    if (entry !== null) entries.push(entry);
  }
  const genesis = local.genesis as GenesisEvent;
  const checked = verifyLog(local.id, entries);
  if (!checked.ok) throw new Error(checked.error.message);
  const { schedule } = checked.value;
  const beats = localBeats(genesis, verdictEntries(entries));
  const records = beatRecords(local.id, beats, (n) => entries[n - 1]?.chain ?? null);
  return { ...service, local, owner, genesis, entries, schedule, beats, records };
}

let world: ReturnType<typeof beatenWorld>;
let openArgs: readonly [Hex, Hex, Hex, Hex, Hex, Hex];

beforeAll(async () => {
  evm = await createEVM();
  const deployer = new Address(hexToBytes(RECORDER));
  const created = await evm.runCall({
    caller: deployer,
    origin: deployer,
    data: hexToBytes(encodeDeployData({ abi, bytecode: artifact.bytecode })),
    gasLimit: 10_000_000n,
  });
  if (created.createdAddress === undefined) throw new Error("deployment produced no address");
  contract = created.createdAddress.toString() as Hex;
  world = beatenWorld();
  const sig = signStream(world.hub.key.secret, {
    chainId: CHAIN_ID,
    contract,
    recorder: RECORDER,
    world: world.local.id,
  });
  const args = sig === null ? null : openStreamArgs(world.genesis, world.hub.key.key, sig);
  if (args === null) throw new Error("the world does not encode");
  openArgs = args;
});

describe("WorldProvenance on chain", () => {
  it("opens one stream per (recorder, world) and emits what decodes back exactly (1, 2)", async () => {
    expect(world.records).toHaveLength(3);
    expect(await send("openStream", openArgs, RECORDER, 5n)).toBe("ok");
    const opened = await reader.opened(RECORDER, openArgs[0], 5n);
    expect(opened).toEqual({
      recorder: RECORDER,
      world: world.local.id,
      cartridgeHash: world.genesis.body.cartridge.contentHash,
      ownerKey: world.genesis.author,
      genesisSig: world.genesis.sig,
      sequencerKey: world.hub.key.key,
      sequencerSig: expect.any(String),
    });
    expect(await send("openStream", openArgs, RECORDER, 6n)).toBe("StreamAlreadyOpen");
  });

  it("records only rising upTos into the sender's own open stream, all or nothing (3, 4, 5)", async () => {
    const [b1, b2, b3] = world.records;
    if (b1 === undefined || b2 === undefined || b3 === undefined) throw new Error("three beats");
    expect(await send("recordBeats", recordBeatsArgs([b1]), OTHER, 7n)).toBe("StreamNotOpen");
    const stranger = { ...b1, world: `0x${"ab".repeat(32)}` as Hex };
    expect(await send("recordBeats", recordBeatsArgs([stranger]), RECORDER, 7n)).toBe(
      "StreamNotOpen",
    );
    expect(await send("recordBeats", recordBeatsArgs([b1, b2]), RECORDER, 10n)).toBe("ok");
    expect(await send("recordBeats", recordBeatsArgs([b3]), RECORDER, 12n)).toBe("ok");

    const ahead = { ...b3, upTo: b3.upTo + 5n };
    const ahead2 = { ...b3, upTo: b3.upTo + 9n };
    expect(await send("recordBeats", recordBeatsArgs([b3]), RECORDER, 13n)).toBe("UpToNotRising");
    expect(await send("recordBeats", recordBeatsArgs([b1]), RECORDER, 13n)).toBe("UpToNotRising");
    expect(await send("recordBeats", recordBeatsArgs([ahead2, ahead]), RECORDER, 13n)).toBe(
      "UpToNotRising",
    );
    expect(await send("recordBeats", recordBeatsArgs([ahead, ahead]), RECORDER, 13n)).toBe(
      "UpToNotRising",
    );
    const [worldIds, upTos, chains, fingerprints] = recordBeatsArgs([ahead]);
    expect(
      await send("recordBeats", [worldIds, upTos, chains, [...fingerprints, b1.fingerprint]]),
    ).toBe("LengthMismatch");
    expect(await send("recordBeats", [worldIds, [], chains, fingerprints])).toBe("LengthMismatch");
    const short = [...openArgs] as [Hex, Hex, Hex, Hex, Hex, Hex];
    short[5] = `0x${"11".repeat(63)}`;
    expect(await send("openStream", short, OTHER, 13n)).toBe("BadSignatureLength");

    const stream = (await view("streamOf", [RECORDER, openArgs[0]])) as Record<string, unknown>;
    expect(stream).toEqual({ open: true, upTo: b3.upTo, openedBlock: 5n, lastBlock: 12n });
  });

  it("main's reader walks every beat back from lastBlock, and this copy matches (1, 7)", async () => {
    const report = await compareWithChain(world.local.id, world.entries, reader, CHAIN_ID);
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    const top = Number(world.records.at(-1)?.upTo);
    expect(report.value.verdict).toEqual({ status: "matches", upTo: top });
    expect(report.value.streams).toEqual([
      {
        recorder: RECORDER,
        sequencerKey: world.hub.key.key,
        trust: "verified",
        beats: world.records.map((record) => ({ upTo: Number(record.upTo), match: "matches" })),
      },
    ]);
  });

  it("counts a stream only for its own sender, chain, contract, schedule and genesis (6)", async () => {
    // Anyone may replay the signatures on chain (the EVM checks no Ed25519) and record junk.
    expect(await send("openStream", openArgs, OTHER, 20n)).toBe("ok");
    const junk = { ...(world.records[0] as NonNullable<(typeof world.records)[0]>) };
    junk.fingerprint = `0x${"66".repeat(32)}`;
    expect(await send("recordBeats", recordBeatsArgs([junk]), OTHER, 21n)).toBe("ok");
    const report = await compareWithChain(world.local.id, world.entries, reader, CHAIN_ID);
    if (!report.ok) throw new Error(report.error.message);
    expect(report.value.streams.map((stream) => [stream.recorder, stream.trust])).toEqual([
      [RECORDER, "verified"],
      [OTHER, "sequencer-sig-invalid"],
    ]);
    expect(report.value.verdict.status).toBe("matches");

    const opened = (await reader.opened(RECORDER, openArgs[0], 5n)) as OpenedStream;
    const context = { chainId: CHAIN_ID, contract, genesis: world.genesis, schedule: [] };
    const { schedule } = world;
    expect(schedule.map((step) => step.key)).toEqual([world.hub.key.key]);
    expect(streamTrust(opened, { ...context, schedule })).toBe("verified");
    expect(streamTrust(opened, { ...context, schedule, chainId: 1 })).toBe("sequencer-sig-invalid");
    expect(streamTrust(opened, { ...context, schedule, contract: OTHER })).toBe(
      "sequencer-sig-invalid",
    );
    expect(streamTrust(opened, context)).toBe("sequencer-unscheduled");
    const stranger = new LocalWorld({ name: "Another" }).genesis as GenesisEvent;
    expect(streamTrust(opened, { ...context, schedule, genesis: stranger })).toBe(
      "genesis-differs",
    );
    expect(streamTrust({ ...opened, ownerKey: world.hub.key.key }, { ...context, schedule })).toBe(
      "genesis-differs",
    );
    expect(idToBytes32(world.local.id)).toBe(openArgs[0]);
    expect(keyToBytes32(world.hub.key.key)).toBe(openArgs[4]);
  });

  it("a forked or shorter copy never reads as matching (8)", async () => {
    const [b1, b2] = world.records;
    if (b1 === undefined || b2 === undefined) throw new Error("two beats");
    // The service's own key signs a different entry right after b1's beat: a valid log that forks.
    const at = Number(b1.upTo) + 1;
    const prefix = world.entries.slice(0, at);
    const last = prefix.at(-1) as LogEntry;
    const other = sign(world.local.id, "profile", { name: "Someone else" }, OWNER, at);
    const fork = sequenceEvent(last, other, last.rt, world.hub.key.secret);
    const forked = await compareWithChain(world.local.id, [...prefix, fork], reader, CHAIN_ID);
    if (!forked.ok) throw new Error(forked.error.message);
    // b1 still matches (the fork is after it), b2 sits where the fork differs.
    expect(forked.value.verdict).toEqual({ status: "differs", upTo: Number(b2.upTo) });

    const cut = await compareWithChain(
      world.local.id,
      world.entries.slice(0, at),
      reader,
      CHAIN_ID,
    );
    if (!cut.ok) throw new Error(cut.error.message);
    expect(cut.value.verdict).toEqual({ status: "matches", upTo: Number(b1.upTo) });
    const opened = (await reader.opened(RECORDER, openArgs[0], 5n)) as OpenedStream;
    const recorded = readRecorded(b1);
    if (recorded === null) throw new Error("b1 does not decode");
    const early = compareProvenance({
      chainId: CHAIN_ID,
      contract,
      genesis: world.genesis,
      schedule: world.schedule,
      entries: world.entries.slice(0, Number(b1.upTo) - 1),
      beats: [],
      streams: [{ opened, beats: [recorded] }],
    });
    expect(early.verdict).toEqual({ status: "not-synced", upTo: Number(b1.upTo) });
  });
});

/** The recorder's side of the chain, over this EVM; the first `flaky` records fail like an RPC. */
let nextBlock = 100n;
function evmChain(recorder: Hex, flaky = 0): ProvenanceChain & { calls: string[] } {
  const calls: string[] = [];
  let failures = flaky;
  const sent = async (functionName: string, args: readonly unknown[]): Promise<Hex> => {
    const outcome = await send(functionName, args, recorder, nextBlock);
    nextBlock += 1n;
    if (outcome !== "ok") throw new Error(outcome);
    return "0x";
  };
  return {
    calls,
    chainId: CHAIN_ID,
    recorder,
    contract,
    stream: async (id) => {
      calls.push("stream");
      const stream = (await view("streamOf", [recorder, idToBytes32(id)])) as {
        open: boolean;
        upTo: bigint;
      };
      return { open: stream.open, upTo: Number(stream.upTo) };
    },
    openStream: async (args) => {
      calls.push("openStream");
      return sent("openStream", args);
    },
    recordBeats: async (records) => {
      calls.push(`recordBeats ${records.length}`);
      if (failures > 0) {
        failures -= 1;
        throw new Error("the RPC is down");
      }
      return sent("recordBeats", recordBeatsArgs(records));
    },
  };
}

const ENV = {
  rpcUrl: "https://rpc.invalid",
  chainId: CHAIN_ID,
  key: `0x${"01".repeat(32)}` as Hex,
  contract: "0x0000000000000000000000000000000000000000" as Hex,
};

/** Waits until `done()` holds (the recorder works in the background). */
async function until(done: () => boolean): Promise<void> {
  for (let tries = 0; tries < 200 && !done(); tries += 1) {
    await new Promise((resume) => setTimeout(resume, 10));
  }
}

describe("the service's recorder", () => {
  it("records nothing without its full env, nor for a world that did not ask (9)", async () => {
    expect(chainEnv({})).toEqual({ ok: true, value: null });
    const partial = chainEnv({ SERVICE_CHAIN_RPC_URL: "https://rpc.invalid" });
    expect(partial.ok ? null : partial.error.code).toBe("service-chain-partial");

    const chain = evmChain("0x3333333333333333333333333333333333333333");
    const recorder = new ProvenanceRecorder(
      world.hub,
      ENV,
      () => chain,
      async () => CHAIN_ID,
    );
    recorder.queue(world.local.id);
    await new Promise((resume) => setTimeout(resume, 50));
    expect(chain.calls).toEqual([]);
  });

  it("records a world that asked, retries a failed batch at the next beat, stops when asked (9)", async () => {
    const service = makeService();
    const local = new LocalWorld({ name: "Reed Ford" });
    const owner = new Client(service.hub, OWNER);
    attach(owner, local);
    const head = () => service.hub.worlds.get(local.id)?.head.n ?? 0;
    const ask = (record: boolean) =>
      owner.submit(local.id, sign(local.id, "chain", { record }, OWNER, head()));
    ask(true);
    const held = service.hub.worlds.get(local.id);
    expect(held?.now.provenance).toEqual({ record: true });

    const recorderAddress = "0x4444444444444444444444444444444444444444" as Hex;
    const chain = evmChain(recorderAddress, 1);
    const recorder = new ProvenanceRecorder(
      service.hub,
      ENV,
      () => chain,
      async () => CHAIN_ID,
    );
    const beat = () => {
      service.clock.ms += 7 * DAY_MS;
      expect(beatPass(service.hub)[0]?.n).not.toBeNull();
      recorder.queue(local.id);
    };
    const upTo = async () =>
      Number(
        ((await view("streamOf", [recorderAddress, idToBytes32(local.id)])) as { upTo: bigint })
          .upTo,
      );

    beat();
    await until(() => chain.calls.includes("recordBeats 1"));
    expect(chain.calls).toEqual(["stream", "openStream", "recordBeats 1"]);
    expect(await upTo()).toBe(0);

    beat();
    const beats = service.hub.worlds.get(local.id)?.now.beats ?? [];
    const top = beats.at(-1)?.body.upTo;
    for (let tries = 0; tries < 200 && (await upTo()) !== top; tries += 1) {
      await new Promise((resume) => setTimeout(resume, 10));
    }
    expect(chain.calls).toEqual([
      "stream",
      "openStream",
      "recordBeats 1",
      "stream",
      "recordBeats 2",
    ]);
    expect(await upTo()).toBe(top);

    const entries: LogEntry[] = [];
    for (let n = 1; n <= head(); n += 1) {
      const entry = service.hub.worlds.get(local.id)?.entryAt(n);
      if (entry) entries.push(entry);
    }
    const report = await compareWithChain(local.id, entries, reader, CHAIN_ID);
    if (!report.ok) throw new Error(report.error.message);
    expect(report.value.streams.map((stream) => [stream.recorder, stream.trust])).toEqual([
      [recorderAddress, "verified"],
    ]);
    expect(report.value.verdict).toEqual({ status: "matches", upTo: top });

    ask(false);
    const before = chain.calls.length;
    beat();
    await new Promise((resume) => setTimeout(resume, 50));
    expect(chain.calls.length).toBe(before);
  });

  it("the committed artifact is what the current source compiles to (10)", () => {
    execFileSync("node", ["scripts/build-provenance.mjs"], { stdio: "pipe" });
    const fresh = JSON.parse(readFileSync("contracts/WorldProvenance.json", "utf8")) as {
      bytecode: string;
    };
    expect(fresh.bytecode).toBe(artifact.bytecode);
    // solc-js compiles in-process: seconds when idle, well past vitest's 5 s default under load.
  }, 60_000);
});
