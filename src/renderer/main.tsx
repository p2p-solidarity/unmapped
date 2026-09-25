import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { SandboxApp } from "./engine/SandboxApp";
import "./game.css";
import "./styles.css";
import { colors, cssVars, font } from "./ui";

const container = document.getElementById("root");
if (container === null) throw new Error('index.html is missing <div id="root">');

// The reset owns layout; the palette comes from tokens (Rule 3: no colour literals outside them).
document.body.style.background = colors.bg;
document.body.style.color = colors.text;
document.body.style.fontFamily = font.family;
document.body.style.fontSize = `${font.size.body}px`;
for (const [name, value] of Object.entries(cssVars)) container.style.setProperty(name, value);

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
