// `chain:*` channels. The renderer may ask what is configured, look a revision up and ask this
// machine to publish or witness a local revision, or to name a local cartridge revision on ENS — it
// never sees the RPC URL, the key or the ENS contract addresses, and it never supplies the hash
// that goes on chain: main reads every revision it writes about from disk.

import { LEDGER_NOTE_MAX, LEDGER_URI_MAX, utf8Bytes } from "@shared/chain";
import { IPC } from "@shared/ipc";
import { z } from "zod";
import { readCartridgeRevision } from "../cartridges/store";
import type { MainContext } from "../context";
import { handle, handleValue } from "../handle";
import { claimCartridgeName, ensNamesConfig } from "./ensNames";
import { ledgerConfig, lookupRevision, publishRevisionOnChain, witnessOnChain } from "./ledger";
import { readSubject } from "./subjects";

const contentHash = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const versionSchema = z.string().min(1).max(128);

/** A revision on this machine by name; its hash and parent are read from disk (subjects.ts). */
export const ledgerSubjectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("cartridge"),
      cartridgeId: z.string().min(1).max(80),
      version: versionSchema,
    })
    .strict(),
  z
    .object({ kind: z.literal("world"), workId: z.string().min(1).max(80), version: versionSchema })
    .strict(),
]);

export const publishOnChainSchema = z
  .object({
    subject: ledgerSubjectSchema,
    // The contract counts bytes; characters never exceed bytes, so max() is only a cheap pre-cut.
    uri: z
      .string()
      .max(LEDGER_URI_MAX)
      .refine((uri) => utf8Bytes(uri) <= LEDGER_URI_MAX, `at most ${LEDGER_URI_MAX} UTF-8 bytes`),
  })
  .strict();

export const witnessOnChainSchema = z
  .object({ subject: ledgerSubjectSchema, note: z.string().trim().min(1).max(LEDGER_NOTE_MAX) })
  .strict();

export function registerChainIpc(ctx: MainContext): void {
  handleValue(IPC.chain.config, () => ledgerConfig());
  handle(IPC.chain.lookup, z.tuple([contentHash]), ([hash]) => lookupRevision(hash));
  handle(IPC.chain.publish, z.tuple([publishOnChainSchema]), async ([input]) => {
    const subject = await readSubject(ctx.userData, ctx.cartridgesDir, input.subject);
    if (!subject.ok) return subject;
    return publishRevisionOnChain({ ...subject.value, uri: input.uri });
  });
  handle(IPC.chain.witness, z.tuple([witnessOnChainSchema]), async ([input]) => {
    const subject = await readSubject(ctx.userData, ctx.cartridgesDir, input.subject);
    if (!subject.ok) return subject;
    return witnessOnChain({ contentHash: subject.value.contentHash, note: input.note });
  });
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
