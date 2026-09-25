import { describe, expect, it } from "vitest";
import config, { PRELOAD_EXTERNALS } from "../../electron.vite.config";

describe("electron-vite preload config", () => {
  it("keeps Electron as a runtime external in the sandboxed preload", () => {
    expect(PRELOAD_EXTERNALS).toContain("electron");
    expect(config.preload?.build?.rollupOptions?.external).toContain("electron");
  });
});
