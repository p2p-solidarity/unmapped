# Aether Spire：可組裝、可改作、可分享的遊戲卡帶主機

> 本文件是目前產品與工程的最高層規格。它取代「單一 Seed 產生一個爬塔世界」的舊假設。
> Aether Spire 要做的是一個讓使用者選擇遊戲意圖、組裝場景、使用 AI 做遊戲編導，最後
> 烘焙成可遊玩、可改作、可分享、可精確驗證的 Cartridge。

## 0. 不可違反的產品決定

1. **Create 不是寫主角或填一份 Seed 問卷。** Create 是組裝一個遊戲的規則、能力、素材與場景。
2. **Genre 不等於 Engine Kit。** `first_person_shooter`、`turn_based`、`team` 是使用者的遊戲意圖；
   `fps_puzzle@1`、`turn_scheduler@1`、`listen_server@1` 才是引擎或 plugin 的實作能力。
3. **場景先於故事。** 使用者先挑可視化的 Scene Base，再由能力編譯器與 AI 把它們變成可玩的
   Scene Candidates；Story 是根據已選場景產生的內容層，不得決定地圖幾何。
4. **角色不是遊戲定義的中心。** PlayerProfile、角色外觀、裝備與隊伍資料在 Play/Instance 邊界建立，
   由所選 module 決定需要哪些欄位；Create 不應強迫使用者先創建一個主角。
5. **AI 只能提出結構化提案。** AI 不可直接改運行中的規則、存檔或已發布卡帶；提案必須經過型別、
   相容性與預覽，再由使用者核准並發布新的 immutable revision。
6. **Generation seed 不是身份。** 生成 seed 只用於重骰與追溯；卡帶身份由內容 hash 決定，多人遊玩
   使用 content/effective hash，而不是使用者輸入的一個數字。
7. **已發布卡帶與個人存檔嚴格分離。** 分享卡帶不帶走存檔；作者發布新版不覆蓋既有 instance。
8. **可玩性優先於工程展示。** UI 的主體是 Three.js 的工廠、場景與素材預覽，不是表單卡片堆疊。
9. **同一款遊戲可有多個能力情境。** FPS、卡牌回合、載具或 2.5D 段落可在同一張卡帶內按 Scene/Phase
   透過已宣告的 Capability Context 切換，不得把整款遊戲鎖死在單一 camera 或單一 kit。
10. **Plugin 與 Mod 不混用。** 可執行的新引擎能力只能來自平台內建或經信任、簽章與版本鎖定的
    Engine Extension；一般 Seed Mod 與素材包保持 data-only，不能用設定檔假裝實作不存在的物理或網路能力。

## 1. 核心詞彙與生命週期

| 名稱 | 定義 | 可變性 | 內容 |
| --- | --- | --- | --- |
| **Game Definition** | 使用者決定「這是一款什麼遊戲」的語義設計 | Create/Remix 期間可變 | genre tags、capability profile、scene plan、assets、story layer |
| **Capability Module** | 實作一項或多項遊戲能力的內建模組或 data-only plugin | 由平台安裝/鎖定 | camera、physics、combat、timing、network、UI 等 provider |
| **Scene Base** | Gallery 裡可直接觀看的場景基底與素材構圖 | workspace 中可替換 | Three.js 預覽、基底 DSL、資產引用、可支援的 genre |
| **Scene Candidate** | 依 Game Definition 生成的可玩場景候選 | workspace 中可重骰/修改 | 已解析的 Scene DSL、contract、asset refs、generation receipt |
| **Cartridge Revision** | 發布後不可變的完整遊戲版本 | 唯讀 | Game Definition、rules、已選場景、素材、module/mod lock |
| **Player Profile** | 使用者跨遊戲的本機身份與外觀偏好 | 本機可變 | profile id、display name、外觀引用、控制偏好 |
| **World Instance** | 某張卡帶的一次長期遊玩世界 | 可變 | instance id、卡帶 pin、目前使用的 save slot |
| **Save** | Instance 的持久進度與玩家/隊伍狀態 | 可變 | scene、flags、inventory、player state、party state、karma |
| **Session** | 當下的連線遊玩場次 | 記憶體瞬態 | host、peers、inputs、物理快照、session hash |

關係如下：

```text
Scene Base + Genre Selection
        ↓
Capability Compiler + AI Design Review
        ↓
Scene Gallery Candidates
        ↓ 使用者挑選、排序、設定入口/結局
Game Definition Draft
        ↓ story after scenes
Cartridge Revision (immutable)
        ↓ pin exact hashes
World Instance → Save + PlayerProfile → Runtime Session
```

## 2. Create 的正確流程

Create 必須按下列順序進行。每一階段都能返回上一階段，不可讓下一階段偷偷覆寫使用者的選擇。

### 2.1 Scene Base Gallery：先選可視化的世界基底

第一畫面不是 Seed 表單，而是實際 Three.js Scene Gallery：

- 每個 Scene Base 都以真正的 Three.js 場景預覽呈現，支援旋轉、縮放、鏡頭切換與素材檢視。
- Base 不是最終關卡；它是空間構圖、素材語言、路線骨架與可用互動點的起點。
- 使用者可以選一個或多個 base，作為後續 Scene Slots 的素材來源。
- Gallery 的候選來源可以是內建 asset pack、已安裝的 data-only plugin、使用者匯入的素材，或 AI 產生的
  base；所有來源都必須有可驗證的 asset hash。
- 「骰子」在此階段代表換一組基底候選；不改動玩家尚未確認的 Game Definition。
- prompt 只描述空間、素材與氛圍，例如「把工廠改成垂直的熔爐與維修平台」；不得在這一步生成主角背景。

Base 選擇結果只記錄為 `SceneBaseSelection`，不產生存檔，也不建立角色。

### 2.2 Genre Matrix：多選遊戲模式

使用者在矩陣中多選 genre、節奏、玩家結構與世界語言。Catalog 在 UI 上是一個可搜尋矩陣，但資料層
明確拆成 `GenreId`、`TimingId`、`PlayerStructureId` 與 `SettingTagId`；它們共同組成 `ModeSelection`，不能
因為都顯示成標籤就混成相同語義。選擇可回頭修改。

Scene Base、Genre、Timing、Player Structure、Capability Profile、Asset Pack 任一變更，都必須讓受影響的
Design Review、Scene Candidate 與 Compatibility Report 標記為 stale，並明確告知使用者哪些已選內容仍被
保留、哪些需要重新生成；不可靜默沿用，也不可整份清空未受影響的選擇。

矩陣要把下列清單完整呈現為可搜尋、可多選的標籤。顯示文字可以是中文，儲存使用穩定的 ASCII id。
同義或重複詞只在資料層合併，UI 仍可顯示別名。

```ts
// The catalog is the source of truth; the union is generated from this exact list.
const GAME_MODE_IDS = [/* ids listed in the tables below */] as const;
type GameModeId = (typeof GAME_MODE_IDS)[number];
```

#### RPG、戰鬥、敘事與卡牌

| 顯示名稱 | 穩定 id |
| --- | --- |
| RPG | `rpg` |
| 卡牌 | `card` |
| TCG | `tcg` |
| ARPG / 動作角色扮演 | `action_rpg` |
| 冒險角色扮演 | `adventure_rpg` |
| 策略和戰術角色扮演 | `strategy_rpg` |
| 日系角色扮演 | `jrpg` |
| 回合制角色扮演 | `turn_based_rpg` |
| 回合制（節奏軸，可與 FPS、團隊等 genre 疊加） | `turn_based` |
| 類 Rogue | `roguelike` |
| 輕度 Rogue | `roguelite` |
| 砍殺 | `hack_and_slash` |
| 解謎 | `puzzle` |
| 視覺小說 | `visual_novel` |
| 劇情豐富 | `story_rich` |

#### 射擊、街機、平台與格鬥

| 顯示名稱 | 穩定 id |
| --- | --- |
| 第一人稱射擊 | `first_person_shooter` |
| 第三人稱射擊 | `third_person_shooter` |
| 街機 | `arcade` |
| 節奏 | `rhythm` |
| 平台和快跑 | `platformer` |
| 清版射擊 | `shoot_em_up` |
| 格鬥和武術 | `fighting` |
| 隱藏物件 | `hidden_object` |
| 休閒 | `casual` |
| 類銀河戰士惡魔城 | `metroidvania` |

#### 種田、建造與模擬

| 顯示名稱 | 穩定 id |
| --- | --- |
| 種田 | `farming` |
| 建造和自動化遊戲 | `automation` |
| 嗜好與工作模擬 | `job_sim` |
| 戀愛模擬 | `dating_sim` |
| 農場和工藝模擬 | `farm_craft_sim` |
| 太空和飛行模擬 | `space_flight_sim` |
| 生活和沉浸模擬 | `life_sim` |
| 沙盒和物理模擬 | `sandbox_physics` |
| 城市和居住地建造 | `city_builder` |

#### 策略、卡牌與棋盤

| 顯示名稱 | 穩定 id |
| --- | --- |
| 回合制策略 | `turn_based_strategy` |
| 即時策略 | `real_time_strategy` |
| 塔防 | `tower_defense` |
| 卡牌和棋盤 | `card_board` |
| 大戰略 | `grand_strategy` |
| 4X | `4x` |
| 軍事策略 | `military_strategy` |

#### 運動與競速

| 顯示名稱 | 穩定 id |
| --- | --- |
| 運動模擬 | `sports_sim` |
| 運動管理 | `sports_management` |
| 競速 | `racing` |
| 競速模擬 | `racing_sim` |
| 團隊運動 | `team_sports` |
| 個人運動 | `individual_sports` |
| 運動 | `sports` |

#### 世界、題材與玩家結構

| 顯示名稱 | 穩定 id |
| --- | --- |
| 團隊 | `team` |
| 合作 | `co_op` |
| 競技 | `competitive` |
| 恐怖 | `horror` |
| 科幻 | `sci_fi` |
| 電馭叛客 | `cyberpunk` |
| 太空 | `space` |
| 開放世界 | `open_world` |
| 日本動畫 | `anime` |
| 生存 | `survival` |
| 懸疑 | `mystery` |
| 推理 | `detective` |

`team` 要經過 AI 訪談確認是「線上玩家隊伍」還是「單人控制的 NPC 小隊」，不能直接把它當成網路能力。
`arcade` 與 `rhythm` 等並列詞是可獨立選項；原始中文片語保存在 `aliases` 供搜尋。`primaryMode` 只決定
Create 的排序、預設建議與展示名稱，不限制其他 mode，也不能在 compiler 中覆蓋使用者的複合選擇。

### 2.3 Capability Compiler：將語意選擇編譯成引擎需求

Compiler 是 deterministic、與 LLM 無關的純函式。它讀取 mode catalog 與已安裝 module catalog，產生：

- camera、physics、combat、timing、network、party、UI、progression、content 的需求。
- 已滿足的能力、需要使用者決定的能力、需要安裝 plugin 的能力、互相衝突的能力。
- 可直接交給 AI 的設計上下文。

概念契約：

```ts
type CapabilityKey =
  | "camera" | "physics" | "combat" | "timing" | "network"
  | "party" | "ui" | "progression" | "content";

interface CapabilityRequirement {
  key: CapabilityKey;
  value: string;
  required: boolean;
  sourceModes: GameModeId[];
  reason: string;
  providerId?: string;
}

interface CapabilityModule {
  moduleId: string;
  version: string;
  source: "builtin" | "signed_engine_extension";
  provides: CapabilityKey[];
  requires: string[];
  deterministic: boolean;
  contentHash: ContentHash;
}

interface CapabilityResolution {
  status: "ready" | "needs_decision" | "needs_plugin" | "conflict";
  requirements: CapabilityRequirement[];
  selectedModules: CapabilityModule[];
  missingModules: CapabilityRequirement[];
  conflicts: CapabilityConflict[];
  profile: CapabilityProfile | null;
}

interface CapabilityConflict {
  modes: GameModeId[];
  key: CapabilityKey;
  message: string;
  resolutionOptions: string[];
}

interface ModuleLock {
  entries: CapabilityModule[];      // provider order is part of the profile identity
  lockHash: ContentHash;
}

type DefinitionPatch =
  | { type: "set_capability"; key: CapabilityKey; value: string | number | boolean }
  | { type: "add_mode"; mode: GameModeId }
  | { type: "remove_mode"; mode: GameModeId }
  | { type: "select_option"; questionId: string; optionId: string };
```

`GameplayKitId` 仍可存在，但它是 `CapabilityModule` 的一種，不是 Genre。例：

```text
first_person_shooter → fps_camera@1 + grounded_physics@1 + shooter_combat@1
third_person_shooter → tps_camera@1 + grounded_physics@1 + shooter_combat@1
turn_based          → turn_scheduler@1
team                → listen_server@1 + team_party@1
```

若 repo 目前只有 `fps_puzzle@1` 而沒有 shooter combat、turn scheduler、listen server，結果必須顯示
`needs_plugin`，並阻止 Forge 直到使用者安裝可信 Engine Extension、平台補上內建 provider，或選擇已支援的
替代方案。data-only Seed Mod 只能設定已存在的 provider，不能實作新的 timing、combat、physics 或 network
程式碼；不得用方塊、假武器或假網路狀態填空。

### 2.4 AI Design Interview / Suggestions

Compiler 完成後才呼叫 Authoring AI。AI 的工作是做 Game Director：發現選擇中的設計缺口、提出可理解的
方案，而不是自由生成一個看似完整的世界。

```ts
interface DesignQuestion {
  id: string;
  category: "timing" | "network" | "combat" | "party" | "camera" | "content";
  question: string;
  required: boolean;
  affects: CapabilityKey[];
  options: DesignOption[];
}

interface DesignOption {
  id: string;
  label: string;
  description: string;
  patches: DefinitionPatch[];
}

interface DesignSuggestion {
  id: string;
  title: string;
  rationale: string;
  patches: DefinitionPatch[];
  status: "proposed" | "accepted" | "dismissed";
}

interface DesignMessage {
  messageId: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

interface DesignReview {
  reviewId: string;
  resolution: CapabilityResolution;
  questions: DesignQuestion[];
  suggestions: DesignSuggestion[];
  acceptedPatches: DefinitionPatch[];
  messages: DesignMessage[];
  status: "waiting_for_user" | "ready" | "blocked";
}
```

例如 `FPS + 回合制 + 團隊` 至少要問：

- 團隊是線上玩家還是 NPC 隊伍？
- 全隊共用一個 turn，還是每個玩家各有 initiative？
- FPS 瞄準是在 planning phase 選定後結算，還是每回合仍可即時操作？
- 回合制是警戒輪、行動槽，還是左輪手槍式逐格輪替？
- 武器改造是否會改變多人 session 的 runtime hash？

AI 可提出「phase-based tactical FPS」：planning → lock → initiative resolution → alert meter。使用者
接受後才會寫入 definition；AI 沒有權限直接改 `rules.oui`。

追問流程固定為：使用者訊息 → AI 新增問題、建議或 typed `DefinitionPatch` → 使用者核准 patch →
deterministic compiler 重新執行 → 受影響資料標記 stale。對話文字本身沒有修改 definition 的權限，不能因為
AI 回答了「已幫你改好」就直接寫檔或進入 Forge。

### 2.5 Actual Three.js Scene Gallery

Design Review ready 後，系統把 Scene Base、genre、capability profile、asset packs 和已接受的設計提案交給
Scene Generator，為每一個 Scene Slot 產生多個 Candidate。

- Gallery 必須是真正的 Three.js/R3F 場景預覽，不是只換背景圖片的卡片。
- Candidate 必須先通過 Scene DSL parser、asset registry 與 Scene Contract 檢查，才可顯示為可選。
- 使用者可以同時看幾個場景的實際路線、地標、光線、碰撞與素材密度。
- 生成只產生 Candidate；只有被選取的 Candidate 才會取得正式 scene id，進入 cartridge。

```ts
type SceneSlotRole =
  | "opening" | "hub" | "encounter" | "puzzle" | "boss" | "ending" | "custom";

interface SceneBaseRef {
  baseId: string;
  version: string;
  contentHash: ContentHash;
}

interface SceneBase {
  ref: SceneBaseRef;
  title: string;
  source: { format: "scene.oui"; text: string; contentHash: ContentHash };
  preview: { cameraPreset: string; thumbnailHash: ContentHash | null };
  assetPacks: AssetPackRef[];
  supportedModes: GameModeId[];
  defaultSlots: SceneSlotRole[];
}

interface SceneBaseSelection {
  refs: SceneBaseRef[];
  selectedAt: string;
}

interface SceneSlot {
  slotId: string;
  role: SceneSlotRole;
  title: string;
  baseRefs: SceneBaseRef[];
  candidates: SceneCandidate[];
  selectedCandidateId: string | null;
}

interface SceneCandidate {
  candidateId: string;
  slotId: string;
  title: string;
  summary: string;
  source: {
    format: "scene.oui";
    text: string;
    contentHash: ContentHash;
  };
  contract: SceneContract;
  assets: AssetRef[];
  requiredModules: string[];
  compatibility: CompatibilityReport;
  generation: GenerationReceipt;
}

interface SceneGallery {
  slots: SceneSlot[];
  galleryRevision: number;
  generatedAt: string;
}

interface SceneTransition {
  fromSceneId: string;
  toSceneId: string;
  triggerId: string;
  requiresFlags: string[];
}

interface ScenePlan {
  orderedSceneIds: string[];
  entrySceneId: string;
  endingSceneIds: string[];
  transitions: SceneTransition[];
}

interface GenerationReceipt {
  operation: "base" | "initial" | "reroll_all" | "reroll_slot" | "refine" | "duplicate";
  generationSeed: number;
  requestHash: ContentHash;
  parentCandidateHash: ContentHash | null;
  modelId: string | null;
  createdAt: string;
}
```

Gallery 操作契約：

```ts
type SceneGalleryOperation =
  | { type: "initial"; slotId: string; count: number; seed: number }
  | {
      type: "reroll_all";
      seed: number;
      preserve: ScenePreservation;
    }
  | {
      type: "reroll_slot";
      slotId: string;
      count: number;
      seed: number;
      preserve: ScenePreservation;
    }
  | {
      type: "refine";
      slotId: string;
      baseCandidateId: string;
      prompt: string;
      preserve: ScenePreservation;
    }
  | { type: "duplicate"; slotId: string; candidateId: string }
  | { type: "reorder_slots"; slotIds: string[] }
  | { type: "set_entry"; slotId: string }
  | { type: "set_ending"; slotId: string };

interface ScenePreservation {
  genreSelection: boolean;
  capabilityProfile: boolean;
  sceneContract: boolean;
  assetPack: boolean;
  traversalIntent: boolean;
}
```

規則：

- 「整組骰子」重新產生所有 slots 的候選，但保留 mode、能力、素材與使用者已確認的設計決定。
- 「單幕重生」只更新一個 slot，其他候選與正式選擇不變。
- `prompt refine` 預設不能改 camera、physics、timing、network 或 contract；若使用者要求改能力，回到
  Design Review，而不是靜默套用。
- 複製候選會產生新的 candidate id，之後可獨立 refine。
- 排序、入口、結局是 Scene Plan 的資料，不用 Story 順序推斷。
- 沒有固定三幕，也沒有固定爬塔 floor；Scene Slot 數量由使用者與能力決定，v2 可支援 1..64 個。
- `SceneBase.source` 必須能由同一套 parser 轉成真正 `SceneGraph`；thumbnail 只是快取，遺失時重畫，不得用
  與實際場景無關的概念圖代替可玩預覽。

### 2.6 Story after scenes

選完場景後才可呼叫 Story Director。Story 只讀取已選場景的標題、路線、目標與素材，產生可修改的
`NarrativeLayer`：

- story 是可選內容層；沒有 story 也可以發布純競速、TCG、模擬或解謎遊戲。
- story 不得建立新的必需 scene、改變 scene contract 或新增 runtime capability。
- 修改 story 文本可形成相容的 patch revision；若改動 gameplay 或 scene，必須走 Scene/Definition proposal。
- 不建立或強迫命名一個「主角」來填補敘事。需要角色時，由所選 module 透過 PlayerProfile/Party 建立。

### 2.7 Forge / Publish / Play

Forge 前檢查：

1. 所有 required capability 有可用且已鎖定的 module。
2. 所有 selected scene 可由 entry 到至少一個 ending。
3. 所有 scene source 可解析，contract 與 definition profile 一致。
4. 所有 asset ref 指向已安裝或隨卡帶打包的精確檔案 hash。
5. rules、scene、asset、module、mod lock 可離線使用；runtime 不依賴 LLM 才能通關。
6. `GameDefinition`、scene sources 與 asset files 產生唯一 content hash。

Forge 頁面提供三個語義不同、不可偷做彼此工作的動作：

- **Preview**：只建立 ephemeral sandbox runtime；不發布、不建立正式 Instance/Save。
- **鑄造卡帶**：只發布 immutable Cartridge Revision，完成後回到 Library；不建立 Instance、Save 或
  PlayerProfile。
- **鑄造並遊玩**：先發布 Cartridge Revision，再建立 pin 該 revision 的 World Instance 與空白 Save；只有
  所選 module 需要角色/隊伍時才建立或選取 PlayerProfile/Party，然後進入 Play。

Play 讀取的是 Instance，不是 workspace，也不直接讀取 AI 的草稿。已存在 revision 再次按「開始新遊戲」只
建立新 Instance/Save，不重複發布卡帶。

## 3. 資料契約

下列介面是跨 renderer、main、DSL、network 的語義契約；實際 zod schema 必須與之對齊。

### 3.1 Game Definition

```ts
interface ModeSelection {
  modes: GameModeId[];           // stable genre/multiplayer/setting ids, unique and ordered by user selection
  primaryMode: GameModeId;
  visualTags: string[];
  freeformIntent: string;
}

interface CapabilityContext {
  contextId: string;              // e.g. exploration_fps, planning_cards, vehicle_race
  camera: {
    mode: "first_person" | "third_person" | "top_down" | "side_2_5d";
    fov: number;
    aiming: "none" | "reticle" | "lock_on";
  };
  physics: {
    model: "grounded" | "rigidbody" | "vehicle" | "flight" | "grid";
    collision: "simple" | "full";
  };
  combat: {
    enabled: boolean;
    model: "none" | "shooter" | "melee" | "card" | "hybrid";
    resolution: "realtime" | "turn_phase" | "initiative";
  };
  timing: {
    model: "realtime" | "turn_based" | "phase_based" | "tick";
    turnOrder: "shared_team" | "per_player" | "initiative" | "simultaneous" | null;
    planningWindowMs: number | null;
  };
  network: {
    model: "offline" | "listen_host" | "dedicated";
    authority: "local" | "host" | "server" | "lockstep";
    minPlayers: number;
    maxPlayers: number;
  };
  party: {
    model: "solo" | "npc_party" | "co_op_party" | "team";
    maxMembers: number;
  };
  ui: {
    hud: "minimal" | "combat" | "tactical" | "cards" | "simulation";
    reticle: boolean;
    turnTimeline: boolean;
    inventory: boolean;
  };
  progression: {
    model: "none" | "linear" | "run_based" | "simulation" | "seasonal";
  };
  content: {
    sceneRoles: string[];
    assetRoles: string[];
  };
}

interface CapabilityContextTransition {
  fromContextId: string;
  toContextId: string;
  trigger: "scene_enter" | "scene_exit" | "phase_change" | "typed_effect";
  triggerId: string;
}

interface CapabilityProfile {
  profileId: string;
  defaultContextId: string;
  contexts: CapabilityContext[];
  transitions: CapabilityContextTransition[];
}

interface GameDefinitionDraft {
  formatVersion: 2;
  draftId: string;
  title: string;
  author: string;
  modeSelection: ModeSelection;
  baseSelection: SceneBaseSelection;
  designReview: DesignReview | null;
  capabilityProfile: CapabilityProfile | null;
  assetPacks: AssetPackRef[];
  sceneGallery: SceneGallery | null;
  narrative: NarrativeLayer;
  generation: {
    seed: number;
    operations: GenerationReceipt[];
  };
}

interface GameDefinition {
  formatVersion: 2;
  gameId: string;
  title: string;
  description: string;
  author: string;
  modeSelection: ModeSelection;
  capabilityProfile: CapabilityProfile;
  assetPacks: AssetPackRef[];
  scenePlan: ScenePlan;
  scenes: SelectedScene[];
  narrative: NarrativeLayer;
  moduleLock: ModuleLock;
  modLock: ModLock;
  provenance: {
    source: "new" | "remix" | "legacy-import";
    parent: CartridgeRef | null;
    generation: GenerationReceipt[];
  };
}
```

### 3.2 Assets、Scene Contract 與 Scene DSL

```ts
interface AssetPackRef {
  packId: string;
  version: string;
  contentHash: ContentHash;
  assets: AssetRef[];
}

interface AssetRef {
  assetId: string;
  role: "environment" | "character" | "weapon" | "vehicle" | "ui" | "audio";
  path: string;
  contentHash: ContentHash;
}

interface SelectedScene {
  sceneId: string;
  slotId: string;
  candidateId: string;
  sourceHash: ContentHash;
  contract: SceneContract;
  assets: AssetRef[];
}

interface SceneContract {
  sceneId: string;
  requiredProfileId: string;
  requiredContextId: string;
  requiredModules: string[];
  requiresFlags: string[];
  requiresItems: string[];
  inventoryPolicy: "carry" | "reset";
  grantsFlags: string[];
  terminal: boolean;
}

interface CompatibilityReport {
  status: "compatible" | "needs_migration" | "incompatible";
  reasons: string[];
  saveImpact: "none" | "migration" | "new_instance";
  networkImpact: "none" | "new_session" | "incompatible";
}
```

Scene source 仍然必須是 OpenUI Lang，模型不能輸出 JavaScript。為了真正支援素材優先，Scene DSL/Graph
需要增加宣告式 asset reference，例如 `Asset("factory/reactor_core", x, z, scale)`；renderer 由 asset
registry 決定如何渲染，mod 不得注入任意 React/Three.js 程式碼。

`SceneContract` 保留進入條件、背包政策、完成旗標與 terminal 語義；v1 的 `kit` 欄位只作為 migration
輸入，v2 以 `requiredProfileId + requiredContextId + requiredModules` 作為唯一 runtime 來源。同一場景若有
planning → execution 等階段切換，只能使用 `CapabilityProfile.transitions` 已宣告的 context transition；這保留
同一世界在 FPS、TPS、2.5D、俯視或卡牌/回合階段間切換的能力，而不是把整張卡帶鎖成單一相機。

### 3.3 Story、角色與存檔

```ts
interface NarrativeLayer {
  required: boolean;
  outline: StoryOutline | null;
}

interface PlayerProfile {
  profileId: string;
  displayName: string;
  appearance: Record<string, string>;
  controlPreferences: Record<string, string | number | boolean>;
  updatedAt: string;
}

interface PlayerState {
  profileId: string;
  loadout: Record<string, string>;
  progression: Record<string, string | number | boolean>;
}

interface PartyState {
  members: Array<{
    id: string;
    role: string;
    loadout: Record<string, string>;
    state: Record<string, string | number | boolean>;
  }>;
}

interface InstanceRecord {
  formatVersion: 2;
  instanceId: string;
  name: string;
  cartridge: CartridgeRef;
  runtimePin: RuntimePin;
  activeSaveId: string;
  createdAt: string;
  updatedAt: string;
}

interface SaveState {
  formatVersion: 2;
  instanceId: string;
  runtimePin: RuntimePin;
  currentSceneId: string;
  flags: Record<string, string | number | boolean>;
  inventory: Inventory;
  player: PlayerState;
  party: PartyState | null;
  completedSceneIds: string[];
  mutation: WorldMutation | null;
  updatedAt: string;
}
```

PlayerProfile 可以跨 cartridge 使用，但 `PlayerState`、角色職能、數值、裝備與隊伍進度必須由該 cartridge 的
module/schema 驗證並保存在 instance save。沒有角色需求的競速、TCG 或建造遊戲不應顯示角色創建流程。

### 3.4 Cartridge Revision、版本與 lineage

```ts
type ContentHash = `sha256:${string}`;

interface CartridgeRef {
  cartridgeId: string;
  version: string;                 // strict SemVer; author-facing label
  contentHash: ContentHash;        // immutable content identity
}

interface CartridgeManifestV2 {
  formatVersion: 2;
  cartridgeId: string;
  version: string;
  name: string;
  description: string;
  author: string;
  createdAt: string;
  engineApiVersion: number;
  saveSchemaVersion: number;
  networkProtocolVersion: number;
  definition: GameDefinition;
  lineage: {
    kind: "revision" | "remix" | "legacy-import";
    parent: CartridgeRef | null;
  };
  contentHash: ContentHash;
  files: CartridgeFileIntegrity[];
}

interface RuntimePin {
  cartridge: CartridgeRef;
  moduleLock: ModuleLock;
  modLock: ModLock;
  profileHash: ContentHash;
  effectiveHash: ContentHash;
}
```

`RuntimePin.cartridge` 是唯一 canonical pin。若為了讀取舊 instance 暫時保留 `InstanceRecord.cartridge` 欄位，
它只能是索引快取，讀取時必須與 `runtimePin.cartridge` 相等，不得形成第二個身份來源。

版本規則：

- 相同 `cartridgeId + version` 只能存在一組 bytes；不同 bytes 一律 `version-conflict`，不能覆蓋。
- `patch`：修文字、材質或不改變存檔語義的 bug；runtime profile 與 save schema 不變。
- `minor`：新增可選 scene、素材或不影響既有 route 的內容。
- `major`：改 camera、physics、combat、timing、network、required module 或 save schema。
- SemVer 只表示作者意圖；所有 instance 與 session 都 pin 精確 `contentHash`。
- 升級永遠是使用者明確操作：先備份 save、檢查 migration、確認新的 runtime/profile hash，再建立新 pin。
- 沒有 migration 的 major/runtime 變更必須建立新 instance，不得把舊進度硬套進新規則。
- `lineage.parent` 保存精確父版本；remix 另一作者卡帶時建立新的 `cartridgeId`，並從 `1.0.0` 開始。

### 3.5 Hash 計算

```text
contentHash = H(
  canonical(GameDefinition)
  + canonical(rules.oui)
  + sorted(scene source files)
  + sorted(asset bytes and asset refs)
)

profileHash = H(
  canonical(CapabilityProfile)
  + ordered(ModuleLock)
  + ordered(runtime-affecting ModLock)
  + engineApiVersion
  + networkProtocolVersion
)

effectiveHash = H(contentHash + profileHash)
```

陣列中有順序語義的項目（module mount order、mod inject order、scene route order）不可任意排序；沒有順序
語義的集合才可 canonical sort。generationSeed、AI model name、prompt transcript 可放在 provenance，
但不能取代 contentHash。

## 4. Seed Mod 與 typed change proposal

Seed Mod 不再是直接覆寫檔案的腳本。它是宣告式、可驗證、可預覽的變更包：

```ts
interface ModLockEntry {
  name: string;
  version: string;
  contentHash: ContentHash;
  affectsRuntime: boolean;
  provides: string[];
}

interface ModLock {
  entries: ModLockEntry[];          // mount order is meaningful
  lockHash: ContentHash;
}

interface SeedModProposal {
  proposalId: string;
  base: CartridgeRef;
  authorPrompt: string;
  operations: ModOperation[];
  generatedAt: string;
}

interface WeaponDefinition {
  weaponId: string;
  kind: "gun" | "melee" | "tool";
  damage: number;
  range: number;
  cooldownMs: number;
  ammoType: string | null;
  assetId: string;
}

type TimingSystemId = "realtime" | "turn_bar" | "initiative" | "phase_based" | "revolver";

interface TimingChange {
  from: TimingSystemId;
  to: TimingSystemId;
  resolution: "shared_team" | "per_player" | "initiative" | "simultaneous";
  turnDurationMs: number | null;
}

interface ScenePatch {
  operations: Array<
    | { type: "replace_asset"; fromAssetId: string; toAssetId: string }
    | { type: "move_asset"; assetId: string; x: number; z: number }
    | { type: "set_objective"; text: string }
    | { type: "set_contract"; contract: SceneContract }
  >;
}

type ModOperation =
  | { type: "add_weapon"; weapon: WeaponDefinition }
  | { type: "change_timing"; change: TimingChange }
  | { type: "add_capability_module"; moduleId: string; version: string }
  | { type: "scene_patch"; sceneId: string; patch: ScenePatch }
  | { type: "asset_patch"; sceneId: string; assets: AssetRef[] };

interface ModCompatibilityResult {
  status: "compatible" | "needs_decision" | "needs_migration" | "incompatible";
  reasons: string[];
  affectedScenes: string[];
  saveImpact: "none" | "migration" | "new_instance";
  networkImpact: "none" | "new_effective_hash" | "incompatible";
}
```

標準流程：

```text
玩家 prompt：加入一把自己的槍
        ↓
typed ModOperation(add_weapon)
        ↓
檢查 weapon module、asset、combat profile 與 save schema
        ↓
Sandbox preview / playtest
        ↓
玩家核准
        ↓
產生新 immutable revision 或鎖定新的 mod set
        ↓
重新計算 contentHash / profileHash / effectiveHash
```

另一個例子：「把 turn bar 改成左輪手槍制度」必須成為 `change_timing`，不是讓 AI 直接改一段文字。若
改變 action resolution、網路同步或 save state，就必須提高版本、重建 profile，並要求所有多人玩家使用
同一個 effectiveHash。

所有 mod 仍遵守 data-only 邊界：只能提供 prompt sections、skills、宣告式 tools、asset/module metadata
與 `GameEffect`；不能帶 Node.js、任意網路、React 或 Three.js 程式碼。runtime-affecting mod 必須可被
完整 hash 與驗證。

## 5. 多人連線與 Yjs 邊界

### 5.1 Join handshake

加入房間前先交換並驗證：

```ts
interface SessionHello {
  sessionId: string;
  cartridge: CartridgeRef;
  contentHash: ContentHash;
  profileHash: ContentHash;
  effectiveHash: ContentHash;
  moduleLock: ModuleLock;
  modLock: ModLock;
  engineApiVersion: number;
  networkProtocolVersion: number;
  playerProfileId: string;
}
```

任何 `contentHash`、ordered module/mod lock、profileHash、effectiveHash、engine API 或 network protocol 不一致，都在
同步前拒絕加入，顯示可理解的原因。不能先進房、再用 Yjs 嘗試「修到一樣」。

### 5.2 同步分工

- immutable cartridge scenes、rules、assets 不由 Yjs 同步；加入者依 hash 從本機卡帶庫讀取並驗證。
- Remix workspace 可以用 Yjs 同步草稿 metadata、Scene Candidate 操作與可協作的 DSL 草稿；發布後內容
  重新計算 hash。
- Session 的玩家 input、物理 snapshot、事件、turn state 走房主權威的 DataChannel/session protocol。
- 重要事件（開門、死亡、領取、turn resolution）可靠且有序；高頻位置快照可不可靠且無序。
- 房主擁有該 instance 的 save checkpoint；斷線時先保存 checkpoint，不能讓 peer 直接改 immutable scene。
- 第一版多人仍限制整隊同步切換 Scene，不支援分隊跨場景。

## 6. 存檔、身份與安全

### 6.1 儲存結構

```text
<userData>/
├── cartridges/<cartridgeId>/<version>/       # immutable cartridge content
│   ├── manifest.json
│   ├── rules.oui
│   ├── scenes/<sceneId>.oui
│   └── assets/<assetPath>                    # declared and hashed
├── workspaces/<workspaceId>/                 # mutable Create/Remix draft
│   ├── workspace.json
│   ├── definition.json
│   ├── scenes/<candidateId>.oui
│   └── gallery.json
├── profiles/<profileId>/                     # player profile, never cartridge story
├── instances/<instanceId>/                   # durable playthrough
│   ├── instance.json
│   └── saves/<saveId>/
│       ├── save.json
│       └── karma.jsonl
└── sessions/                                 # optional crash checkpoints only
```

Cartridge export 絕對不能包含 `save.json`、`karma.jsonl` 或 PlayerProfile。Save backup 只包含 exact
`RuntimePin`，缺少對應卡帶時要顯示 actionable error，不能自動拿最新版本代替。

### 6.2 加密與身份

保留既有正確方向：

1. Save 使用隨機 Data Key 進行 AES-GCM 加密。
2. 每把 Passkey 透過 WebAuthn PRF 衍生 wrapping key，包住 Data Key。
3. 新裝置新增 Passkey 時，透過已解鎖的 Data Key 建立新的 wrapping record，不假設不同憑證會產生同一把 key。
4. PRF 不可用時使用同機 keychain fallback；提供離線加密 backup。
5. 帳號、Passkey、PlayerProfile、錢包解耦；沒有 Web3 也可完整使用卡帶與存檔。

## 7. 舊流程的退出與 v1 migration

以下機制明確退出新產品路徑：

- `Genesis` 作為 Create 的主資料模型。
- `archetype = farm | delve | quest` 的固定選項。
- `physics = gentle | destructible | elemental` 的舊 Seed 問卷。
- `sceneKits: [A, B, C]` 固定三幕。
- `floor`/爬塔作為所有遊戲的隱含進度模型。
- 先生成 `StoryOutline` 再讓 story 決定地圖。
- 角色職業卡、主角姓名、主角背景作為新遊戲的必填欄位。
- `generateStoryOutline → bakeStoryScenes → 直接 publish` 的無預覽流程。
- 用 `GameplayKitId` 直接代表使用者選的 genre。
- 發布或多人連線前不檢查 asset/module/mod/effective hash。

舊資料不刪除，改為 read-only archive。Migration 流程：

```text
worlds/<id>/ (v1)
   ↓ 保留原始目錄與 migration receipt
cartridges/<id>/1.0.0/ (legacy-import cartridge)
instances/<id>-legacy/ + default save
```

Migration 必須：

- 把舊 `world.oui` 包成單一 legacy scene 或可安全識別的 scene route，不硬猜成新的 genre。
- 把舊 `Genesis` 存在 `legacyProvenance`，不餵給新的 Create compiler。
- 保留原始 `worlds/<id>` 作為可恢復備份，不自動刪除。
- 顯示「Legacy」標籤，禁止 legacy metadata 影響新建遊戲。
- v1 `SceneContract.kit` 只映射成相容的 legacy profile；新 v2 contract 不再使用它作為唯一能力來源。

## 8. Repository 落點

### Shared domain

- `src/shared/game-definition.ts`：`ModeSelection`、`GameDefinitionDraft`、`GameDefinition`、`DesignReview`。
- `src/shared/mode-catalog.ts`：完整 genre id、分類、別名、互斥與 capability requirements。
- `src/shared/capabilities.ts`：module descriptor、compiler、resolution/conflict types；純 TypeScript，不能依賴 React/Electron。
- `src/shared/scene-gallery.ts`：Scene Base、Scene Slot、Scene Candidate、reroll/refine/reorder operations。
- `src/shared/cartridge.ts`：保留 `CartridgeRef`、lineage 與 immutable revision；新增 v2 manifest/RuntimePin，
  並讓 v2 的 NarrativeLayer 不再依賴固定三場景的 v1 StoryOutline。
- `src/shared/gameplay.ts`：保留實作層 Gameplay Kit，改成 Capability Module 的 provider，而不是 genre catalog。
- `src/shared/mods.ts`：ModLock、runtime-affecting metadata、typed proposal/compatibility contracts。
- `src/shared/world.ts`：SceneGraph/SceneContract、PlayerState/PartyState；移除新流程對 legacy Genesis 的依賴。

### DSL 與引擎

- `src/dsl/schemas/scene.ts`、`src/dsl/parse/scene.ts`、`src/dsl/serialize.ts`：新增 declarative `Asset` 或
  `Prop(assetId)`，並把 `requiredProfileId`/`requiredModules` 綁定到 Scene Contract。
- `src/dsl/prompts/scene.ts`：以 Scene Base、asset refs、mode profile、traversal intent 為上下文，禁止以
  主角故事或舊 archetype 生成場景。
- `src/renderer/engine/assetRegistry.ts`、`src/renderer/engine/Assets.tsx`：把內建與 plugin asset pack
  映射到真正的 Three.js asset/geometry/material；沒有 asset 時回傳 error，不產生假方塊。
- `src/renderer/engine/ScenePreviewCanvas.tsx`：Create/Remix 的即時 3D Scene Base/Candidate 預覽，與 Play
  使用相同 parser/runtime。
- `src/renderer/engine/kits/`：保留 camera/movement/interaction providers；新增 provider capability metadata。

### Main、儲存與 network

- `src/main/cartridges/`：v2 manifest schema、asset file integrity、content hash、immutable publish、lineage。
- `src/main/seeds/`：只保留 v1 `.seed` 匯入/相容讀取；新的 export 使用 content-only cartridge package，
  不再把 instance save 混進 Seed。
- `src/main/instances/`：RuntimePin、player/party save、save schema 與 explicit upgrade/migration。
- `src/main/workspaces/`：GameDefinitionDraft、Scene Gallery candidates、preview 與 publish input。
- `src/main/mods/`：mod bundle content hash、lock resolution、proposal compatibility，保留 data-only sandbox。
- `src/renderer/net/` 或新增 `src/shared/session.ts`：SessionHello、effective hash handshake、host authority。
- `src/renderer/net/sync.ts`：退出 published `world.oui` 的 Yjs 同步；Yjs 只同步 workspace draft，runtime 用
  session protocol。

### Renderer flow

- `src/renderer/app/WorldsScreen.tsx`：主入口只有 Play / Create / Remix / Join；legacy archive 是次要入口。
- `src/renderer/narrative/ui/GenesisScreen.tsx`：改名/拆分成 Create flow，不再顯示 Genesis、職業卡或舊 archetype。
- 新增 `src/renderer/narrative/ui/SceneBaseGallery.tsx`、`GenreMatrix.tsx`、`DesignReviewPanel.tsx`、
  `SceneGallery.tsx`、`ForgeSummary.tsx`。
- `src/renderer/narrative/story.ts`：只在場景選定後生成 NarrativeLayer，不再是 Create 的第一步。
- `src/renderer/narrative/cartridge.ts`：由「三幕直接 bake」改成「draft → selected candidates → validate → forge」。
- `src/renderer/state/`：新增 authoring/draft store；PlayerProfile 與 instance save 不與 Create draft 共用 state。

## 9. 分階段實作與驗收

每個階段以使用者可完成的流程驗收，不以「多寫了多少 schema」作為完成標準。

### Phase 0：退出舊方向，建立 domain baseline

落點：`src/shared/`、`src/renderer/narrative/`、`docs/implementation-plan.md`。

- 建立 v2 domain types、完整 mode catalog、Capability Compiler 的 `ready/needs_plugin/conflict` 狀態。
- `GameDefinitionDraft` 可保存到 workspace；改 mode 會讓受影響候選失效。
- 新 Create 不再讀 `archetype`、`physics`、固定三幕或角色職業卡。

驗收：選 `FPS + turn_based + team` 時能看到 FPS provider 已滿足、turn/network provider 缺少或需要決策，
而不是直接生成一個方塊世界。

### Phase 1：Scene Base Gallery

落點：`src/renderer/engine/ScenePreviewCanvas.tsx`、asset registry、`src/renderer/narrative/ui/`。

- 以真正 Three.js 場景展示 base；可切換 base、旋轉鏡頭、檢視素材與建立 scene slots。
- 支援 base set reroll；所有候選帶 generation receipt 與 asset hash。

驗收：使用者只選素材與空間基底，不輸入主角資料，也能建立可保存的 draft。

### Phase 2：Genre Matrix 與 Capability Compiler

落點：`src/shared/mode-catalog.ts`、`src/shared/capabilities.ts`、`GenreMatrix.tsx`。

- 完整 genre 清單可搜尋、多選、顯示別名與分類。
- genre 只產生需求；compiler 對應到已安裝的 Gameplay Kit/Capability Module。
- 缺能力顯示安裝/替代方案，沒有假裝支援。

驗收：至少完整處理 `first_person_shooter + turn_based + team`、`racing + racing_sim`、
`farming + automation` 三種組合，且每組的 runtime profile 明確不同。

### Phase 3：AI Design Interview

落點：`src/renderer/narrative/`、`src/shared/design-review.ts`（或合併至 game-definition）。

- AI 只回傳 typed questions/suggestions/patches。
- 使用者可接受、忽略或追問；接受後重新執行 deterministic compiler。
- blocking conflict 或 missing module 未解決時不能 Forge。

驗收：AI 能針對 turn/team/FPS 詢問 turn ownership、aim timing、隊伍型態與同步方式；AI 不能直接寫
`rules.oui` 或改 live save。

### Phase 4：Actual Three.js Scene Gallery

落點：`SceneGallery.tsx`、`src/renderer/narrative/scene.ts`、DSL asset/contract、workspace store。

- 每個 slot 產生多個可解析、可遊玩的 Scene Candidate。
- 支援整組骰子、單幕重生、prompt refine、複製、排序、入口與結局。
- Candidate 用相同 Play runtime 做 sandbox preview；只有 selected candidates 進入 cartridge。

驗收：使用者可把同一個 Factory base 變成三個完全不同的空間構圖；換一幕不會改其他幕，也不會改動
玩家的角色或存檔。

### Phase 5：Story after scenes 與 Forge/Play

落點：`story.ts`、`cartridge.ts`、`main/cartridges/`、`main/instances/`。

- 場景選完後才可生成/編輯 NarrativeLayer。
- Forge 前執行 offline route、contract、module、asset、hash 檢查。
- 發布 immutable v2 cartridge，再建立獨立 Instance/Save。

驗收：完成 Create → 選 scene → 生成 story → Forge → Play；關閉程式後從 save 恢復，卡帶內容不包含存檔。

### Phase 6：PlayerProfile、角色/隊伍與 session

落點：`profiles/`、`instances/`、`renderer/state/characterStore.ts`、`renderer/net/`。

- 角色建立只在所需的 module 決定後顯示。
- `PlayerProfile` 可跨遊戲使用；game-specific player/party state 留在 Save。
- 加入房間前完成 RuntimePin/effectiveHash handshake，再開始同步。

驗收：無角色需求的遊戲直接開始；team 遊戲在建立 session 時才建立玩家槽位；不同 hash 的玩家無法進房。

### Phase 7：Typed Seed Mod、revision 與 migration

落點：`src/shared/mods.ts`、`src/main/mods/`、`src/main/cartridges/`、legacy archive importer。

- prompt 轉成 typed mod proposal；通過 compatibility 後進 sandbox preview。
- 加槍或修改 turn system 會產生新的 revision/effectiveHash，不能覆寫 live cartridge。
- 建立 v1 legacy import、migration receipt、可恢復 archive。

驗收：對已發布卡帶提出「加一把槍」或「turn bar 改左輪制度」，能看到受影響的 module/save/network，
預覽後發布新版本；原卡帶與原 instance 完全不變。

### Phase 8：可靠性與產品化

- 儲存、匯出、還原、Passkey wrapping 與缺卡帶錯誤訊息完整可用。
- Yjs 不再傳 immutable scenes；workspace collaboration 與 runtime session 分流。
- 進行實際 Electron flow：Create、Gallery、Forge、Play、Quit、Resume、Remix、Publish、Join。
- 只保留必要的純函式驗證（compiler、hash、route、compatibility、migration）；驗收重點是完整產品流程。

## 10. Benchmark Demo

一個非工程使用者可以完成：

1. 從 Scene Base Gallery 挑一組工廠與反應爐空間。
2. 在 Genre Matrix 選 `第一人稱射擊 + 回合制 + 團隊 + 科幻`。
3. 看到 compiler 提示 FPS 已有、turn scheduler 和 team network 需要 module。
4. 接受 AI 建議的 phase-based tactical FPS，回答 turn ownership 與隊伍同步問題。
5. 在 Three.js Scene Gallery 中取得多組候選，骰掉其中一幕，再對另一幕下 prompt refine。
6. 排序場景、設定入口和結局，最後才生成 story。
7. Forge 成 `CartridgeRevision`，建立自己的 `PlayerProfile` 與 `World Instance`，開始遊玩。
8. 朋友只有在 `contentHash + profileHash + effectiveHash` 完全一致時才能加入。
9. 遊戲中提出「加入自己的槍」或「改成左輪手槍 turn system」，看見 typed proposal、compatibility、
   sandbox preview，核准後得到新的 immutable revision；舊存檔仍可照原版本繼續。

這個 demo 成功時，Aether Spire 才真正是「可組裝的遊戲卡帶主機」，而不是把同一個爬塔角色遊戲換一組
名字、背景和光照。
