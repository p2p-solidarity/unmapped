// Runs the exact runtime shim served into a world frame inside a Node vm context with a stub
// page, to prove the host helpers behave as WORK_CONTRACT promises.

import { createContext, runInContext } from "node:vm";
import { FRAME_RUNTIME } from "@main/works/frame";
import { describe, expect, it } from "vitest";

const TOKEN = `w${"b".repeat(32)}`;

type Handler = (...args: unknown[]) => void;

function startRuntime(boot: { state?: unknown; carry?: unknown }) {
  const posted: { type: string; [key: string]: unknown }[] = [];
  const timers: Handler[] = [];
  let frames: Handler[] = [];
  const listeners = new Map<string, Handler>();
  const bootJson = JSON.stringify({
    token: TOKEN,
    state: null,
    carry: null,
    assets: {},
    mainStart: 1,
    mainEnd: 50,
    ...boot,
  });
  const page: Record<string, unknown> = {
    document: {
      getElementById: (id: string) => (id === "ulw-boot" ? { textContent: bootJson } : { id }),
    },
    parent: { postMessage: (message: unknown) => posted.push(JSON.parse(JSON.stringify(message))) },
    addEventListener: (type: string, handler: Handler) => listeners.set(type, handler),
    setTimeout: (handler: Handler) => timers.push(handler),
    clearTimeout: () => undefined,
    setInterval: () => 0,
    requestAnimationFrame: (handler: Handler) => frames.push(handler),
  };
  page.window = page;
  createContext(page);
  // Served with newlines flattened (frame.ts), so run it the same way.
  runInContext(FRAME_RUNTIME.replace(/\n/g, " "), page);
  return {
    posted,
    run: (code: string): unknown => runInContext(code, page),
    flushTimers: () => {
      for (let handler = timers.shift(); handler !== undefined; handler = timers.shift()) handler();
    },
    frame: (now: number) => {
      const due = frames;
      frames = [];
      for (const handler of due) handler(now);
    },
    fire: (type: string, event: unknown) => listeners.get(type)?.(event),
  };
}

describe("world runtime helpers", () => {
  it("load(fresh) fills whatever the save lacks; load() still returns exactly the save", () => {
    const world = startRuntime({ state: { hp: 2, seen: ["gate"], nested: { x: 1 }, spark: {} } });
    expect(world.run("JSON.stringify(host.load())")).toBe(
      JSON.stringify({ hp: 2, seen: ["gate"], nested: { x: 1 }, spark: {} }),
    );
    const resumed = world.run(`(() => {
      const game = host.load({ hp: 5, xp: 0, seen: new Set(), spark: [], nested: { x: 0, y: 9 } });
      return JSON.stringify({ hp: game.hp, xp: game.xp, seen: game.seen instanceof Set && game.seen.has("gate"),
        spark: Array.isArray(game.spark), nested: game.nested });
    })()`);
    expect(JSON.parse(String(resumed))).toEqual({
      hp: 2,
      xp: 0,
      seen: true,
      spark: true,
      nested: { x: 1, y: 9 },
    });

    const fresh = startRuntime({});
    expect(fresh.run("host.load({ level: 1 }).level")).toBe(1);
    expect(fresh.run("host.load()")).toBe(null);
  });

  it("save keeps Sets, and a repeated identical save is posted once", () => {
    const world = startRuntime({});
    world.run(
      `host.save({ n: 1, keys: new Set(["red"]) }); host.save({ n: 1, keys: new Set(["red"]) });`,
    );
    world.flushTimers();
    world.run(`host.save({ n: 1, keys: new Set(["red"]) });`);
    world.flushTimers();
    const saves = world.posted.filter((message) => message.type === "save");
    expect(saves).toEqual([{ ulw: 1, token: TOKEN, type: "save", state: { n: 1, keys: ["red"] } }]);
    expect(world.run(`host.load({ n: 0, keys: new Set() }).keys.has("red")`)).toBe(true);
  });

  it("loop hands out dt in seconds, capped at 0.1", () => {
    const world = startRuntime({});
    world.run("globalThis.dts = []; host.loop((dt) => dts.push(dt));");
    world.frame(1_000);
    world.frame(1_016);
    world.frame(9_000);
    const dts = JSON.parse(String(world.run("JSON.stringify(dts)"))) as number[];
    expect(dts[0]).toBeCloseTo(1 / 60);
    expect(dts[1]).toBeCloseTo(0.016);
    expect(dts[2]).toBe(0.1);
  });

  it("reports an error thrown every frame once", () => {
    const world = startRuntime({});
    const error = {
      lineno: 3,
      colno: 7,
      message: "boom",
      error: { stack: "TypeError: boom\n at x" },
    };
    for (let index = 0; index < 60; index += 1) world.fire("error", error);
    const errors = world.posted.filter((message) => message.type === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ file: "main.js", line: 3, column: 7 });
  });
});
