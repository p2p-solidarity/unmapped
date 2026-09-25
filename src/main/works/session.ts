// Turns "play this journey" or "preview this draft candidate" into a served frame page. Assets are
// resolved here, in main, into data URLs: the frame never receives a path, and a missing or
// unreadable image stays null so the world has to show it as missing.

import { err, ok, type Result } from "@shared/result";
import {
  assetMapSchema,
  isLibraryPath,
  type Json,
  type LibraryPath,
  WORK_LIBRARY,
  type WorkSession,
  type WorkSessionSource,
} from "@shared/works";
import { readCandidate, readDraft } from "./drafts";
import { buildFramePage, type FrameSessions } from "./frame";
import { readPlay, readRevision, type WorkContent, type WorkDirs } from "./store";

export type LibraryReader = (path: LibraryPath) => Promise<Uint8Array | null>;

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function dataUrl(path: string, bytes: Uint8Array): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "png";
  return `data:${MIME[extension] ?? "image/png"};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function resolveAssets(
  content: WorkContent,
  readLibrary: LibraryReader,
): Promise<{ urls: Record<string, string | null>; missing: string[] }> {
  const parsed = assetMapSchema.safeParse(JSON.parse(content.text.assets));
  const urls: Record<string, string | null> = {};
  const missing: string[] = [];
  if (!parsed.success) return { urls, missing };
  // Every library image is also reachable by its path: models keep calling host.asset with the
  // path instead of an id, and that should draw the picture rather than a "missing" box.
  for (const entry of WORK_LIBRARY) {
    const bytes = await readLibrary(entry.path);
    if (bytes !== null) urls[entry.path] = dataUrl(entry.path, bytes);
  }
  for (const [id, entry] of Object.entries(parsed.data)) {
    let bytes: Uint8Array | null = null;
    if (entry.src !== null && isLibraryPath(entry.src)) bytes = await readLibrary(entry.src);
    else if (entry.src !== null) bytes = content.images[entry.src] ?? null;
    urls[id] = bytes === null || entry.src === null ? null : dataUrl(entry.src, bytes);
    if (urls[id] === null) missing.push(id);
  }
  return { urls, missing };
}

interface Opened {
  title: string;
  content: WorkContent;
  state: Json | null;
  carry: Json | null;
  world: number | null;
}

async function load(dirs: WorkDirs, source: WorkSessionSource): Promise<Result<Opened>> {
  if (source.kind === "play") {
    const play = await readPlay(dirs, source.playId);
    if (!play.ok) return play;
    const world = play.value.current;
    const ref = play.value.worlds[world];
    if (ref === undefined) return err("play-invalid", "The journey has no current world.");
    const revision = await readRevision(dirs, ref.workId, ref.version);
    if (!revision.ok) return revision;
    if (revision.value.manifest.contentHash !== ref.contentHash) {
      return err(
        "work-mismatch",
        `${ref.workId}@${ref.version} is not the revision this journey was started on.`,
      );
    }
    return ok({
      title: revision.value.manifest.title,
      content: revision.value.content,
      state: play.value.states[world] ?? null,
      carry: play.value.carry,
      world,
    });
  }
  const draft = await readDraft(dirs, source.draftId);
  if (!draft.ok) return draft;
  const content = await readCandidate(dirs, source.draftId, source.candidateId);
  if (!content.ok) return content;
  return ok({
    title: draft.value.title,
    content: content.value,
    state: source.state,
    carry: source.carry,
    world: null,
  });
}

export async function openSession(
  dirs: WorkDirs,
  sessions: FrameSessions,
  readLibrary: LibraryReader,
  source: WorkSessionSource,
): Promise<Result<WorkSession>> {
  const opened = await load(dirs, source);
  if (!opened.ok) return opened;
  const { title, content, state, carry, world } = opened.value;
  const assets = await resolveAssets(content, readLibrary);
  const { token, url } = sessions.create((token) =>
    buildFramePage({ token, title, text: content.text, assets: assets.urls, state, carry }),
  );
  return ok({ token, url, title, world, missingAssets: assets.missing });
}
