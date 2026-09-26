# E2E · Play together across networks: invite, join by code, positions, chat, and a relay

Spec: `docs/plans/simplify-together.md` (Join a world, Invite friends, F12 → Friends, Chat) plus the
relay service asked for after the first attempt failed. Two apps on one Mac with **NordVPN
(NordLynx) connected the whole time**, local y-webrtc signaling, and the relay service
(`src/turn`, `bun run turn:dev`) minting Cloudflare Realtime TURN credentials. Files and order:
`run.json`.

## Why a relay (the first attempt)

With STUN only, B found A through signaling (both in `unwritten-land:K96S2G:continent`, each listing
the other's peer id) but ICE stayed `checking` for over 40 s: host candidates on `192.168.151.25`
and `10.5.0.2` (the VPN) and a shared server-reflexive `187.15.122.59` (the VPN's exit). A UDP probe
between two processes on this machine failed on both interfaces and passed only on 127.0.0.1, with
the firewall allowing python3 — the VPN blocks local traffic, and two peers behind one VPN exit
cannot punch through it. That is the cross-network case: any VPN, symmetric NAT or strict firewall.
The screen said 「已開放 · 等朋友加入」 forever. Chromium's `--allow-loopback-in-peer-connection`
did not add loopback candidates, so the fix is a relay, not a local switch.

## Checks (relay on, VPN on)

| # | Checked | Observed | Result |
| --- | --- | --- | --- |
| 1 | Relay servers reach the app | Main asked `POST /ice`: 1 Cloudflare STUN + 6 TURN URLs (udp/tcp 3478, udp 443, tcp 80, tls 5349/443) with credentials, port 53 dropped; `hasRelay()` true in both apps, 9 URLs with the public STUN | pass |
| 2 | Invite friends (A, F12) | 邀請朋友 → 「把這個告訴朋友：加入碼 K96S2G · 複製 · 已開放 · 等朋友加入」 (`a-01`) | pass |
| 3 | Join a world by code (B, no world of its own on the first run) | The field said 這是朋友的加入碼 · 帶著：一片新的大地 (first run) / its own world (later runs); 加入 → verified friend in **2,157 ms** (earlier runs: 2,454 ms; 539 ms to Play on the first, before any relay) (`b-01`, `b-02`) | pass |
| 4 | It really went through the relay | Selected pair: B local `relay/udp turn:turn.cloudflare.com:3478?transport=udp` ↔ A `prflx`; RTT 77–141 ms | pass |
| 5 | Friends online with positions | B: 「player-ZXNM 位置 -183, 9 · 距離你 230 步 · 在 player-ZXNM 的土地上」; A: 「已開放 · 1 位朋友在這裡」 and player-6PTH (`b-03`, `a-02`) | pass |
| 6 | Positions follow the walk | B walked west (x 53 → 46 in its own tiles); A read B at 245 → 238 and 237 → 230 steps; in the final run 231, 222 steps | pass |
| 7 | Chat A → B | A: Enter, typed, Enter. B's box: 「player-ZXNM: 你好！我是阿公，聽得到嗎？」 and 「按 Enter 說話」 within 645 ms of sending (100 ms polling included) (`a-03`, `b-04`) | pass |
| 8 | Chat B → A, typing never walks | B typed 「聽得到！wasd 不會亂走」 and held D for 800 ms with the line open: moved **0.000** tiles. A: 「player-6PTH: 聽得到！wasd 不會亂走」 (`a-04`) | pass |
| 9 | Esc while typing | Closes the line; still in Play (`screen: play`, no chat layer) | pass |
| 10 | Names come from the sender's own awareness | Each line is filed under the other app's player name; own lines carry none | pass |

## No relay on either side (VPN on)

| # | Checked | Observed | Result |
| --- | --- | --- | --- |
| 11 | One side with a relay is enough | A with the relay, B STUN only: verified in 2,408 ms | pass |
| 12 | Neither side: the player is told | After **22.4 s** both apps show 「找到朋友了，但連不上。」 and 「可能被 VPN 或防火牆擋住了。試著關掉 VPN 或換個網路；它會一直重試，一通就自動連上。」 (code `continent-peer-unreachable`) (`b-05`) | pass (after fix 2) |

## The deployed Worker (the release default)

`bun run turn:deploy` → `https://unmapped-turn.gimmychang.workers.dev` (account `b9e60d05…`, rate
limit 20 / 60 s per address); the TURN key went in with `wrangler secret put`, read from
`.cache/turn/dev.env` and never printed. `/status` → configured; `POST /ice` → 2 server groups, 7
URLs with relay credentials; a request with an `Origin` → 403. `TURN_URL` in `main/net/ice.ts` now
names it, so the apps below ran **without** `UNMAPPED_TURN_URL`, NordVPN still on:

| # | Checked | Observed | Result |
| --- | --- | --- | --- |
| 13 | Join by code on the default relay | run-01 / run-02 replayed: verified friend in **2,366 ms** (`c-01`–`c-03`) | pass |
| 14 | Through the relay | A local `relay/udp turn:turn.cloudflare.com:3478?transport=udp`, B `prflx`; RTT 79–90 ms | pass |
| 15 | Chat | A → B 「player-ZXNM: 你好！我是阿公，聽得到嗎？」 635 ms after sending (100 ms polling included) (`c-04`, `c-05`) | pass |

## Found and fixed during the run

1. **No relay at all.** WebRTC had only simple-peer's default STUN. Added the relay service
   (`src/turn`, a Worker holding the TURN key; `@shared/ice`; `main/net/ice.ts` behind
   `window.seed.net.iceServers`; `net/iceServers.ts` feeding `peerOpts.config.iceServers`, also for
   connections made after a late answer). `UNMAPPED_TURN_URL` in main; empty = the baked
   `TURN_URL`, the deployed Worker (checks 13–15).
2. **The "found but cannot connect" wait reset on every attempt.** y-webrtc drops a failed attempt
   and starts another, so the pending count blinked to 0 and the 20 s wait never finished (seen with
   a temporary probe, since removed). The wait now runs from the first friend found until one
   connects or signaling is lost.
3. **The error showed its code and English source** in Invite friends. It now shows only the
   translated message and what to do (`a-05` was taken before this change, `b-05` after).

Calls: joining, positions and chat call no model. In the background: A 2 (a chapter and a witness),
B 5 (a chapter and 4 witnesses), all gpt-5.4-mini, 19,611 in / 4,558 out on B.

Not reached: two machines on two different real networks (here one machine behind a VPN stands in —
the relay path is the same), a shared world's presence chat (service worlds; chat is continent-only), and
public signaling servers (a local one was used).
