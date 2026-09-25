import { join } from "node:path";

const INSTANCE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const SAVE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isInstanceId(value: string): boolean {
  return INSTANCE_ID.test(value);
}

export function isSaveId(value: string): boolean {
  return SAVE_ID.test(value);
}

export function instanceDir(instancesDir: string, instanceId: string): string {
  return join(instancesDir, instanceId);
}

export function saveDir(instancesDir: string, instanceId: string, saveId: string): string {
  return join(instanceDir(instancesDir, instanceId), "saves", saveId);
}
