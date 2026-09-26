import { registerModProposalIpc } from "./mods/proposal-ipc";
import { registerProfilesIpc } from "./profiles/ipc";
// The single registration point for every channel in `@shared/ipc`. Called once from `index.ts`
// after the app is ready and the worlds directory exists.
//
// `registerInferenceIpc` (provider client, streaming, sidecar) and `registerModsIpc` (the mod
// install directory, its watcher and the install dialog) are owned by their own folders; this file
// only calls them so every channel is registered in the same pass.

import { registerAccountIpc } from "./account/ipc";
import { registerAppIpc } from "./app/ipc";
import { registerBillingIpc } from "./billing/ipc";
import { registerCartridgesIpc } from "./cartridges/ipc";
import { registerChainIpc } from "./chain/ipc";
import { registerMarketIpc } from "./chain/marketIpc";
import type { MainContext } from "./context";
import { registerGameIpc } from "./game/base";
import { registerWorldIpc } from "./histories/ipc";
import { registerInferenceIpc } from "./inference/ipc";
import { registerInstancesIpc } from "./instances/ipc";
import { registerModsIpc } from "./mods/ipc";
import { registerSeedIpc } from "./seeds/ipc";
import { registerUsageIpc } from "./usage/ipc";
import { registerVaultIpc } from "./vault/ipc";
import { registerWorksIpc } from "./works/ipc";
import { registerCreateDraftsIpc } from "./workspaces/createDraftsIpc";
import { registerWorkspacesIpc } from "./workspaces/ipc";
import { registerWorldsIpc } from "./worlds/ipc";

export function registerIpc(ctx: MainContext): void {
  registerWorldsIpc(ctx);
  registerCartridgesIpc(ctx);
  registerGameIpc(ctx);
  registerInstancesIpc(ctx);
  registerWorkspacesIpc(ctx);
  registerProfilesIpc(ctx);
  registerModProposalIpc(ctx);
  registerSeedIpc(ctx);
  registerVaultIpc(ctx);
  registerAppIpc(ctx);
  registerInferenceIpc(ctx);
  registerModsIpc(ctx);
  registerWorksIpc(ctx);
  registerChainIpc(ctx);
  registerMarketIpc(ctx);
  registerCreateDraftsIpc(ctx);
  registerUsageIpc(ctx);
  registerWorldIpc(ctx);
  registerAccountIpc(ctx);
  registerBillingIpc(ctx);
}
