import { join } from "node:path";

const WORKSPACE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;

export function isWorkspaceId(value: string): boolean {
  return WORKSPACE_ID.test(value);
}

export function workspaceDir(workspacesDir: string, workspaceId: string): string {
  return join(workspacesDir, workspaceId);
}

export function workspaceScenePath(dir: string, sceneId: string): string {
  return join(dir, "scenes", `${sceneId}.oui`);
}
