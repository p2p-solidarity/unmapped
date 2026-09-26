// The story plan's line protocol as a small local model writes it (Qwen 3.5 4B on llama.cpp,
// docs/e2e/milestone-rev6-p4-no-servers, "Create on Qwen 4B, after the fix"). Written before the
// change to readStoryBlocks.
//
// How this can fail:
//  S1  A model that closes every chapter with its own @@end has only its first chapter read, so a
//      plan of five chapters is refused three times as "fewer than 3" and Create stops.
//  S2  A model that writes its whole plan twice (Qwen repeated a whole program three times) gets
//      every chapter twice.
//  S3  Words after the last @@end are read as part of a chapter.

import { parseStoryReply } from "@shared/story";
import { describe, expect, it } from "vitest";

const chapter = (n: number, end: boolean): string =>
  [
    "@@episode",
    `title: Chapter ${n}`,
    `place: Place ${n}`,
    n % 2 === 0 ? "kind: search" : "kind: meet",
    `brief: What happens in chapter ${n}.`,
    ...(end ? ["@@end"] : []),
  ].join("\n");

describe("the story plan's @@end", () => {
  it("S1: reads every chapter when each one is closed with its own @@end", () => {
    const reply = ["@@logline", "A through-line.", ...[1, 2, 3, 4, 5].map((n) => chapter(n, true))];
    const plan = parseStoryReply(reply.join("\n"));
    if (!plan.ok) throw new Error(plan.error.message);
    expect(plan.value.episodes.map((e) => e.title)).toEqual(
      [1, 2, 3, 4, 5].map((n) => `Chapter ${n}`),
    );
  });

  it("S2: stops at a second plan instead of reading every chapter twice", () => {
    const once = ["@@logline", "A through-line.", ...[1, 2, 3].map((n) => chapter(n, true))];
    const plan = parseStoryReply([...once, "", ...once].join("\n"));
    if (!plan.ok) throw new Error(plan.error.message);
    expect(plan.value.episodes).toHaveLength(3);
  });

  it("S3: reads nothing after the last @@end", () => {
    const reply = [
      "@@logline",
      "A through-line.",
      ...[1, 2, 3].map((n) => chapter(n, false)),
      "@@end",
    ];
    const plan = parseStoryReply(
      [...reply, "brief: I hope you like it!", "title: Extra"].join("\n"),
    );
    if (!plan.ok) throw new Error(plan.error.message);
    expect(plan.value.episodes).toHaveLength(3);
    expect(plan.value.episodes[2]?.brief).toBe("What happens in chapter 3.");
  });
});
