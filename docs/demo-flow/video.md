# 投稿影片稿（ETHGlobal Tokyo 2026，目標 3:30）

一支影片同時給總評審（Technicality、Originality、Practicality、Usability、WOW）和兩個合作方獎
（ENS、Uniswap Foundation 只看投稿資料）。講稿用英文（國際評審與 Showcase），操作說明用繁中；
錄製語言最後由使用者決定。內容和投稿文字（description、how it's made、ENS／Uniswap 用途）一致。

## 官方規則（2026-09-26 讀取，錄之前再看一次）

| 規則 | 對這支影片的意思 |
| --- | --- |
| 2–4 分鐘，超出或不足直接被拒 | 目標 3:30；剪完量一次總長 |
| ≥ 720p，.mp4 或 .mov，不能用手機錄 | macOS 螢幕錄影（⌘⇧5）或 OBS，1440×900 以上 |
| 必須真人講解；不能配樂＋字幕代替講話；不能 TTS／AI 配音 | 全程人聲，不放音樂 |
| 不能加速影片；可以剪掉等待 | 等模型、等交易確認的地方**剪掉**，絕不快轉 |
| 背景故事 ≤ 20 秒；多展示實際操作；投影片每張 ≤ 4 點 | 開場 15 秒；全片只有 4 張投影片 |
| 截止 9/27（日）09:00 JST | 至少留 2 小時上傳與重錄 |

## 錄之前

- 照 [setup.md](setup.md) 準備：`.env` 放 `OPENAI_API_KEY`；A、B 兩個視窗各用拋棄式資料夾；兩邊到「設定 → 信令伺服器」存本機 `ws://127.0.0.1:4444`。
- **介面語言**：給國際評審建議用英文介面（「設定」→ 語言 English），世界內容就會用英文寫；想保留中文世界也可以，講稿不用改。下面每個按鈕都列出英文／繁中。
- B 先用「世界 → 新遊戲 → 開始」（Worlds → New game → Start）開好內建世界，等原點顯影完成。
- 市場：根世界 `aether-land.unmapped.eth` 已在 v2 合約上拍賣完、池子已開；gas station 已上線，錄之前打開 https://unmapped-relay.gimmychang.workers.dev/status 確認 relayer 不是 null、還有 ETH（2026-09-26 是 0.0318 ETH，見 [chain-audit](../e2e/milestone-chain-audit/result.md)）；passkey 帳戶先領好測試 USDC。
- 買入時 app 會打開系統瀏覽器完成簽名。這一步在錄影的 Mac 上**先排練一次**（E2E 用的是虛擬驗證器）。
- 每一幕分開錄，最後剪在一起；每一段都錄長一點，剪的時候只拿掉等待。

## 分段稿

### 0:00–0:15 開場（背景 ≤ 20 秒）
- **畫面**：A 的標題畫面，背後的大地在動；標題四個入口「Continue · Worlds · Create World · Settings（繼續・世界・創造世界・設定）」。
- **講稿**：
  > This is UNMAPPED. The map has no edge, and nothing on it exists until someone walks there. An AI writes each place the first time a player arrives — and friends' worlds join into one continent, with no game server in charge.

### 0:15–0:55 幾個字變成一個世界
- **畫面**：Create World（創造世界）→ Start a new game（開始新的遊戲）→ 只在描述欄打幾個字（例：*a clockwork city in the desert*／沙漠裡的鐘錶城），**名稱留空** → Write the world（撰寫世界）→ 七張卡邊寫邊出現 → 把 How it looks（外觀風格）那張鎖住 → Continue to the look（前往看樣子）→ 三張草圖畫出來的同時故事在旁邊串流 → 選一張 → 故事章節 → Continue to build（前往建立）→ 報價 → Build and play（建立並開始玩）→ 大地。
- **剪**：卡片串流只留前 3–4 秒和寫完的那一刻；草圖從開始畫剪到三張都出來；建立剪到大地出現。
- **講稿**：
  > I type a few words — no name, no settings. The model drafts the world's bible card by card while I watch; I can edit, lock or rewrite any card. It sketches three concept pictures to pick an art direction, writes the story in the background, and before anything is built it shows a quote — calls, tokens and price. Then I'm walking.
- 實測（[milestone-rev6-p2-create](../e2e/milestone-rev6-p2-create/result.md)）：七張卡約 4.5 秒；三張草圖 9–11 秒、同時故事在串流；按下建立 3.6–6.1 秒就在大地上。

### 0:55–1:25 走路不等 AI
- **畫面**：往霧裡走，新的一塊地顯影（地名、道具、居民出現），角色一直在動。
- **剪**：顯影中那幾秒可以剪短，但要留一段「角色在走、HUD 顯示顯影中」的畫面。
- **投影片 1（4 點）**：
  - The model writes a tiny game language — never code, never JSON
  - A parser checks every line; numbers are clamped
  - Errors go back for at most 2 repairs, then an honest error
  - Written once, saved — never asks the model again
- **講稿**：
  > The ground comes from a seed, so walking never waits for the AI. When I step into fog, the model witnesses the place — but it only proposes. It writes our small game language; a parser checks every line and clamps every number. If it's wrong, it gets two tries to fix it, then an error — never a fake scene. Once written, the place is saved and never needs the model again.
- 實測（[milestone-demo-flow](../e2e/milestone-demo-flow/result.md)）：一次寫好 6.7 秒；要修正時約 23 秒，全程都能走，74–80 FPS。

### 1:25–2:10 朋友的世界連成大陸（CRDT）
- **畫面（A）**：在家門口按 E → Open my door to friends（向夥伴敞開我的門）→ 門牌。
- **畫面（B）**：Worlds → Continent（世界 → 大陸）→ 選自己的存檔 → 在 Friend's door number or ENS name（夥伴的門牌或 ENS 名稱）輸入門牌 → Walk through（穿過這扇門）→ 兩邊 HUD「CONTINENT XXXXXX · LIVE · 1 PEER」（大陸 XXXXXX · 已連線 · 1 位夥伴）→ 在家門按 E → Go to their door（前往他們的門）→ B 站在 A 剛寫好的土地上。
- **畫面（A）**：A 看到 B 在走（按 V 切換兩種畫法各拍 2 秒）。B 按 N 留言 → A 按 N，留言立刻出現。
- **投影片 2（4 點）**：
  - Every machine keeps its own copy — a Yjs CRDT
  - A place or a note is written once, only by its owner
  - Copies merge by union: order and repeats don't matter
  - Nothing crosses before a verified hello (code, protocol, physics)
- **講稿**：
  > My friend opens my door code and walks onto my land. Everything they see, I witnessed — their machine made zero model calls. Where we stand is live presence; what we write is history. Each machine keeps its own copy, every page is written once by its owner, and copies merge by union — so there's nothing to fight over and no server as referee. A note they leave shows up on my screen right away.
- 實測：加入大陸 578 毫秒；B 在 A 的土地上 0 次模型呼叫；留言即時出現在 A 的畫面（[milestone-demo-flow](../e2e/milestone-demo-flow/result.md)）。

### 2:10–2:45 ENSv2：名字就是世界的身分
- **畫面**：Worlds → Cartridges（世界 → 卡帶）：內建世界那一行 `aether-land.unmapped.eth` · points at this version；Worlds → Saves（世界 → 存檔）→ ENS name for this save（這個存檔的 ENS 名稱）→ Record with passkey（用 passkey 記錄）→ 出現 `<save>.aether-land.unmapped.eth`。再切到公開拍賣頁 https://unmapped-auction.gimmychang.workers.dev/#aether-land 的家族樹（不加 `#aether-land` 會打開最新上架、0 筆出價就結束的 lantern-quay）。
- **選拍**：Worlds → Cartridges → Open by ENS name（用 ENS 名稱開啟）輸入存檔名稱，畫面說出那個存檔的進度點（[milestone-lineage-names](../e2e/milestone-lineage-names/result.md) 已實機驗證）。
- **投影片 3（4 點）**：
  - A world's name holds only its id, version and sha256
  - The app opens a world only if the hash matches the bytes
  - A remix — and even a save — is a subname
  - Names stay emancipated — safely transferable tokens
- **講稿**：
  > Every published world is an immutable, hashed cartridge on your disk. On ENSv2 it gets a name — aether-land.unmapped.eth — whose records hold only its id, version and hash. A remix is a subname under its parent, and even my save gets one, held by my passkey account and recording the save's hash and progress. The family tree is the ENS hierarchy, and every name stays emancipated and safely transferable.

### 2:45–3:20 Uniswap：公平發行與血緣權利金，免錢包
- **畫面**：市場裡根世界的拍賣結果 → 公開拍賣頁上清算價逐塊上升的線 → Spend (USDC)（花費）輸入 10 → Buy with passkey（用 passkey 買入）→ 系統瀏覽器的簽名頁 → 回到 app 看到買到的數量 → Pay out royalties（發放分潤）→ 付給名字持有人。
- **剪**：Sepolia 確認交易的等待全部剪掉。
- **投影片 4（4 點）**：
  - Uniswap Continuous Clearing Auction prices every world
  - Graduation opens a v4 pool at the discovered price
  - Our v4 hook takes 1% per swap, split 50/30/20 up the line
  - Passkey smart account — no wallet, no ETH
- **講稿**：
  > Each world's token is launched with Uniswap's Continuous Clearing Auction, priced in its parent's token. Our first world took four passkey bids and cleared 86% above its floor, then graduated into a v4 pool. I buy with a passkey — no wallet, no ETH, and no key inside the app: a gas station only pays gas and can't change what I signed. Our hook takes exactly one percent, and it pays whoever holds the world's ENS name.
- 實測（Sepolia 真實交易，[milestone-lineage-relay](../e2e/milestone-lineage-relay/result.md)）：v2 根世界 4 筆出價、清算 0.018636 USDC（+86%）、募得 9,025 USDC、經 gas station 結算並開池；10 USDC 買到 528.45，hook 抽 5.338（剛好 1%），分潤付給名字持有人。

### 3:20–3:35 收尾
- **畫面**：回到 A 的大地，B 站在旁邊。
- **講稿**：
  > Your world is files you own, the AI is only a guest, and the chain is optional — switch it off and the game still plays. UNMAPPED is open source. Thanks for watching.

## 不能講過頭（照 track 文件）

- **不要說**「按 Touch ID」：錄影的簽名是在系統瀏覽器完成的；說 "sign with a passkey"。
- **名字轉手後權利金跟著新持有人**只在 Sepolia 真實合約上的模擬（`eth_simulateV1`）驗過——影片裡只說 "pays whoever holds the name"，不要示範轉手。
- **50／30／20 三代分帳**只在模擬裡驗過；真實交易的根世界是第一代，1% 全歸它。投影片 4 寫的是規則，講稿說的是真實發生的「剛好 1%」。
- **朋友離線也能進你的世界**還沒做（第三段）；影片只講兩邊同時在線。
- 本機模型（Apple、Ollama、llama.cpp）已接上但沒量過；影片只用雲端模型的數字。

## 剪完檢查

- [ ] 總長 2:00–4:00（目標 3:30）
- [ ] 沒有任何加速片段；等待都是剪掉的
- [ ] 全程人聲、沒有配樂、沒有 TTS
- [ ] 開場背景 ≤ 20 秒；投影片 4 張、每張 ≤ 4 點
- [ ] ≥ 720p，.mp4 或 .mov
- [ ] 畫面裡沒有金鑰、`.env`、私鑰（終端機與設定畫面都檢查）
