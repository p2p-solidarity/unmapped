# Unwritten Land：2D 開放世界素材包研究

研究里程碑：2D 開放地素材選型
價格基準：只記錄官方作者頁或官方商店在研究當日顯示的價格；`Name your own price`、限時折扣與組合包價格都可能變動。未能在官方頁確認的價格不猜測。

## 結論先行

產品方向不應退回「三個互不相干的小遊戲」，而應保留 Unwritten Land 的核心：**連續、可探索、可持續擴張的未記之地**。2D 的價值，是把地圖生成從任意 3D scene graph 降成較容易驗證的 tile/chunk 配置，而不是拿掉世界感。

建議採兩階段素材策略：

1. **現在的原型與公開技術示範：用 CC0。** `Ninja Adventure` 已同時提供地形、室內、50+ 角色、怪物、物件、UI、音效與音樂；再加 Kenney 的 CC0 UI／城鎮包，以及 PixelKensei 的日式地標，就能合法地把素材隨程式、測試資料與可攜卡帶一起散布。這是目前最適合讓 AI 產生地圖配置、最低授權摩擦的組合。
2. **正式的一致美術：優先洽談 GuttyKreum The Japan Collection 的平台授權。** 它是候選中最接近「昭和／近現代日本鄉間」者，且同一作者已有鄉間空屋、車站、神社、商店、室內、角色、UI 與 icon。標準授權適合成品遊戲，卻明確禁止素材再散布與讓終端使用者抽取；不能直接推論可內建到 AI 創作平台。

如果只看地圖技術，**VectoRaith 最適合程序化 chunk**：地形生態完整、系列可互換，並提供 2×2／3×3 autotile。可是它的日本建築偏傳統而非昭和，官方又標示 `No AI`／禁止 `AI learning`；即使我們只讓模型輸出 asset ID、沒有拿圖片訓練，也應先取得作者書面確認。

最重要的架構結論是：**模型只產生語意化的地圖與 asset ID，不看圖、不寫 atlas 座標，也不把商業素材複製進作品檔。** 播放器持有版本化素材目錄、接邊規則、碰撞、footprint、z-layer 與動畫資料；作品只保存 seed、chunk 配置、局部 patch 與素材引用。這同時降低模型 token、錯配與局部修改成本。

## 評估標準

對「無主之地」式 2D 開放探索，素材數量並不是唯一指標。排序時優先看：

- **連續地圖能力**：草地、土路、道路、水岸、橋、牆、坡面等是否能無縫接邊，是否有 autotile／Wang rule 或至少可整理成固定 edge mask。
- **chunk 穩定性**：正交 top-down 比 isometric 更容易做跨 chunk 接邊、碰撞、遮擋與尋路；16／32 px 也比任意大圖更容易讓 AI 以格子語意操作。
- **完整生態**：建築外觀與室內、角色四向動畫、props、UI／icon 是否能維持一致畫風。
- **可索引性**：命名單圖、規格一致的 atlas、固定 tile size、可分離動畫，都比只有展示用大圖更適合建立 asset catalog。
- **授權邊界**：一般「可商用」不等於可把原始素材放進遊戲引擎、創作工具或可匯出的卡帶；「可修改」也不等於可讓模型訓練或可將衍生素材再散布。

## Pixel art 候選

### 1. GuttyKreum — The Japan Collection：最符合正式視覺方向

- **官方價格與範圍**：完整組合目前為 **US$153.83**，原價 US$307.66，共 34 個 pack；包含日本城市、鄉間空屋、車站、神社、溫泉、便利商店、學校、辦公室、室內、20 個動畫角色、UI、225 個 icon、肖像與背景。[完整組合官方頁](https://itch.io/s/103166/the-complete-japan-collection-bundle) · [作者完整目錄](https://guttykreum.itch.io/)
- **最相關的鄉間子組合**：`Rural Japan` 為 **US$27.72**，含 Train Station、Temples and Shrines I／II、Overgrown Backstreets。[Rural Japan 官方組合頁](https://itch.io/s/68289/the-japan-bundle-rural-japan)
- **地圖內容**：Overgrown Backstreets 為 **US$9.99**，有 681 個 32×32 PNG 鄉間日本 tiles，含土路、空屋、倉庫、鐵皮／木／瓦屋頂、舊廂型車、樹、藤蔓與 props；Train Station 為 **US$7.99**，有 385 個靜態 tile 與 8 組動畫；Temples and Shrines 為 **US$8.99**，有 587 個 tile、池塘／水景動畫、橋、石路、神社與庭園。[Overgrown Backstreets](https://guttykreum.itch.io/the-japan-collection-overgrown-backstreets) · [Train Station](https://guttykreum.itch.io/train-station-game-assets) · [Temples and Shrines](https://guttykreum.itch.io/japanese-zen-garden)
- **城市與昭和日常**：Japanese City 為 **US$7.99**，637 個靜態 tile、8 組動畫，含傳統店面、公寓、模組化道路／人行道、電線、自販機等；另有 379-tile 免費版，可先驗證 importer。[Japanese City](https://guttykreum.itch.io/japanese-town) · [免費版](https://guttykreum.itch.io/free-japanese-city-game-assets)
- **角色與 UI**：JRPG Characters 為 **US$8.99**，20 個 32×32 動畫角色與 template；UI 為 **US$8.99**，帶 1990s／2000s 電腦介面氣質；Icons 為 **US$6.99**。同作者生態能降低拼包後的比例、palette 與輪廓不一致。[角色](https://guttykreum.itch.io/jrpg-character-pack) · [UI](https://guttykreum.itch.io/the-japan-collection-ui)
- **格式／相依**：每包有通用 PNG 主 sheet，並另附 Unity package 與 RPG Maker 格式；不強制使用 Unity 或 RPG Maker。缺點是沒有承諾全面提供命名單圖，需要先做一次 atlas 索引。
- **更新狀態**：Japanese City 持續擴充，多個 pack 已新增 Unity package；生態仍有維護。
- **授權**：官方頁允許商用、修改與衍生作品，但禁止分享、轉售、再授權素材本身，且不能讓成品使用者把素材抽出另用。[官方頁內授權文字](https://guttykreum.itch.io/the-japan-collection-overgrown-backstreets)
- **缺口／判斷**：地形、道路與池塘足以做一個日本聚落，但多 biome 與真正大面積自然地形不如 VectoRaith；作者也尚未提供稻田主題。**視覺最對題，但公開產品前必須談 creator-tool／platform license。**

### 2. VectoRaith 16×16 Complete Collection：chunk／autotile 技術首選

- **官方價格與範圍**：目前 **US$54.30**，原價 US$160.48，共 33 個 pack；含 21 種 biome、8 種建築系列、5,100+ 室內 tile、NPC／動物／怪物、500+ icon。[完整組合官方頁](https://itch.io/s/133183/vectoraiths-16x16-game-assets-complete-collection)
- **日本建築**：Traditional Japanese Buildings 單包 **US$5**，提供 16／32／48 px PNG、池塘動畫、角落建築、recolor／reshade 版本，主 sheet 可用於 Godot、Unity、Tiled 等；已更新至 v1.06。[Traditional Japanese Buildings](https://vectoraith.itch.io/traditional-japanese-buildings-tileset-pack)
- **開放地圖能力**：biome 系列涵蓋 temperate／boreal／tundra forest、grassland、scrubland、savannah、coastal、wetland、rainforest、alpine、desert、cave；主要地形支援 Godot 2×2 autotile，部分 pack 也提供 3×3 版本。建築系列標示 swap-compatible，最容易整理成跨 chunk 的 edge rule。[組合規格](https://itch.io/s/133183/vectoraiths-16x16-game-assets-complete-collection)
- **完整度**：terrain／water／外景／室內／角色／animals／props／icons 高；沒有一套明確完整的 UI chrome。日本建築偏傳統，昭和日常要混入 Modern Architecture、farming 與 generic interiors。
- **授權**：允許商用與修改；禁止再散布、轉售、再授權素材或衍生檔，並禁止 `AI learning`。頁面同時有更廣的 `No AI` 標示。[官方授權文字](https://vectoraith.itch.io/traditional-japanese-buildings-tileset-pack)
- **缺口／判斷**：技術最適合生成式 chunk，但 `No AI` 的範圍可能超過模型訓練。若要讓模型依 catalog 產生地圖 JSON，仍應把「模型不讀取圖片，只選擇人工標註的 asset ID」寫清楚向作者確認。

### 3. LimeZu Modern 系列：最快取得完整現代生活內容

- **官方價格**：Modern Exteriors 原價 **US$5**、研究當日特價 **US$2.50**；Modern Interiors 完整版最低 **US$1.50**；Modern Farm 原價 **US$7.50**、當日 **US$4.95**；Modern UI 原價 **US$6**、當日 **US$3.90**。折扣價格是即時價格，不應寫死進採購預算。[Modern Exteriors](https://limezu.itch.io/modernexteriors) · [Modern Interiors](https://limezu.itch.io/moderninteriors) · [Modern Farm](https://limezu.itch.io/modernfarm) · [Modern UI](https://limezu.itch.io/modernuserinterface)
- **格式與完整度**：16／32／48 px；Exteriors 有道路、建築、車輛、動畫、Godot／GameMaker autotile 與命名單圖；Interiors 有數千件家具、100+ 動畫、角色生成器、UI 元素與 Japanese house；Farm 補作物、動物與農場 props。命名單圖對 AI 的 asset-ID 選材和局部替換特別友善。
- **更新狀態**：Exteriors 已達第 400 次更新，之後仍有公告；內容量與維護成熟度都高。
- **授權**：付費版允許商用與修改，禁止再散布或修改後轉售，並要求 credit。官方條款沒有看到 AI 禁令，但也沒有授權把素材庫內建到生成平台。[Exteriors 官方授權](https://limezu.itch.io/modernexteriors) · [Interiors 官方授權](https://limezu.itch.io/moderninteriors)
- **缺口／判斷**：是非常好的「現代生活功能覆蓋」包，但整體像泛現代城市；昭和日本識別仍需自製招牌、電柱、車款、屋頂與室內陳設。適合內部原型，不是最終品牌美術的第一選擇。

### 4. pixel-boy — Ninja Adventure：單一 CC0 完整原型包首選

- **價格／授權**：免費／Name your own price，整包以 **CC0** 發布，可商用，免署名；因此可以放進公開 repo、測試 fixture、播放器與可匯出的 cartridge，不會碰到一般商業素材的再散布限制。[官方素材頁](https://pixel-boy.itch.io/ninja-adventure-asset-pack)
- **內容**：50+ 動畫角色與 faceset、30+ 動畫怪物、9 bosses、60+ items、室內／外 tileset、floor autotiling、UI、30+ VFX、2 fonts、100+ SFX、37 music，另有 Godot 3／4 範例專案。另有大型動畫／動物／露營更新。
- **格式／相依**：16×16 top-down pixel art；素材本身可獨立使用，Godot 專案只是範例。
- **缺口／判斷**：主題偏忍者／奇幻而非昭和；但是「完整、免費、CC0、可實際跑」四項同時成立，最適合作為播放器、chunk、存檔與 AI 配置生成的基準素材。

### 5. Kenney CC0 生態：授權與工具鏈最穩的通用補充

- **官方價格／授權**：單獨素材頁可免費下載且皆為 CC0；All-in-1 目前 **US$19.95**，含 60,000+ assets、2D／3D／UI／audio／fonts，版本為 3.7.0。[All-in-1 官方頁](https://kenney.itch.io/kenney-game-assets) · [官方授權 FAQ](https://kenney.nl/support)
- **相關包**：Tiny Town 是 16×16、130+ files；RPG Urban Pack 是 16×16、480+ files；Roguelike/RPG pack 是 16×16、1,700+ files；UI Pack RPG Expansion 有 85+ files，全部 CC0。[Tiny Town](https://kenney.nl/assets/tiny-town) · [RPG Urban Pack](https://kenney.nl/assets/rpg-urban-pack) · [Roguelike/RPG](https://kenney.nl/assets/roguelike-rpg-pack) · [UI RPG Expansion](https://kenney.nl/assets/ui-pack-rpg-expansion)
- **缺口／判斷**：規格整齊、icon／UI／props 很好補，但不同子系列不是完全同一 palette，也沒有日本鄉間辨識。適合作為 CC0 工具箱，不宜單獨定義正式畫風。

### 6. finalbossblues — Time Fantasy 生態：完整，但年代與題材偏江戶／SNES fantasy

- **官方價格／內容**：Japan RPG Tileset 為 **US$8**，16×16，包含竹林、鳥居、燈籠、鯉魚池、和式房屋／城、榻榻米、佛壇、圍爐裏、茶具、滑門動畫、8 角色與武士／忍者 battlers。[Japan RPG Tileset](https://finalbossblues.itch.io/time-fantasy-japan)
- **同系補齊**：Core terrain 為 **US$15**，涵蓋草／土／岩／沙、山崖、沙漠、動畫水域、房屋與商店內外；Character Core 為 **US$20**，有 64+ modular pieces、5 heroes、16 NPC 與四向動畫；1000+ Icons 為 **US$6**。[Core terrain](https://finalbossblues.itch.io/fantasy-rpg-tileset-pack) · [Character Core](https://finalbossblues.itch.io/time-elements-character-core-set) · [Icons](https://finalbossblues.itch.io/icons)
- **更新／授權**：Character Core 有更新；Japan pack 較舊。作者的官方素材頁允許商用、免 royalty／credit、可修改，禁止直接再散布。[官方授權例](https://finalbossblues.itch.io/pixel-animations-and-effects)
- **缺口／判斷**：完整度高，但整體是 SNES fantasy／封建日本，不是昭和「廢棄鄉間與日常場所」；也仍有平台再散布問題。

### 7. RyoJohno — Showa-Retro HouseSet：最精準的昭和室內補充

- **官方價格／內容**：**US$5**，48×48 top-view；16 種地板、22 種牆、12 種門（含配色共 24）、143 種小物，含榻榻米與室內 map chips。[官方素材頁](https://ryojohno.itch.io/showa-retro-houseset)
- **授權**：允許加工／修改，禁止再散布；credit 非必要。
- **缺口／判斷**：題材非常準，但只有室內，沒有 terrain、道路、水域、角色、動畫或 UI。48 px 也不能直接混入 32 px GuttyKreum atlas；較適合當美術參考或另談授權後重製同尺度版本，不是主包。

### 8. PixelKensei — Feudal Japan CC0：授權安全的日式地標 filler

- **官方價格／內容**：Vol.2、Vol.3 都是免費／Name your own price，32×32 transparent PNG、spritesheet 與 `.gpl` palette，支援 RPG Maker、Godot、Unity、GameMaker、LDtk、Tiled，明示 CC0。[Vol.2 Structures](https://pixelkensei.itch.io/feudal-japan-props-vol2-free-pixel-art-assets) · [Vol.3 Nature](https://pixelkensei.itch.io/feudal-japan-props-vol3-free-pixel-art-assets)
- **範圍**：Vol.2 只有 8 個建築物件（牆、門、井、橋、階梯等）；Vol.3 只有 8 個自然物（櫻、鯉魚池、竹林、石路等）。
- **缺口／判斷**：不是完整 tileset，但非常適合補 Ninja Adventure／Kenney 原型的日式辨識，亦可作為 importer、catalog 與授權測試 fixture。

### 9. Wagara Life：精緻傳統室內，但生態剛起步

- **官方價格／內容**：Room 為 **US$7**，16×16 固定 16 色、96 tiles，提供透明單圖與 sheet，含榻榻米、障子／襖、緣側、茶具、燈籠、圍棋等。[官方素材頁](https://nagi-kujyou.itch.io/wagara-life-1-room)
- **授權／更新**：允許商用與修改、credit optional、禁止素材再散布；研究時新發布，作者規劃 Garden、Teahouse、Shop、Shrine、Hot spring。
- **缺口／判斷**：可以觀察，但現階段沒有 exterior、角色或 UI，不應依賴尚未交付的 roadmap。

## 非 pixel／手繪候選

### 10. Kokoro Reflections — Spirit of Japan：內容合適，但授權直接衝突

- **官方價格／內容**：**US$16.99**；32／48 px，含草、土、水、路、榻榻米、木地板、牆／屋頂、橋、鳥居、井、樹、家具、食物，以及門、櫃、火、風鈴等動畫；支援 RPG Maker 與其他可讀 32／48 px tile 的引擎。[Spirit of Japan 官方頁](https://kokororeflections.itch.io/kr-spirit-of-japan-tileset-for-rpgs-part-1-village)
- **授權**：官方允許一般遊戲的商用與修改，但明確限定 `games only`，禁止 `anything AI-related — NO EXCEPTIONS`，而且沒有書面同意不得作為 game engine 或 game-making software 的一部分。[官方 Usage Terms](https://kokororeflections.com/terms-use/)
- **缺口／判斷**：缺角色與 UI，更重要的是授權與 Unwritten Land 的 AI 創作平台本質衝突。**不建議購買或使用，除非作者先給書面豁免。**

### 11. SeventhSolution — Japanese Village：畫風對題，但內容小且授權不足

- **官方價格／內容**：**US$9.99**；top-down isometric，依 1920×1080 場景設計，只有一張 tileable 主背景、bonsai／sakura、石像、花、石頭、一棟建築、燈籠、鳥居與井；全部是靜態 PNG，可用於任意引擎。[官方素材頁](https://seventhsolution.itch.io/japanese-village-asset-pack)
- **授權／更新風險**：頁面沒有清楚授予商用、修改與可散布成品的標準條款，只列出創作者免責與使用者須守法；其「更多 props」連結在研究時已失效。
- **缺口／判斷**：沒有角色、動畫、室內、UI，也不是可組大片 chunk 的完整 terrain。適合單張 isometric 場景，不適合 Unwritten Land 主地圖；購買前也要先補書面授權。

### 12. Penzilla — Cozy Isometric RPG Village：可愛手繪，但更像小型農村場景包

- **官方價格／內容**：單包 **US$6.99**；PNG sheet 與 individual exports，4 棟建築、4 組攤位／推車、base tile、43 植物與樹、12 decor，各有多色版本；Master Collection 為 **US$238**、63 個項目。[Cozy Isometric RPG Village](https://penzilla.itch.io/isometric-rpg-village) · [Master Collection](https://itch.io/s/152976/penzilla-master-collection-lifetime-dev-kit)
- **授權**：商品頁寫 royalty-free／commercial use，但完整 Standard License PDF 隨下載提供；在把素材放進生成平台前仍需實際審閱 PDF，而不能只根據宣傳標籤推論。
- **缺口／判斷**：手繪一致性好，但 base tile 與物件量更適合手工小場景；缺道路／水域變體、完整室內、居民動畫與 UI。isometric 也會提高 chunk seam、遮擋、碰撞與尋路成本。

### 13. nacl1234 — Top-Down Feudal Japan Complete 2D Mega Pack：日式 props 很豐富，地形系統不足

- **官方價格／內容**：Name your own price；完整包最低 **US$1**，240 個約 192 px 透明 PNG、一般 atlas、packed atlas 與 JSON metadata，涵蓋町家、神社、庭園、市場、居家、城堡、戰營、武器庫與 19 個模組建築 tile；可用於 Unity、Godot、GameMaker、RPG Maker、Tiled。[官方素材頁](https://nacl1234.itch.io/top-down-feudal-japan-complete-2d-mega-pack)
- **授權／更新**：允許個人／商業遊戲使用，禁止轉售或再散布素材；研究時已發布。官方標記為 AI-assisted graphics。
- **缺口／判斷**：角色、角色動畫、UI、icon 缺失；地形主要是物件與少量模組 tile，而非完整 shoreline／road autotile。適合做事件地標和場景 props，不適合單獨撐起無限 chunk。

### 14. CraftPix Vector Top-Down 生態：可編輯向量很多，但 AI 條款不適合本案

- **官方內容**：Simple Summer Top-Down Vector Tileset 免費，AI／EPS／PNG、256×256 tiles，含道路交叉、建築、橋、井、樹、石頭與 props；付費 Top-Down 2D Game Vector Tileset 另有四 biome、路徑、池塘、房屋與自然物，但官方頁只顯示 Premium 解鎖，沒有可核實單包價格。[Simple Summer](https://craftpix.net/freebies/free-simple-summer-top-down-vector-tileset/) · [Top-Down Vector Tileset](https://craftpix.net/product/top-down-2d-game-vector-tileset-for-td/)
- **授權**：一般付費與 freebie 都可商用、修改；禁止 source／modified art 被另一位終端使用者取用。更重要的是，官方明確禁止素材用於 AI／ML 的 training、fine-tuning、developing、**testing、validating 或 improving**。[官方 File Licenses](https://craftpix.net/file-licenses/)
- **缺口／判斷**：即使模型只產配置，Unwritten Land 本身仍在「testing／validating generative AI」；這個條款比單純禁止訓練更廣。除非 CraftPix 書面允許本案的具體工作流，應排除。

### 15. GameArt2D Top-Down Vector 系列：引擎中立，但日本氣質與完整度不足

- **官方內容**：The Village 有 200+ vector tiles，含 grass、hill、stone ground、trees、houses，另附 128／256 px PNG；同系列有動畫 top-down heroes／enemies 與 vector GUI。支援 Unity、Godot、GameMaker、Construct 等。官方頁可核實規格，但研究時未在可讀頁面看到價格，因此不報價。[The Village](https://www.gameart2d.com/top-down-tileset-2.html) · [角色](https://www.gameart2d.com/game-sprites-1.html) · [GUI](https://www.gameart2d.com/game-gui-1.html)
- **授權**：付費素材可商用、修改、用於無限項目；禁止素材單獨轉售、再授權、分享或再散布。免費區素材為 CC0。[官方 License](https://www.gameart2d.com/license.html)
- **缺口／判斷**：vector source 對換色與重製很友善，但現有系列偏西方 fantasy，室內、日式角色與昭和 props 不足。適合作為「非 pixel renderer 可行性」對照，不適合作為正式主包。

## 跨候選比較

| 候選 | 連續 terrain／road／water | 建築外＋內 | 角色動畫 | Props | UI／icon | 對 chunk 與局部替換 | 平台授權風險 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GuttyKreum Japan | 中高 | 高 | 高 | 高 | 高 | 32 px 一致；需自建 atlas 索引 | 高：禁止再散布／抽取 |
| VectoRaith Complete | 高 | 高 | 高 | 高 | icon 高、UI 缺 | 最佳：autotile、swap-compatible | 高：再散布＋`No AI` 歧義 |
| LimeZu Modern | 高 | 高 | 高 | 高 | 高 | 很佳：named singles＋autotile | 中高：標準遊戲授權而非平台授權 |
| Ninja Adventure | 中高 | 中高 | 高 | 高 | 高 | 很佳；已有 floor autotiling | **低：CC0** |
| Kenney | 中 | 中 | 中 | 高 | 高 | 格式整齊，但跨系列 palette 不一 | **低：CC0** |
| Time Fantasy | 高 | 高 | 高 | 高 | icon 高、UI 不明 | 適合 16 px tilemap | 中高：禁止 direct redistribution |
| PixelKensei Feudal | 低 | 低 | 無 | 低 | 無 | 適合安全的少量替換 | **低：CC0** |
| Kokoro Spirit of Japan | 中 | 高 | 無 | 高 | 無 | 32／48 px 可用 | **不可用：明禁 AI／engine** |

## 三種可落地採購組合

### A. 最快原型／授權最安全：CC0 組合，US$0

- Ninja Adventure：主 terrain、室內、角色、動畫、UI、icon、SFX、music。
- Kenney Tiny Town／RPG Urban／UI RPG Expansion：補通用城鎮、介面與 props。
- PixelKensei Feudal Japan Vol.2／Vol.3：補鳥居、橋、竹林、櫻花、鯉魚池等日式地標。

這是**最適合 AI 生成地圖配置**的方案，因為 CC0 允許複製、修改與再散布；可以把素材與 metadata 一起放進 repo、播放器和 export，不需要讓每位玩家另買素材。缺點是正式畫風不夠昭和，三個來源需要做 palette 與尺寸統一。應把它當技術與生成成功率基準，而不是承諾最終美術。

### B. 最貼近題目的聚焦垂直切片：約 US$61.68，但先限內部驗證

- GuttyKreum Rural Japan：US$27.72。
- JRPG Characters：US$8.99。
- Interior Essentials：US$8.99。
- UI：US$8.99。
- Icons：US$6.99。

合計約 **US$61.68**。這組可完成鄉間道路／空屋、車站、神社、室內、人物、HUD 與物品的完整垂直切片，比一開始買全包更聚焦。先用免費 Japanese City 驗證 atlas importer、遮擋、動畫、碰撞與跨 chunk 接邊，通過再買。標準授權下應只用於團隊內部原型或單一成品遊戲；若要成為對外的生成平台，先取得平台授權。

### C. 正式一致美術／長期日本世界：GuttyKreum Complete，US$153.83，前提是談成平台授權

完整組合的 34 個 pack 能讓世界從鄉間空屋與車站延伸到地方商店、學校、辦公室、城市、溫泉、神社、祭典與交通，最能支撐「走出去永遠還有下一個地方」的產品感。它也是唯一同時在日本題材、室內外、角色、UI、icons 與長期擴充上都足夠完整的單一作者生態。

採購前應把下列情境寄給作者逐項確認：

1. 素材由 Unwritten Land 安裝包提供，使用者不能匯出原圖。
2. AI 只讀人工撰寫的 semantic catalog，不把圖片送給模型或拿來訓練。
3. 使用者可以生成任意多個地圖與遊戲，但輸出是否含素材檔、是否只能在播放器內執行。
4. `.cartridge` 發布、備份、P2P 傳輸與版本保存是否構成再散布。
5. 是否需要 per-seat、per-title、平台或 revenue-share 授權。

若談不成平台授權，正式產品應維持 CC0 素材庫，另以委託美術逐步替換；不要用技術手段把標準授權包「藏起來」來規避條款。

## 對播放器與生成契約的具體建議

### 作品負責

- 世界 seed、chunk 座標與使用中的 palette／biome ID。
- 每個 chunk 的 terrain 語意格（如 `grass`, `dirt_path`, `shallow_water`），以及建築／props／NPC 的 asset ID。
- 劇情、互動、規則、任務狀態與局部 patch。
- 明確引用素材包 ID 與版本；不保存 atlas 像素座標，也不內嵌受限制的素材原檔。

### 播放器／素材服務負責

- `assetId -> source rectangle / standalone file / animation frames` 的版本化 catalog。
- terrain edge mask、autotile 規則、chunk 邊界銜接與 deterministic fallback。
- footprint、collision、navigation cost、occlusion、z-layer、anchor、interaction bounds。
- 素材存在性、尺寸、動畫 frame 與授權 policy 的驗證。
- 只在玩家合法持有／產品已獲授權時解析商業 asset pack；否則回報缺少素材，不能偷換成看似合理的假圖。

### AI 負責

- 從受限的 semantic ID 清單選材與配置，不接觸圖片 bytes。
- 產生 chunk plan 與局部 patch，例如「把 `shop_03` 換成 `abandoned_house_02`，保留道路、NPC 與任務狀態」。
- 不自行創造不存在的 asset ID；catalog validation 失敗才進 repair，最多固定次數。

這個分工能讓「修改一條道路」「替換一間屋」「把村口改成雨後廢墟」只改少量 chunk patch，而不必重產整張地圖或整個作品。

## 最終推薦

1. **立即採用 A 組合建立 32×32 top-down chunk spike**，保留現有 Cartridge／Instance／Workspace 分工與 Three.js 舊路徑；新 2D 路徑只新增 tile renderer 與 asset catalog，不先做通用素材商城。
2. **同時以 GuttyKreum Japanese City Free 做第二個視覺驗證**。若同一 chunk schema 能無修改切換 CC0 與 Gutty atlas，代表作品契約沒有綁死某個素材包。
3. **正式美術優先談 GuttyKreum 平台授權**；談成後先買 US$61.68 聚焦組合，世界規模確定再升完整包。若授權談不成，委託一套自有的昭和日本 32×32 terrain／road／water／building shell，角色與 UI 可先沿用 CC0，這比混用數個不能再散布的商業包更可持續。
4. **把 VectoRaith 當規格參考與備選，不直接默認可用於 AI 平台**。其 autotile 與 swap-compatible 組織最值得學，但應先釐清 `No AI`。

依現有證據，下一階段最值得降低的成本不是「讓模型畫更多圖」，而是**建立小而穩定的 semantic asset catalog 與 chunk edge rules**。這會保住開放地圖感，同時把 AI 的任務收斂到它最擅長的選擇、配置與局部修改。
