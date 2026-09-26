// The light chain's answer for one world, for the door (rev 6 phase 4, D6, app side: read-only).
// It goes through main/chain/provenance.ts: the RPC, the contract address and the chain id come
// from main's own UNMAPPED_PROVENANCE_* variables (Rule 6); the renderer sends only a world id.
//
// The chain can be switched off entirely: with nothing configured (or half of it) the answer is
// `provenance-not-configured` before anything is read, neither the log nor the network, and the
// door shows it as a calm line. Otherwise the log is read under the world's lock (an append never
// tears it) and the chain after the lock is released, so writing never waits for an RPC.

import type { ProvenanceReport } from "@shared/provenance";
import { err, type Result } from "@shared/result";
import { compareWithChain, type ProvenanceReader, provenanceReader } from "../chain/provenance";
import type { HostCore } from "./core";
import { locked } from "./fsx";
import { readLog } from "./logStore";
import { isWorldId, worldDir } from "./paths";

export async function readWorldProvenance(
  core: Pick<HostCore, "histories">,
  worldId: string,
  open: () => Result<ProvenanceReader> = () => provenanceReader(),
): Promise<Result<ProvenanceReport>> {
  const reader = open();
  if (!reader.ok) return reader;
  if (!isWorldId(worldId)) return err("provenance-world-invalid", "That is not a world id.");
  const log = await locked(`world:${worldId}`, () => readLog(worldDir(core.histories, worldId)));
  if (!log.ok) return log;
  return compareWithChain(worldId, log.value, reader.value);
}
