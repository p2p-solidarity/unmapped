import { EventEmitter } from "node:events";
import {
  createManagedAppleLocalSceneProvider,
  resolveAppleLocalHelperPath,
} from "@main/inference/appleLocalHelper";
import type { NativeBridgeProcess } from "@main/inference/nativeTransport";
import { describe, expect, it, vi } from "vitest";

function fakeProcess() {
  const stdout = new EventEmitter();
  const process = Object.assign(new EventEmitter(), {
    stdin: { write: () => true },
    stdout,
    stderr: new EventEmitter(),
    exitCode: null as number | null,
    kill: vi.fn(() => true),
  }) as unknown as NativeBridgeProcess & EventEmitter;
  return { process, stdout };
}

describe("Apple local helper lifecycle", () => {
  it("resolves development and packaged helper locations", () => {
    expect(
      resolveAppleLocalHelperPath({
        isPackaged: false,
        appPath: "/repo",
        resourcesPath: "/App/Contents/Resources",
      }),
    ).toBe("/repo/native/afm-bridge/.build/debug/afm-bridge");
    expect(
      resolveAppleLocalHelperPath({
        isPackaged: true,
        appPath: "/App/Contents/Resources/app.asar",
        resourcesPath: "/App/Contents/Resources",
      }),
    ).toBe("/App/Contents/Resources/afm-bridge");
  });

  it("keeps one lazy helper and closes it through the app lifecycle", async () => {
    const child = fakeProcess();
    const spawnHelper = vi.fn(() => child.process);
    let cleanup: (() => Promise<void> | void) | undefined;
    const provider = createManagedAppleLocalSceneProvider({
      helperPath: "/repo/afm-bridge",
      spawnHelper,
      onBeforeQuit: (handler) => {
        cleanup = handler;
      },
    });

    expect(spawnHelper).not.toHaveBeenCalled();
    const capability = provider.capabilities();
    expect(spawnHelper).toHaveBeenCalledTimes(1);
    child.stdout.emit(
      "data",
      '{"v":1,"requestId":"apple-local-capabilities-1","seq":1,"type":"accepted"}\n',
    );
    child.stdout.emit(
      "data",
      '{"v":1,"requestId":"apple-local-capabilities-1","seq":2,"type":"error","error":{"code":"bridge.unavailable","message":"disabled","hint":"enable it"}}\n',
    );
    await expect(capability).resolves.toMatchObject({
      ok: false,
      error: { code: "bridge.unavailable" },
    });

    await cleanup?.();
    expect(child.process.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
