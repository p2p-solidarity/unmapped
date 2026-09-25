// `vault:get-key`. The renderer only ever sees the base64 key; the encrypted blob stays in
// userData and the OS keychain holds the wrapping secret.

import { IPC } from "@shared/ipc";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { getOrCreateKey } from "./store";
import { readWrappingRecords, upsertWrappingRecord, wrappingRecordSchema } from "./wrapping";

export function registerVaultIpc(ctx: MainContext): void {
  handle(IPC.vault.getKey, z.tuple([]), () => getOrCreateKey(ctx.userData));
  handle(IPC.vault.getWrappingRecords, z.tuple([]), () => readWrappingRecords(ctx.userData));
  handle(IPC.vault.putWrappingRecord, z.tuple([wrappingRecordSchema]), ([record]) =>
    upsertWrappingRecord(ctx.userData, record),
  );
}
