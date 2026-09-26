// `window.seed.bundle.*` in main (rev 6 phase 4, D5): export a world as a signed `.world`, read and
// verify one offline, bring it onto this device, and follow a move link. Every payload is checked
// here (Rule 6); files are chosen by native dialogs in main (AETHER_TEST_WORLD_PATH in E2E), and the
// renderer names an inspected file only by the token `inspect` returned — never by its path.

import { randomBytes } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { EVENT_ID } from "@shared/history/ids";
import { err, ok } from "@shared/result";
import { BUNDLE_IPC, WORLD_BUNDLE_EXTENSION } from "@shared/worldBundle";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import type { WorldHost } from "../histories/host";
import { chooseWorldSource, chooseWorldTarget } from "./dialog";
import { exportWorldBundle, listBundleWorlds } from "./export";
import { importWorldBundle, readWorldFile } from "./import";
import { followMoveLink } from "./move";

const TOKEN = /^[a-f0-9]{32}$/;
const displayName = z
  .string()
  .min(1)
  .max(60)
  .refine((text) => text.trim().length > 0 && !/[\r\n]/.test(text), "must be one line");

const schemas = {
  list: z.tuple([]),
  export: z.tuple([z.string().regex(EVENT_ID)]),
  inspect: z.tuple([]),
  import: z.tuple([z.string().regex(TOKEN), displayName]),
  move: z.tuple([z.string().min(1).max(2000)]),
} as const;

/** A file name from a world's name: letters, digits and dashes only. */
function fileNameOf(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug === "" ? "world" : slug}.${WORLD_BUNDLE_EXTENSION}`;
}

async function writeAtomically(path: string, bytes: Uint8Array): Promise<void> {
  const staged = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(staged, bytes);
    await rename(staged, path);
  } finally {
    await rm(staged, { force: true }).catch(() => undefined);
  }
}

export function registerBundleIpc(_ctx: MainContext, host: WorldHost): void {
  const core = host.core;
  /** Inspected files by token; only the latest few are kept. */
  const inspected = new Map<string, string>();

  handle(BUNDLE_IPC.list, schemas.list, () => listBundleWorlds(core));
  handle(BUNDLE_IPC.export, schemas.export, async ([worldId]) => {
    const built = await exportWorldBundle(core, worldId);
    if (!built.ok) return built;
    const path = await chooseWorldTarget(fileNameOf(built.value.name));
    if (path === null) return ok(null);
    try {
      await writeAtomically(path, built.value.bytes);
    } catch (error) {
      return err("bundle-write-failed", `The file cannot be written: ${String(error)}`);
    }
    const { bytes, report } = built.value;
    return ok({ fileName: basename(path), bytes: bytes.length, report });
  });
  handle(BUNDLE_IPC.inspect, schemas.inspect, async () => {
    const path = await chooseWorldSource();
    if (path === null) return ok(null);
    const read = await readWorldFile(path);
    if (!read.ok) return read;
    const token = randomBytes(16).toString("hex");
    inspected.set(token, path);
    for (const old of [...inspected.keys()].slice(0, -4)) inspected.delete(old);
    return ok({ token, fileName: read.value.fileName, report: read.value.report });
  });
  handle(BUNDLE_IPC.import, schemas.import, async ([token, name]) => {
    const path = inspected.get(token);
    if (path === undefined) {
      return err("bundle-token-unknown", "That file is no longer open here.", "Choose it again.");
    }
    return importWorldBundle(
      core,
      (instanceId, player) => host.ensure(instanceId, player),
      path,
      name.trim(),
    );
  });
  handle(BUNDLE_IPC.move, schemas.move, ([link]) => followMoveLink(core, link));
}
