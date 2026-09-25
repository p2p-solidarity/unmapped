// The channels behind System → Model: write-only API keys and what can run a model on this
// computer. A key goes in through `setApiKey` and never comes back out — the renderer only ever
// sees a KeyStatus. Every payload is zod-checked (`keys.ts`); nothing here logs a key.

import type { MainContext } from "@main/context";
import { IPC } from "@shared/ipc";
import { KEY_PROVIDERS, type KeyStatusMap, type LocalDetection } from "@shared/llm";
import { ok, type Result } from "@shared/result";
import { dialog } from "electron";
import { z } from "zod";
import { handle } from "../handle";
import { clearKeyRecord, keyStatusMap, writeKeyRecord } from "./keyStore";
import { parseSetApiKey } from "./keys";
import { detectLocal } from "./local";

const noArgs = z.tuple([]);

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
    z.tuple([z.enum(KEY_PROVIDERS)]),
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
    const chosen = await dialog.showOpenDialog({
      title: "Choose a .gguf model",
      properties: ["openFile"],
      filters: [{ name: "GGUF model", extensions: ["gguf"] }],
    });
    const path = chosen.filePaths[0];
    return ok(chosen.canceled || path === undefined ? null : path);
  });
}
