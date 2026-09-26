// Model and picture requests belong to the page that asked for them (rev 6 phase 4 fix). A page
// that reloads, navigates away, crashes or closes can never read the answer, so every request it
// still has running is aborted then: a gateway hold is released (`release … abort`), a local server
// stops writing, and nothing streams on for nobody until the upstream gives up. Every provider,
// hosted or not: the chat, Apple scene, Create look and AI-world picture handlers track here.
//
// A page is its WebContents, known from the IPC event that started the request; a same-document
// navigation (a hash change, pushState) keeps the page, and subframe navigations (a world's
// sandboxed frame) are not the page's own. Electron-free (a structural page type), so the rules
// run in vitest.

/** What an aborted page means for the log. */
export type PageGone = "navigated" | "crashed" | "closed";

/** The part of Electron's `WebContents` this needs. */
export interface RequestPage {
  readonly id: number;
  isDestroyed(): boolean;
  on(
    event: "did-start-navigation",
    listener: (details: { isMainFrame: boolean; isSameDocument: boolean }) => void,
  ): unknown;
  on(event: "render-process-gone", listener: () => void): unknown;
  once(event: "destroyed", listener: () => void): unknown;
}

export class PageRequests {
  /** Page id → its running requests, each with the log label its abort line starts with. */
  private readonly running = new Map<number, Map<AbortController, string>>();
  private readonly watched = new Set<number>();

  constructor(private readonly log: (line: string) => void = () => {}) {}

  /**
   * Ties `controller` to `page` until the returned function is called (when the request ends). A
   * page already gone aborts it at once.
   */
  track(page: RequestPage, controller: AbortController, label: string): () => void {
    if (page.isDestroyed()) {
      this.abort(controller, label, "closed");
      return () => {};
    }
    this.watch(page);
    const id = page.id;
    const mine = this.running.get(id) ?? new Map<AbortController, string>();
    mine.set(controller, label);
    this.running.set(id, mine);
    return () => {
      const now = this.running.get(id);
      if (now === undefined) return;
      now.delete(controller);
      if (now.size === 0) this.running.delete(id);
    };
  }

  /** How many requests `page` has running (the log and the tests read it). */
  count(pageId: number): number {
    return this.running.get(pageId)?.size ?? 0;
  }

  private watch(page: RequestPage): void {
    const id = page.id;
    if (this.watched.has(id)) return;
    this.watched.add(id);
    page.on("did-start-navigation", (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.gone(id, "navigated");
    });
    page.on("render-process-gone", () => this.gone(id, "crashed"));
    page.once("destroyed", () => {
      this.gone(id, "closed");
      this.watched.delete(id);
    });
  }

  private gone(pageId: number, why: PageGone): void {
    const mine = this.running.get(pageId);
    if (mine === undefined) return;
    this.running.delete(pageId);
    for (const [controller, label] of mine) this.abort(controller, label, why);
  }

  private abort(controller: AbortController, label: string, why: PageGone): void {
    if (controller.signal.aborted) return;
    this.log(`${label} · page ${why}`);
    controller.abort();
  }
}

/** Main's one tracker; abort lines go to stdout beside the `[inference]` / `[look]` lines. */
export const pageRequests = new PageRequests((line) => process.stdout.write(`${line}\n`));
