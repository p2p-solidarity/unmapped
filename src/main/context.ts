// Dependency bag handed to every IPC module in main. Keeps modules free of direct BrowserWindow
// references so they can be unit-tested with a fake context.

export interface MainContext {
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
  /** Registers cleanup run on `before-quit` (kill sidecars, close watchers). */
  onBeforeQuit(cleanup: () => Promise<void> | void): void;
}
