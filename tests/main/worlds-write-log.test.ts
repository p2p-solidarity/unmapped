import {
  clearWriteLog,
  noteWrite,
  SELF_WRITE_WINDOW_MS,
  wasSelfWrite,
} from "@main/worlds/writeLog";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  clearWriteLog();
});

describe("write log", () => {
  it("suppresses a path we just wrote and forgets it after the window", () => {
    const path = "/tmp/worlds/abc-1/world.oui";
    noteWrite(path, 1_000);
    expect(wasSelfWrite(path, 1_100)).toBe(true);
    expect(wasSelfWrite(path, 1_000 + SELF_WRITE_WINDOW_MS)).toBe(false);
  });

  it("never suppresses a path written by someone else", () => {
    noteWrite("/tmp/worlds/abc-1/world.oui", 1_000);
    expect(wasSelfWrite("/tmp/worlds/abc-1/karma.jsonl", 1_050)).toBe(false);
  });
});
