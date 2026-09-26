// Requests belong to the page that asked (src/main/inference/pageRequests.ts). Isolated because E2E
// reaches one reload at a time, not a crash, a closed window, a hash change or a world's frame
// navigating. Written as the failure list first (Rule 0); each test names the one it guards:
//
//   1. A page reloads or navigates away and its chat or picture keeps running: the gateway hold is
//      held for nobody until the upstream gives up (p4-quota: `39cd3cde`, 16,974 credits, 12 s).
//   2. A renderer crash or a closed window does the same.
//   3. A same-document navigation (a hash change, pushState) or a subframe navigating (a world's
//      sandboxed frame) aborts the page's running requests.
//   4. One page going away aborts another page's requests, or a request that already ended is
//      aborted later (it stayed tracked after its release).
//   5. A request that arrives from a page already destroyed keeps running for nobody.

import { EventEmitter } from "node:events";
import { PageRequests, type RequestPage } from "@main/inference/pageRequests";
import { describe, expect, it } from "vitest";

class FakePage extends EventEmitter implements RequestPage {
  destroyed = false;
  constructor(readonly id: number) {
    super();
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  navigate(details: { isMainFrame: boolean; isSameDocument: boolean }): void {
    this.emit("did-start-navigation", details);
  }
  close(): void {
    this.destroyed = true;
    this.emit("destroyed");
  }
}

const RELOAD = { isMainFrame: true, isSameDocument: false };

function setup() {
  const lines: string[] = [];
  const pages = new PageRequests((line) => lines.push(line));
  return { pages, lines };
}

describe("a page that goes away aborts what it asked for", () => {
  it("aborts every running request on a reload, and logs why (1)", () => {
    const { pages, lines } = setup();
    const page = new FakePage(1);
    const chat = new AbortController();
    const picture = new AbortController();
    pages.track(page, chat, "[inference] abort chat-1");
    pages.track(page, picture, "[look] abort look-1");
    page.navigate(RELOAD);
    expect(chat.signal.aborted).toBe(true);
    expect(picture.signal.aborted).toBe(true);
    expect(lines).toEqual([
      "[inference] abort chat-1 · page navigated",
      "[look] abort look-1 · page navigated",
    ]);
    expect(pages.count(1)).toBe(0);
    // The reloaded page starts clean: its new request is its own and still runs.
    const next = new AbortController();
    pages.track(page, next, "[inference] abort chat-2");
    expect(next.signal.aborted).toBe(false);
    expect(page.listenerCount("did-start-navigation")).toBe(1);
  });

  it("aborts on a crash and on a closed window (2)", () => {
    const { pages, lines } = setup();
    const crashed = new FakePage(1);
    const closed = new FakePage(2);
    const a = new AbortController();
    const b = new AbortController();
    pages.track(crashed, a, "[inference] abort a");
    pages.track(closed, b, "[image] abort b");
    crashed.emit("render-process-gone");
    closed.close();
    expect(a.signal.aborted && b.signal.aborted).toBe(true);
    expect(lines).toEqual(["[inference] abort a · page crashed", "[image] abort b · page closed"]);
  });

  it("keeps requests through a same-document or a subframe navigation (3)", () => {
    const { pages } = setup();
    const page = new FakePage(1);
    const chat = new AbortController();
    pages.track(page, chat, "[inference] abort c");
    page.navigate({ isMainFrame: true, isSameDocument: true });
    page.navigate({ isMainFrame: false, isSameDocument: false });
    expect(chat.signal.aborted).toBe(false);
    expect(pages.count(1)).toBe(1);
  });

  it("touches only the page that went, and never a request that already ended (4)", () => {
    const { pages, lines } = setup();
    const one = new FakePage(1);
    const two = new FakePage(2);
    const mine = new AbortController();
    const theirs = new AbortController();
    const ended = new AbortController();
    pages.track(one, mine, "[inference] abort mine");
    pages.track(two, theirs, "[inference] abort theirs");
    const release = pages.track(one, ended, "[inference] abort ended");
    release();
    one.navigate(RELOAD);
    expect(mine.signal.aborted).toBe(true);
    expect(theirs.signal.aborted).toBe(false);
    expect(ended.signal.aborted).toBe(false);
    expect(lines).toEqual(["[inference] abort mine · page navigated"]);
    expect(pages.count(2)).toBe(1);
  });

  it("aborts at once a request from a page already destroyed (5)", () => {
    const { pages, lines } = setup();
    const page = new FakePage(1);
    page.destroyed = true;
    const late = new AbortController();
    pages.track(page, late, "[look] abort late");
    expect(late.signal.aborted).toBe(true);
    expect(lines).toEqual(["[look] abort late · page closed"]);
    expect(pages.count(1)).toBe(0);
  });
});
