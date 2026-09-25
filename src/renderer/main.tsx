import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { SandboxApp } from "./engine/SandboxApp";
import "./game.css";
import "./styles.css";
import { type UiLanguage, useLanguageStore } from "./i18n";
import { colors, cssVars, font, fontStacks } from "./ui";

const container = document.getElementById("root");
if (container === null) throw new Error('index.html is missing <div id="root">');

// The reset owns layout; the palette comes from tokens (Rule 3: no colour literals outside them).
document.body.style.background = colors.bg;
document.body.style.color = colors.text;
document.body.style.fontFamily = font.family;
document.body.style.fontSize = `${font.size.body}px`;
for (const [name, value] of Object.entries(cssVars)) container.style.setProperty(name, value);

// The UI language sets <html lang> (so the OS picks matching CJK glyphs for anything unlisted) and
// reorders the type stacks' CJK faces; it follows the language picker without a reload.
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
    {window.parent !== window &&
    new URLSearchParams(window.location.search).get("sandbox") === "1" ? (
      <SandboxApp />
    ) : (
      <App />
    )}
  </StrictMode>,
);
