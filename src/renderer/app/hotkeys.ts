// Global keyboard map. Pure so it can be unit-tested without a DOM: App feeds it the current
// session state plus whether the focus is inside a text field.

import type { Screen } from "@renderer/state";

export type HotkeyAction =
  | "toggle-console"
  | "close-console"
  | "close-altar"
  | "close-dialogue"
  | "exit-play"
  | null;

export interface HotkeyContext {
  screen: Screen;
  consoleOpen: boolean;
  altarOpen: boolean;
  dialogueOpen: boolean;
  /**
   * A change proposal waits for approve / reject: Escape (or a pad's B) must neither discard it by
   * leaving Play nor decide it.
   */
  proposalOpen: boolean;
  /** Focus is in an <input>/<textarea>/contenteditable — printable keys belong to it. */
  typing: boolean;
}

/** `event.code` values that toggle the developer console. */
export const CONSOLE_KEYS = ["F12", "Backquote"] as const;

export function hotkeyAction(code: string, ctx: HotkeyContext): HotkeyAction {
  if (code === "Escape") {
    if (ctx.consoleOpen) return "close-console";
    if (ctx.altarOpen) return "close-altar";
    if (ctx.dialogueOpen) return "close-dialogue";
    if (ctx.proposalOpen) return null;
    if (ctx.screen === "play") return "exit-play";
    return null;
  }
  if ((CONSOLE_KEYS as readonly string[]).includes(code)) {
    // The console lives on top of the running world only.
    if (ctx.screen !== "play") return null;
    // ` is a printable character: while typing (including in the console's own editor) it is text.
    if (ctx.typing && code === "Backquote") return null;
    return "toggle-console";
  }
  return null;
}

/** True when the key press belongs to the focused text field rather than to the app. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
