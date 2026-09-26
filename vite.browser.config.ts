// The browser proof (rev 6 phase 4, D7): `bun run browser:dev` serves src/browser on 5190, and
// `bun run browser:build` writes out/browser. It is served from its own origin, never a world
// service's. Imports may reach the renderer (the mobile shell, input, UI), never main.
//
// No React Fast Refresh: its preamble is an inline script, and the page's CSP allows none. JSX is
// compiled by Vite's own transform. The page's CSP allows loopback ws:/http: for a local service
// in dev only; the build keeps `connect-src 'self' https: wss:`.

import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const LOOPBACK = " ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:*";

/** Build only: the shipped CSP connects to https: and wss: services, never to loopback. */
const shippedCsp: Plugin = {
  name: "unmapped-browser-csp",
  apply: "build",
  transformIndexHtml(html) {
    if (!html.includes(LOOPBACK)) throw new Error("index.html's CSP lost its loopback sources");
    return html.replace(LOOPBACK, "");
  },
};

export default defineConfig({
  root: at("./src/browser"),
  base: "./",
  plugins: [shippedCsp],
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  resolve: {
    alias: {
      "@shared": at("./src/shared"),
      "@dsl": at("./src/dsl"),
      "@renderer": at("./src/renderer"),
    },
  },
  server: { host: "localhost", port: Number(process.env.BROWSER_PORT ?? 5190), strictPort: true },
  preview: { host: "localhost", port: Number(process.env.BROWSER_PORT ?? 5190), strictPort: true },
  build: {
    outDir: at("./out/browser"),
    emptyOutDir: true,
    target: "es2022",
  },
});
