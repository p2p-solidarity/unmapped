// The single registration point for every channel in `@shared/ipc`. Called once from `index.ts`
// after the app is ready and the worlds directory exists.
//
// `registerInferenceIpc` (provider client, streaming, sidecar) and `registerModsIpc` (the mod
// install directory, its watcher and the install dialog) are owned by their own folders; this file
// only calls them so every channel is registered in the same pass.

import { registerAppIpc } from "./app/ipc";
import { registerCartridgesIpc } from "./cartridges/ipc";
import type { MainContext } from "./context";
import { registerInferenceIpc } from "./inference/ipc";
import { registerInstancesIpc } from "./instances/ipc";
import { registerModsIpc } from "./mods/ipc";
import { registerSeedIpc } from "./seeds/ipc";
import { registerVaultIpc } from "./vault/ipc";
import { registerWorkspacesIpc } from "./workspaces/ipc";
import { registerWorldsIpc } from "./worlds/ipc";

export function registerIpc(ctx: MainContext): void {
  registerWorldsIpc(ctx);
  registerCartridgesIpc(ctx);
  registerInstancesIpc(ctx);
  registerWorkspacesIpc(ctx);
  registerSeedIpc(ctx);
  registerVaultIpc(ctx);
  registerAppIpc(ctx);
  registerInferenceIpc(ctx);
  registerModsIpc(ctx);
}
