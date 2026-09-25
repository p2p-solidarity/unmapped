// IPC for Create a game drafts. The renderer is untrusted (Rule 6): every argument is checked
// here, and a whole draft is checked again against its schema by the store before it is written.

import { createDraftSchema, DRAFT_ID, draftIdeaSchema } from "@shared/createDraft";
import { IPC } from "@shared/ipc";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import {
  createCreateDraft,
  listCreateDrafts,
  readCreateDraft,
  removeCreateDraft,
  saveCreateDraft,
} from "./createDrafts";

const draftIdSchema = z.string().regex(DRAFT_ID);

export function registerCreateDraftsIpc(ctx: MainContext): void {
  handle(IPC.createDrafts.list, z.tuple([]), () => listCreateDrafts(ctx.workspacesDir));
  handle(IPC.createDrafts.create, z.tuple([draftIdeaSchema]), ([idea]) =>
    createCreateDraft(ctx.workspacesDir, idea),
  );
  handle(IPC.createDrafts.read, z.tuple([draftIdSchema]), ([draftId]) =>
    readCreateDraft(ctx.workspacesDir, draftId),
  );
  handle(IPC.createDrafts.save, z.tuple([createDraftSchema]), ([draft]) =>
    saveCreateDraft(ctx.workspacesDir, draft),
  );
  handle(IPC.createDrafts.remove, z.tuple([draftIdSchema]), ([draftId]) =>
    removeCreateDraft(ctx.workspacesDir, draftId),
  );
}
