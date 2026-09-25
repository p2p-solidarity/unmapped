// IPC for Create a game drafts. The renderer is untrusted (Rule 6): every argument is checked
// here, and a whole draft is checked again against its schema by the store before it is written.
// The look step's pictures are drawn here, in main, where the image key lives: from the draft as
// main last saved it, recorded in the usage ledger under the draft, and cancellable by request id.

import {
  createDraftSchema,
  DRAFT_ID,
  draftIdeaSchema,
  LOOK_PICTURE_ID,
  LOOK_PICTURES_MAX,
  type LookPicture,
} from "@shared/createDraft";
import { IPC } from "@shared/ipc";
import { err, ok, type Result } from "@shared/result";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { recordUsage } from "../usage/ipc";
import { imageProvider } from "../works/images";
import {
  createCreateDraft,
  listCreateDrafts,
  readCreateDraft,
  removeCreateDraft,
  saveCreateDraft,
} from "./createDrafts";
import { discardLooks, LOOK_VIEWS, lookPrompt, readLooks, storeLook } from "./createLooks";

const draftIdSchema = z.string().regex(DRAFT_ID);
const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
const cancelled = (): Result<never> =>
  err("cancelled", "The picture was cancelled; nothing was changed.");

export function registerCreateDraftsIpc(ctx: MainContext): void {
  const inflight = new Map<string, AbortController>();

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

  handle(IPC.createDrafts.looks, z.tuple([draftIdSchema]), ([draftId]) =>
    readLooks(ctx.workspacesDir, draftId),
  );
  handle(
    IPC.createDrafts.discardLooks,
    z.tuple([draftIdSchema, z.array(z.string().regex(LOOK_PICTURE_ID)).max(LOOK_PICTURES_MAX)]),
    ([draftId, keep]) => discardLooks(ctx.workspacesDir, draftId, keep),
  );
  handle(
    IPC.createDrafts.drawLook,
    z.tuple([
      draftIdSchema,
      z
        .number()
        .int()
        .min(0)
        .max(LOOK_VIEWS - 1),
      z.string().regex(REQUEST_ID),
    ]),
    async ([draftId, view, requestId]): Promise<Result<LookPicture>> => {
      if (inflight.has(requestId)) {
        return err("duplicate-request", `Picture request ${requestId} is already running.`);
      }
      const draft = await readCreateDraft(ctx.workspacesDir, draftId);
      if (!draft.ok) return draft;
      const prompt = lookPrompt(draft.value, view);
      if (!prompt.ok) return prompt;
      const controller = new AbortController();
      inflight.set(requestId, controller);
      const provider = imageProvider();
      const started = Date.now();
      const image = await provider
        .generate(prompt.value, controller.signal, { quality: "low", kind: "concept" })
        .finally(() => inflight.delete(requestId));
      const ms = Date.now() - started;
      await recordUsage(ctx, {
        tag: { purpose: "image", scope: { kind: "create", id: draftId } },
        provider: provider.id,
        model: provider.model,
        input: image.ok ? image.value.inputTokens : null,
        output: image.ok ? image.value.outputTokens : null,
        cached: null,
        ms,
        outcome: image.ok ? "done" : image.error.code === "cancelled" ? "aborted" : "failed",
      });
      process.stdout.write(
        `[look] ${image.ok ? "done" : "fail"} ${requestId} · ${provider.id} · ${provider.model} · ${ms} ms${image.ok ? "" : ` · ${image.error.code}`}\n`,
      );
      if (!image.ok) return image;
      // A cancel that raced the last byte: the picture arrived, but the player said no.
      if (controller.signal.aborted) return cancelled();
      return storeLook(ctx.workspacesDir, draftId, image.value.png);
    },
  );
  handle(IPC.createDrafts.cancelLook, z.tuple([z.string().regex(REQUEST_ID)]), ([requestId]) => {
    const controller = inflight.get(requestId);
    if (controller === undefined) {
      return err("image-not-running", "That picture request is no longer running.");
    }
    controller.abort();
    process.stdout.write(`[look] abort ${requestId}\n`);
    return ok(undefined);
  });
}
