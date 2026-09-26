// The browser proof's entry (rev 6 phase 4, D7). It installs `window.seed` — the page's own
// implementation, with `world` running the device side of the shared-world protocol here — and
// only then mounts the mobile shell, handing it the page's device (the land from a world's genesis
// pack, where the player stood), so no renderer module ever sees a page without them. A browser
// that cannot store anything still gets a `world` and a device that answer every call with that
// error (Rule 2).

import { type UiLanguage, useLanguageStore } from "@renderer/i18n";
import { MobileShell } from "@renderer/mobile/MobileShell";
import { failingDevice } from "@renderer/mobile/phoneDevice";
import { colors, cssVars, font, fontStacks } from "@renderer/ui";
import type { WorldApi } from "@shared/worldApi";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../renderer/styles.css";
import "../renderer/game.css";
import { browserSeed } from "./seed";
import { BrowserStore } from "./store";
import { failingWith } from "./unavailable";
import { browserClient } from "./worlds";

const container = document.getElementById("root");
if (container === null) throw new Error('index.html is missing <div id="root">');

const store = await BrowserStore.open();
const client = store.ok
  ? browserClient(store.value)
  : { world: failingWith<WorldApi>(store.error), device: failingDevice(store.error) };
window.seed = browserSeed(client.world);

// The offline shell (public/sw.js): the page itself loads with no network, so what IndexedDB holds
// can still be read. Without it the page still works online; the console says why it is missing.
navigator.serviceWorker?.register("./sw.js").catch((error: unknown) => {
  console.warn(`[browser] no offline shell: ${error instanceof Error ? error.message : error}`);
});

// As the desktop renderer's entry does: tokens paint the body, the UI language sets <html lang>
// and orders the CJK faces.
document.body.style.background = colors.bg;
document.body.style.color = colors.text;
document.body.style.fontFamily = font.family;
document.body.style.fontSize = `${font.size.body}px`;
for (const [name, value] of Object.entries(cssVars)) container.style.setProperty(name, value);
function applyLanguage(language: UiLanguage, root: HTMLElement): void {
  document.documentElement.lang = language;
  const stacks = fontStacks(language);
  document.body.style.fontFamily = stacks.family;
  root.style.setProperty("--ui-font", stacks.family);
  root.style.setProperty("--ui-mono", stacks.mono);
  root.style.setProperty("--ui-display", stacks.display);
}
applyLanguage(useLanguageStore.getState().language, container);
useLanguageStore.subscribe((state) => applyLanguage(state.language, container));

createRoot(container).render(
  <StrictMode>
    <MobileShell device={client.device} />
  </StrictMode>,
);
