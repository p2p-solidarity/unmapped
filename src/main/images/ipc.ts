// `images:*` channels (rev 6 phase 4, D4). The renderer is untrusted (Rule 6): it names a provider
// id from the build's own list, or a revision by id and version, and nothing else — never a URL, a
// key or a path. Settings and choices come back with every provider's licence line; a choice that
// commercial mode refuses is refused here as well as at draw time.

import { join } from "node:path";
import { IMAGE_PROVIDER_IDS } from "@shared/images";
import { IPC } from "@shared/ipc";
import { WORK_ID } from "@shared/works";
import { z } from "zod";
import { isCartridgeId, isCartridgeVersion } from "../cartridges/paths";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { cartridgeAudit } from "./cartridgeLicences";
import { chooseImageProvider, imageSettings, initImages, probeImageProvider } from "./registry";
import { workAudit } from "./workLicences";

const providerSchema = z.enum(IMAGE_PROVIDER_IDS);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const auditTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("cartridge"),
    cartridgeId: z.string().refine(isCartridgeId, "bad cartridge id"),
    version: z.string().refine(isCartridgeVersion, "bad cartridge version"),
  }),
  z.strictObject({
    kind: z.literal("work"),
    workId: z.string().regex(WORK_ID),
    version: z.string().regex(SEMVER),
  }),
]);

export function registerImagesIpc(ctx: MainContext): void {
  initImages(ctx.userData);
  const workDirs = {
    worksDir: join(ctx.userData, "works"),
    playsDir: join(ctx.userData, "work-plays"),
    draftsDir: join(ctx.userData, "work-drafts"),
  };
  handle(IPC.images.settings, z.tuple([]), () => imageSettings());
  handle(IPC.images.choose, z.tuple([providerSchema]), async ([id]) => {
    const chosen = await chooseImageProvider(id);
    process.stdout.write(`[images] choose ${id} · ${chosen.ok ? "ok" : chosen.error.code}\n`);
    return chosen;
  });
  handle(IPC.images.probe, z.tuple([providerSchema]), async ([id]) => {
    const probe = await probeImageProvider(id, new AbortController().signal);
    process.stdout.write(
      `[images] probe ${id} · ${probe.ok ? `${probe.value.latencyMs} ms · served ${probe.value.served} · edits ${probe.value.edits}` : probe.error.code}\n`,
    );
    return probe;
  });
  handle(IPC.images.audit, z.tuple([auditTargetSchema]), ([target]) =>
    target.kind === "cartridge"
      ? cartridgeAudit(ctx.cartridgesDir, target.cartridgeId, target.version)
      : workAudit(workDirs, target.workId, target.version),
  );
}
