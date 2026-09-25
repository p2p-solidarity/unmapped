// `chain:*` channels. The renderer may ask what is configured, look a revision up and ask this
// machine to publish or witness — it never sees the RPC URL or the key.

import { LEDGER_KINDS, LEDGER_NOTE_MAX } from "@shared/chain";
import { IPC } from "@shared/ipc";
import { z } from "zod";
import { handle, handleValue } from "../handle";
import { ledgerConfig, lookupRevision, publishRevisionOnChain, witnessOnChain } from "./ledger";

const contentHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export function registerChainIpc(): void {
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
}
