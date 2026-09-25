import { IPC } from "@shared/ipc";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { publishCartridgeInputSchema } from "./schemas";
import { listCartridgeRevisions, publishCartridgeRevision, readCartridgeRevision } from "./store";

const cartridgeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const versionSchema = z.string().min(1).max(128);

export function registerCartridgesIpc(ctx: MainContext): void {
  handle(IPC.cartridges.list, z.tuple([]), () => listCartridgeRevisions(ctx.cartridgesDir));
  handle(
    IPC.cartridges.read,
    z.tuple([cartridgeIdSchema, versionSchema]),
    ([cartridgeId, version]) => readCartridgeRevision(ctx.cartridgesDir, cartridgeId, version),
  );
  handle(IPC.cartridges.publish, z.tuple([publishCartridgeInputSchema]), ([input]) =>
    publishCartridgeRevision(ctx.cartridgesDir, input),
  );
}
