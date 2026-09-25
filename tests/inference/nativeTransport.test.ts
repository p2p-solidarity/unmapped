import { EventEmitter } from "node:events";
import {
  createNativeTransport,
  type NativeBridgeProcess,
  type NativeEvent,
} from "@main/inference/nativeTransport";
import { describe, expect, it } from "vitest";

class FakeStream extends EventEmitter {
  writes: string[] = [];

  write(text: string): boolean {
    this.writes.push(text);
    return true;
  }
}

function process(): {
  proc: NativeBridgeProcess & EventEmitter;
  stdin: FakeStream;
  stdout: FakeStream;
} {
  const stdin = new FakeStream();
  const stdout = new FakeStream();
  const proc = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr: null,
    exitCode: null as number | null,
    kill: () => true,
  }) as unknown as NativeBridgeProcess & EventEmitter;
  return { proc, stdin, stdout };
}

describe("createNativeTransport", () => {
  it("writes one versioned NDJSON request and routes its streamed event", async () => {
    const fixture = process();
    const transport = createNativeTransport(() => fixture.proc);
    const received: NativeEvent[] = [];

    const started = await transport.request(
      { v: 1, requestId: "scene-1", method: "generateEvents", payload: { sceneId: "room-a" } },
      (event) => received.push(event),
    );

    expect(started).toMatchObject({ ok: true });
    expect(fixture.stdin.writes).toEqual([
      '{"v":1,"requestId":"scene-1","method":"generateEvents","payload":{"sceneId":"room-a"}}\n',
    ]);

    fixture.stdout.emit("data", '{"v":1,"requestId":"scene-1","seq":1,"type":"accepted"}\n');

    expect(received).toEqual([{ v: 1, requestId: "scene-1", seq: 1, type: "accepted" }]);
  });

  it("rejects duplicate ids and terminates pending requests when the helper exits", async () => {
    const fixture = process();
    const transport = createNativeTransport(() => fixture.proc);
    const received: NativeEvent[] = [];

    await transport.request(
      { v: 1, requestId: "scene-2", method: "generateLayout", payload: {} },
      (event) => received.push(event),
    );
    const duplicate = await transport.request(
      { v: 1, requestId: "scene-2", method: "generateLayout", payload: {} },
      () => undefined,
    );
    fixture.proc.emit("exit", 1);

    expect(duplicate).toMatchObject({ ok: false, error: { code: "native-duplicate-request" } });
    expect(received).toMatchObject([
      {
        type: "error",
        error: { code: "native-helper-exited" },
      },
    ]);
  });

  it("terminates pending requests when the helper fails before it can exit", async () => {
    const fixture = process();
    const transport = createNativeTransport(() => fixture.proc);
    const received: NativeEvent[] = [];
    await transport.request(
      { v: 1, requestId: "scene-spawn-error", method: "capabilities", payload: {} },
      (event) => received.push(event),
    );

    fixture.proc.emit("error", new Error("ENOENT afm-bridge"));

    expect(received).toMatchObject([
      {
        type: "error",
        error: { code: "native-helper-start", message: "ENOENT afm-bridge" },
      },
    ]);
  });

  it("turns malformed helper output into a terminal protocol error", async () => {
    const fixture = process();
    const transport = createNativeTransport(() => fixture.proc);
    const received: NativeEvent[] = [];
    await transport.request(
      { v: 1, requestId: "scene-3", method: "capabilities", payload: {} },
      (event) => received.push(event),
    );

    fixture.stdout.emit("data", "not-json\n");
    expect(received).toMatchObject([{ type: "error", error: { code: "native-protocol-output" } }]);
  });

  it("rejects duplicate or out-of-order helper events", async () => {
    const fixture = process();
    const transport = createNativeTransport(() => fixture.proc);
    const received: NativeEvent[] = [];
    await transport.request(
      { v: 1, requestId: "scene-ordered", method: "capabilities", payload: {} },
      (event) => received.push(event),
    );

    fixture.stdout.emit("data", '{"v":1,"requestId":"scene-ordered","seq":1,"type":"accepted"}\n');
    fixture.stdout.emit(
      "data",
      '{"v":1,"requestId":"scene-ordered","seq":1,"type":"progress","phase":"decode"}\n',
    );

    expect(received).toMatchObject([
      { v: 1, requestId: "scene-ordered", seq: 1, type: "accepted" },
      { type: "error", error: { code: "native-protocol-output" } },
    ]);
  });

  it("rejects a terminal event before accepted and unknown envelope fields", async () => {
    const fixture = process();
    const transport = createNativeTransport(() => fixture.proc);
    const received: NativeEvent[] = [];
    await transport.request(
      { v: 1, requestId: "scene-strict", method: "capabilities", payload: {} },
      (event) => received.push(event),
    );

    fixture.stdout.emit(
      "data",
      '{"v":1,"requestId":"scene-strict","seq":1,"type":"result","payload":{},"extra":true}\n',
    );

    expect(received).toMatchObject([{ type: "error", error: { code: "native-protocol-output" } }]);
  });

  it("rejects an unterminated line larger than the configured byte limit", async () => {
    const fixture = process();
    const transport = createNativeTransport(() => fixture.proc, 32);
    const received: NativeEvent[] = [];
    await transport.request(
      { v: 1, requestId: "scene-large", method: "capabilities", payload: {} },
      (event) => received.push(event),
    );

    fixture.stdout.emit("data", "x".repeat(33));

    expect(received).toMatchObject([
      { type: "error", error: { code: "native-protocol-line-too-large" } },
    ]);
  });

  it("sends cancellation as a new request and waits for the target terminal event", async () => {
    const fixture = process();
    const transport = createNativeTransport(() => fixture.proc);
    const received: NativeEvent[] = [];
    await transport.request(
      { v: 1, requestId: "scene-4", method: "planWorld", payload: {} },
      (event) => received.push(event),
    );

    await transport.cancel("scene-4");
    fixture.stdout.emit("data", '{"v":1,"requestId":"scene-4","seq":1,"type":"accepted"}\n');
    fixture.stdout.emit("data", '{"v":1,"requestId":"scene-4","seq":2,"type":"cancelled"}\n');

    expect(fixture.stdin.writes[1]).toContain('"method":"cancel"');
    expect(fixture.stdin.writes[1]).toContain('"targetRequestId":"scene-4"');
    expect(received).toEqual([
      { v: 1, requestId: "scene-4", seq: 1, type: "accepted" },
      { v: 1, requestId: "scene-4", seq: 2, type: "cancelled" },
    ]);
  });
});
