// The page a world runs in. Main builds it from validated files and serves it on a fresh
// `ulwork://<token>/` host, so every session is its own opaque origin and (under site isolation)
// its own process. The runtime shim below is convenience, not security: the boundary is the
// sandboxed iframe, this CSP, and the host re-validating every message it receives.

import { randomBytes } from "node:crypto";
import { type Json, WORK_LIMITS, WORK_PROTOCOL, WORK_SCHEME, type WorkText } from "@shared/works";

export function frameCsp(nonce: string): string {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "media-src data: blob:",
    "font-src data:",
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}

/**
 * Runs before main.js. Exposes `window.host`, reports errors with main.js line numbers, sends a
 * heartbeat the host uses to detect a hung world, batches saves and status lines (worlds often
 * call them every frame), and — for the draft checker —
 * replays a few keys and a click so input handlers run once before a version is accepted.
 */
const RUNTIME = `(() => {
  "use strict";
  const boot = JSON.parse(document.getElementById("ulw-boot").textContent);
  const root = document.getElementById("world");
  const clone = (value) => (value === undefined || value === null ? null : JSON.parse(JSON.stringify(value)));
  const post = (message) => {
    try { parent.postMessage(Object.assign({ ulw: ${WORK_PROTOCOL}, token: boot.token }, message), "*"); } catch (_) {}
  };
  const where = (line) =>
    line >= boot.mainStart && line <= boot.mainEnd
      ? { file: "main.js", line: line - boot.mainStart + 1 }
      : { file: "runtime", line: line > 0 ? line : null };
  addEventListener("error", (event) => {
    const at = where(event.lineno || 0);
    const text = event.error && event.error.stack ? String(event.error.stack) : String(event.message || "error");
    post({ type: "error", message: text.slice(0, 2000), file: at.file, line: at.line, column: event.colno || null });
  });
  addEventListener("unhandledrejection", (event) => {
    const reason = event.reason && event.reason.stack ? event.reason.stack : String(event.reason);
    post({ type: "error", message: ("Unhandled rejection: " + reason).slice(0, 2000), file: "runtime", line: null, column: null });
  });
  const freeze = (value) => {
    if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  };
  let state = clone(boot.state);
  let pending = null;
  let timer = null;
  let completed = false;
  const unknownAssets = new Set();
  let lastStatus = null;
  let queuedStatus = null;
  let statusTimer = null;
  const sendStatus = () => {
    statusTimer = null;
    if (queuedStatus !== null && queuedStatus !== lastStatus) {
      lastStatus = queuedStatus;
      post({ type: "status", text: queuedStatus });
    }
    queuedStatus = null;
  };
  const flush = () => { timer = null; if (pending !== null) { post({ type: "save", state: pending.value }); pending = null; } };
  const host = Object.freeze({
    root,
    carry: freeze(clone(boot.carry)),
    load: () => clone(state),
    save: (value) => {
      state = clone(value);
      pending = { value: state };
      if (timer === null) timer = setTimeout(flush, 400);
    },
    complete: (summary, carry) => {
      if (completed) return;
      completed = true;
      flush();
      if (statusTimer !== null) { clearTimeout(statusTimer); sendStatus(); }
      post({ type: "complete", summary: String(summary ?? "").slice(0, ${WORK_LIMITS.summaryChars}), carry: carry === undefined ? clone(boot.carry) : clone(carry) });
    },
    status: (text) => {
      queuedStatus = String(text ?? "").slice(0, 200);
      if (statusTimer === null) statusTimer = setTimeout(sendStatus, 250);
    },
    asset: (id) => {
      if (Object.prototype.hasOwnProperty.call(boot.assets, id)) return boot.assets[id];
      if (!unknownAssets.has(String(id))) {
        unknownAssets.add(String(id));
        post({ type: "error", message: ("host.asset(" + JSON.stringify(String(id)) + ") is neither an id in assets.json nor a library path.").slice(0, 2000), file: "runtime", line: null, column: null });
      }
      return null;
    },
  });
  Object.defineProperty(window, "host", { value: host, writable: false, configurable: false });
  setInterval(() => post({ type: "heartbeat" }), ${WORK_LIMITS.heartbeatMs});
  post({ type: "heartbeat" });
  Object.defineProperty(window, "__ulwAfterMain", {
    value: () => setTimeout(() => {
      const rendered = root.childElementCount > 0 || root.textContent.trim() !== "" || document.querySelector("canvas") !== null;
      post({ type: "ready", rendered });
    }, 60),
  });
  const KEYS = [["ArrowRight", "ArrowRight"], ["ArrowLeft", "ArrowLeft"], ["ArrowUp", "ArrowUp"], ["ArrowDown", "ArrowDown"],
    ["Space", " "], ["Enter", "Enter"], ["KeyW", "w"], ["KeyA", "a"], ["KeyS", "s"], ["KeyD", "d"]];
  const probe = () => {
    let index = 0;
    const press = () => {
      const pair = KEYS[index++];
      if (!pair) return click();
      const target = document.activeElement || document.body;
      target.dispatchEvent(new KeyboardEvent("keydown", { key: pair[1], code: pair[0], bubbles: true, cancelable: true }));
      setTimeout(() => {
        target.dispatchEvent(new KeyboardEvent("keyup", { key: pair[1], code: pair[0], bubbles: true, cancelable: true }));
        setTimeout(press, 40);
      }, 120);
    };
    const click = () => {
      const box = root.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const target = document.elementFromPoint(x, y) || root;
      for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
        const init = { bubbles: true, cancelable: true, clientX: x, clientY: y };
        target.dispatchEvent(type.startsWith("pointer") ? new PointerEvent(type, init) : new MouseEvent(type, init));
      }
      const button = root.querySelector("button");
      if (button) button.click();
      setTimeout(() => post({ type: "probed" }), 800);
    };
    press();
  };
  addEventListener("message", (event) => {
    if (event.source !== parent || !event.data || event.data.ulw !== ${WORK_PROTOCOL}) return;
    if (event.data.type === "probe") probe();
  });
})();`;

/** Text inside a <style> or <script> element must not be able to close it early. */
function guard(text: string, tag: "style" | "script"): string {
  return text.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`).replace(/<!--/g, "<\\!--");
}

export interface FramePageInput {
  token: string;
  title: string;
  text: WorkText;
  /** Asset id → data URL, or null when the image is missing. */
  assets: Record<string, string | null>;
  state: Json | null;
  carry: Json | null;
  nonce?: string;
}

export interface FramePage {
  html: string;
  csp: string;
}

export function buildFramePage(input: FramePageInput): FramePage {
  const nonce = input.nonce ?? randomBytes(16).toString("base64");
  const csp = frameCsp(nonce);
  const head = [
    "<!doctype html>",
    '<html><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    `<title>${input.title.replace(/[<>&"]/g, "")}</title>`,
    "<style>html,body{margin:0;height:100%;overflow:hidden;background:black}#world{position:fixed;inset:0;overflow:auto}</style>",
    `<style>${guard(input.text.style, "style")}</style>`,
    '</head><body><div id="world"></div>',
  ];
  const main = guard(input.text.main, "script");
  const boot = (mainStart: number) => ({
    token: input.token,
    state: input.state,
    carry: input.carry,
    assets: input.assets,
    mainStart,
    mainEnd: mainStart + main.split("\n").length - 1,
  });
  const prefix = (mainStart: number) =>
    [
      ...head,
      `<script type="application/json" id="ulw-boot">${JSON.stringify(boot(mainStart)).replace(/</g, "\\u003c")}</script>`,
      `<script nonce="${nonce}">${RUNTIME.replace(/\n/g, " ")}</script>`,
      `<script nonce="${nonce}">`,
    ].join("\n");
  // Error events report page lines; the shim maps them back to main.js. The user CSS can hold
  // newlines, so count the real prefix rather than assuming one line per element.
  const mainStart = prefix(0).split("\n").length + 1;
  const lines = [
    prefix(mainStart),
    main,
    "</script>",
    `<script nonce="${nonce}">window.__ulwAfterMain()</script>`,
    "</body></html>",
  ];
  return { html: lines.join("\n"), csp };
}

interface FrameSession {
  page: FramePage;
  /** OS pid of the frame's renderer, recorded when it navigates; used only to stop a hung world. */
  pid: number | null;
  createdAt: number;
}

const MAX_SESSIONS = 32;

/** Pages waiting to be served, keyed by the host part of their `ulwork://` URL. */
export class FrameSessions {
  private readonly sessions = new Map<string, FrameSession>();

  /** The page embeds its own token, so the caller builds it once the token exists. */
  create(build: (token: string) => FramePage): { token: string; url: string } {
    const token = `w${randomBytes(16).toString("hex")}`;
    if (this.sessions.size >= MAX_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (oldest !== undefined) this.sessions.delete(oldest);
    }
    this.sessions.set(token, { page: build(token), pid: null, createdAt: Date.now() });
    return { token, url: `${WORK_SCHEME}://${token}/` };
  }

  page(token: string): FramePage | null {
    return this.sessions.get(token)?.page ?? null;
  }

  recordPid(token: string, pid: number): void {
    const session = this.sessions.get(token);
    if (session !== undefined) session.pid = pid;
  }

  pid(token: string): number | null {
    return this.sessions.get(token)?.pid ?? null;
  }

  close(token: string): void {
    this.sessions.delete(token);
  }
}
