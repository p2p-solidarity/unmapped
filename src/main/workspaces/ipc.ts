import { IPC } from "@shared/ipc";
import { z } from "zod";
import { readCartridgeRevision } from "../cartridges/store";
import type { MainContext } from "../context";
import { handle } from "../handle";
import {
  createWorkspaceFromRevision,
  listWorkspaces,
  publishWorkspace,
  readWorkspace,
  writeWorkspaceRules,
  writeWorkspaceScene,
} from "./store";

const workspaceIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/);
const cartridgeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
const sceneIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
const versionSchema = z.string().min(1).max(128);
const createWorkspaceSchema = z
  .object({
    sourceCartridgeId: cartridgeIdSchema,
    sourceVersion: versionSchema,
    mode: z.enum(["revision", "remix"]),
    targetCartridgeId: cartridgeIdSchema,
    name: z.string().trim().min(1).max(120),
    author: z.string().trim().min(1).max(120),
  })
  .strict();
const writeSceneSchema = z
  .object({
    workspaceId: workspaceIdSchema,
    sceneId: sceneIdSchema,
    source: z.string().max(4 * 1024 * 1024),
  })
  .strict();
const writeRulesSchema = z
  .object({ workspaceId: workspaceIdSchema, source: z.string().max(4 * 1024 * 1024) })
  .strict();
const publishSchema = z.object({ workspaceId: workspaceIdSchema, version: versionSchema }).strict();

export function registerWorkspacesIpc(ctx: MainContext): void {
  handle(IPC.workspaces.list, z.tuple([]), () => listWorkspaces(ctx.workspacesDir));
  handle(IPC.workspaces.read, z.tuple([workspaceIdSchema]), ([workspaceId]) =>
    readWorkspace(ctx.workspacesDir, workspaceId),
  );
  handle(IPC.workspaces.create, z.tuple([createWorkspaceSchema]), async ([input]) => {
    const source = await readCartridgeRevision(
      ctx.cartridgesDir,
      input.sourceCartridgeId,
      input.sourceVersion,
    );
    if (!source.ok) return source;
    return createWorkspaceFromRevision(ctx.workspacesDir, source.value, {
      mode: input.mode,
      targetCartridgeId: input.targetCartridgeId,
      name: input.name,
      author: input.author,
    });
  });
  handle(IPC.workspaces.writeScene, z.tuple([writeSceneSchema]), ([input]) =>
    writeWorkspaceScene(ctx.workspacesDir, input.workspaceId, input.sceneId, input.source),
  );
  handle(IPC.workspaces.writeRules, z.tuple([writeRulesSchema]), ([input]) =>
    writeWorkspaceRules(ctx.workspacesDir, input.workspaceId, input.source),
  );
  handle(IPC.workspaces.publish, z.tuple([publishSchema]), ([input]) =>
    publishWorkspace(ctx.workspacesDir, ctx.cartridgesDir, input.workspaceId, input.version),
  );
}
