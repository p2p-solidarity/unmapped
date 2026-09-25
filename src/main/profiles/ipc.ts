import { IPC } from "@shared/ipc";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { playerProfileInputSchema, profileIdSchema } from "./schemas";
import {
  listPlayerProfiles,
  readPlayerProfile,
  removePlayerProfile,
  upsertPlayerProfile,
} from "./store";

export function registerProfilesIpc(ctx: MainContext): void {
  handle(IPC.profiles.list, z.tuple([]), () => listPlayerProfiles(ctx.profilesDir));
  handle(IPC.profiles.read, z.tuple([profileIdSchema]), ([profileId]) =>
    readPlayerProfile(ctx.profilesDir, profileId),
  );
  handle(IPC.profiles.upsert, z.tuple([playerProfileInputSchema]), ([input]) =>
    upsertPlayerProfile(ctx.profilesDir, input),
  );
  handle(IPC.profiles.remove, z.tuple([profileIdSchema]), ([profileId]) =>
    removePlayerProfile(ctx.profilesDir, profileId),
  );
}
