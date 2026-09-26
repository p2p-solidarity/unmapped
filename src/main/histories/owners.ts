// Co-owners and the chain opt-in in main (rev 6 phase 4, D5, D6): the owner actions the draft kinds
// leave out, built against the world as it stands, checked by `admit` (only an owner writes them,
// the last owner stays) and signed like every other event (./commit). The door panel's co-owner
// rows and pairing's co-owner offer call these through `window.seed.world.{addOwner, removeOwner,
// setChainRecording}` (./ipc).

import type { Result } from "@shared/result";
import type { WorldAppended } from "@shared/worldApi";
import { appendDraft } from "./commit";
import type { HostCore } from "./core";

/** Makes `key` (a device's author key) a co-owner of `worldId`. */
export function addOwner(
  core: HostCore,
  worldId: string,
  key: string,
): Promise<Result<WorldAppended>> {
  return appendDraft(core, worldId, (world) => ({
    kind: "owner.add",
    body: { key },
    seen: world.now.head.n,
  }));
}

/** Ends `key`'s ownership of `worldId` (refused for the last owner: `owner-last`). */
export function removeOwner(
  core: HostCore,
  worldId: string,
  key: string,
): Promise<Result<WorldAppended>> {
  return appendDraft(core, worldId, (world) => ({
    kind: "owner.remove",
    body: { key },
    seen: world.now.head.n,
  }));
}

/** D6's opt-in: whether the world's service records its beats on chain (latest wins). */
export function setChainRecording(
  core: HostCore,
  worldId: string,
  record: boolean,
): Promise<Result<WorldAppended>> {
  return appendDraft(core, worldId, (world) => ({
    kind: "chain",
    body: { record },
    seen: world.now.head.n,
  }));
}
