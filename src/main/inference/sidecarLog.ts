// What the llama-server sidecar says, kept on disk at `<userData>/logs/llama-server.log`, so its
// speed, its memory and a later error can be read after a good start (the status panel only shows
// the last lines when it fails). Main-only. The file grows to MAX_BYTES, then moves to `.1` and the
// one before is dropped, so the folder never holds more than two files. Writes are chained and
// never throw: a log must never take main down.

import { appendFile, mkdir, rename, stat } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Where the sidecar's log lives, relative to userData. */
export const SIDECAR_LOG = join("logs", "llama-server.log");
export const SIDECAR_LOG_MAX_BYTES = 2 * 1024 * 1024;

/** CLIs colour their output; the log keeps plain text. */
export const ANSI_COLOUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

export interface LineLog {
  /**
   * A chunk of the child's output on one of its streams; lines are written whole (a line split
   * across chunks waits for its end), each with the time it arrived.
   */
  write(chunk: string, stream: "stdout" | "stderr"): void;
  /** One line of our own (start, ready, exit), marked so it stands out from the child's. */
  note(line: string): void;
  /** Writes what is left and waits for every write to land. */
  close(): Promise<void>;
}

export function createLineLog(path: string, maxBytes: number = SIDECAR_LOG_MAX_BYTES): LineLog {
  let chain: Promise<void> = Promise.resolve();
  let size: number | null = null;
  const partial = { stdout: "", stderr: "" };

  function append(lines: string[]): void {
    if (lines.length === 0) return;
    const at = new Date().toISOString();
    const text = lines.map((line) => `${at} ${line}\n`).join("");
    chain = chain.then(async () => {
      try {
        if (size === null) {
          await mkdir(dirname(path), { recursive: true });
          size = await stat(path).then(
            (info) => info.size,
            () => 0,
          );
        }
        const bytes = Buffer.byteLength(text);
        if (size > 0 && size + bytes > maxBytes) {
          await rename(path, `${path}.1`).catch(() => undefined);
          size = 0;
        }
        await appendFile(path, text);
        size += bytes;
      } catch {
        // Disk full or the folder gone: the sidecar keeps running without its log.
      }
    });
  }

  const clean = (line: string): string => line.replace(ANSI_COLOUR, "").trimEnd();

  return {
    write(chunk, stream) {
      const lines = `${partial[stream]}${chunk}`.split("\n");
      partial[stream] = lines.pop() ?? "";
      append(lines.map(clean).filter((line) => line.length > 0));
    },
    note(line) {
      append([`[unmapped] ${line}`]);
    },
    async close() {
      const rest = [clean(partial.stdout), clean(partial.stderr)].filter((line) => line !== "");
      partial.stdout = "";
      partial.stderr = "";
      append(rest);
      await chain;
    },
  };
}
