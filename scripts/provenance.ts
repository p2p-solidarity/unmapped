// The light chain (rev 6 phase 4, D6): WorldProvenance (contracts/src/provenance) against a world
// service's real beats, as simulated blocks on top of Ethereum Sepolia — nothing is sent.
//
//   bun run provenance --dry-run [--from <service data dir>] [--out <dir>] [--rpc <url>]
//   SERVICE_CHAIN_KEY=0x… bun run provenance --deploy [--rpc <url>]    # a person runs this: gas
//
// --from reads a world service's --data directory (never writes it): its service key and every
// world whose log verifies and whose current sequencer is that key, as the service would record
// them. Without --from, two small worlds are made in memory with keys made for this run. The dry
// run deploys, opens a stream per world, records every beat (the first half in one catch-up batch,
// as a service that turns recording on late would, then one batch per beat pass), runs the
// refusals, reads everything back through main's reader and writes gas per step to <out>/result.md
// (default .cache/provenance). WorldProvenance has no owner and no constructor argument; it is
// deployed through the deterministic CREATE2 deployer, so its address is the same for everyone.
//
// Ways the light chain can fail, each one checked below (the failures an app E2E cannot reach, Rule 0):
// 1. On-chain encoding: a world id, key, hash or signature does not survive bytes32 / bytes and back,
//    so a reader decodes another world, key or fingerprint than the service recorded.
// 2. A stream opens twice for one (recorder, world), so a recorder could swap its signatures later.
// 3. A beat lands in a stream that was never opened.
// 4. `upTo` falls or repeats — between transactions or inside one batch — so a stream rewinds.
// 5. Stream signatures replayed by another sender (or for another chain or contract) count as the
//    world's stream.
// 6. The owner's genesis signature or the service's stream signature does not verify offline from
//    what the chain alone carries.
// 7. A recorded fingerprint does not recompute from the log, or a copy whose history differs (or
//    is shorter) reads as "matches".
// 8. Main's reader, walking `prevBlock` one block at a time, misses beats (a catch-up batch holds
//    several beats of one world in one block).
// 9. Recording costs more than a service can pay per beat (gas per step, in result.md).

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { authorKeyFor, newSecretKey } from "@shared/history/sign";
import {
  type BeatRecord,
  beatRecords,
  compareProvenance,
  type LocalBeat,
  type OpenedStream,
  openStreamArgs,
  readOpened,
  readRecorded,
  recordBeatsArgs,
  signStream,
  streamSignatures,
  streamTrust,
} from "@shared/provenance";
import { config as loadEnv } from "dotenv";
import {
  type Abi,
  type Address,
  concat,
  createPublicClient,
  decodeEventLog,
  getContractAddress,
  type Hex,
  http,
  keccak256,
  type Log,
  type PublicClient,
  toFunctionSelector,
  toHex,
} from "viem";
import { sepolia } from "viem/chains";
import artifact from "../contracts/WorldProvenance.json";
import { compareWithChain, type ProvenanceReader, readStreams } from "../src/main/chain/provenance";
import { RECORD_BATCH } from "../src/service/chain/recorder";
import { type Call, call, dryExec, type Exec, liveExec, read } from "./lib/chainExec";
import { type Loaded, madeWorld, readServiceDir, type ServiceSecret } from "./lib/provenanceWorlds";

loadEnv({ quiet: true });
const args = process.argv.slice(2);
const option = (name: string) => {
  const value = args[args.indexOf(name) + 1];
  return args.includes(name) && value !== undefined && !value.startsWith("--") ? value : undefined;
};
const say = (line: string) => process.stdout.write(`${line}\n`);
const fail = (line: string): never => {
  process.stderr.write(`${line}\n`);
  process.exit(1);
};

const ABI = artifact.abi as Abi;
const BYTECODE = artifact.bytecode as Hex;
/** The deterministic CREATE2 deployer (on Sepolia and most chains): one address for everyone. */
const CREATE2_DEPLOYER: Address = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const SALT = keccak256(toHex("unmapped.provenance:v1"));
const CONTRACT = getContractAddress({
  opcode: "CREATE2",
  from: CREATE2_DEPLOYER,
  salt: SALT,
  bytecode: BYTECODE,
});
const DEPLOY: Call = { to: CREATE2_DEPLOYER, data: concat([SALT, BYTECODE]) };
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

const dryRun = args.includes("--dry-run");
if (dryRun === args.includes("--deploy")) {
  fail(
    "Usage: bun run provenance --dry-run [--from <service data dir>] [--out <dir>] [--rpc <url>]\n" +
      "       SERVICE_CHAIN_KEY=0x… bun run provenance --deploy [--rpc <url>]   (spends Sepolia gas)",
  );
}
const rpcUrl =
  option("--rpc") ?? (dryRun ? SEPOLIA_RPC : process.env.SERVICE_CHAIN_RPC_URL || SEPOLIA_RPC);
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) }) as PublicClient;
if ((await client.getChainId()) !== sepolia.id) fail(`${rpcUrl} is not Ethereum Sepolia.`);
const deployed = async () => ((await client.getCode({ address: CONTRACT })) ?? "0x") !== "0x";

if (!dryRun) {
  const key = (process.env.SERVICE_CHAIN_KEY ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) fail("Set SERVICE_CHAIN_KEY to a funded Sepolia key.");
  const exec = liveExec(client, key as Hex, rpcUrl);
  say(`Deploying WorldProvenance on Sepolia as ${exec.account}`);
  if (await deployed()) say(`  · already at ${CONTRACT}`);
  else await exec.send(DEPLOY, "deploy WorldProvenance");
  say(`\nSERVICE_PROVENANCE_ADDRESS=${CONTRACT}\nUNMAPPED_PROVENANCE_ADDRESS=${CONTRACT}`);
  say(`UNMAPPED_PROVENANCE_CHAIN_ID=${sepolia.id}\nSERVICE_CHAIN_ID=${sepolia.id}`);
  process.exit(0);
}

const from = option("--from");
const out = resolve(option("--out") ?? ".cache/provenance");
say(`Dry run of WorldProvenance on Sepolia (${rpcUrl}); nothing is sent.`);
let source: { service: ServiceSecret; worlds: Loaded[] };
if (from === undefined) {
  const secret = newSecretKey();
  const service = { secret, key: authorKeyFor(secret) };
  const start = Date.parse("2026-09-01T00:00:00.000Z");
  source = {
    service,
    worlds: [madeWorld(service, "Reed", start), madeWorld(service, "Salt", start)],
  };
  say("Worlds: two made in memory for this run (no --from).");
} else {
  const read = readServiceDir(resolve(from));
  for (const line of read.skipped) say(`  · skipped ${line}`);
  source = read;
  say(`Worlds: ${resolve(from)} (service ${source.service.key}).`);
}
const { service, worlds } = source;
if (worlds.length === 0) fail("No world there is sequenced by that service.");
for (const world of worlds) {
  const recomputed = world.beats.filter((beat) => beat.recomputes).length;
  say(
    `  ${world.genesis.id}: ${world.entries.length} entries, ${world.beats.length} beats ` +
      `(${recomputed} recompute), record requested: ${world.requested}`,
  );
  if (recomputed !== world.beats.length)
    throw new Error("a beat does not recompute from its log (7)");
}

// ── The chain, simulated ─────────────────────────────────────────────────────────────────────

const exec: Exec = dryExec(client);
const recorder = exec.account.toLowerCase();
const chainId = sepolia.id;
interface Step {
  what: string;
  gas: number;
  beats: number;
}
const steps: Step[] = [];
const refusals: string[] = [];
/** Every log of every simulated send, with the block it landed in. */
const logs: { block: bigint; log: Log }[] = [];

/** exec.send, keeping the gas dryExec prints and the logs with their block. */
async function send(what: string, request: Call, beats = 0): Promise<Log[]> {
  const block = await exec.nextBlock();
  const write = process.stdout.write.bind(process.stdout);
  let gas = 0;
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: never[]) => {
    const match = /simulated, ([\d,]+) gas/.exec(String(chunk));
    if (match?.[1] !== undefined) gas = Number(match[1].replaceAll(",", ""));
    return write(chunk, ...rest);
  }) as typeof process.stdout.write;
  try {
    const sent = await exec.send(request, what);
    for (const log of sent) logs.push({ block, log });
    steps.push({ what, gas, beats });
    return sent;
  } finally {
    process.stdout.write = write;
  }
}

/** The contract's errors by selector: a simulated revert reports only the 4-byte selector. */
const ERRORS = new Map(
  ABI.flatMap((item) =>
    item.type === "error"
      ? [
          [
            toFunctionSelector(`${item.name}(${item.inputs.map((input) => input.type).join(",")})`),
            item.name,
          ] as const,
        ]
      : [],
  ),
);

/** The error a call must revert with. */
async function refused(what: string, request: Call, expected: string): Promise<void> {
  try {
    await exec.read(request);
  } catch (cause) {
    const text = cause instanceof Error ? cause.message : String(cause);
    const names = [...text.matchAll(/0x[0-9a-f]{8}\b/g)].map(([selector]) =>
      ERRORS.get(selector as Hex),
    );
    if (!names.includes(expected)) {
      throw new Error(
        `${what}: refused, but not with ${expected}: ${text.split("\n").slice(0, 2).join(" ")}`,
      );
    }
    say(`  ✓ refused: ${what} (${expected})`);
    refusals.push(`${what}: ${expected}`);
    return;
  }
  throw new Error(`${what} went through, but it must be refused`);
}

const recordCall = (records: readonly BeatRecord[]) =>
  call(CONTRACT, ABI, "recordBeats", recordBeatsArgs(records));
const recordsOf = (world: Loaded, beats: readonly LocalBeat[] = world.beats) =>
  beatRecords(world.genesis.id, beats, (n) => world.entries[n - 1]?.chain ?? null);

say(`\nContract ${CONTRACT} (CREATE2, salt ${SALT}); recorder ${recorder}`);
if (await deployed()) say("  · already deployed on Sepolia: the run uses it");
else await send("deploy WorldProvenance", DEPLOY);

const [first] = worlds;
const firstRecords = first === undefined ? [] : recordsOf(first);
const [oldest] = firstRecords;
const newest = firstRecords.at(-1);
if (first === undefined || oldest === undefined || newest === undefined) {
  throw new Error("The first world holds no beat.");
}
await refused("a beat before its stream is open (3)", recordCall([oldest]), "StreamNotOpen");

const opened = new Map<string, OpenedStream>();
for (const world of worlds) {
  const ref = { chainId, contract: CONTRACT, recorder, world: world.genesis.id };
  const sig = signStream(service.secret, ref);
  const openArgs = sig === null ? null : openStreamArgs(world.genesis, service.key, sig);
  if (openArgs === null) throw new Error(`${world.genesis.id} does not encode (1)`);
  const sent = await send(
    `open the stream of ${world.genesis.id.slice(0, 12)}…`,
    call(CONTRACT, ABI, "openStream", openArgs),
  );
  for (const log of sent) {
    const event = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics });
    if (event.eventName !== "StreamOpened") continue;
    const read = readOpened(event.args as unknown as Parameters<typeof readOpened>[0]);
    if (read === null) throw new Error("StreamOpened does not decode (1)");
    opened.set(world.genesis.id, read);
  }
  if (opened.get(world.genesis.id)?.world !== world.genesis.id)
    throw new Error("world id round trip (1)");
}
const firstOpen = openStreamArgs(
  first.genesis,
  service.key,
  signStream(service.secret, { chainId, contract: CONTRACT, recorder, world: first.genesis.id }) ??
    "",
);
if (firstOpen === null) throw new Error("the first world does not encode (1)");
await refused(
  "a second open of one stream (2)",
  call(CONTRACT, ABI, "openStream", firstOpen),
  "StreamAlreadyOpen",
);

// Record: the first half of the beat passes in one catch-up batch, then one batch per pass.
const passes = new Map<string, BeatRecord[]>();
for (const world of worlds) {
  for (const beat of world.beats) {
    // A beat pass writes every due world's beat at one receipt time T (the body's `at`).
    const body = world.entries[beat.n - 1]?.event.body as { at?: unknown } | undefined;
    const at = String(body?.at);
    const [record] = recordsOf(world, [beat]);
    if (record !== undefined) passes.set(at, [...(passes.get(at) ?? []), record]);
  }
}
const ordered = [...passes.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, records]) => records);
const half = Math.max(1, Math.floor(ordered.length / 2));
const batches = [ordered.slice(0, half).flat(), ...ordered.slice(half)];
for (const [index, batch] of batches.entries()) {
  for (let start = 0; start < batch.length; start += RECORD_BATCH) {
    const part = batch.slice(start, start + RECORD_BATCH);
    const what =
      index === 0
        ? `record ${part.length} beats (catch-up batch)`
        : `record ${part.length} beats (one pass)`;
    await send(what, recordCall(part), part.length);
  }
}

await refused("a falling upTo (4)", recordCall([oldest]), "UpToNotRising");
await refused("the same upTo again (4)", recordCall([newest]), "UpToNotRising");
const ahead = { ...newest, upTo: newest.upTo + 100n };
await refused("one upTo twice in one batch (4)", recordCall([ahead, ahead]), "UpToNotRising");

// ── Reading it back: offline signatures, main's reader, and copies that differ ────────────────

say("\nOffline checks");
for (const world of worlds) {
  const open = opened.get(world.genesis.id);
  if (open === undefined) throw new Error("no StreamOpened");
  const signed = streamSignatures(open, chainId, CONTRACT);
  const trust = streamTrust(open, {
    chainId,
    contract: CONTRACT,
    genesis: world.genesis,
    schedule: world.schedule,
  });
  if (!signed.genesis || !signed.sequencer || trust !== "verified") {
    throw new Error(`${world.genesis.id}: the stream does not verify offline (6): ${trust}`);
  }
  const other = "0x000000000000000000000000000000000000dead";
  const replay = streamTrust(
    { ...open, recorder: other },
    { chainId, contract: CONTRACT, genesis: world.genesis, schedule: world.schedule },
  );
  const elsewhere = streamTrust(open, {
    chainId: 1,
    contract: CONTRACT,
    genesis: world.genesis,
    schedule: world.schedule,
  });
  if (replay !== "sequencer-sig-invalid" || elsewhere !== "sequencer-sig-invalid") {
    throw new Error(`replayed signatures count (5): ${replay}, ${elsewhere}`);
  }
  say(
    `  ✓ ${world.genesis.id.slice(0, 12)}…: genesis and stream signatures verify; replays read "${replay}"`,
  );
}
await exec.read(
  call(CONTRACT, ABI, "openStream", firstOpen),
  "0x000000000000000000000000000000000000dEaD",
);
say("  ✓ the chain takes the same signatures from another sender; offline they do not count (5)");

const reader: ProvenanceReader = {
  contract: CONTRACT.toLowerCase(),
  chainId: async () => chainId,
  recorders: async (world, key, start, count) => {
    const [page, total] = (await read(exec, CONTRACT, ABI, "recorders", [
      world,
      key,
      BigInt(start),
      BigInt(count),
    ])) as [string[], bigint];
    return { page, total: Number(total) };
  },
  stream: async (who, world) =>
    (await read(exec, CONTRACT, ABI, "streamOf", [who, world])) as {
      open: boolean;
      openedBlock: bigint;
      lastBlock: bigint;
    },
  opened: async (who, world, block) => {
    for (const { block: at, log } of logs) {
      if (at !== block) continue;
      const event = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics });
      const args = event.args as unknown as Record<string, string>;
      if (
        event.eventName === "StreamOpened" &&
        args.recorder?.toLowerCase() === who.toLowerCase() &&
        args.worldId === world
      ) {
        return readOpened(args as unknown as Parameters<typeof readOpened>[0]);
      }
    }
    return null;
  },
  beatsAt: async (who, world, block) =>
    logs.flatMap(({ block: at, log }) => {
      if (at !== block) return [];
      const event = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics });
      const args = event.args as unknown as {
        recorder: string;
        worldId: string;
        upTo: bigint;
        chain: string;
        fingerprint: string;
        prevBlock: bigint;
      };
      if (
        event.eventName !== "BeatRecorded" ||
        args.recorder.toLowerCase() !== who.toLowerCase() ||
        args.worldId !== world
      )
        return [];
      const beat = readRecorded(args);
      return beat === null ? [] : [{ beat, prevBlock: args.prevBlock }];
    }),
};

const verdicts: string[] = [];
for (const world of worlds) {
  const id = world.genesis.id;
  const report = await compareWithChain(id, world.entries, reader, chainId);
  if (!report.ok) throw new Error(`${id}: ${report.error.message}`);
  const highest = world.beats.at(-1)?.upTo ?? 0;
  const read = report.value.streams[0]?.beats.length ?? 0;
  const { verdict } = report.value;
  if (verdict.status !== "matches" || verdict.upTo !== highest || read !== world.beats.length) {
    throw new Error(`${id}: main reads ${JSON.stringify(verdict)} with ${read} beats (8)`);
  }
  const input = { chainId, contract: CONTRACT, genesis: world.genesis, schedule: world.schedule };
  const recorded = await readStreams(reader, id, [service.key]);
  // A copy whose history parts from entry 2 on: every chain after it differs.
  const changed = world.entries.map((entry, index) =>
    index === 0 ? entry : { ...entry, chain: `sha256:${index.toString(16).padStart(64, "e")}` },
  );
  const differs = compareProvenance({
    ...input,
    entries: changed,
    beats: world.beats,
    streams: recorded,
  }).verdict;
  const firstBeat = world.beats[0];
  const cut = firstBeat === undefined ? 0 : firstBeat.n - 1;
  const shorter = compareProvenance({
    ...input,
    entries: world.entries.slice(0, cut),
    beats: [],
    streams: recorded,
  }).verdict;
  if (differs.status !== "differs" || shorter.status !== "not-synced") {
    throw new Error(
      `${id}: a copy that differs reads ${differs.status}, a shorter one ${shorter.status} (7)`,
    );
  }
  const line = `${id}: matches at ${verdict.upTo} (${read} beats walked back); a changed copy: differs at ${differs.upTo}; one cut before the first beat: not synced`;
  say(`  ✓ ${line}`);
  verdicts.push(line);
}

// ── result.md ────────────────────────────────────────────────────────────────────────────────

const totalBeats = worlds.reduce((sum, world) => sum + world.beats.length, 0);
const rows = steps.map(
  (step) =>
    `| ${step.what} | ${step.gas.toLocaleString("en")} | ${step.beats === 0 ? "" : Math.round(step.gas / step.beats).toLocaleString("en")} |`,
);
const report = [
  "# WorldProvenance dry run (rev 6 phase 4, D6)",
  "",
  `- When: ${new Date().toISOString()}; \`bun run provenance ${args.join(" ")}\``,
  `- Chain: Ethereum Sepolia (${chainId}) via ${rpcUrl}, simulated with eth_simulateV1; nothing sent`,
  `- Contract: ${CONTRACT} (CREATE2 through ${CREATE2_DEPLOYER}, salt ${SALT}); solc ${artifact.solc}`,
  `- Recorder (simulated sender): ${recorder}; service key ${service.key}`,
  `- Worlds: ${from === undefined ? "two made in memory" : `\`${resolve(from)}\``}, ${worlds.length} worlds, ${totalBeats} beats`,
  "",
  "| World | Entries | Beats | Recompute | Record requested |",
  "| --- | ---: | ---: | ---: | --- |",
  ...worlds.map(
    (world) =>
      `| ${world.genesis.id} | ${world.entries.length} | ${world.beats.length} | ${world.beats.filter((beat) => beat.recomputes).length} | ${world.requested} |`,
  ),
  "",
  "## Gas per step",
  "",
  "| Step | Gas | Gas per beat |",
  "| --- | ---: | ---: |",
  ...rows,
  "",
  "## Refused",
  "",
  ...refusals.map((line) => `- ${line}`),
  "",
  "## Read back (main's reader over the simulated blocks)",
  "",
  ...verdicts.map((line) => `- ${line}`),
  "",
].join("\n");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "result.md"), report);
say(`\nWrote ${join(out, "result.md")}`);
