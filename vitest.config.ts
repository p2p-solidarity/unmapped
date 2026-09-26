import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "src/shared"),
      "@dsl": resolve(__dirname, "src/dsl"),
      "@harness": resolve(__dirname, "src/harness"),
      "@main": resolve(__dirname, "src/main"),
      "@renderer": resolve(__dirname, "src/renderer"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Several sessions share this machine and run Electron beside the suite; the property and
    // crypto tests take seconds there, so the default 5 s times them out while they pass alone.
    testTimeout: 20_000,
  },
});
