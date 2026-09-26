// AI works an otherworld place announces (rev 6 phase 3, D3, D10), from the land's side (WP5):
//
// - `packWorkFor`: the reproducible pack of one of this device's published works, stored as a blob,
//   so its hash can go into a `place` body's `work.pack`. A work that arrived with someone else's
//   history is refused (`work-received`): it is theirs, and the place maker never offers it. When
//   the world is attached and online the blob is uploaded too, so friends can fetch it; offline it
//   waits in the blob store for `uploadOwnPacks`.
// - `sendPackOnce`: one pack up to a service, once (`packWorkFor`, and ./builtInPack before it
//   announces a built-in world's cartridge pack).
// - `uploadOwnPacks`: every pack this device announced (the cartridge pack while it owns the world,
//   the AI works of its own places and chapters, sequenced or still in the outbox) that the
//   world's service has not confirmed yet. Attach runs it, and so does every reconnect (D11: the
//   device works offline first), so a place added offline reaches friends once the link is back.
//   What the service confirmed is noted per service URL in `uploaded-packs.json`, so a pack is
//   never sent twice; a failure is logged and tried again at the next reconnect.
// - `receivedWorks`: every work any history on this device brought with it, so the otherworld
//   picker ("this device's AI worlds") can leave them out.

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { ContentHash } from "@shared/cartridge";
import { readEvent } from "@shared/history/event";
import { CONTENT_HASH } from "@shared/history/ids";
import { isOwner } from "@shared/history/owners";
import { type AppError, err, ok, type Result } from "@shared/result";
import type { WorkRef } from "@shared/works";
import { z } from "zod";
import { readBlob } from "../blobs/store";
import type { DeviceKey } from "../identity/deviceKey";
import { uploadBlob } from "./blobClient";
import type { HostCore } from "./core";
import { locked, readJsonFile, writeJsonAtomic } from "./fsx";
import type { LoadedWorld } from "./loaded";
import { readReceivedWorks } from "./logStore";
import { storeWorkPack } from "./packs";
import { isWorldId, UPLOADED_PACKS_FILE, worldDir } from "./paths";

const sameWork = (a: WorkRef, b: WorkRef): boolean =>
  a.workId === b.workId && a.version === b.version && a.contentHash === b.contentHash;

/** Every AI work some history on this device received (deduplicated). */
export async function receivedWorks(core: HostCore): Promise<Result<WorkRef[]>> {
  let names: string[];
  try {
    names = await readdir(core.histories);
  } catch {
    return ok([]);
  }
  const out: WorkRef[] = [];
  for (const name of names.filter(isWorldId).sort()) {
    const read = await readReceivedWorks(worldDir(core.histories, name));
    if (!read.ok) continue;
    for (const { workId, version, contentHash } of read.value) {
      const ref = { workId, version, contentHash };
      if (!out.some((one) => sameWork(one, ref))) out.push(ref);
    }
  }
  return ok(out);
}

export async function packWorkFor(
  core: HostCore,
  worldId: string,
  work: WorkRef,
): Promise<Result<ContentHash>> {
  const received = await receivedWorks(core);
  if (received.ok && received.value.some((one) => sameWork(one, work))) {
    return err(
      "work-received",
      "That AI world arrived with someone else's world; it is not this device's to place.",
      "Place one of your own AI worlds, or write a new one in the workshop.",
    );
  }
  const world = await core.withWorld(worldId, async (loaded) => ok(loaded));
  if (!world.ok) return world;
  const hash = await storeWorkPack(core.blobsDir, core.deps.works, work);
  if (!hash.ok) return hash;
  const url = world.value.link?.url;
  if (url === undefined || core.sync.get(worldId)?.link !== "online") return hash;
  const key = await core.deps.key();
  if (!key.ok) return key;
  const sent = await sendPackOnce(core, world.value, url, hash.value, key.value);
  return sent.ok ? hash : sent;
}

/**
 * Uploads one pack from this device's blob store to `url`, unless that service confirmed it
 * already, and notes it as confirmed. In the same queue as `uploadOwnPacks`, so a reconnect's pass
 * never sends it a second time.
 */
export function sendPackOnce(
  core: Pick<HostCore, "blobsDir" | "deps">,
  world: Pick<LoadedWorld, "id" | "dir">,
  url: string,
  hash: ContentHash,
  key: DeviceKey,
): Promise<Result<void>> {
  return locked(`packs:${world.id}`, async (): Promise<Result<void>> => {
    if ((await confirmedPacks(world.dir, url)).has(hash)) return ok(undefined);
    const bytes = await readBlob(core.blobsDir, hash);
    if (!bytes.ok) return bytes;
    const up = await uploadBlob(url, world.id, hash, bytes.value, key, core.deps.fetchImpl);
    if (up.ok) await confirmPack(world.dir, url, hash);
    return up;
  });
}

// ── Packs this device announced, uploaded once per service ──────────────────────────────────

const uploadedSchema = z.strictObject({
  v: z.literal(1),
  url: z.string().min(1).max(2048),
  packs: z
    .array(z.custom<ContentHash>((v) => typeof v === "string" && CONTENT_HASH.test(v)))
    .max(4096),
});

/** The packs `url` confirmed it holds for this world (none for another URL, or a damaged file). */
async function confirmedPacks(dir: string, url: string): Promise<Set<ContentHash>> {
  const read = await readJsonFile(
    join(dir, UPLOADED_PACKS_FILE),
    uploadedSchema,
    "history-uploaded-invalid",
    "uploaded-packs.json is damaged; the packs are sent again at the next reconnect.",
  );
  if (!read.ok) console.warn(`[world] ${read.error.message}`);
  return new Set(read.ok && read.value?.url === url ? read.value.packs : []);
}

function confirmPack(dir: string, url: string, hash: ContentHash): Promise<void> {
  return locked(`uploaded:${dir}`, async () => {
    const packs = await confirmedPacks(dir, url);
    if (packs.has(hash)) return;
    await writeJsonAtomic(join(dir, UPLOADED_PACKS_FILE), { v: 1, url, packs: [...packs, hash] });
  });
}

/**
 * The packs this device announced in `world`: the cartridge pack while it owns the world (the
 * maker's `pack` event; a co-owner may attach or move it, phase 4 D5), and the AI works its own
 * places and chapters open, sequenced or still waiting in the outbox. Packs members announced came
 * from the service and stay there.
 */
export function ownPacks(world: Pick<LoadedWorld, "now" | "outbox">, me: string): ContentHash[] {
  const { now } = world;
  const packs = new Set<ContentHash>();
  if (now.pack !== null && isOwner(now, me)) packs.add(now.pack.pack);
  for (const place of now.places) {
    if (place.author === me && place.body.work !== undefined) packs.add(place.body.work.pack);
  }
  for (const contest of Object.values(now.chapters)) {
    for (const chapter of [contest.live, ...contest.variants]) {
      if (chapter?.author === me && chapter.body.kind === "work") packs.add(chapter.body.work.pack);
    }
  }
  for (const pending of world.outbox) {
    const event = readEvent(pending.event);
    if (!event.ok || event.value.author !== me) continue;
    const { value } = event;
    if (value.kind === "pack") packs.add(value.body.pack);
    if (value.kind === "place" && value.body.work !== undefined) packs.add(value.body.work.pack);
    if (value.kind === "chapter" && value.body.kind === "work") packs.add(value.body.work.pack);
  }
  return [...packs];
}

export interface PackUpload {
  sent: ContentHash[];
  failed: { hash: ContentHash; error: AppError }[];
}

/**
 * Uploads every pack of `ownPacks` that `url` has not confirmed yet; see the header. One pass per
 * world at a time: a pass asked for while another runs follows it, and finds nothing left to send.
 */
export function uploadOwnPacks(
  core: Pick<HostCore, "blobsDir" | "deps">,
  world: LoadedWorld,
  url: string,
): Promise<PackUpload> {
  return locked(`packs:${world.id}`, async () => {
    const done: PackUpload = { sent: [], failed: [] };
    const key = await core.deps.key();
    if (!key.ok) return done;
    const confirmed = await confirmedPacks(world.dir, url);
    for (const hash of ownPacks(world, key.value.author)) {
      if (confirmed.has(hash)) continue;
      const bytes = await readBlob(core.blobsDir, hash);
      const sent = bytes.ok
        ? await uploadBlob(url, world.id, hash, bytes.value, key.value, core.deps.fetchImpl)
        : bytes;
      if (!sent.ok) {
        console.warn(
          `[world] ${world.id.slice(0, 12)}… pack ${hash.slice(7, 19)} not uploaded (${sent.error.code}: ${sent.error.message}); tried again at the next reconnect`,
        );
        done.failed.push({ hash, error: sent.error });
        continue;
      }
      await confirmPack(world.dir, url, hash);
      done.sent.push(hash);
    }
    return done;
  });
}
