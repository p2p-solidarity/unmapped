// Recording beats on WorldProvenance (rev 6 phase 4, D6): the service signs and pays, only for the
// worlds it sequences, only while it has chain settings (./config) and only while the world's latest
// `chain` event says `record: true` (`chainRecording`, @shared/history/fold). Off by default, twice.
//
// `queueProvenance` is the one hook, called by beats.ts after each accepted beat. It only marks the
// world and returns: the chain work runs later in the background, so a beat never waits for it.
// Each run reads the world's stream from the chain (the chain is the record of what landed, so a
// restart loses nothing), opens it once with the service key's stream signature, then records every
// beat above the stream's `upTo` in batches across worlds. A world whose run fails stays queued and
// is retried after the next beat; a world queued during a run gets one more run straight after.

import { chainRecording } from "@shared/history/fold";
import {
  type BeatRecord,
  beatRecords,
  idToBytes32,
  openStreamArgs,
  signStream,
} from "@shared/provenance";
import type { Hub } from "../hub";
import type { ServiceWorld } from "../world";
import { connectChain, type ProvenanceChain, rpcChainId } from "./client";
import { type ChainEnv, chainEnv } from "./config";

/** Entries per `recordBeats` transaction. */
export const RECORD_BATCH = 64;

/** Whether this service records `world` now: it is its sequencer and the world asked for it. */
export function recordsWorld(hub: Hub, world: ServiceWorld): boolean {
  if (world.now.sequencer?.key !== hub.key.key) return false;
  return chainRecording(world.now);
}

export class ProvenanceRecorder {
  private readonly queued = new Set<string>();
  private running = false;
  private again = false;
  private chain: ProvenanceChain | null = null;

  constructor(
    private readonly hub: Hub,
    private readonly env: ChainEnv,
    private readonly connect: (env: ChainEnv, chainId: number) => ProvenanceChain = connectChain,
    private readonly probe: (rpcUrl: string) => Promise<number> = rpcChainId,
  ) {}

  queue(world: string): void {
    this.queued.add(world);
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    // After the current beat pass: every world beaten in it lands in one batch.
    setTimeout(() => void this.run(), 0);
  }

  private async run(): Promise<void> {
    try {
      for (;;) {
        this.again = false;
        const settled = await this.flush();
        if (!settled || !this.again) break;
      }
    } catch (error) {
      this.hub.log(`provenance: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async connected(): Promise<ProvenanceChain> {
    if (this.chain !== null) return this.chain;
    const reported = await this.probe(this.env.rpcUrl);
    if (this.env.chainId !== null && this.env.chainId !== reported) {
      throw new Error(`SERVICE_CHAIN_ID is ${this.env.chainId}, but the RPC is chain ${reported}`);
    }
    this.chain = this.connect(this.env, reported);
    return this.chain;
  }

  /** Opens the stream if needed; the beats above its `upTo`, in rising order. */
  private async pendingBeats(chain: ProvenanceChain, world: ServiceWorld): Promise<BeatRecord[]> {
    if (idToBytes32(world.id) === null) return [];
    const stream = await chain.stream(world.id);
    if (!stream.open) {
      const ref = { chainId: chain.chainId, contract: chain.contract, recorder: chain.recorder };
      const sig = signStream(this.hub.key.secret, { ...ref, world: world.id });
      const args = sig === null ? null : openStreamArgs(world.genesis, this.hub.key.key, sig);
      if (args === null) throw new Error(`world ${world.id} does not encode for the chain`);
      const hash = await chain.openStream(args);
      this.hub.log(`provenance: opened the stream of ${world.id} (${hash})`);
    }
    const beats = world.now.beats.filter((beat) => !beat.pending).map((beat) => beat.body);
    return beatRecords(world.id, beats, (n) => world.chainAt(n), stream.upTo);
  }

  /** One pass over the queue; false when something must wait for the next beat. */
  private async flush(): Promise<boolean> {
    const chain = await this.connected();
    let settled = true;
    const records: BeatRecord[] = [];
    const worlds: string[] = [];
    for (const id of [...this.queued]) {
      const world = this.hub.worlds.get(id);
      if (world === undefined || !recordsWorld(this.hub, world)) {
        this.queued.delete(id);
        continue;
      }
      try {
        records.push(...(await this.pendingBeats(chain, world)));
        worlds.push(id);
      } catch (error) {
        settled = false;
        this.hub.log(`provenance: ${id}: ${error instanceof Error ? error.message : error}`);
      }
    }
    const failed = new Set<string>();
    for (let start = 0; start < records.length; start += RECORD_BATCH) {
      const batch = records.slice(start, start + RECORD_BATCH);
      try {
        const hash = await chain.recordBeats(batch);
        this.hub.log(`provenance: recorded ${batch.length} beats (${hash})`);
      } catch (error) {
        settled = false;
        for (const record of records.slice(start)) failed.add(record.world);
        this.hub.log(`provenance: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
    for (const id of worlds) if (!failed.has(idToBytes32(id) ?? "")) this.queued.delete(id);
    return settled;
  }
}

const recorders = new WeakMap<Hub, ProvenanceRecorder | null>();

/** beats.ts calls this after each accepted beat. Never throws, never waits. */
export function queueProvenance(
  hub: Hub,
  world: ServiceWorld,
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  let recorder = recorders.get(hub);
  if (recorder === undefined) {
    const settings = chainEnv(env);
    if (!settings.ok) hub.log(`provenance: ${settings.error.message} ${settings.error.hint ?? ""}`);
    recorder =
      settings.ok && settings.value !== null ? new ProvenanceRecorder(hub, settings.value) : null;
    recorders.set(hub, recorder);
  }
  recorder?.queue(world.id);
}
