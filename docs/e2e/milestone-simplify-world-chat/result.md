# E2E · Chat in a shared world, through its world service

Asked by the owner after v0.2.0 ("幫共享世界也加上聊天"). A shared world talks through its world
service: `chat` goes up, the service relays it to the world's other readers that sent `hear`, and
keeps nothing. The service's challenge now says `unmapped-service/2`; main sends `hear` / `chat`
only to a service that says 2 or later, and the service sends `chat` only to a session that said
`hear`, so an older app or an older service never meets a frame it cannot read (both would drop
the link). Only owners and members talk; visitors to a public world and invitees read.

Setup (`run.json`): a fresh world service in test mode, two fresh apps on this Mac. A's world
service list was set by eval (a device preference); B has none — the invite names the service.

| # | Checked | Observed | Result |
| --- | --- | --- | --- |
| 1 | The service speaks chat | `/v1/health` → `version: unmapped-service/2` | pass |
| 2 | Invite without a server in sight | A: 開始 → the door's ▸ 進階 shows 「建立邀請連結」 only; pressing it shared the world and made `unmapped://join?…` in **523 ms**; no `ws://` or address anywhere in the door (`a-01`, `a-02`) | pass |
| 3 | Join a world by link | B: 加入世界 → the field said 這是邀請連結 → 看看這個世界 → 「由 player-CM7T 建立 · 誰可以進來：朋友 · 這份邀請還能用 1 次」, no service line → name 阿公 → 加入並開始玩 → in Play in **709 ms** (`b-01`, `b-02`) | pass |
| 4 | Both see each other | A: others 「阿公」; B: others 「player-CM7T」; both show 「按 Enter 說話」 | pass |
| 5 | Chat A → B | A: Enter (the line opened), typed, Enter. B's box: 「player-CM7T: 阿公歡迎！這是我的世界」 **919 ms** after sending (100 ms polling included) — the name comes from the world's history, not the line (`a-03`, `b-03`) | pass |
| 6 | Chat B → A, typing never walks | B typed with D held for 600 ms: moved **0.000** tiles. A: 「阿公: 謝謝！我是阿公，看得到你 wasd」 (`a-04`) | pass |
| 7 | Nothing kept | The chat lines appear in none of: the service's `--data` (`service-key.json`, `blobs/`, `worlds/<id>/{log.jsonl,blobs.txt}`), its stdout log, and every file of both userData folders including Chromium's own stores | pass |
| 8 | The invite preview's name | Showed 「無界之地 · 5ZPD-YV4N」 (the seed suffix); fixed with `plainSaveName` and re-read: 「無界之地」 (`b-04`) | pass after fix |

Found on the way: the first keyboard attempt sent nothing, because A's door and B's first-run 怎麼玩
card were still open — Enter opens the chat only when no layer is open, as designed. A direct
`window.seed.world.sendChat` had already reached B (「player-CM7T: test line」), so the path was fine.

Isolated tests (`tests/service/chat.test.ts`, failure list first): only `hear` sessions get lines,
closing stops them, the version is read like main reads it, visitors and invitees are refused
(`chat-members-only`), `from` is stamped by the service, lines are cleaned (`chat-invalid`),
5 per 5 s (`quota-chat`, the socket stays open), and nothing reaches the data directory.

Calls: A 3 on gpt-5.4-mini in the background (a chapter and 2 witnesses); B none. Sharing, joining
and chat call no model.

Not reached: an older service or an older app meeting this build (covered by the isolated tests
and the version rule, not run), the phone proof (it never says `hear`; `sendChat` answers
`not-on-this-client`), and a public world's visitor trying to talk in the app (refused in the
tests; the app shows the translated `chat-members-only`).
