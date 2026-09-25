// What the ledger is asked about, read back from disk. The renderer names a revision (cartridge id or
// work id + version); main re-reads it, verifies its files against its hash, and only then knows the
// content hash and parent that go on chain — like the ENS claim, never a hash the renderer typed.

import { join } from "node:path";
import type { LedgerKind, LedgerSubject } from "@shared/chain";
import { ok, type Result } from "@shared/result";
import { readCartridgeRevision } from "../cartridges/store";
import { readRevision } from "../works/store";

export interface SubjectRevision {
  kind: LedgerKind;
  contentHash: string;
  parent: string | null;
}

export async function readSubject(
  userData: string,
  cartridgesDir: string,
  subject: LedgerSubject,
): Promise<Result<SubjectRevision>> {
  if (subject.kind === "cartridge") {
    const revision = await readCartridgeRevision(
      cartridgesDir,
      subject.cartridgeId,
      subject.version,
    );
    if (!revision.ok) return revision;
    const { manifest } = revision.value;
    return ok({
      kind: "cartridge",
      contentHash: manifest.contentHash,
      parent: manifest.lineage?.parent?.contentHash ?? null,
    });
  }
  // The same layout works/ipc.ts serves; only the published revisions are read here.
  const revision = await readRevision(
    {
      worksDir: join(userData, "works"),
      playsDir: join(userData, "work-plays"),
      draftsDir: join(userData, "work-drafts"),
    },
    subject.workId,
    subject.version,
  );
  if (!revision.ok) return revision;
  const { manifest } = revision.value;
  return ok({
    kind: "world",
    contentHash: manifest.contentHash,
    parent: manifest.lineage.parent?.contentHash ?? null,
  });
}
