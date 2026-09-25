# E2E · rev 6 follow-up · signaling servers in System, and a continent that stops "connecting"

One app process on a fresh throwaway userData. It checks four things:

- System → 信令伺服器 shows this device's list, tests each server for real, saves a list and goes
  back to the default.
- A continent whose only signaling server never answers reaches an error state with a hint.
- It turns live by itself once a server answers there.
- It turns live after the fix the hint describes.

The bug being checked comes from `milestone-rev6-land`. There, `wss://y-webrtc-eu.fly.dev` timed
out and the HUD showed "大陸 … · 連線中…" forever.

## Replay

```bash
PORT=4444 node node_modules/y-webrtc/bin/server.js &                                   # local signaling
PORT=4446 node -e "require('net').createServer(s=>s.on('error',()=>{})).listen(4446,'127.0.0.1')" &   # silent: accepts, never answers
AETHER_TEST_USER_DATA="$TMPDIR/ud-followup-signaling" bun run dev --remoteDebuggingPort 9335 &
P=docs/e2e/milestone-rev6-followup-signaling/run.json
CDP_PORT=9335 bun scripts/cdp-drive.ts "$(bun -e "console.log(JSON.stringify(require('./$P').actions))")"
CDP_PORT=9335 bun scripts/cdp-drive.ts "$(bun -e "console.log(JSON.stringify(require('./$P').world))")"
# shell: stop the silent server on 4446, then  PORT=4446 node node_modules/y-webrtc/bin/server.js &
CDP_PORT=9335 bun scripts/cdp-drive.ts "$(bun -e "console.log(JSON.stringify(require('./$P').recover))")"
# shell: stop the y-webrtc server on 4446
# then the phases lost, fix, language, defaultDoor in that order, the same way
```

- Seed: `SGNL-7K4R` (New Game). Door number this run: `MPVDCE`.
- Locale: zh-TW. Window: 1440 × 868.
- Model: `openai · gpt-5.4-mini`, one call: witness, 7,262 ms, 3,304 + 923 tokens.
- The HUD line is recorded in the page by a 100–200 ms `setInterval` (`window.__hud`, ms since
  the door was opened).

## Checked: System → 信令伺服器

| Step | Expected | Observed |
| --- | --- | --- |
| Open System (`01`) | the default list, marked as the default | Field shows `wss://y-webrtc-eu.fly.dev` and `wss://y-webrtc.fly.dev`. Status line: "這台裝置使用預設的伺服器。". Both servers: 尚未測試. Buttons: 測試連線 enabled; 儲存到這台裝置 and 使用預設 disabled. `unwritten.signaling`: null |
| Test the default (`02`) | the real result for each server | **eu:** "可連線 · 握手 583 ms · 轉送 268 ms". **y-webrtc.fly.dev:** "錯誤 · signaling-timeout"; message 信令伺服器沒有及時回應。, source line "did not answer within 15 s", hint translated. The whole test took 15.15 s |
| `ws://127.0.0.1:4444`, local server running (`03`, `04`) | reachable, with ms | "可連線 · 握手 16 ms · 轉送 1 ms", done 113 ms after the click. Save: `unwritten.signaling` = `ws://127.0.0.1:4444`; status line changes to "這台裝置使用自己的清單。"; "已儲存到這台裝置。" appears |
| Malformed `ftp://nope` (`05`) | named in red, cannot be tested or saved | "不是 ws:// 或 wss:// 位址：ftp://nope". 測試連線 and 儲存到這台裝置 disabled; 使用預設 enabled |
| `ws://127.0.0.1:1` + `wss://echo.websocket.org` (`06`) | the real error for each | **Port 1:** "錯誤 · signaling-closed", 無法連上信令伺服器。, "(code 1006)". **Echo server:** "錯誤 · signaling-no-relay", 伺服器接受了連線，卻沒有轉送測試訊息。, "sent our own message back instead of relaying it". Both answered 1.53 s after the click. Not saved: storage kept `ws://127.0.0.1:4444` |
| `ws://127.0.0.1:4446`, silent server (`07`) | timeout | "錯誤 · signaling-timeout" after 15.11 s; then saved as this device's list |
| 使用預設 (`19`) | back to the default | `unwritten.signaling` removed (null). Field shows the two defaults again, with "這台裝置使用預設的伺服器。". 儲存到這台裝置 and 使用預設 disabled |
| Test the default again (`19`) | the real result | **eu:** "握手 311 ms · 轉送 248 ms". **y-webrtc.fly.dev:** signaling-timeout again (15.10 s) |
| en / ja (`17`, `18`) | every new word translated | English: "Signaling servers … This device uses its own list … Test connection / Save for this device / Use default … not tested …". Japanese: "シグナリングサーバー … この端末は独自のリストを使っています … 接続をテスト / この端末に保存 / 既定に戻す … 未テスト …". No English left in either |

## Checked: the continent status

| Step | Expected | Observed |
| --- | --- | --- |
| New Game `SGNL-7K4R` (`08`) | a world to open a door on | "已記 · 北坡電線旁" 7.6 s after 開始 |
| Open the door; the only server is the silent 4446 (`09`–`11`) | "connecting" at first | "大陸 MPVDCE · 連線中…" from 152 ms on. Still connecting in the poll at 21.4 s |
| … after the wait (`12`, `13`) | an error with a hint, not "connecting" forever | At **22,151 ms** the HUD reads "大陸 MPVDCE · 沒有任何信令伺服器回應，其他世界找不到這片大陸。 — 請在標題畫面開啟「系統 → 信令伺服器」，測試後儲存一個有回應的伺服器，再重新開啟大陸。若伺服器先回應，會自動恢復連線。". That is `SIGNALING_WAIT_MS` (20 s) plus the 2 s status tick. The door panel shows "錯誤 · continent-signaling-unreachable", the message, the source line "No signaling server answered within 20 s (ws://127.0.0.1:4446)." and the translated hint |
| Stuck handshake is retried | a new attempt about every 12 s | The silent server logged the continent's connections at 16:33:14.40, 16:33:27.76 and 16:33:40.97 UTC, about 13.3 s apart. In `lsof`, Electron had only **one** ESTABLISHED connection to 4446 at a time. Earlier ones were closed by the client (CLOSE_WAIT on the server side) |
| A real server appears on the same port (`14`) | turns live by itself | The silent server was swapped for y-webrtc's on 4446 at 64.7 s. The HUD read "大陸 MPVDCE · 已連線 · 0 位夥伴" at **70.15 s**, 5.5 s after the swap mark |
| The live continent loses its only server | connecting, then the error again | 4446 was stopped at 90.9 s. The HUD showed "連線中…" 23 ms after the mark and the error again **21.2 s** later |
| The fix the hint describes (`15`, `16`) | live after saving a server that answers | Steps: ← 主頁 → 系統 → `ws://127.0.0.1:4444` → 測試連線 ("握手 2,132 ms · 轉送 1 ms") → 儲存到這台裝置 → 繼續遊戲 → E → 向夥伴敞開我的門. Result: "大陸 MPVDCE · 已連線 · 0 位夥伴" at **74 ms** |
| The default list (`20`) | live if a default answers | After 使用預設 and reopening the door: 連線中… at 82 ms, then "已連線 · 0 位夥伴" at **382 ms**. `lsof`: Electron's one :443 connection went to 66.241.125.161 (y-webrtc-eu.fly.dev). There was none to 66.241.124.163 (y-webrtc.fly.dev), so the continent went live through eu alone |
| Health | no renderer errors | `[renderer:ERR]`: 0. The only ERROR lines in the log are Chromium GPU "Invalid mailbox" lines at 01:31:18 JST, during a Vite restart. Model calls: 1 |

## The second default server, from the shell

For this check, two `ws` (npm) clients join one random topic. One subscribes and pings; after the
pong, the other publishes. The check passes only if the publish arrives within 20 s. Runs were at
16:36–16:37 UTC.

| Server | Result |
| --- | --- |
| `wss://y-webrtc-eu.fly.dev` | 3 of 3 relayed. Handshake 540 / 526 / 842 ms, relay 289 / 252 / 250 ms |
| `wss://y-webrtc.fly.dev` | 0 of 3. All timed out at 20 s; 0/2, 1/2 and 1/2 sockets opened |

Together with the two tests in the app, y-webrtc.fly.dev answered **0 of 5** times in this session.
eu answered **5 of 5** (2 in the app, 3 from the shell).

## Code fixes

None. `bun run check` at 01:39 JST, with the tree as it was: exit 0. Typecheck, lint and the line
limit ("all source files are <= 600 lines") passed, plus vitest with 102 files and 430 tests.

## Seen, not changed

- **The second default server contributed nothing today.** `wss://y-webrtc.fly.dev` failed every
  attempt, and the continent went live through eu alone. Nobody known runs it. Like any signaling
  server, it sees room names (they contain the door number) and the offers, which include IP
  addresses. The implementer left keeping it to the user; this run's data does not support keeping
  it as a fallback. Removing it is one line in `DEFAULT_SIGNALING` in `src/renderer/net/signaling.ts`.
- After 使用預設 the panel says "已儲存到這台裝置。" ("Saved for this device"). That is true, since
  the choice is stored, but it reads oddly for going back to the default.
- The HUD error line is four lines long in the HUD card (message — hint). The code shows only in
  the door panel.
- The second test of `ws://127.0.0.1:4444` took 2,132 ms to hand-shake, against 16 ms the first
  time. It came right after the continent's repeated failures on 127.0.0.1:4446. This was not
  investigated; possibly Chromium delays WebSockets to a host after failures.
- The ErrorBlock shows the English source line under the translated message. That is ErrorBlock's
  existing behaviour, not new here.

## Interference during the run (not from this task)

My dev app reloaded several times because of edits other sessions made in the same tree:

- page reloads for `i18n/strings/common.ts`, `index.html` and five `errors-*.ts` at 01:28:27 and
  01:28:41 JST;
- "`.env` changed, restarting server" at 01:30:58, 01:31:17 and 01:31:34 JST.

The bad-URL step and the silent-server door step were re-run after them. `09` and `10` come from
the first door run, taken before the 01:30:58 restart dropped it. Every other number above comes
from runs that no reload touched: each phase set `window.__sigMarker` and read it back at the end.
The title also changed to "UNMAPPED / 無界之地" during the run; that is another session's edit.

## Not verified

- Two worlds meeting through the new panel's list. That needs a second process; `milestone-rev6-land`
  already met through `ws://127.0.0.1:4444` set in storage.
- The in-game System panel (`hud/SystemPanel.tsx`), which has no signaling section, by design for now.
- The HUD error wording in en and ja (seen in zh-TW only; the en/ja strings exist in
  `errors-net.ts`).
- Whether y-webrtc.fly.dev answers from other networks or regions.
- The progress page (`docs/architecture/afm3-dsl-architecture.html`, Page 03). It is not one of
  this task's files, so it was left for the session that owns it.
