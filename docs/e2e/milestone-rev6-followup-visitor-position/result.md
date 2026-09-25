# E2E · rev 6 follow-up · a visitor's position is never saved on its own land

Two app processes on fresh throwaway userData, joined as a continent through a local signaling
server. Guest B visits host A's land, then leaves in every way the build offers, and B's
`save.json` and the reopened world are checked each time.

The bug being checked comes from `milestone-rev6-land` ("Seen, not changed"). There, B's autosave
kept the spot where B stood on A's land. Reopened without the continent, B stood at chunk −6 · 0 of
its **own** land, and that chunk was witnessed.

## Replay

```bash
PORT=4444 node node_modules/y-webrtc/bin/server.js &                                        # signaling
AETHER_TEST_USER_DATA="$TMPDIR/ud-followup-vp-a" bun run dev --remoteDebuggingPort 9333 &  # A (empty)
AETHER_TEST_USER_DATA="$TMPDIR/ud-followup-vp-b" bun run dev --remoteDebuggingPort 9334 &  # B (empty)
CDP_PORT=9333 bun scripts/cdp-drive.ts "$(bun -e 'console.log(JSON.stringify(require("./docs/e2e/milestone-rev6-followup-visitor-position/run.json").actions))')"
CDP_PORT=9334 bun scripts/cdp-drive.ts "$(bun -e 'console.log(JSON.stringify(require("./docs/e2e/milestone-rev6-followup-visitor-position/run.json").guest))')"
# then together, guestVisit, guestLeavePlayAndReopen, guestRoomDial, guestLeaveContinent,
# guestCloseWindow, restart, guestAfterRestart in that order (B = CDP_PORT=9334, A = 9333).
# Run the `shell` steps by hand. A's door number differs per run (this one: ZTVJCV).
```

- Seeds: A `V6AU-HW5A`, B `B7QM-2PXD` (New Game).
- Window: 1440 × 868. Locale: zh-TW.
- Model: `openai · gpt-5.4-mini`, used only to witness each world's origin chunk.
- The `eval` probe steps only *read* the live sample (`samplePlayer`, `isVisiting`), the engine
  chunk, the teleport request and the continent store. They import the dev modules the app itself
  loaded (`/engine/playerProbe.ts`, `/state/index.ts`).
- Coordinates below are B-local tiles (a chunk is 32 tiles). B's anchor on A's continent is
  (6, 0), so A's land shows at B-local chunk −6 · 0. A's door is at (−181.5, 8.5).

## Checked

| Step | Expected | Observed |
| --- | --- | --- |
| B walks its own land | autosave writes the own spot | sample `origin` (13.36, 10.91) → `save.json` position (13.36, 10.91) at 16:17:19Z |
| B joins A (title → 加入大陸 → ZTVJCV) | both on one continent | B: "大陸 ZTVJCV · 已連線 · 1 位夥伴", anchor (6, 0). B walked back to its door; the autosave wrote (8.556, 10.107) at 16:18:14Z |
| 前往他們的門 | B stands on A's land, marked as visiting | sample `visiting:v6au-hw5a-muh5xdt3` (−180.5, 8.5). HUD 大地 −6 · 0, "player-3H3N 的大地 · 未記之地 · 已記 · 新田岬" (`02`) |
| (d) presence while visiting | A sees B move live, in A's coordinates | B at (−172.5, 11.3). A's roster: player-VFTH at (19.5, 11.3), exactly +192 tiles (6 chunks). A's view shows B walking east (`03`) |
| (d) a note left on A's land | goes to A's notes at the right tile | A's `notes.jsonl`: author player-VFTH, `coord {cx 0, cz 0, x 19, z 11}`. B has no `notes.jsonl`. B's note panel: "留言 · 新田岬（-6 · 0）" (`04`) |
| Autosave while visiting | never writes the foreign spot | after > 5 s and more walking (sample −169.23, 11.3): `save.json` still (8.556, 10.107), `updatedAt` still 16:18:14Z |
| (a) ← 主頁 while visiting | checkpoint keeps the own spot; continent left | the parked sample is still `visiting:…` (judged at unmount), and the continent is `off`. `save.json` is unchanged (position and `updatedAt`) |
| (a) reopen, same process (繼續遊戲) | own land, no witness | sample `origin` (8.56, 10.11), HUD 0 · 0 已記 · 北田邊, `teleport: null` (the stale door request was cleared). No new `[inference]` line, and B's `chunks/` holds only `0_0` (`05`) |
| (c) room dial on A's door card | B is brought home before the new continent opens | B went back to A's land (−179.7, 8.5, visiting). E at A's door opened A's card: "player-3H3N 的門 … 轉盤 1 門 QRSTUV 前往" (`06`). After 前往: sample `origin` (11.5, 8.5), chunk 0 · 0, "大陸 QRSTUV · 已連線 · 0 位夥伴", "E · 開門" at B's own door (`07`). The next autosave wrote (11.5, 8.5) at 16:21:20Z |
| (b) leaveContinent while visiting | B lands beside its own door, and the next autosave writes own land | B back on A's land (−174.44, 11.7). **No 離開大陸 button is reachable there** (see below), so `leaveContinent()` was called through the module. Result: sample `origin` (11.5, 8.5), continent `off`, HUD 0 · 0 (`08`). After walking south, the autosave wrote (11.5, 12.167) at 16:22:00Z |
| (a) window closed while visiting | beforeunload flush writes nothing foreign | own spot (11.5, 8.567) saved at 16:22:20Z. B went to A's land (−173.3, 8.5) and waited 6.5 s (`09`), then `window.close()` ran and the page target went away. `save.json` stayed (11.5, 8.567), 16:22:20Z |
| (a) reopen after a restart | own land, no witness | B's process was stopped and restarted on the same userData, then 繼續遊戲: sample `origin` (11.5, 8.57), HUD 0 · 0 已記 · 北田邊 (`10`). `vp-b-2.log` has **0** `[inference]` lines, and `chunks/` still holds only `0_0`. `updatedAt` moved to 16:23:41Z on open, but the position did not change |
| Health | no renderer errors | `[renderer:ERR]`: 0 in A's log, 0 in both B logs |

### Dev-log numbers

```
A  [inference] done 98555a05… · witness · openai gpt-5.4-mini · 8158 ms · max 3200 · 3304+985 tokens (0 cached)
A  [inference] done ea127f48… · witness · openai gpt-5.4-mini · 4966 ms · max 3200 · 5300+946 tokens (2816 cached)
B  [inference] done 5ca780a6… · witness · openai gpt-5.4-mini · 8171 ms · max 3200 · 3304+1027 tokens (2816 cached)
B (after restart)  no [inference] lines
```

A's two calls are both for its origin chunk; the second one sends 4 messages. B's only model call
was its origin chunk. No visit, leave, reopen or restart caused a witness call on either side.

## Found

- **(b) cannot be staged through the UI.** 離開大陸 exists only in `ContinentSection`, and that
  section lives only in the player's **own** door panel. The panel opens with E at the player's
  home door. On A's land, E at A's door opens A's `ForeignDoorCard`, which has no leave control.
  `document.body.innerText.includes('離開大陸')` was `false` there. So `leaveContinent()` was
  called through `/net/continentActions.ts`, and that verifies the function, not a click. From
  foreign land a player can leave only in two ways, and both were run through the UI:
  - ← 主頁 (App's `useLeaveRoomAfterPlay` closes the continent with `setActiveContinent(null)`)
  - a room dial on the foreign door card (`bringVisitorHome` ran)
- Leaving Play while visiting writes no checkpoint at all (`updatedAt` does not change), so nothing
  from the visit reaches the save.

## Not verified

- The out-of-scope `LandView2D.tsx` issue the implementer reported was not exercised: the teleport
  effect also runs on mount, so leaving a place after door travel may put the player at the old
  door target. This run never entered a place.
- Saves that already hold a foreign spot from before the fix. They are not repaired, and none was
  staged here.
- A friend's territory appearing under a player who is standing still.
- The default public signaling server (unreachable from this machine; the local server was used).
