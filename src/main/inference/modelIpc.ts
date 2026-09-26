// The channels behind Settings → Model: write-only API keys and what can run a model on this
// computer. A key goes in through `setApiKey` and never comes back out — the renderer only ever
// sees a KeyStatus. Every payload is zod-checked (`keys.ts`); nothing here logs a key.

import { extname, isAbsolute } from "node:path";
import type { MainContext } from "@main/context";
import { IPC } from "@shared/ipc";
import { type KeyStatusMap, type LocalDetection, TYPED_KEY_PROVIDERS } from "@shared/llm";
import { ok, type Result } from "@shared/result";
import { app, dialog } from "electron";
import { z } from "zod";
import { handle } from "../handle";
import { clearKeyRecord, keyStatusMap, writeKeyRecord } from "./keyStore";
import { parseSetApiKey } from "./keys";
import { detectLocal } from "./local";

const noArgs = z.tuple([]);

/**
 * A native open panel cannot be driven over CDP, so an E2E run of the unpackaged app on a
 * throwaway userData (AETHER_TEST_USER_DATA, the same guard as backups and `.world` files) may set
 * AETHER_TEST_MODEL_PATH to an absolute `.gguf` path: "Choose a GGUF model…" then answers with it.
 */
function scriptedModelPath(): string | null {
  if (app.isPackaged || !process.env.AETHER_TEST_USER_DATA) return null;
  const path = process.env.AETHER_TEST_MODEL_PATH;
  return path !== undefined && isAbsolute(path) && extname(path).toLowerCase() === ".gguf"
    ? path
    : null;
}

export function registerModelIpc(ctx: MainContext): void {
  handle(IPC.inference.keyStatus, noArgs, async (): Promise<Result<KeyStatusMap>> => {
    return ok(await keyStatusMap());
  });

  handle(
    IPC.inference.setApiKey,
    z.tuple([z.unknown()]),
    async ([raw]): Promise<Result<KeyStatusMap>> => {
      const record = parseSetApiKey(raw);
      if (!record.ok) return record;
      const written = await writeKeyRecord(record.value);
      if (!written.ok) return written;
      return ok(await keyStatusMap());
    },
  );

  handle(
    IPC.inference.clearApiKey,
    // The account token is cleared by signing out (Settings → Account), never from here.
    z.tuple([z.enum(TYPED_KEY_PROVIDERS)]),
    async ([provider]): Promise<Result<KeyStatusMap>> => {
      const cleared = await clearKeyRecord(provider);
      if (!cleared.ok) return cleared;
      return ok(await keyStatusMap());
    },
  );

  handle(IPC.inference.detectLocal, noArgs, async (): Promise<Result<LocalDetection>> => {
    return ok(await detectLocal(ctx.appleLocalProvider));
  });

  // Only the path crosses back: a multi-gigabyte model is never read here.
  handle(IPC.inference.pickModelFile, noArgs, async (): Promise<Result<string | null>> => {
    const scripted = scriptedModelPath();
    if (scripted !== null) return ok(scripted);
    const chosen = await dialog.showOpenDialog({
      title: "Choose a .gguf model",
      properties: ["openFile"],
      filters: [{ name: "GGUF model", extensions: ["gguf"] }],
    });
    const path = chosen.filePaths[0];
    return ok(chosen.canceled || path === undefined ? null : path);
  });
}
