// Menus by focus: the pad moves DOM focus among the visible, enabled, focusable elements of the
// top-most layer, clicks the focused one, and sends Escape through the app's existing Escape paths.
//
// A layer is anything drawn over the page that owns the controls while it is open — the dialogue
// card, the chapter / door / notes panels, the tweak panel, the console, a change proposal, Play's
// overlay cards, an otherworld. It marks its root with `data-layer` (or role="dialog"); the one with
// the highest stacking level (then the latest in the document) is on top. With none open, the page
// itself is the scope. Elements marked `data-nav-skip` (the shell's hint row, which only repeats
// what B / A do) are never focused by the pad. A focused frame (an otherworld's sandboxed player)
// reads the pad itself: the poller then leaves it alone except for Start (`frameFocused`).

import { type Box, type Direction, nextInDirection } from "./spatial";

const LAYERS = "[data-layer], [role='dialog'], dialog[open]";
const FOCUSABLE =
  "button, a[href], input:not([type='hidden']), select, textarea, summary, iframe, [tabindex], [contenteditable='true']";

function visible(element: HTMLElement): boolean {
  if (element.getClientRects().length === 0) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  return getComputedStyle(element).visibility !== "hidden";
}

/** The z-index of the outermost positioned ancestor that sets one: that is what stacks layers. */
function stackLevel(element: HTMLElement): number {
  let level = 0;
  for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) {
    const z = Number.parseInt(getComputedStyle(node).zIndex, 10);
    if (!Number.isNaN(z)) level = z;
  }
  return level;
}

/** The open layer on top, or null when only the page is showing. */
export function topLayer(): HTMLElement | null {
  const layers = [...document.querySelectorAll<HTMLElement>(LAYERS)].filter(visible);
  if (layers.length <= 1) return layers[0] ?? null;
  let top = layers[0] as HTMLElement;
  let topLevel = stackLevel(top);
  for (const layer of layers.slice(1)) {
    const level = stackLevel(layer);
    // querySelectorAll is in document order, so an equal level later in the page is on top.
    if (level >= topLevel) {
      top = layer;
      topLevel = level;
    }
  }
  return top;
}

export function focusScope(): HTMLElement {
  return topLayer() ?? document.body;
}

function focusable(element: HTMLElement): boolean {
  if (element.matches(":disabled")) return false;
  if (element.getAttribute("tabindex") === "-1") return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  if (element.closest("[data-nav-skip], [inert], [aria-hidden='true']") !== null) return false;
  return visible(element);
}

export function focusables(scope: HTMLElement): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(focusable);
}

/** The focused element when it is one the pad may use in this scope, else null. */
function focusedIn(scope: HTMLElement): HTMLElement | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || active === scope || !scope.contains(active)) return null;
  return focusable(active) ? active : null;
}

/** Room left around a revealed element inside its scrolling list (px). */
const REVEAL_MARGIN = 8;

/**
 * Scrolls every scrolling list (overflow auto / scroll) around the element just enough to show it.
 * Not scrollIntoView: that also scrolls `overflow: hidden` frames (the stage, Play's root), which
 * would slide a whole screen out of place.
 */
function reveal(element: HTMLElement): void {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const style = getComputedStyle(node);
    const scrollsY = /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    const scrollsX = /auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth;
    if (!scrollsY && !scrollsX) continue;
    const box = node.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (scrollsY && rect.top < box.top) node.scrollTop -= box.top - rect.top + REVEAL_MARGIN;
    else if (scrollsY && rect.bottom > box.bottom) {
      node.scrollTop += rect.bottom - box.bottom + REVEAL_MARGIN;
    }
    if (scrollsX && rect.left < box.left) node.scrollLeft -= box.left - rect.left + REVEAL_MARGIN;
    else if (scrollsX && rect.right > box.right) {
      node.scrollLeft += rect.right - box.right + REVEAL_MARGIN;
    }
  }
}

function focus(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  reveal(element);
}

/**
 * Focuses where a pad user starts in this scope when nothing in it has focus yet: an element marked
 * `data-autofocus` or with the class `g-autofocus` (the library's AUTOFOCUS, for a Button, which
 * takes no data attributes), else the selected row (`data-active="true"`, a menu's cursor), else
 * the first control that is not a text field, else the first. Returns whether something in the
 * scope now has focus.
 */
export function ensureFocus(scope: HTMLElement): boolean {
  if (focusedIn(scope) !== null) return true;
  const all = focusables(scope);
  // A pad cannot type, so it starts on a control rather than a text field (it can still move there).
  const start =
    all.find((element) => element.matches("[data-autofocus], .g-autofocus")) ??
    all.find((element) => element.dataset.active === "true") ??
    all.find((element) => !element.matches("input, textarea, [contenteditable='true']")) ??
    all[0];
  if (start === undefined) return false;
  focus(start);
  return true;
}

const toBox = (rect: DOMRect): Box => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
});

/** Moves focus one step in a direction within the top-most layer; the first step only lands. */
export function moveFocus(direction: Direction): void {
  const scope = focusScope();
  const current = focusedIn(scope);
  if (current === null) {
    ensureFocus(scope);
    return;
  }
  const others = focusables(scope).filter((element) => element !== current);
  const index = nextInDirection(
    toBox(current.getBoundingClientRect()),
    others.map((element) => toBox(element.getBoundingClientRect())),
    direction,
  );
  const next = others[index];
  if (next !== undefined) focus(next);
}

/** True while a frame has focus: its own page reads the pad, so only Start stays with the app. */
export function frameFocused(): boolean {
  return document.activeElement instanceof HTMLIFrameElement;
}

/** A presses the focused element; with nothing focused yet it only lands focus (never a blind click). */
export function clickFocused(): void {
  const scope = focusScope();
  const current = focusedIn(scope);
  if (current === null) {
    ensureFocus(scope);
    return;
  }
  current.click();
}

/**
 * B and Start: an Escape key-down and key-up from the focused element, so the app's own Escape
 * paths (App's global keys, a screen's shell keys, a panel's own handler) decide what it closes.
 * Synthetic events are untrusted, so they never switch the hints back to the keyboard.
 */
export function pressEscape(): void {
  const target = document.activeElement ?? document.body;
  for (const type of ["keydown", "keyup"] as const) {
    target.dispatchEvent(
      new KeyboardEvent(type, { key: "Escape", code: "Escape", bubbles: true, cancelable: true }),
    );
  }
}
