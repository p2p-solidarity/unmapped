import { IPC } from "@shared/ipc";
import type { AuthoringSnapshot, CreateAuthoringInput } from "@shared/scene-gallery";
import { z } from "zod";
import type { MainContext } from "../context";
import { handle } from "../handle";
import { createAuthoring, readAuthoring, writeAuthoring } from "./authoring";

const workspaceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,95}$/);
const createInput = z.object({ name: z.string().max(120), author: z.string().max(120) }).strict();
const snapshot = z.custom<AuthoringSnapshot>(
  (value) => typeof value === "object" && value !== null && "workspaceId" in value,
);

export function registerAuthoringIpc(ctx: MainContext): void {
  handle(IPC.workspaces.createAuthoring, z.tuple([createInput]), ([input]) =>
    createAuthoring(ctx.workspacesDir, input as CreateAuthoringInput),
  );
  handle(IPC.workspaces.readAuthoring, z.tuple([workspaceId]), ([id]) =>
    readAuthoring(ctx.workspacesDir, id),
  );
  handle(IPC.workspaces.writeAuthoring, z.tuple([snapshot]), ([value]) =>
    writeAuthoring(ctx.workspacesDir, value),
  );
}
