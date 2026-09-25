// `chain:*` channels. The renderer may ask what is configured, look a revision up and ask this
// machine to publish or witness, or to name a local cartridge revision on ENS — it never sees the
// RPC URL, the key or the ENS contract addresses.

import { LEDGER_KINDS, LEDGER_NOTE_MAX } from "@shared/chain";
import { IPC } from "@shared/ipc";
import { z } from "zod";
import { readCartridgeRevision } from "../cartridges/store";
import type { MainContext } from "../context";
import { handle, handleValue } from "../handle";
import { claimCartridgeName, ensNamesConfig } from "./ensNames";
import { ledgerConfig, lookupRevision, publishRevisionOnChain, witnessOnChain } from "./ledger";

const contentHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export function registerChainIpc(ctx: MainContext): void {
  handleValue(IPC.chain.config, () => ledgerConfig());
  handle(IPC.chain.lookup, z.tuple([contentHash]), ([hash]) => lookupRevision(hash));
  handle(
    IPC.chain.publish,
    z.tuple([
      z
        .object({
          contentHash,
          parent: contentHash.nullable(),
          kind: z.enum(LEDGER_KINDS),
          uri: z.string().max(400),
        })
        .strict(),
    ]),
    ([input]) => publishRevisionOnChain(input),
  );
  handle(
    IPC.chain.witness,
    z.tuple([z.object({ contentHash, note: z.string().min(1).max(LEDGER_NOTE_MAX) }).strict()]),
    ([input]) => witnessOnChain(input),
  );
  handleValue(IPC.chain.ensConfig, () => ensNamesConfig());
  handle(
    IPC.chain.claimName,
    z.tuple([z.string().min(1).max(80), z.string().min(1).max(128)]),
    async ([cartridgeId, version]) => {
      // Only a revision on disk can be named, with the hash its files verified to.
      const revision = await readCartridgeRevision(ctx.cartridgesDir, cartridgeId, version);
      if (!revision.ok) return revision;
      const { manifest } = revision.value;
      return claimCartridgeName({
        cartridgeId: manifest.cartridgeId,
        version: manifest.version,
        contentHash: manifest.contentHash,
      });
    },
  );
}
