// `window.seed.world.*` in main (rev 6 phase 3, D11). Every payload is checked by
// ./ipcSchemas before the host sees it; every answer is a `Result` (Rule 5). The device key stays
// in main (Rule 6): the renderer sends drafts and gets back ids, never a signature it could reuse.
//
// Registered by `registerIpc` (main/ipc.ts) in the wiring pass, which also adds `WORLD_IPC` and
// `WorldApi` to src/shared/ipc.ts and the preload bridge.

import { join } from "node:path";
import { WORLD_IPC } from "@shared/worldApi";
import type { MainContext } from "../context";
import { ensureBaseGame } from "../game/base";
import { handle } from "../handle";
import { DeviceIdentity, type KeyCipher } from "../identity/deviceKey";
import { electronCipher } from "../identity/safeStorage";
import { worldClock } from "./clock";
import { DSL_HISTORY, type WorldDsl } from "./dslSeam";
import { WorldHost } from "./host";
import { worldIpcSchemas as s } from "./ipcSchemas";

export interface WorldIpcOptions {
  /** The DSL-backed history functions (default: src/dsl/history). */
  dsl?: WorldDsl;
  /** The OS keychain (default: Electron safeStorage). */
  cipher?: KeyCipher;
}

export function registerWorldIpc(ctx: MainContext, options: WorldIpcOptions = {}): WorldHost {
  const identity = new DeviceIdentity(ctx.userData, options.cipher ?? electronCipher());
  const host = new WorldHost({
    userData: ctx.userData,
    cartridgesDir: ctx.cartridgesDir,
    instancesDir: ctx.instancesDir,
    works: {
      worksDir: join(ctx.userData, "works"),
      playsDir: join(ctx.userData, "work-plays"),
      draftsDir: join(ctx.userData, "work-drafts"),
    },
    dsl: options.dsl ?? DSL_HISTORY,
    key: () => identity.get(),
    clock: worldClock(),
    broadcast: (channel, payload) => ctx.broadcast(channel, payload),
    ensureBaseGame: () => ensureBaseGame(ctx.cartridgesDir),
  });
  handle(WORLD_IPC.ensure, s.ensure, ([instanceId, name]) => host.ensure(instanceId, name));
  handle(WORLD_IPC.read, s.read, ([worldId]) => host.read(worldId));
  handle(WORLD_IPC.close, s.close, ([worldId]) => host.close(worldId));
  handle(WORLD_IPC.append, s.append, ([worldId, draft]) => host.append(worldId, draft));
  handle(WORLD_IPC.claim, s.claim, ([worldId, target]) => host.claim(worldId, target));
  handle(WORLD_IPC.release, s.release, ([worldId, target]) => host.release(worldId, target));
  handle(WORLD_IPC.sendStream, s.sendStream, ([worldId, frame]) => host.sendStream(worldId, frame));
  handle(WORLD_IPC.sendPresence, s.sendPresence, ([worldId, p]) => host.sendPresence(worldId, p));
  handle(WORLD_IPC.attach, s.attach, ([worldId, url]) => host.attach(worldId, url));
  handle(WORLD_IPC.invite, s.invite, ([worldId, options]) => host.invite(worldId, options));
  handle(WORLD_IPC.setAccess, s.setAccess, ([worldId, policy]) => host.setAccess(worldId, policy));
  handle(WORLD_IPC.hide, s.hide, ([worldId, id, hidden]) => host.hide(worldId, id, hidden));
  handle(WORLD_IPC.dismissRefused, s.dismissRefused, ([worldId, id]) =>
    host.dismissRefused(worldId, id),
  );
  handle(WORLD_IPC.join, s.join, ([link, name, instanceId]) => host.join(link, name, instanceId));
  ctx.onBeforeQuit(() => host.flush());
  return host;
}
