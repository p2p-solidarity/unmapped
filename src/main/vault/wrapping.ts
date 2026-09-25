import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DataKeyWrappingRecord } from "@shared/identity";
import { err, fail, ok, type Result, toError } from "@shared/result";
import { z } from "zod";

const FILE = "data-key-wrappings.json";
const base64Bytes = (bytes: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .refine((value) => Buffer.from(value, "base64").byteLength === bytes, {
      message: `must encode exactly ${bytes} bytes`,
    });
export const wrappingRecordSchema: z.ZodType<DataKeyWrappingRecord> = z
  .object({
    formatVersion: z.literal(1),
    id: z.string().min(1).max(1024),
    method: z.enum(["prf", "keychain"]),
    credentialId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,1024}$/)
      .nullable(),
    iv: base64Bytes(12),
    wrappedKey: base64Bytes(48),
    createdAt: z.iso.datetime(),
  })
  .strict();
export const wrappingRecordsSchema = z
  .array(wrappingRecordSchema)
  .max(32)
  .superRefine((records, context) => {
    const ids = new Set<string>();
    for (const [index, record] of records.entries()) {
      const expectedId =
        record.method === "prf" && record.credentialId !== null
          ? `prf:${record.credentialId}`
          : record.method === "keychain" && record.credentialId === null
            ? "keychain"
            : null;
      if (expectedId === null || record.id !== expectedId) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "Wrapping record id, method, and credentialId do not match.",
        });
      }
      if (ids.has(record.id)) {
        context.addIssue({
          code: "custom",
          path: [index, "id"],
          message: `Duplicate wrapping record id: ${record.id}`,
        });
      }
      ids.add(record.id);
    }
  });

function pathFor(userData: string): string {
  return join(userData, FILE);
}

export async function readWrappingRecords(
  userData: string,
): Promise<Result<DataKeyWrappingRecord[]>> {
  try {
    const raw: unknown = JSON.parse(await readFile(pathFor(userData), "utf8"));
    const parsed = wrappingRecordsSchema.safeParse(raw);
    return parsed.success
      ? ok(parsed.data)
      : err(
          "wrapping-records-invalid",
          parsed.error.issues[0]?.message ?? "Invalid wrapping records",
        );
  } catch (error) {
    const cause = error as NodeJS.ErrnoException;
    return cause.code === "ENOENT" ? ok([]) : fail(toError(error, "wrapping-records-read-failed"));
  }
}

export async function writeWrappingRecords(
  userData: string,
  records: DataKeyWrappingRecord[],
): Promise<Result<void>> {
  const parsed = wrappingRecordsSchema.safeParse(records);
  if (!parsed.success)
    return err(
      "wrapping-records-invalid",
      parsed.error.issues[0]?.message ?? "Invalid wrapping records",
    );
  const path = pathFor(userData);
  const staged = `${path}.${process.pid}-${Date.now()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(staged, `${JSON.stringify(parsed.data, null, 2)}\n`, { mode: 0o600 });
    await rename(staged, path);
    return ok(undefined);
  } catch (error) {
    return fail(toError(error, "wrapping-records-write-failed"));
  }
}

/**
 * Adds or replaces exactly one record by id. Other credentials' records are never touched, so a
 * renderer bug (or a hostile mod) cannot orphan the Data Key by rewriting the whole list.
 */
export async function upsertWrappingRecord(
  userData: string,
  record: DataKeyWrappingRecord,
): Promise<Result<void>> {
  const existing = await readWrappingRecords(userData);
  if (!existing.ok) return existing;
  const others = existing.value.filter((item) => item.id !== record.id);
  return writeWrappingRecords(userData, [...others, record]);
}
