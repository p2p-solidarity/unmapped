// `ctx.world` — the read-only mirror of the loaded world.
//
// The harness never owns world state: the renderer's stores and the dotfiles do (Rule 9). This
// service holds the snapshot a prompt section or a tool may *read*, and is replaced whenever the
// stores change. Writes always travel the other way, as a GameEffect through `ctx.effects`.

import { type Context, Service } from "@deepseek-ai/cordis";
import type { WorldSnapshot } from "./types";

export class WorldService extends Service {
  private snapshot: WorldSnapshot | null = null;

  constructor(ctx: Context) {
    super(ctx, "world");
  }

  /** Publish the current snapshot, or `null` when no world is open. */
  set(snapshot: WorldSnapshot | null): void {
    this.snapshot = snapshot;
  }

  get(): WorldSnapshot | null {
    return this.snapshot;
  }
}
