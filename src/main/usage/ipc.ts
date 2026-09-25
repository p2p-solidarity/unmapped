// Usage over IPC: the renderer reads a world's total and links a Create draft into the world built
// from it. Recording is main's alone (`recordUsage`), called where each provider call settles, so
// the renderer can never write a line it did not spend.

import { IPC } from "@shared/ipc";
import { ok } from "@shared/result";
import {
  type UsageOutcome,
  type UsageRecord,
  type UsageTag,
  usageScopeSchema,
} from "@shared/usage";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { appendUsage, readUsageSummary } from "./store";

export interface SettledCall {
  tag: UsageTag;
  provider: string;
  model: string;
  input: number | null;
  output: number | null;
  cached: number | null;
  ms: number;
  outcome: UsageOutcome;
}

/** Appends one call and tells every window, so an open usage view updates without polling. */
export async function recordUsage(ctx: MainContext, call: SettledCall): Promise<void> {
  const record: UsageRecord = {
    v: 1,
    at: new Date().toISOString(),
    purpose: call.tag.purpose,
    scope: call.tag.scope,
    provider: call.provider.slice(0, 40),
    model: call.model.slice(0, 200),
    input: call.input,
    output: call.output,
    cached: call.cached,
    ms: Math.max(0, Math.round(call.ms)),
    outcome: call.outcome,
  };
  const written = await appendUsage(ctx.userData, record);
  if (written.ok) ctx.broadcast(IPC.usage.changed, record);
}

export function registerUsageIpc(ctx: MainContext): void {
  handle(IPC.usage.summary, z.tuple([usageScopeSchema]), ([scope]) =>
    readUsageSummary(ctx.userData, scope),
  );
  handle(IPC.usage.link, z.tuple([usageScopeSchema, usageScopeSchema]), async ([from, to]) => {
    const written = await appendUsage(ctx.userData, {
      v: 1,
      at: new Date().toISOString(),
      link: { from, to },
    });
    return written.ok ? ok(undefined) : written;
  });
}
