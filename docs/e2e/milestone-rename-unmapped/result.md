# E2E · 更名為《無界之地》／UNMAPPED，以及離開地點的兩個修正

名稱定案：《無界之地》——自主開放世界（UNMAPPED — An Autonomous Open World）。這次檢查玩家看得到的名稱都已改好；另外檢查 `LandView2D` 的兩個修正。這兩個問題是收尾代理回報、但不在它們負責範圍內的。

## 重播

```bash
cp -R "$TMPDIR/ud-followup-hud-biome" "$TMPDIR/ud-rename-check"   # 已有世界 V6AU-HW5A 和兩個地點
AETHER_TEST_USER_DATA="$TMPDIR/ud-rename-check" bun run dev --remoteDebuggingPort 9338 &
CDP_PORT=9338 bun scripts/cdp-drive.ts "$(cat docs/e2e/milestone-rename-unmapped/run.json)"
```

這次沒有呼叫模型：dev log 裡沒有任何 `[inference]` 行。走路的按鍵長度依這個種子和地點位置而定。

## 檢查結果

| 項目 | 預期 | 觀察到的 |
| --- | --- | --- |
| 視窗標題 | 新名稱 | `document.title` = `UNMAPPED — 無界之地` |
| 標題畫面（三種語言） | 大字 UNMAPPED、中文名、翻譯過的副標 | ja：`UNMAPPED / 無界之地 / 自律するオープンワールド`（`03`）；en：`… / An Autonomous Open World`（`02`）；zh-TW：`… / 自主開放世界`（`01`） |
| 新遊戲 | 內建世界 1.2.0 的名稱 | `無界之地 · 新遊戲`（`04`）；存檔列為 `無界之地 · V6AU-HW5A` |
| 用過門之後離開地點 | 回到入口，不被舊的傳送目標拉走 | 先傳送到 (72.5, 27.5)（留下 seq 2），走回地城「冰洞迷迷宮」入口，進入（`05`）再出來：玩家在回程點 (80.5, 17.9)，也就是入口南方 1.4 格，離舊目標 11 格；`landReturn` 已清空（`06`） |
| 離開地點時的 React 警告 | 不再出現 | 兩次出地城，`Cannot update a component … while rendering LandView2D`：0 次；`[renderer:ERR]`：0 |

## 這次修掉的

- `initialPlayer()` 原本在 render 期間呼叫 `takeLandReturn()`，同時寫入 session store。玩家卡片訂閱了這個 store，就在 `LandView2D` render 途中被更新，開發模式因此印出警告。現在 render 只讀 `landReturn`，掛載後才在 effect 裡清掉。
- `[teleport]` 效果原本在畫面掛載時也會執行，所以用過門之後進出地點，舊的門目標會被重新套用。現在只套用掛載之後才發出的傳送請求。3D 的 `Player.tsx` 本來就是這樣做。

## 沒驗到的

- 修正前的兩個問題沒有在這個行程裡重現。警告是 hud-biome 代理量到的（每次離開各 1 次）；傳送重播是 visitor-position 代理讀程式推論的。
- 側視地點（東沙丘）這次沒有進出。
- 打包後的 app（仍叫 Unwritten Land.app，見 CLAUDE.md 的 Name 段）。
