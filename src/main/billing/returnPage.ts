// Where the billing provider sends the browser back after checkout or the customer portal (rev 6
// phase 4, D3): a one-page server on 127.0.0.1 that main starts for that one visit. The gateway only
// takes an https:// return address or one on this computer, and the app has no web page of its own,
// so the page says "back to the app" and main re-reads the quota when the browser arrives (the
// provider's webhook may land a moment later, so it reads once more after that). It never sees a
// payment detail: the provider's page holds those, and nothing is read from the request.

import { createServer, type Server } from "node:http";

/** A visit that never comes back stops waiting after this long. */
const WAIT_MS = 30 * 60_000;
const SECOND_READ_MS = 8_000;

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>UNMAPPED</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; line-height: 1.6">
<p>You can close this tab and return to UNMAPPED.</p>
<p lang="zh-TW">可以關閉這個分頁，回到《無界之地》。</p>
<p lang="ja">このタブを閉じて UNMAPPED に戻ってください。</p>
</body></html>`;

let open: Server | null = null;

/** Starts the page (replacing one still waiting) and answers its address. */
export function returnPage(onReturn: () => void): Promise<string> {
  open?.close();
  return new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
        "cache-control": "no-store",
      });
      response.end(PAGE);
      if (request.method === "GET" && !request.url?.startsWith("/favicon")) {
        onReturn();
        setTimeout(onReturn, SECOND_READ_MS).unref();
        server.close();
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        reject(new Error("the return page has no port"));
        return;
      }
      open = server;
      server.unref();
      setTimeout(() => server.close(), WAIT_MS).unref();
      resolve(`http://127.0.0.1:${address.port}/billing-return`);
    });
  });
}
