# E2E · rev 6 phase 1 · built-in world, backup, cartridge, continent, picture cancel (3.3, 3.5, 3.7–3.11)

Two app processes on their own throwaway userData, joined as a continent through a local signaling
server, plus the backup and cartridge round trips and the AI-world picture cancel.

## Replay

```bash
PORT=4444 node node_modules/y-webrtc/bin/server.js &                       # local signaling
AETHER_TEST_USER_DATA="$TMPDIR/ud-rev6a" AETHER_TEST_BACKUP_PATH="$TMPDIR/rev6.spire-backup" \
  AETHER_TEST_CARTRIDGE_PATH="$TMPDIR/rev6.cartridge" bun run dev --remoteDebuggingPort 9333 &   # A
AETHER_TEST_USER_DATA="$TMPDIR/ud-rev6b" AETHER_TEST_CARTRIDGE_PATH="$TMPDIR/rev6.cartridge" \
  bun run dev --remoteDebuggingPort 9334 &                                                        # B
CDP_PORT=9333 bun scripts/cdp-drive.ts "$(bun -e 'console.log(JSON.stringify(require("./docs/e2e/milestone-rev6-land/run.json").actions))')"
CDP_PORT=9334 bun scripts/cdp-drive.ts "$(bun -e 'console.log(JSON.stringify(require("./docs/e2e/milestone-rev6-land/run.json").guest))')"
# then the `together` steps (B holds a key while A captures) and the `after` list on A; the two
# `shell` steps in `after` are run by hand between the drive calls.
```

A reuses the userData of `milestone-rev6-create` (it holds the 發條沙城 cartridge); B starts empty.
The door number (LJHZCA) and the `together` screen positions depend on these seeds and a 1440 × 841
window. Model: `openai · gpt-5.4-mini`; picture model `gpt-image-1-mini` (cancelled, never drawn).

## Checked

| Item | Expected | Observed |
| --- | --- | --- |
| 3.5 built-in world | both revisions installed; the feel unchanged | `cartridges/aether-land/1.0.0` and `1.1.0` (1.0.0 stays for old pins); New Game → 1.1.0; witnessed 灰田停車場: bus_stop, utility_pole, chimney, house, fence, flower, tree, rocks — all inside its own `Props:` line; lore 雨天掛低 (`01`) |
| 3.11 pin | a new world pins its physics | `instance.json` → `runtimePin.physicsVersion: 1` |
| 3.9 other players, HD-2D | name and facing | A sees player-PUXA by its door (`03`); walking east → side view facing right (`05`), west → facing left (`06`), north → back view (`07`) |
| 3.9 other players, 16-bit | the same in the flat look | after V: walking south → front view (`08`), east → side view (`09`), name over the figure |
| 3.10 handshake | land only after the hello | both HUDs: "已連線 · 1 位夥伴" (the count is now verified worlds); B's door panel lists player-6RQV · 未記之地 · 在線 only after the hello, and B could walk to A's door on A's land. A peer failing the hello is not stageable with one build — covered by `tests/net/continent-gate.test.ts` |
| 3.8 cartridge | same revision after export → import | exported 5,572 bytes: manifest, rules, origin, `bible/core.md`, `bible/style.md`, `bible/story.json` (`10`); imported in B: "已匯入 xn--uisz40bp3chqn-468f5b@1.0.0" (`11`); content hash `sha256:d965a020…c9d657` on both; `diff -r` of the two revision folders: identical |
| 3.7 backup | land, lore and notes survive delete + restore | backup 4,838 bytes: instance, save, karma, lore.jsonl, notes.jsonl, chunks/0_0 (scene, errands, dialogue); instance folder deleted; 還原備份 → "已還原 未記之地 · V6AU-HW5A" (`12`); `diff -r` against the copy: only `save.json` `updatedAt` differs; opening it shows 已記 · 灰田停車場 with no new model call and the note (`13`) |
| 3.3 picture cancel | request aborted in main, nothing stored | AI world 一片小沙地 made in one call (10.3 s, 772 + 2,403); 生成 on "hero", 取消 2.5 s later → `[image] abort …` then `[image] fail … · openai · 2537 ms · cancelled`; notice "已取消。可玩版本沒有被更動。" (`14`); candidates still only `c001`; ledger line `image · gpt-image-1-mini · aborted · 2529 ms` under the work draft |
| Health | no renderer errors | `[renderer:ERR]`: 0 in A's and B's logs |

## Found and fixed during this run

- **The default signaling server was unreachable** (`wss://y-webrtc-eu.fly.dev` timed out), so two
  worlds could not meet at all. Added a per-device override (`localStorage` `unwritten.signaling`,
  a comma-separated ws/wss list) used by both continents and rooms; the run used y-webrtc's bundled
  server on 127.0.0.1:4444. The default is unchanged — whether it is down for everyone is open.
- The first cancelled picture was recorded as model `"image"`; the provider now names its model
  before the request. The cancel notice was English; it now uses the translated works notice.
- **After the run, a code review** found that a verified peer could still file a well-formed world
  entry or chunk under a third world's id, or overwrite a chunk or note already written. The gate
  now lets a peer write only its own world and chunks, never overwrite a chunk or note, and still
  accept a visitor's note on someone else's land (`mayWrite`, test case 5). Re-run live: A opened
  LJHZCA, B joined through the title's 加入大陸 → both "已連線 · 1 位夥伴", B stood on A's land and
  saw A's 灰田停車場, A listed player-PUXA's world at 6 · 0 online (`15`); renderer errors 0.

## Seen, not changed

- B's save kept the position it had while visiting A's land; reopened without the continent, B
  stood at chunk −6 · 0 of its own land and witnessed it. A visitor's position is saved in the
  host's shifted coordinates — a continent design question, left as it was.

## Not verified

- A hello that fails in the real app (it needs two builds with different physics); the unit test
  stages it.
- Continent over the default public signaling server (down from here).
- Walking into the other world's territory beyond its door, and notes left on someone else's land.
