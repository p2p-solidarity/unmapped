// Drives the running dev app over the Chrome DevTools Protocol, in the background — no window
// focus, no screen takeover. Start the app with a throwaway userData and a debugging port:
//
//   AETHER_TEST_USER_DATA=/tmp/aether-ud bunx electron-vite dev --remoteDebuggingPort 9333
//   bun scripts/cdp-drive.ts '[{"text":true},{"hold":["KeyW","ShiftLeft"],"ms":8000},{"shot":"/tmp/a.jpg"}]'
//
// actions: {eval: "js"} | {shot: "file.png"} | {hold: "KeyW", ms: 2000} | {click: [x, y]} | {wait: ms} | {text: true}
//          | {hold: {from: "<js → code | code[] | null>"}, ms: 80} — keys read from the page first
//          | {clickText: "Cartridges"} — clicks the smallest visible element whose text is exactly that
//          | {type: "words"} — inserts text into the focused field
//          | {pad: {buttons: [0], axes: [lx, ly, rx, ry], ms: 150}} — a virtual gamepad (see below)
//          | {cdp: {method: "WebAuthn.enable", params: {}}} — any DevTools command (virtual passkeys)
//          | {viewport: {width: 375, height: 812, scale: 3, mobile: true}} — a phone-sized page
//          | {touch: {tap: [x, y]}} | {touch: {tapText: "Join"}} | {touch: {drag: [[x0, y0], [x1, y1]],
//            ms: 400, hold: 800}} — a finger (Input.dispatchTouchEvent; a drag moves over `ms`, then
//            stays down `hold` ms before lifting)
//          | {offline: true} / {offline: false} — Network.emulateNetworkConditions for the page
//            (navigator.onLine turns false and new requests fail; a loopback WebSocket may still
//            connect, so stop the service to cut a world off). viewport and offline last only as
//            long as this run's DevTools session: keep them in the same run as the steps they serve.
//
// pad: installs one connected "standard"-mapping gamepad in the page (navigator.getGamepads() is
// overridden through Runtime.evaluate, and re-installed after a reload), holds the given buttons
// and axes for `ms` (default 150), then releases everything and waits a few frames so the next
// press reads as fresh. Buttons are W3C standard indices: 0 A (interact / confirm), 1 B (back;
// jump in play), 2 X (fire), 3 Y (notes), 5 RB (sprint), 9 Start (menu = Esc), 12–15 D-pad
// up / down / left / right. Axes are the left stick x / y (-1 = left / up) then the right stick:
//   {"pad":{"buttons":[0],"ms":150}}            press A
//   {"pad":{"buttons":[13],"ms":120}}           D-pad down (one focus step in a menu)
//   {"pad":{"axes":[0,-1,0,0],"ms":1200}}       walk north for 1.2 s
//   {"pad":{"buttons":[5],"axes":[1,0,0,0],"ms":800}}   sprint east
// A pad can also steer the left stick toward a point, the way a player walks to what they see:
//   {"pad":{"toward":"<js → [x, z] | null>","within":1.2,"buttons":[5],"timeoutMs":30000}}
// Every ~120 ms it reads the target and samplePlayer() (read-only) and leans the stick that way
// (holding `buttons` too, e.g. RB); when stuck it sidesteps for a moment. A null target ends it.
// {repeat: {times: 8, until: "<js>", actions: [...]}} runs actions again until `until` is truthy.
//
// The argument is either that action array or a docs/e2e run.json — { env, model, actions } — so a
// recorded run replays as-is: bun scripts/cdp-drive.ts "$(cat docs/e2e/<run>/run.json)"
import { writeFile } from "node:fs/promises";

// A second app (a room guest) can listen elsewhere: CDP_PORT=9334 bun scripts/cdp-drive.ts …
const PORT = Number(process.env.CDP_PORT ?? 9333);
const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as Array<{
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}>;
const page = targets.find((t) => t.type === "page" && /^http:\/\/localhost:\d+\//.test(t.url));
if (!page) throw new Error(`no page target: ${JSON.stringify(targets.map((t) => t.url))}`);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
// biome-ignore lint/suspicious/noExplicitAny: CDP replies are untyped JSON and this is a dev script
type CdpReply = any;
let seq = 0;
const pending = new Map<number, (value: CdpReply) => void>();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(String(event.data));
  if (msg.id !== undefined) pending.get(msg.id)?.(msg);
});
function send(method: string, params: object = {}): Promise<CdpReply> {
  seq += 1;
  const id = seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The centre of the smallest visible element whose text is exactly `label` (as clickText finds it). */
async function textPoint(label: string): Promise<[number, number] | null> {
  const r = await send("Runtime.evaluate", {
    expression: `(() => {
      const want = ${JSON.stringify(label)};
      const hits = [...document.querySelectorAll("button, a, [role=button], div, span, strong, em, kbd, p, h1, h2, h3, label")]
        .filter((el) => el.innerText !== undefined && el.innerText.trim() === want)
        .map((el) => { el.scrollIntoView({ block: "nearest" }); return { el, rect: el.getBoundingClientRect() }; })
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
        .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
      const hit = hits[0];
      return hit ? [hit.rect.x + hit.rect.width / 2, hit.rect.y + hit.rect.height / 2] : null;
    })()`,
    returnByValue: true,
  });
  return (r.result?.result?.value as [number, number] | null | undefined) ?? null;
}

interface Touch {
  tap?: [number, number];
  tapText?: string;
  drag?: [[number, number], [number, number]];
  ms?: number;
  hold?: number;
}

/** One finger: a tap (down, up) or a drag (down, moves over `ms`, stay `hold` ms, up). */
async function touch(input: Touch): Promise<void> {
  const finger = (x: number, y: number) => [{ x, y, id: 0, radiusX: 4, radiusY: 4, force: 1 }];
  const start =
    input.tapText !== undefined ? await textPoint(input.tapText) : (input.tap ?? input.drag?.[0]);
  if (start === null || start === undefined) {
    console.log(`touch: "${input.tapText}" not found`);
    return;
  }
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: finger(...start) });
  const end = input.drag?.[1];
  if (end !== undefined) {
    const steps = Math.max(2, Math.round((input.ms ?? 300) / 16));
    for (let i = 1; i <= steps; i += 1) {
      const x = start[0] + ((end[0] - start[0]) * i) / steps;
      const y = start[1] + ((end[1] - start[1]) * i) / steps;
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: finger(x, y) });
      await sleep(16);
    }
    await sleep(input.hold ?? 0);
  } else {
    await sleep(input.hold ?? 60);
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  console.log(`touch ${JSON.stringify(input.drag ?? start)}`);
}
const VK: Record<string, number> = {
  KeyW: 87,
  KeyA: 65,
  KeyS: 83,
  KeyD: 68,
  KeyE: 69,
  Space: 32,
  ShiftLeft: 16,
  Enter: 13,
  Escape: 27,
  ArrowDown: 40,
  ArrowUp: 38,
  KeyV: 86,
  KeyN: 78,
};

/** Sets the virtual pad's state (installing it first when the page has none). */
function padScript(buttons: readonly number[], axes: readonly number[]): string {
  return `(() => {
    const w = window;
    if (w.__cdpPad === undefined || navigator.getGamepads()[0] !== w.__cdpPad) {
      w.__cdpPad = { id: "cdp-drive virtual pad (STANDARD GAMEPAD)", index: 0, connected: true,
        mapping: "standard", timestamp: 0, buttons: [], axes: [0, 0, 0, 0], vibrationActuator: null };
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: () => [w.__cdpPad, null, null, null],
      });
    }
    const on = new Set(${JSON.stringify(buttons)});
    w.__cdpPad.buttons = Array.from({ length: 17 }, (_, i) =>
      ({ pressed: on.has(i), touched: on.has(i), value: on.has(i) ? 1 : 0 }));
    w.__cdpPad.axes = ${JSON.stringify([...axes, 0, 0, 0, 0].slice(0, 4))};
    w.__cdpPad.timestamp = performance.now();
    return true;
  })()`;
}

const input = JSON.parse(process.argv[2] ?? "[]");
const actions = Array.isArray(input) ? input : (input.actions ?? []);
/** Fields of earlier `cdp` replies, for "$name" params. */
const replies: Record<string, unknown> = {};

async function evaluate(expression: string): Promise<unknown> {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value ?? null;
}

async function setPad(buttons: readonly number[], axes: readonly number[]): Promise<void> {
  const r = await send("Runtime.evaluate", {
    expression: padScript(buttons, axes),
    returnByValue: true,
  });
  if (r.result?.result?.value !== true) console.log(`pad: ${JSON.stringify(r.result)}`);
}

interface Toward {
  toward: string;
  within?: number;
  buttons?: number[];
  timeoutMs?: number;
}

/** Leans the left stick toward a point until the player stands within `within` of it. */
async function steerToward(pad: Toward): Promise<void> {
  const within = pad.within ?? 1.2;
  const started = Date.now();
  const read = `(async () => {
    const target = await (${pad.toward});
    const p = (await import("/engine/playerProbe.ts")).samplePlayer();
    return { target, at: p === null ? null : [p.x, p.z] };
  })()`;
  let last: [number, number] | null = null;
  let stuck = 0;
  let side = 1;
  let outcome = "timeout";
  while (Date.now() - started < (pad.timeoutMs ?? 30_000)) {
    const seen = (await evaluate(read)) as {
      target: [number, number] | null;
      at: [number, number] | null;
    } | null;
    if (seen?.target === null || seen?.target === undefined || seen.at === null) {
      outcome = "no target";
      break;
    }
    const [dx, dz] = [seen.target[0] - seen.at[0], seen.target[1] - seen.at[1]];
    const distance = Math.hypot(dx, dz);
    if (distance <= within) {
      outcome = `arrived ${seen.at.map((v) => v.toFixed(1)).join(",")}`;
      break;
    }
    const moved = last === null ? 1 : Math.hypot(seen.at[0] - last[0], seen.at[1] - last[1]);
    last = seen.at;
    stuck = moved < 0.05 ? stuck + 1 : 0;
    let [ax, az] = [dx / distance, dz / distance];
    // Pressed against something: slide along it for a moment, alternating sides.
    if (stuck >= 3) {
      [ax, az] = [-az * side, ax * side];
      side = -side;
      stuck = 0;
      await setPad(pad.buttons ?? [], [ax, az, 0, 0]);
      await sleep(450);
      continue;
    }
    await setPad(pad.buttons ?? [], [ax, az, 0, 0]);
    await sleep(120);
  }
  await setPad([], []);
  await sleep(80);
  console.log(`pad toward: ${outcome} (${Date.now() - started} ms)`);
}

// biome-ignore lint/suspicious/noExplicitAny: actions are untyped JSON from the command line
async function run(list: any[]): Promise<void> {
  for (const action of list) {
    if (action.repeat !== undefined) {
      const { times = 1, until, actions: body = [] } = action.repeat;
      for (let round = 0; round < times; round += 1) {
        if (until !== undefined && (await evaluate(until))) break;
        await run(body);
      }
    } else if (action.cdp !== undefined) {
      // Any other DevTools command, e.g. WebAuthn.addVirtualAuthenticator for a passkey that needs
      // no Touch ID: {cdp: {method: "WebAuthn.enable", params: {}}}. A param written "$name" takes
      // the `name` field of an earlier reply (e.g. "$authenticatorId").
      const params = JSON.parse(JSON.stringify(action.cdp.params ?? {}), (_key, value) =>
        typeof value === "string" && value.startsWith("$")
          ? (replies[value.slice(1)] ?? value)
          : value,
      );
      const r = await send(action.cdp.method, params);
      Object.assign(replies, r.result ?? {});
      console.log(JSON.stringify(r.result ?? r.error));
    } else if (action.eval !== undefined) {
      const r = await send("Runtime.evaluate", {
        expression: action.eval,
        awaitPromise: true,
        returnByValue: true,
      });
      console.log(
        JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? r.result),
      );
    } else if (action.shot !== undefined) {
      const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
      await writeFile(action.shot, Buffer.from(r.result.data, "base64"));
      console.log(`shot ${action.shot}`);
    } else if (action.hold !== undefined) {
      // {hold: {from: "<js → code | code[] | null>"}}: the keys are read from the page first (the
      // next step of a route a player sees, say); null holds nothing.
      const read =
        typeof action.hold === "object" && !Array.isArray(action.hold)
          ? await evaluate(action.hold.from)
          : action.hold;
      if (read === null || read === undefined) {
        console.log("hold: nothing to hold");
        continue;
      }
      const codes: string[] = Array.isArray(read) ? read : [read];
      for (const code of codes)
        await send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          code,
          key: code,
          windowsVirtualKeyCode: VK[code] ?? 0,
        });
      await sleep(action.ms ?? 100);
      for (const code of codes)
        await send("Input.dispatchKeyEvent", {
          type: "keyUp",
          code,
          key: code,
          windowsVirtualKeyCode: VK[code] ?? 0,
        });
    } else if (action.click !== undefined) {
      const [x, y] = action.click;
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1,
      });
      await send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1,
      });
    } else if (action.clickText !== undefined) {
      const r = await send("Runtime.evaluate", {
        expression: `(() => {
        const want = ${JSON.stringify(action.clickText)};
        const hits = [...document.querySelectorAll("button, a, [role=button], div, span, strong, em, kbd, p, h1, h2, h3, label")]
          .filter((el) => el.innerText !== undefined && el.innerText.trim() === want)
          .map((el) => { el.scrollIntoView({ block: "nearest" }); return { el, rect: el.getBoundingClientRect() }; })
          .filter(({ rect }) => rect.width > 0 && rect.height > 0)
          .sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height);
        const hit = hits[0];
        return hit ? [hit.rect.x + hit.rect.width / 2, hit.rect.y + hit.rect.height / 2] : null;
      })()`,
        returnByValue: true,
      });
      const point = r.result?.result?.value as [number, number] | null;
      if (point === null || point === undefined) {
        console.log(`clickText: "${action.clickText}" not found`);
      } else {
        const [x, y] = point;
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
        await send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        await send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        console.log(`clicked "${action.clickText}" at ${Math.round(x)},${Math.round(y)}`);
      }
    } else if (action.pad?.toward !== undefined) {
      await steerToward(action.pad as Toward);
    } else if (action.pad !== undefined) {
      const pad = action.pad as { buttons?: number[]; axes?: number[]; ms?: number };
      await setPad(pad.buttons ?? [], pad.axes ?? []);
      await sleep(pad.ms ?? 150);
      await setPad([], []);
      await sleep(80);
      console.log(`pad ${JSON.stringify(pad)}`);
    } else if (action.viewport !== undefined) {
      const { width = 375, height = 812, scale = 3, mobile = true } = action.viewport;
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: scale,
        mobile,
      });
      await send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 5 });
      console.log(`viewport ${width}x${height}${mobile ? " (touch)" : ""}`);
    } else if (action.touch !== undefined) {
      await touch(action.touch as Touch);
    } else if (action.offline !== undefined) {
      await send("Network.enable");
      const r = await send("Network.emulateNetworkConditions", {
        offline: action.offline === true,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });
      console.log(
        `offline ${action.offline === true}${r.error ? ` ${JSON.stringify(r.error)}` : ""}`,
      );
    } else if (action.type !== undefined) {
      await send("Input.insertText", { text: action.type });
    } else if (action.wait !== undefined) {
      await sleep(action.wait);
    } else if (action.text) {
      const r = await send("Runtime.evaluate", {
        expression: "document.body.innerText.slice(0, 1500)",
        returnByValue: true,
      });
      console.log(r.result?.result?.value);
    }
  }
}

await run(actions);
ws.close();
