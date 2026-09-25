// Small file primitives the history store is built from: atomic replace (temp file + rename, so a
// crash leaves the old file or the new one, never half), existence, JSON reads that tell "absent"
// from "damaged", and one queue per key so read-modify-write never interleaves.

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { err, ok, type Result } from "@shared/result";
import type { z } from "zod";

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Replaces `path` with `text` atomically. */
export async function writeTextAtomic(path: string, text: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const staged = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(staged, text);
    await rename(staged, path);
  } catch (error) {
    await rm(staged, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  return writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** The file's text, or null when it does not exist (any other read error throws). */
export async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") return null;
    throw error;
  }
}

/** A JSON file checked by `schema`: null when absent, `code` when unreadable or invalid. */
export async function readJsonFile<T>(
  path: string,
  schema: z.ZodType<T>,
  code: string,
  hint: string,
): Promise<Result<T | null>> {
  let text: string | null;
  try {
    text = await readTextOrNull(path);
  } catch (error) {
    return err(code, `${path} cannot be read: ${(error as Error).message}`, hint);
  }
  if (text === null) return ok(null);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return err(code, `${path} is not JSON.`, hint);
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return ok(parsed.data);
  const issue = parsed.error.issues[0];
  return err(code, `${path} ${issue?.path.join(".") || ""}: ${issue?.message ?? "invalid"}`, hint);
}

/** Non-empty lines of a JSONL text. */
export function jsonlLines(text: string): string[] {
  return text.split("\n").filter((line) => line.trim().length > 0);
}

export function jsonl(values: readonly unknown[]): string {
  return values.length === 0 ? "" : `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
}

const queues = new Map<string, Promise<unknown>>();

/** One task per key at a time, in call order; a failed task does not block the next. */
export function locked<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(run, run);
  const settled = next.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return next;
}
