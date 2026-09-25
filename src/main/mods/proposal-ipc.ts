import { IPC } from "@shared/ipc";
import { seedModProposalSchema } from "@shared/mod-proposal-schema";
import { z } from "zod";
import {
  cartridgeVersions,
  publishCartridgeRevision,
  readCartridgeRevision,
} from "../cartridges/store";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { previewModProposal } from "./proposal";

export function registerModProposalIpc(ctx: MainContext): void {
  handle(IPC.mods.previewProposal, z.tuple([seedModProposalSchema]), async ([proposal]) => {
    const base = await readCartridgeRevision(
      ctx.cartridgesDir,
      proposal.base.cartridgeId,
      proposal.base.version,
    );
    if (!base.ok) return base;
    const taken = await cartridgeVersions(ctx.cartridgesDir, proposal.base.cartridgeId);
    return previewModProposal(base.value, proposal, taken);
  });
  handle(IPC.mods.publishProposal, z.tuple([seedModProposalSchema]), async ([proposal]) => {
    // Re-read and revalidate on approval; renderer preview bytes are never trusted for publication.
    const base = await readCartridgeRevision(
      ctx.cartridgesDir,
      proposal.base.cartridgeId,
      proposal.base.version,
    );
    if (!base.ok) return base;
    const taken = await cartridgeVersions(ctx.cartridgesDir, proposal.base.cartridgeId);
    const preview = previewModProposal(base.value, proposal, taken);
    return preview.ok
      ? publishCartridgeRevision(ctx.cartridgesDir, preview.value.revision)
      : preview;
  });
}
