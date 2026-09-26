import type { SceneProvider } from "@shared/scene-generation";
import type { AppleChat } from "./inference/appleChat";

// Dependency bag handed to every IPC module in main. Keeps modules free of direct BrowserWindow
// references so they can be unit-tested with a fake context.

export interface MainContext {
  /**
   * The app-session Apple provider: structured scenes and plain chat through one Swift helper the
   * app starts itself. Null on platforms where it cannot run.
   */
  appleLocalProvider: (SceneProvider & AppleChat) | null;
  /** Electron `app.getPath("userData")`. */
  userData: string;
  /** `<userData>/worlds` — created on boot. */
  worldsDir: string;
  /** Immutable published cartridge revisions. */
  cartridgesDir: string;
  /** Player-owned saves pinned to an immutable cartridge revision. */
  instancesDir: string;
  /** Mutable revision/remix drafts. */
  workspacesDir: string;
  /** Reusable player identities, kept separate from cartridge-specific save state. */
  profilesDir: string;
  /** Sends an event to every open renderer window (`webContents.send`). */
  broadcast(channel: string, payload: unknown): void;
  /**
   * Registers a cleanup run once when the app quits, after its windows have closed (kill sidecars,
   * close watchers, flush outboxes). Each quit waits for it at most a few seconds (quit.ts).
   */
  onBeforeQuit(cleanup: () => Promise<void> | void): void;
}
