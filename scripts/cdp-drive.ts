// Drives the running dev app over the Chrome DevTools Protocol, in the background — no window
// focus, no screen takeover. Start the app with a throwaway userData and a debugging port:
//
//   AETHER_TEST_USER_DATA=/tmp/aether-ud bunx electron-vite dev --remoteDebuggingPort 9333
//   bun scripts/cdp-drive.ts '[{"text":true},{"hold":["KeyW","ShiftLeft"],"ms":8000},{"shot":"/tmp/a.jpg"}]'
//
// actions: {eval: "js"} | {shot: "file.png"} | {hold: "KeyW", ms: 2000} | {click: [x, y]} | {wait: ms} | {text: true}
//          | {clickText: "Cartridges"} — clicks the smallest visible element whose text is exactly that
//          | {type: "words"} — inserts text into the focused field
import { writeFile } from "node:fs/promises";

// A second app (a room guest) can listen elsewhere: CDP_PORT=9334 bun scripts/cdp-drive.ts …
const PORT = Number(process.env.CDP_PORT ?? 9333);
const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()) as Array<{
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}>;
const page = targets.find((t) => t.type === "page" && t.url.includes("localhost:5173"));
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

const actions = JSON.parse(process.argv[2] ?? "[]");
for (const action of actions) {
  if (action.eval !== undefined) {
    const r = await send("Runtime.evaluate", {
      expression: action.eval,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? r.result));
  } else if (action.shot !== undefined) {
    const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 70 });
    await writeFile(action.shot, Buffer.from(r.result.data, "base64"));
    console.log(`shot ${action.shot}`);
  } else if (action.hold !== undefined) {
    const codes: string[] = Array.isArray(action.hold) ? action.hold : [action.hold];
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
ws.close();
