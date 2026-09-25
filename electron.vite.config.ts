import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import type { Plugin } from "vite";

const shared = resolve(__dirname, "src/shared");
const dsl = resolve(__dirname, "src/dsl");
const harness = resolve(__dirname, "src/harness");

// `electron` is a devDependency, so externalizeDepsPlugin does not keep it out of the
// sandboxed preload bundle. It must remain a runtime Electron module, not the executable-path
// package that Node can import during a build.
export const PRELOAD_EXTERNALS = ["electron"];

/**
 * Dev only: the renderer's <meta> CSP has no 'unsafe-inline', which blocks the inline
 * react-refresh preamble Vite injects. The main process still applies a header CSP in dev.
 */
const stripMetaCspInDev: Plugin = {
  name: "aether-strip-meta-csp",
  apply: "serve",
  transformIndexHtml(html) {
    return html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>\s*/i, "");
  },
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": shared,
        "@dsl": dsl,
        "@harness": harness,
        "@main": resolve(__dirname, "src/main"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { "@shared": shared } },
    // Sandboxed renderers refuse ESM preloads; package.json is "type": "module", so force CJS.
    build: {
      rollupOptions: {
        external: PRELOAD_EXTERNALS,
        output: { format: "cjs", entryFileNames: "[name].js" },
      },
    },
  },
  renderer: {
    plugins: [react(), stripMetaCspInDev],
    resolve: {
      alias: {
        "@shared": shared,
        "@dsl": dsl,
        "@harness": harness,
        "@renderer": resolve(__dirname, "src/renderer"),
      },
    },
  },
});
