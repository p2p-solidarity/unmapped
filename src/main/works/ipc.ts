// `works:*` channels plus the `ulwork:` protocol that serves world pages. The renderer is treated as
// untrusted input: every payload is zod-validated, ids are pattern-checked before touching a path,
// and the only process this module may terminate is a recorded, still-running work frame renderer.

import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { IPC } from "@shared/ipc";
import { err, ok, type Result } from "@shared/result";
import {
  ASSET_ID,
  assetMapSchema,
  CANDIDATE_ID,
  DRAFT_ID,
  jsonSchema,
  PLAY_ID,
  SESSION_TOKEN,
  WORK_CODE_FILES,
  WORK_ID,
  WORK_LIMITS,
  WORK_SCHEME,
  type WorkText,
} from "@shared/works";
import { app, BrowserWindow, dialog, protocol, webFrameMain } from "electron";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import {
  createDraft,
  listDrafts,
  publishDraft,
  readCandidate,
  readDraft,
  revertDraft,
  settleCandidate,
  writeCandidate,
} from "./drafts";
import { FrameSessions } from "./frame";
import { assetPrompt, generateImage } from "./images";
import { readLibrary } from "./library";
import { openSession } from "./session";
import { changePlay, createPlay, listPlays, listRevisions, readPlay, type WorkDirs } from "./store";

/** Must run before `app.whenReady()`: a standard, secure scheme gets a real host per session. */
export function registerWorkScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: WORK_SCHEME, privileges: { standard: true, secure: true } },
  ]);
}

const text = (max: number) => z.string().max(max);
const workTextSchema = z.object({
  main: text(WORK_LIMITS.codeBytes),
  style: text(WORK_LIMITS.codeBytes),
  assets: text(WORK_LIMITS.codeBytes),
});
const metricsSchema = z
  .object({
    model: z.string().max(200).nullable(),
    elapsedMs: z.number().min(0).max(3_600_000),
    promptTokens: z.number().int().min(0).nullable(),
    completionTokens: z.number().int().min(0).nullable(),
  })
  .nullable();
const refSchema = z.object({
  workId: z.string().regex(WORK_ID),
  version: z.string().max(40),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});
const worldIndex = z.number().int().min(0).max(WORK_LIMITS.worldsPerPlay);
const playChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("save"), world: worldIndex, state: jsonSchema }),
  z.object({
    kind: z.literal("complete"),
    world: worldIndex,
    summary: text(WORK_LIMITS.summaryChars),
    carry: jsonSchema,
  }),
  z.object({ kind: z.literal("restart"), world: worldIndex }),
  z.object({ kind: z.literal("goto"), world: worldIndex }),
]);
const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("play"), playId: z.string().regex(PLAY_ID) }),
  z.object({
    kind: z.literal("draft"),
    draftId: z.string().regex(DRAFT_ID),
    candidateId: z.string().regex(CANDIDATE_ID),
    state: jsonSchema.nullable(),
    carry: jsonSchema.nullable(),
  }),
]);

const IMAGE_TYPES = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** Renderer pids of our own windows: never a valid kill target. */
function hostPids(): Set<number> {
  return new Set(
    BrowserWindow.getAllWindows()
      .filter((window) => !window.isDestroyed())
      .map((window) => window.webContents.getOSProcessId()),
  );
}

/** Live `ulwork:` frames across our windows, as [session host, OS pid]. */
function liveWorkFrames(): Array<[string, number]> {
  const frames: Array<[string, number]> = [];
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    for (const frame of window.webContents.mainFrame.framesInSubtree) {
      if (!frame.url.startsWith(`${WORK_SCHEME}://`)) continue;
      try {
        frames.push([new URL(frame.url).host, frame.osProcessId]);
      } catch {
        // A frame mid-navigation can report a partial URL; it is simply not a kill candidate.
      }
    }
  }
  return frames;
}

/**
 * Stops a hung world. The pid comes from the live frame when it still exists (else the one
 * recorded at navigation), must be one of this app's renderer processes, must not be a window's
 * own renderer, and must not also be serving another session's frame.
 */
function killFrameProcess(token: string, recorded: number | null): boolean {
  const live = liveWorkFrames();
  const pid = live.find(([host]) => host === token)?.[1] ?? recorded;
  if (pid === null || hostPids().has(pid)) return false;
  if (live.some(([host, other]) => host !== token && other === pid)) return false;
  const alive = app.getAppMetrics().some((metric) => metric.pid === pid && metric.type === "Tab");
  if (!alive) return false;
  try {
    process.kill(pid, "SIGKILL");
    return true;
  } catch {
    return false;
  }
}

export function registerWorksIpc(ctx: MainContext): void {
  const dirs: WorkDirs = {
    worksDir: join(ctx.userData, "works"),
    playsDir: join(ctx.userData, "work-plays"),
    draftsDir: join(ctx.userData, "work-drafts"),
  };
  const sessions = new FrameSessions();

  protocol.handle(WORK_SCHEME, (request) => {
    const url = new URL(request.url);
    const page =
      SESSION_TOKEN.test(url.host) && url.pathname === "/" ? sessions.page(url.host) : null;
    if (page === null) return new Response("Not found", { status: 404 });
    return new Response(page.html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": page.csp,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  });

  // Record which OS process renders each work frame, so a hung one can be stopped later even
  // after its iframe has been removed from the page.
  app.on("web-contents-created", (_event, contents) => {
    contents.on(
      "did-frame-navigate",
      (_e, url, _code, _status, isMainFrame, frameProcessId, frameRoutingId) => {
        if (isMainFrame || !url.startsWith(`${WORK_SCHEME}://`)) return;
        const host = new URL(url).host;
        const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
        if (frame !== undefined && frame !== null) sessions.recordPid(host, frame.osProcessId);
      },
    );
  });

  handle(IPC.works.list, z.tuple([]), () => listRevisions(dirs));
  handle(IPC.works.plays, z.tuple([]), () => listPlays(dirs));
  handle(IPC.works.drafts, z.tuple([]), () => listDrafts(dirs));
  handle(IPC.works.createDraft, z.tuple([z.string().max(200)]), ([title]) =>
    createDraft(dirs, title),
  );
  handle(IPC.works.readDraft, z.tuple([z.string().regex(DRAFT_ID)]), ([draftId]) =>
    readDraft(dirs, draftId),
  );
  handle(
    IPC.works.readCandidate,
    z.tuple([z.string().regex(DRAFT_ID), z.string().regex(CANDIDATE_ID)]),
    async ([draftId, candidateId]): Promise<Result<WorkText>> => {
      const content = await readCandidate(dirs, draftId, candidateId);
      return content.ok ? ok(content.value.text) : content;
    },
  );
  handle(
    IPC.works.writeCandidate,
    z.tuple([
      z.object({
        draftId: z.string().regex(DRAFT_ID),
        parent: z.string().regex(CANDIDATE_ID).nullable(),
        kind: z.enum(["generate", "edit", "repair"]),
        request: text(WORK_LIMITS.requestChars * 4),
        summary: text(WORK_LIMITS.summaryChars * 2),
        text: workTextSchema,
        changed: z.array(z.enum(WORK_CODE_FILES)).max(3),
        metrics: metricsSchema,
      }),
    ]),
    ([input]) => writeCandidate(dirs, input),
  );
  handle(
    IPC.works.settleCandidate,
    z.tuple([
      z.object({
        draftId: z.string().regex(DRAFT_ID),
        candidateId: z.string().regex(CANDIDATE_ID),
        outcome: z.enum(["playable", "failed", "cancelled"]),
        error: text(8_000).nullable(),
        expectedHead: z.string().regex(CANDIDATE_ID).nullable(),
      }),
    ]),
    ([input]) => settleCandidate(dirs, input),
  );
  handle(
    IPC.works.revertDraft,
    z.tuple([z.string().regex(DRAFT_ID), z.string().regex(CANDIDATE_ID)]),
    ([draftId, candidateId]) => revertDraft(dirs, draftId, candidateId),
  );
  handle(IPC.works.publishDraft, z.tuple([z.string().regex(DRAFT_ID)]), ([draftId]) =>
    publishDraft(dirs, draftId),
  );
  handle(
    IPC.works.replaceAsset,
    z.tuple([z.string().regex(DRAFT_ID), z.string().regex(ASSET_ID)]),
    async ([draftId, assetId]) => {
      const draft = await readDraft(dirs, draftId);
      if (!draft.ok) return draft;
      const head = draft.value.head;
      if (head === null) return err("draft-empty", "Make a playable version first.");
      const content = await readCandidate(dirs, draftId, head);
      if (!content.ok) return content;
      const assets = assetMapSchema.parse(JSON.parse(content.value.text.assets));
      const entry = assets[assetId];
      if (entry === undefined) return err("asset-unknown", `This world has no asset "${assetId}".`);
      const picked = await dialog.showOpenDialog({
        title: `Image for "${assetId}"`,
        properties: ["openFile"],
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }],
      });
      const file = picked.filePaths[0];
      if (picked.canceled || file === undefined) return ok(null);
      const extension = extname(file).toLowerCase();
      if (!IMAGE_TYPES.has(extension)) return err("asset-type", "Pick a PNG, JPEG, WebP or GIF.");
      const bytes = new Uint8Array(await readFile(file));
      if (bytes.length > WORK_LIMITS.assetBytes) {
        return err("asset-too-large", `The image is ${bytes.length} bytes (limit 2 MB).`);
      }
      const path = `assets/${assetId}${extension === ".jpeg" ? ".jpg" : extension}`;
      const nextAssets = { ...assets, [assetId]: { ...entry, src: path } };
      return writeCandidate(dirs, {
        draftId,
        parent: head,
        kind: "asset",
        request: `Replace image "${assetId}" with ${basename(file)}`,
        summary: `Image "${assetId}" now uses ${basename(file)}.`,
        text: { ...content.value.text, assets: `${JSON.stringify(nextAssets, null, 2)}\n` },
        changed: ["assets.json"],
        metrics: null,
        images: { [path]: bytes },
      });
    },
  );
  handle(
    IPC.works.generateAsset,
    z.tuple([z.string().regex(DRAFT_ID), z.string().regex(ASSET_ID)]),
    async ([draftId, assetId]) => {
      const draft = await readDraft(dirs, draftId);
      if (!draft.ok) return draft;
      const head = draft.value.head;
      if (head === null) return err("draft-empty", "Make a playable version first.");
      const content = await readCandidate(dirs, draftId, head);
      if (!content.ok) return content;
      const assets = assetMapSchema.parse(JSON.parse(content.value.text.assets));
      const entry = assets[assetId];
      if (entry === undefined) return err("asset-unknown", `This world has no asset "${assetId}".`);
      const prompt = assetPrompt({ note: entry.note, assetId, world: draft.value.title });
      const image = await generateImage(prompt);
      if (!image.ok) return image;
      const path = `assets/${assetId}.png`;
      const nextAssets = { ...assets, [assetId]: { ...entry, src: path } };
      return writeCandidate(dirs, {
        draftId,
        parent: head,
        kind: "asset",
        request: `Generate image "${assetId}": ${prompt}`,
        summary: `Image "${assetId}" was generated by ${image.value.model}.`,
        text: { ...content.value.text, assets: `${JSON.stringify(nextAssets, null, 2)}\n` },
        changed: ["assets.json"],
        metrics: {
          model: image.value.model,
          elapsedMs: image.value.elapsedMs,
          promptTokens: image.value.inputTokens,
          completionTokens: image.value.outputTokens,
        },
        images: { [path]: image.value.png },
      });
    },
  );
  handle(
    IPC.works.createPlay,
    z.tuple([
      z.object({
        title: text(200),
        worlds: z.array(refSchema).min(1).max(WORK_LIMITS.worldsPerPlay),
        carry: jsonSchema.nullable().optional(),
      }),
    ]),
    ([input]) => createPlay(dirs, input as Parameters<typeof createPlay>[1]),
  );
  handle(IPC.works.readPlay, z.tuple([z.string().regex(PLAY_ID)]), ([playId]) =>
    readPlay(dirs, playId),
  );
  handle(
    IPC.works.changePlay,
    z.tuple([z.string().regex(PLAY_ID), playChangeSchema]),
    ([playId, change]) => changePlay(dirs, playId, change),
  );
  handle(IPC.works.openSession, z.tuple([sourceSchema]), ([source]) =>
    openSession(dirs, sessions, readLibrary, source),
  );
  handle(
    IPC.works.closeSession,
    z.tuple([z.string().regex(SESSION_TOKEN), z.boolean()]),
    ([token, kill]): Result<void> => {
      if (kill) killFrameProcess(token, sessions.pid(token));
      sessions.close(token);
      return ok(undefined);
    },
  );
}
