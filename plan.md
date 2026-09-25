# 未記之地（Unwritten Land）：一個遊戲、一片無限的地

> 本文件是目前產品與工程的最高層規格（2026-09-17 改向）。它取代「可組裝 60 種類型的遊戲卡帶主機」
> 作為**主路徑**的假設。上一版完整保留在 `docs/ref/plan-cartridge-console.md`：其中的
> cartridge / instance / workspace 儲存模型、hash 驗證、typed proposal、Mod 邊界**仍然有效**，
> Create 的 Genre Matrix / Capability Compiler / Scene Gallery 則降為進階的「重制」入口（§9）。

## 0. 為什麼改向

- Scope 畫太大：Create（類型矩陣、能力編譯器、場景畫廊、設計訪談）約 3.9k 行，Play 約 1.3k 行。
  gameplay 功能太多，新玩家進不來。
- 進到遊戲後世界太小：一個場景最多 32×32 格（1 格 = 1 m），玩家每幀被 `clampToFloor` 夾在地板內，
  唯一的「更多世界」是 Exit 瞬移到另一個預先寫好的場景。
- 決定：**只做一個遊戲，把它做到無限地圖**。判斷任何工作的標準只有一條——
  它有沒有讓這一片世界更大、更連貫、或累積更多 lore。

兩篇定位文章：

| 文章 | 角色 | 我們拿什麼 |
| --- | --- | --- |
| [Large Lore Models](https://aw.network/posts/large-lore-models) | **精神** | lore = 去中心、累積而成的敘事。雙帳本：不可變的事實帳本 + 錨定其上的、可爭論的人寫 para-ledger |
| [Moving Castles — Zero](https://movingcastles.world/posts/zero) | **控制核心** | 固定錨點（`core.md` / `style.md`）每輪原封不動注入 + 關聯圖的啟動／衰減／擴散，只把「熱區」放進 prompt，模型才不漂 |

## 1. 不可違反的決定

1. **一個遊戲。** 不新增類型、kit、capability context、Create 步驟。
2. **地理是確定性的，故事是見證出來的。** 地形只由 `landSeed + 區塊座標` 決定，永不呼叫模型、永不落盤。
   人、名字、習俗、委託由模型在「顯影」時寫**一次**，存進存檔，之後不再需要模型。
3. **走路永遠不等模型。** 沒有模型時世界仍可無限行走，只是沒有居民——誠實顯示「未記」，不放假資料。
4. **互動當下不呼叫 LLM。** NPC 對話是顯影時寫好的靜態 Dialogue DSL，選項走確定性 action。
5. **模型永遠被錨住。** 每次生成都帶同一份世界聖經 + lore 圖熱區；不帶就不生成。
6. **事實與敘述分開。** `karma.jsonl` 是 append-only 事實；手記與居民證詞是錨定在事實上的敘述，
   允許互相矛盾，不做共識、不做投票。
7. **地理屬於世界 seed。** `landSeed = seedFromText(save.seed ?? cartridgeId)`：同一個 seed 的所有玩家站在同一片地上，
   座標對每個人意義相同（手記才錨得住）；換 seed 就是另一片地。沒有 seed 的舊存檔沿用 cartridgeId。
   （2026-09-17 改向：主路徑是**一個內建遊戲 × 多個 seed**，不再是每個玩家建一張卡帶。）
8. 既有規則照舊：DSL 是真相、repair ≤ 2 輪、數值 clamp、無假資料、cartridge 不可變、Play 不寫 cartridge、
   每檔 ≤ 600 行、不過度工程（CLAUDE.md）。

## 2. 主軸與世界觀

**「被看見，才存在」**——Berkeley 的 *esse est percipi* × 物哀。

一個地圖停止被繪製的世界。已知之外的土地是真的，但沒有名字、沒有人、沒有故事——直到有人走到那裡。
玩家是**見證人**。

- 不是劍與魔法。質感是昭和鄉間：電線桿、單線鐵道、無人車站、錢湯煙囪、空曠田野裡亮著的自動販賣機、
  防波堤、風車、梯田。安靜、有點寂寥、但溫暖。
- 氣質參考：《ヨコハマ買い出し紀行》《キノの旅》《少女終末旅行》、千尋的海上電車；
  夢想感參考《No Man's Sky》（遠方總有東西）與《霍爾的移動城堡》（家與那扇門）。
- 相機可由玩家切換（預設 TPS）。沒有許願祭壇。戰鬥不在主路徑。沒有塔、沒有樓層。

## 3. 核心迴圈

1. **遠方有高的東西**（鐵塔、煙囪、巨樹）→ 走過去。
2. **顯影**：第一次走進未記的區塊，世界在眼前成形——模型一次寫下居民、一個地標、一條當地的**習俗**
   （每個地方有自己的規矩）。寫完存檔，這個區塊從此不需要模型。
3. 居民有**小委託**（確定性模板：送、找、帶路；文字在顯影時寫好）→ 得到**紀念物**。
4. **家與門**：紀念物帶回家佈置。家有一扇門，門上四格轉盤，每格釘一個你見證過的地方或朋友的家。
   連線碼 = 門牌。
5. **手記**：在任何地方留下自己寫的字。別人來到同一處會看到，也可以寫下不同的版本。

## 4. 架構：區塊世界

```
世界 = 無限區塊格；區塊 (cx, cz) = 32×32 格
區塊內容 = 地形（確定性，seed+座標）  ← src/shared/chunks.ts，不落盤
         + 顯影層（模型寫一次的 .oui） ← 存檔，P2
原點區塊 (0,0) = cartridge 裡的 authored scene（出生地／家的周遭）
```

- `SceneGraph` 與 Scene DSL **不改**：顯影層就是一份既有 DSL 的 Scene 程式（區塊內本地座標 0..31），
  引擎在渲染時加 `(cx*32, 0, cz*32)` 偏移。Rule 7 原樣成立。
- 引擎：玩家周圍半徑 2 的區塊常駐（5×5 繪製、3×3 有碰撞體）；`tps_exploration@1` 的 behaviour
  `open: true` 是開關，此時不再 `clampToFloor`；太陽與陰影視錐跟著玩家；霧有下限，蓋住區塊邊緣。
- 存檔落點（Rule 9，全部在 instance 的 active save 之下，cartridge 永不被寫入）：

```
saves/<saveId>/
├── save.json          既有 + player 世界座標、home 座標、門的轉盤
├── karma.jsonl        既有 + { cx, cz }；新 action: witness / request / note
├── chunks/<cx>_<cz>/  scene.oui + dialogue/<npcId>.oui（顯影一次，之後唯讀）
├── lore.jsonl         lore 節點（append-only；邊寫在節點的 links 裡）
└── notes.jsonl        手記（para-ledger）
```

- cartridge 多一個不可變的 `bible/core.md`、`bible/style.md`（納入 content hash）。

## 5. 控制核心（Zero）

**固定錨點**：`core`（世界前提、規則、基調、禁止事項）+ `style`（命名法、語言、句長、語氣）。
建世界時寫一次，每次顯影原封不動注入。取代現在沒有錨點的狀態。

**lore 圖**：節點 = 地點／人物／習俗／事件／物件，帶 `coord`、`links[]`、`tone`（-1..1）。
取代 `src/harness/builtins/worldContext.ts` 的 `KARMA_WINDOW = 12` 扁平視窗。

顯影 `(cx, cz)` 時的啟動（純函式，`src/shared/lore.ts`，可測）：

1. 空間核：距離越近啟動越高（鄰近區塊的節點最熱）。
2. 近期 karma 提到的節點加權。
3. 沿 `links` 擴散一步（×0.5），整體衰減。
4. 取 top-K（≈12）渲染進 prompt。

效果：**相鄰地區的習俗自然相關，文化沿地圖呈漸層**，走得越遠越陌生——無限地圖不漂移的原因。

prompt 組裝順序（沿用 harness 的 section ORDER）：
`core → style → DSL 規格 → lore 熱區 → 鄰區摘要（名字、習俗）→ 本區地形摘要（水、林、巨樹）→ 輸出契約`。

輸出契約：Scene 程式 + 新元件 `Lore(id, kind, label, text, links[], tone)` 宣告它新增的節點；
parser 驗證（id 不撞、links 指向存在的節點、語言 = `genesis.language`）才入圖。
衛生檢查（取自 Zero 的 hygiene）：助理腔、空泛神祕語、重複命名 → 走 repair；兩輪後仍失敗，
區塊維持「未記」，之後可重試。**絕不寫入 fallback 內容。**

`tone` 的區域加權平均決定居民 mood 與天空／霧的色偏（mood-congruent，便宜且有感）。

## 6. 精神（LLoreM）

- **事實帳本** = `karma.jsonl`：誰、何時、在哪個區塊、做了什麼。只增不改。
- **para-ledger** = `notes.jsonl`：`{ id, author, at, coord, anchors: [karmaSeq | loreId], text, contests?: noteId }`。
  手記是玩家自己打的字（不經模型、不翻譯）。對同一錨點可以有多個互相矛盾的版本，並列顯示。
- **居民證詞**也是敘述：顯影 prompt 明示「居民可以記錯、可以各說各話」，矛盾是特色不是 bug。
- 上鏈（帳本 hash 錨定）是之後的事，不在本計畫範圍。

## 7. 家與門

- 家 = 玩家認領的一個區塊（預設原點）。佈置 = 紀念物擺放，存在存檔；連線時為共享文件的一部分。
- 門 = 四格轉盤：每格是 `{ 世界座標 }` 或 `{ 朋友的門牌 }`。轉到座標 = 快速旅行；轉到門牌 = 連線加入。
- 玩家世界座標寫進存檔，重開遊戲回到原地。

## 8. 連線（CRDT 邊界）

- 房間 = 房主的世界。加入前比對 cartridge `contentHash`（沿用既有 SessionHello gate）。
- Y.Doc 承載：`overlays`（顯影層，key = 座標，**先寫者為準**——誰先見證，誰的版本成為這個世界的正史）、
  `lore`、`notes`、`home`。
- 位置走 awareness，不進文件。不可變的 cartridge 內容不走 Yjs（既有決定不變）；
  顯影層不是 cartridge 內容，是見證出來的進度，所以可以走。
- 單機世界各自分歧是預期行為：每個人的世界由自己見證；透過門拜訪時，你進的是**對方的**世界。

## 9. 砍掉、下架、保留

| 處置 | 項目 |
| --- | --- |
| **砍掉（主遊戲不出現）** | 許願祭壇／`generateItem` UI、互動當下的 `generateDialogue`、塔與樓層、HUD 的 FLOOR |
| **下架為進階入口「重制」** | Genre Matrix、Capability Compiler、多 context、Scene Candidate Gallery、Design Interview、Story 步驟。定位：拿這個基礎世界改聖經／規則／原點場景 → 發布帶 lineage 的新 cartridge。先從路由拿掉，新流程可玩後再決定刪不刪 |
| **保留但不加功能** | 戰鬥與其他 kit（由 cartridge 宣告才出現）、workspaces、mod proposal、endless depths |
| **保留並依賴** | cartridge／instance 儲存、hash 驗證、Data Key 加密、harness（sections／tools／effects）、repair、y-webrtc 房間 |

主路徑（2026-09-17 起）：**New Game → 選 seed（隨機或輸入）→ Start**，遊戲本體是內建卡帶《未記之地》。
極簡 Create 退到 seed 畫面底部的進階連結，舊 Create 在「Remix」。

極簡 Create：**世界名 + 一句意圖 + 語言** → 模型寫世界聖經與原點場景 → 發布 cartridge
（`tps_exploration@1`）→ 直接進遊戲。沒有模型 → `error` 狀態與可行動的 hint，不出貨任何預製世界（Rule 2）。

## 10. 分階段與驗收

| 階段 | 內容 | 驗收 |
| --- | --- | --- |
| **P1 無限地形** | `shared/chunks.ts`、`engine/ChunkField.tsx`、`open` behaviour、太陽／霧跟隨、HUD 座標 | 在任一 TPS 卡帶中朝同一方向跑 5 分鐘不碰邊界；重開後同座標地形相同；fps 不掉到 45 以下 |
| **P1.5** | 相機 TPS/FPS 切換；玩家世界座標存檔 | 重開遊戲回到離開的位置 |
| **P2 顯影** | 世界聖經、`shared/lore.ts` 啟動函式、`Lore` DSL 元件、區塊顯影管線、靜態對話、鄉間詞彙與調色盤（新 biome／prop） | 走進未記區塊 → 居民出現且重開後不變；相鄰區塊習俗可見相關；拔掉模型仍可行走；對話零 LLM 呼叫 |
| **P3 家與門** | 家的佈置、紀念物、委託模板、門轉盤 | 完成一個委託 → 紀念物擺在家 → 用門回到該地 |
| **P4 連線** | overlays／lore／notes／home 走 Yjs；門牌加入 | 兩台機器同一區塊看到同一批居民與彼此的手記 |
| **P5 重制入口** | 舊 Create 移到進階入口；主路徑換成極簡 Create | 新玩家三次輸入內進到遊戲 |

### 目前狀態（2026-09-17）

**P1 完成並實機驗證**：`bun run check` 全綠（88 檔 678 測試）；在 dev app 內實際走過——
《P0 Finale Test》（9×9 白天 meadow）連續衝刺到 `LAND 0 · -3`、《湯屋來信》到 `LAND -1 · -1`，
全程 60 FPS、沒有邊界、陰影跟隨、authored 地板正確嵌在原點區塊的洞裡。

- `src/shared/chunks.ts`（+ `tests/shared/chunks.test.ts`）：value noise 地表（水／岸／岩）、林地散佈、稀有巨樹、
  原點區塊為 authored scene 留洞。
- `src/renderer/engine/ChunkField.tsx`：5×5 繪製、3×3 碰撞；`Ground`／`Props` 加 `hole`、`solid`。
- `kits/registry.ts` `open`；`Player.tsx` 在 open 時不夾邊界；`Atmosphere.tsx` 太陽跟隨與霧下限；
  `engineStore.chunk` → HUD `LAND cx · cz`。
- 驗證方式：`scripts/cdp-drive.ts`（背景用 CDP 驅動 dev app：按鍵、點擊、截圖，不搶畫面）。

P1 尚未做：同座標重開後地形相同只由單元測試保證（未實機重開比對）；5 分鐘長跑未做（只跑了約 15 秒）。

**P1.5 完成並實機驗證**（2026-09-17）：`bun run check` 全綠（88 檔 679 測試）。

- 相機：open 世界按 `V`（或 HUD 的 `Cam` 按鈕）在 orbit／fps 間切換；其他 kit 仍顯示 `scene locked`。
  `CameraRig.tsx`（`switchable`、`switchedCamera`）、`hud/ActionDock.tsx`、`Hud.tsx` 操作提示。
- 座標存檔：`SaveState.position = { sceneId, x, y, z, yaw }`（`shared/cartridge.ts`，main 端 zod `savedPositionSchema`），
  經既有 `instances.checkpoint` 寫入；`engine/playerProbe.ts` 讓 app 層按需讀取 ref（不進 zustand）；
  `app/usePositionAutosave.ts` 每 5 秒取樣、走超過 2 格才寫，離開 Play 再寫一次；載入時同場景才從該點出生並還原視角。
- 天光下限：open 且場景無 `sun` 時加一盞跟隨玩家的方向光（`Atmosphere.tsx` `Skylight`，強度 5——夜景地面反照率很低，0.7／1.8 實測仍近全黑）。
- HUD：open 世界不顯示 `FLOOR`。
- 實機：《test》走到 `LAND -2 · -2` → 回主頁 → 殺掉 app 重開 → Continue，回到同座標、同視角，截圖地形逐塊相同（也補上了 P1 的「重開同座標地形相同」）；
  V 切 FPS／切回 ORBIT 正常；《湯屋來信》走出去地面可辨識。60 FPS。

P1.5 沒做：app 被直接關掉時，最後 5 秒內的移動不會寫入（只有定期與離開 Play 時寫）。

**P2 顯影 完成並實機驗證**（2026-09-17）：`bun run check` 全綠（91 檔 689 測試）。

- 世界聖經：cartridge 多 `bible/core.md`、`bible/style.md`（`WorldBible`），進檔案表與 content hash，publish／read／pack／unpack 全線支援；
  舊卡帶 `bible === null` → HUD 顯示「此卡帶沒有聖經」與 hint，不塞預設聖經。
- `shared/lore.ts`：`LoreNode`、`activate()`（空間核 + 近期 karma 加權 + 沿 links 擴散一步 ×0.5 + top-12）、`regionalTone()`。
  `harness/builtins/worldContext.ts` 在開放地以 lore 熱區取代 `KARMA_WINDOW` 扁平視窗（有界場景仍用舊視窗）。
- DSL：`Chunk(name, [...])` 方言 = 既有 `Prop/Wall/NPC/Choice` + 新 `Lore(id, kind, label, text, links[], tone)` + `Talk(npcId, line, choices)`（`dsl/schemas/chunk.ts`、`parse/chunk.ts`）。
  結構檢查（居民 1–4 各有一段 Talk、Choice 只能 talk/trade/leave、原點區塊不可放進作者場景、lore id 不撞、links 可解析、必有 place + custom、
  **鄰區有習俗時新習俗必須 link 到其中之一**）與衛生檢查（助理腔、空泛神祕語、與既有節點重名、zh/ja 語言）全部走 repair；兩輪失敗 → 區塊維持未記。
  存檔時轉回一般 `Scene` 與 `Dialogue` 程式（`serializeScene`、新 `serializeDialogue`）。
- 管線 `narrative/witness.ts` + `app/land/witness.ts`：prompt 段落順序 = 聖經 core → style → Chunk 規格 → lore 熱區 → 鄰區（名字、習俗 id）→ 本區地形摘要 → 輸出契約。
  背景執行、一次一塊、走路不等；HUD `未記 / 顯影中 / 已記 · 地名 / 失敗 + Retry`，無法顯影時顯示原因（無聖經／模型離線／未設定）。
- 存檔（main，zod + DSL 驗證）：`saves/<id>/chunks/<cx>_<cz>/{scene.oui, dialogue/<npcId>.oui}` 寫一次（已存在 → `chunk-already-witnessed`），`lore.jsonl` append-only；
  karma 加 `cx/cz` 與 `witness` action。IPC `instances.readLand`／`instances.witness`。
- 引擎：`ChunkField` 疊加顯影層（居民、建物、碰撞；剛在玩家腳下顯影的區塊先不給碰撞體，離開後才實體化）、非原點居民可互動、
  `FarLand.tsx` 遠景剪影（巨樹 + 已記區塊的煙囪／鐵塔／風車／民家，不受霧影響，半徑 6 區塊）。
- 對話零 LLM：開放地的 NPC 一律讀存好的 Dialogue；選項只做記帳（karma + gives），不呼叫 `resolveChoice`；沒寫過話的居民誠實顯示「還沒被寫下」。
  main 每個推論請求印一行 `[inference] chat …` 供驗證。
- 鄉間詞彙：`PROP_KINDS` 加 utility_pole、vending_machine、bus_stop、rail_track、chimney、steel_tower、windmill、breakwater、house（`engine/palette/rural.ts`），biome 加 `countryside`。
- 實機（gpt-5.4-mini，測試卡帶《Witness Test》= P0 Finale Test 場景 + **手寫的測試聖經**，只在暫存 userData；區塊內容全由模型寫）：
  原點 → 「霞田角」（習俗「等車先揮手」）、東 (1,0) → 「灰坂」（「先揮一下」）、北 (1,-1) → 「霜田尾」（「先看再揮」，links → `gray_slope_rule@1,0`），
  (3,1) → 「霞田」：習俗沿地圖呈變奏。重開 app 後居民、地名、對話完全相同。走到「夏津」「阿亞」旁按 E 選選項：karma 帶 cx/cz 寫入，
  main log 對話前後推論請求數不變（7 → 7）。推論設定指向不存在的 llama.cpp → HUD「未記 · 模型不可達」，照樣跨區塊走到 (5,3)，零請求。60 FPS。

P2 沒做／已知問題：
- `.spire-backup` 還不含 `chunks/` 與 `lore.jsonl`：備份還原會遺失已顯影的土地。
- `tone` 只進 prompt（regional tone），尚未影響居民 mood 或天空／霧色偏。
- 範例程式的內容會滲進第一批習俗（原點的「揮手」母題來自範例）；已在 prompt 註明範例只示範語法，未再重測原點。
- 模型常把鄰區節點寫成裸 slug；已讓 parser 解析為最近的同名節點。
- 開放地的林地降密度（樹 11% → 6%、巨樹機率 ×2）：實測林地與石地會卡人；這改變了所有卡帶的確定性地形（地形不落盤，顯影層不受影響）。
  TPS 相機沒有碰撞，民家會遮住鏡頭。
- 原點作者居民的靜態對話（原點區塊顯影時一併寫）只有程式與單元測試，測試卡帶原點沒有 NPC，未實機驗到。

**P3 家與門 完成並實機驗證**（2026-09-17）：`bun run check` 全綠（91 檔 692 測試）。

- 委託 = 顯影時寫好的確定性模板：`Find(id, giver, ask, x, z, reward, thanks)`（在本區某格搜尋）、
  `Deliver(…, place, …)`／`Guide(…, place, …)`（走進另一個已記地點的區塊）；獎勵是同一程式裡的 `Item`（沿用 Item DSL，限 charm／tool／consumable）。
  非原點區塊必須恰好一個委託；Deliver／Guide 的 place 必須是別區已知的 place 節點，沒有就要求改寫 Find（repair）。
  存成 `chunks/<cx>_<cz>/errands.oui`（`Errands([...])` 程式，`dsl/schemas/errand.ts`、`parse/errand.ts`、`serializeErrands.ts`）。
- 進度全在 save.json `land`：`errands`（accepted → reached → done）、`home { cx, cz, keepsakes }`、`door`（四格，place 或 room），main zod 驗證、經 checkpoint 寫入。
- 對話卡（靜態對話）多一段委託：接受 → 進行中提示（「找」顯示由資料推導的方位：約 N 格、哪個方向）→ 回報並拿到紀念物。全程零模型。
- 家（預設原點）：出生點旁一扇門與紀念物展示台（`engine/HomeYard.tsx`）；門面板（`app/land/DoorPanel.tsx`）四格轉盤可釘任何已記地點、Go 傳送（`engineStore.requestTeleport`），
  帶著的紀念物可擺上展示台。朋友門牌（room）型別已在存檔裡，UI 留給 P4。
- 實機：南邊 (0,1) 顯影為「濱田角」，千夏的委託「我把藍傘袋弄丟了」→ 接受 → 走到 (9,13) 按 E「Search here」→ 回去回報 → 拿到「藍傘袋」
  → 走回家按 E 開門 → 擺上展示台（場景裡出現標著「藍傘袋」的台座）、轉盤 1 釘「濱田角」→ Go → 出現在濱田角「作」的身旁。
  save.json 與 karma（accepted／found／finished，帶 cx/cz）都正確落盤；推論請求數全程不變。

P3 沒做／已知問題：
- 送／帶路只有單元測試（本次實機生成的是 Find），未實機走過。
- 家只能是原點；「認領別的區塊當家」未做。紀念物是自動排成一列，不能自由擺放；台座只是方塊 + 名牌，沒有依 meshDna 組模型。
- 門傳送的落點是該區第一位居民旁，沒有檢查碰撞體。

**P4 連線 完成並實機驗證**（2026-09-17）：`bun run check` 全綠（91 檔 694 測試）。

- 手記（para-ledger）：`LandNote { id, author, at, coord{cx,cz,x,z}, anchors[], text, contests }`，玩家自己打的字；
  `saves/<id>/notes.jsonl` append-only（main zod，contests 必須指向既有手記），IPC `instances.appendNote`；karma 記 `note` 事實。
  N 鍵／HUD「手記」開面板：本區所有手記並列（含「another version of …」），可寫下「不同的版本」；場景裡有標記與作者名。
- 房間 Y.Doc（`net/landSync.ts`）：`overlays`（key = 區塊座標，只在不存在時寫入＝先寫者為準）、`lore`、`notes`、`home`；
  房主發布自己見證的一切，訪客只鏡像文件、不讀自己磁碟（`hydrateInstance` 對 peer 不載入土地）、不顯影；
  訪客的手記寫進文件，由房主寫入房主的 notes.jsonl；位置走 awareness（每 250 ms），場景顯示其他玩家與名字。
  開放地上訪客跟居民說話直接讀鏡像的靜態對話，不再送去房主畫面。離開房間時訪客回到自己的存檔與土地。
- 門：轉盤可釘朋友的門牌（= 房間碼），Go 即以目前存檔加入；房主面板顯示自己的門牌。加入前的 contentHash／runtime pin 檢查沿用 SessionHello。
- 實機（同一台機器兩個行程：host = ud1、guest = ud2，guest 設成沒有模型）：測試卡帶是 v2《湯屋來信》1.1.0 + 手寫測試聖經。
  host 顯影原點「初見田角」（同時為作者居民千代／小春／雲水寫下靜態對話與小春的委託）→ host 留手記 → 開房 → guest 加入：
  guest 看到「已記 · 初見田角」、房主身影、房主手記；guest 對手記寫「不同的版本」→ host 的 notes.jsonl 多一行（contests 正確）、host 面板並列兩版；
  guest 走到千代旁按 E，看到與 host 存檔相同的台詞「今天風不大。」，host 推論請求數不變。guest 離房後回到自己的未記世界，再用自家門轉盤釘 host 門牌 → Go → 約 40 秒後連上並鏡像出 host 的土地。

P4 沒做／已知問題：
- **連線不穩**：同機兩行程經公開 signaling（y-webrtc-eu.fly.dev）時，5 次加入有 3 次 60–96 秒內沒連上；
  抓到的一次失敗是雙方同時當 initiator（y-webrtc glare）後 simple-peer 各留一條單向資料通道，訊息全被丟掉。成功時 15–40 秒。未修（要改 y-webrtc 或換傳輸）。
- 只有房主能顯影；訪客走到房主沒去過的區塊只會看到未記。訪客的委託進度、門轉盤不同步也不落盤。
- 位置同步沒有插值以外的處理（沒有動畫、只有膠囊 + 名字）。
- 多人仍要求 v2 卡帶（既有閘門）；手記備份同 P2：`.spire-backup` 不含 notes.jsonl。

**P5 重制入口 完成並實機驗證**（2026-09-17）：`bun run check` 全綠（92 檔 696 測試）。

- 標題選單「New Game」→ 極簡 Create（`app/NewWorldScreen.tsx`）：世界名 + 一句意圖 + 語言（預設 OS 語系）→ Make this world。
  管線 `narrative/newWorld.ts`：模型寫 `Bible(premise, tone, rules[], taboos[], naming, voice)`（新方言，確定性轉成 core.md／style.md，
  style 第一行 `Language: <tag>` 進 hash，載入時優先於 OS 語系）→ 模型寫原點 `Scene`（countryside、12–24 格、1–3 居民、
  牆不得碰邊界、不得有怪物／寶箱／出口／觸發器／平台，違反走 repair）→ 既有 Forge 以固定 `adventure_rpg`（單一 context、`tps_exploration@1`）
  組成 v2 卡帶並附聖經發布 → 建存檔 → 直接進遊戲，原點區塊自動顯影。沒有模型 → `new-world-no-model` 與 hint，不給任何預製世界。
- 發布驗證放寬一條：開放地 kit（`tps_exploration@1`）的終點場景可以沒有結局出口（無限地圖沒有結局）；其他 kit 規則不變。
- 舊 Create（場景基底／模式／設計審查／畫廊／故事／Forge）沒刪，移到標題選單「Remix」與新畫面底部的進階連結。
- 實機（全新空白 userData）：沒有模型時 New Game 顯示錯誤與 hint；接上模型後「New Game → 輸入世界名 → 輸入一句意圖 → Make this world」
  約 10 秒進到《防波堤之後》（v2、含 bible/core.md、bible/style.md、邊緣開放的原點），原點隨即顯影為「潮風堤外」並有委託。
  再以 ja-JP 建《風見の丘》：style.md 首行 `Language: ja-JP`，OS 雖是 zh-TW，原點居民的台詞與習俗都是日文。

P5 沒做／已知問題：
- 驗收「三次輸入內進到遊戲」：選 New Game 之後是名稱、意圖、Make 三次輸入（語言用預設）；若把選單點擊算進去是四次。
- ja-JP 第一次建世界時模型把聖經欄位拆成變數語句，2 輪 repair 仍失敗（畫面正確顯示錯誤）；已在 prompt 明示「只寫一行 root = Bible(...)」後重試成功，未做更多次統計。
- 新世界的 cartridgeId 對非 ASCII 名稱會變成 `cartridge-<隨機>`；作者欄固定為 "you"。

實測發現、與本計畫無關但擋路的 bug：v2 存檔格式沒有 v1 reader，
`~/Library/Application Support/Unwritten Land/instances/` 下既有的 v1 instance 全部讀不到。
（2026-09-17 緩解）以前只要有一個 v1 存檔，整個存檔清單就失敗、Cartridges 面板只剩 `instance-invalid`、Continue 變灰，
新玩家完全進不了遊戲。現在清單會跳過 v1 存檔，Cartridges 面板另外列出「N 個舊格式存檔讀不到、檔案未動」；
直接打開 v1 存檔回 `instance-legacy-format`。v1 reader 本身仍未做。
同日另修：啟動時第一次模型探測失敗會一直卡在「不可達」——探測逾時 3 → 8 秒、不可達時每 15 秒靜默重測、
New Game 進畫面就重測，且「Make this world」不再被探測結果鎖住（真的失敗會顯示實際錯誤）。

**單一遊戲 × 多 seed 完成並實機驗證**（2026-09-17）：`bun run check` 全綠（95 檔 705 測試）。

- 內建遊戲《未記之地》`aether-land@1.0.0`：`src/main/game/aether-land.json`（由 `scripts/build-base-game.mjs` 經 `openLandCartridge` 產生，
  聖經依本計畫 §2 手寫、英文；原點只有地板、天空、太陽，**沒有預製居民**——居民照樣由顯影寫）。
  main `game.base` IPC 第一次呼叫時發布到 cartridges（single-flight；同 hash 已存在視為成功），contentHash 在不同機器上相同。
- seed：`shared/seedCode.ts`，8 碼 `[A-HJ-NP-Z2-9]`、顯示為 `XXXX-XXXX`；`SaveState.seed` 由 `instances.create` 帶入（zod 驗格式）。
  `landSeedOf(save)` 同時給 `GameCanvas`（地形）與顯影（本區地形摘要）用。房間快照帶 seed，訪客走房主的地。
- 畫面：`app/SeedScreen.tsx`（預填隨機 seed、Roll、可手打、Start → 建存檔 `未記之地 · XXXX-XXXX` → 進遊戲）；HUD 顯示 `SEED`。
- 實機（兩個全新 userData）：兩邊都用 `HAKE-2345` 開局，同一位置截圖地形逐像素幾乎相同（平均差 0.009，只有待機動畫區不同）；
  `WXYZ-6789` 是另一片地。沒有模型時 Start 照樣進遊戲，HUD 顯示「未記」與原因。接 OpenAI 時開 `PCZ7-WY73`，(0,0)、(-1,-1)、(-2,-1) 陸續顯影。

多 seed 沒做／已知問題：
- 同 seed 的兩個存檔地形相同，但居民各自顯影、彼此不同（顯影寫在存檔裡）；要「同 seed 同居民」只能靠房間。
- v1 存檔 reader 依決定延後。內建遊戲的聖經是英文、`Language:` 行沒寫，顯影語言跟 OS 語系。

**推論 provider：OpenAI／Apple Foundation Models**（2026-09-17）：

- 預設順序：`.env` 有 `OPENAI_API_KEY` → OpenAI（`gpt-5.4-mini`）；沒有 key 但有 `/usr/bin/fm` → `apple-fm`；否則 llama.cpp sidecar。
  已存在的 `inference.json` 不會被改寫，要換就到 F12 → Inference 選 kind。
- `apple-fm`：base `http://127.0.0.1:11535/v1`、model `system`、無 key；sidecar = `/usr/bin/fm serve --port 11535`（受信任路徑，不需 .gguf）。
  選到 apple-fm 時每次探測若 fm 沒在跑就啟動它；沒同意條款時 fm 立即退出，System 面板顯示原因與「`sudo fm license`」hint，
  同意後下一次（≤ 15 秒）重測就會接上。不送 reasoning 參數、不送 grammar。sidecar 失敗訊息不再被 stop 蓋成 stopped，並去掉終端色碼。
- 實機：apple-fm 設定 → System 面板 `offline — … YOU HAVE NOT AGREED … run sudo fm license`（本機未同意條款，未能再往下）；
  預設設定 + OpenAI key → `online · 130 model(s)`，進遊戲顯影成功。

provider 沒做／沒驗到：
- **Apple 模型生成完全沒驗到**（需要使用者自己 `sudo fm license`）。串流、`stop`、`max_tokens` 是否被 fm serve 支援未知；
  顯影 prompt 約 3.8k tokens + 最多 3.2k 輸出，可能超過 Apple 模型的 context，屆時會以錯誤顯示、區塊維持未記。

## 11. 已知未決

- 地形是平的。高低差（丘陵、階地）最有「無人深空感」，但牽涉碰撞與相機，P1 不做。
- 湖面目前可行走（沿用既有 pond 行為）。要不要擋、要不要船，P3 前決定。
- 夜景／濃霧場景（如《湯屋來信》fog 0.06、無 sun）走出去後外面幾乎全黑：忠於作者的天空，但開放地需要一個天光下限。
- authored 原點場景若四周被牆圍死，玩家走不出去：極簡 Create 的 prompt 必須要求原點場景邊緣開放。
- 現有 `BIOMES`／`PROP_KINDS` 偏奇幻（altar、lava_forge…）。P2 要補鄉間詞彙；舊詞彙為了舊卡帶可讀而保留。
- 遠景：霧下限讓 64 m 外不可見，與「遠方有高的東西」衝突。P2 需要一個只畫地標剪影的遠景層。
