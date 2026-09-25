// Helper discovery and ownership for the Apple local provider. Process spawning stays in main;
// tests and the provider itself depend only on the narrow NativeBridgeProcess contract.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { AppleLocalSceneProvider } from "./appleLocalProvider";
import {
  createNativeTransport,
  type NativeBridgeProcess,
  type SpawnNative,
} from "./nativeTransport";

export interface AppleLocalHelperLocation {
  isPackaged: boolean;
  appPath: string;
  resourcesPath: string;
}

export interface ManagedAppleLocalProviderOptions {
  helperPath: string;
  timeoutMs?: number;
  spawnHelper?: SpawnNative;
  log?: (message: string) => void;
  onBeforeQuit?: (cleanup: () => Promise<void> | void) => void;
}

export function resolveAppleLocalHelperPath(location: AppleLocalHelperLocation): string {
  return location.isPackaged
    ? join(location.resourcesPath, "afm-bridge")
    : join(location.appPath, "native", "afm-bridge", ".build", "debug", "afm-bridge");
}

function spawnBridge(helperPath: string, log: (message: string) => void): NativeBridgeProcess {
  const child = spawn(helperPath, [], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stderr.on("data", (chunk: string | Buffer) => {
    const message = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    for (const line of message.split("\n")) {
      if (line.trim().length > 0) log(line);
    }
  });
  return child;
}

export function createManagedAppleLocalSceneProvider(
  options: ManagedAppleLocalProviderOptions,
): AppleLocalSceneProvider {
  const log = options.log ?? ((message) => process.stderr.write(`[apple-local] ${message}\n`));
  const spawnHelper = options.spawnHelper ?? (() => spawnBridge(options.helperPath, log));
  const provider = new AppleLocalSceneProvider(
    createNativeTransport(spawnHelper),
    options.timeoutMs,
  );
  options.onBeforeQuit?.(async () => {
    const closed = await provider.close();
    if (!closed.ok) log(`${closed.error.code}: ${closed.error.message}`);
  });
  return provider;
}
