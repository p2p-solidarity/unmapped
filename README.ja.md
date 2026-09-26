<div align="center">

<img src="docs/readme/hero.jpg" alt="UNMAPPED · 無界之地 — 自律するオープンワールド。HD-2D のジオラマとして描かれたピクセルアートの森の上にタイトルが浮かぶ画面。" width="100%">

<h3>歩いた先から言語モデルが書き起こしていく、果てのないオープンワールド。そのすべてが、あなたの持つファイルとして残ります。</h3>

<p><a href="README.md">English</a> · <a href="README.zh-TW.md">繁體中文</a> · <b>日本語</b></p>

<p>
<a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue"></a>
<img alt="Platform: macOS" src="https://img.shields.io/badge/platform-macOS-lightgrey?logo=apple">
<img alt="Electron 44" src="https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white">
<img alt="TypeScript 5.9" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
<img alt="Three.js r186" src="https://img.shields.io/badge/Three.js-r186-000000?logo=threedotjs&logoColor=white">
<img alt="Bun 1.3" src="https://img.shields.io/badge/Bun-1.3-000000?logo=bun&logoColor=white">
<img alt="Languages: en, zh-TW, ja" src="https://img.shields.io/badge/i18n-en%20%C2%B7%20zh--TW%20%C2%B7%20ja-2ea44f">
</p>

<p>
<a href="#クイックスタート">クイックスタート</a> ·
<a href="#スクリーンショット">スクリーンショット</a> ·
<a href="#しくみ">しくみ</a> ·
<a href="#現在の状態">現在の状態</a> ·
<a href="#ロードマップ">ロードマップ</a> ·
<a href="#コントリビュート">コントリビュート</a>
</p>

</div>

---

**UNMAPPED**（《無界之地》）は、オープンソースのデスクトップゲームです。地図には端がなく、誰かがたどり着く
まで、そこには何も書かれていません。地形はシードから生成されます。プレイヤーがまだ記録されていない場所へ
初めて足を踏み入れると、大規模言語モデルがその場所を**観測**します。場所に名前を付け、住人、その土地の
しきたり、頼みごと、敵を書き起こします。書くのは小さな宣言型のゲーム DSL で、パーサーがすべての行を
検査します。場所が書かれるのは一度だけで、セーブに保存されたあとはモデルを必要としません。ワールド、
セーブ、公開したリビジョンは、どれもディスク上のふつうのファイルです。友だちのワールドとは P2P の WebRTC で
つながり、ひとつの**大陸**になります。

接続先は OpenAI 互換のエンドポイントなら何でもかまいません。ローカルの llama.cpp や Ollama、Apple の
オンデバイスモデル、vLLM、クラウド API に対応しています。English・繁體中文・日本語で遊べます。ただし、
エンドツーエンドで検証済みなのは現時点ではクラウド経由の経路だけです。検証済みの項目は
[状態表](#現在の状態)にまとめています。

> *Esse est percipi*（存在するとは知覚されることである）。既知の外にある土地は実在しますが、観測者が
> 歩いてくるまでは名前も、人も、物語もありません。

## 特長

- **モデルを待たずに歩ける、果てのない大地。** 地面は 32 × 32 マスのチャンクで、「シード + チャンク座標」
  から計算されます。モデルが生成することも、ディスクに保存されることもありません。モデルにつながって
  いなくても、いつでも歩けます。
- **観測は一度だけ、その後は固定。** 新しい場所はモデルが下書きし、検証を通ってからセーブに書き込まれます。
  住人と話してもモデルは呼ばれません。会話と選択肢は、観測の時点で書き終わっているからです。
- **モデルが書くのはコードではなく DSL。** モデルは Scene・Dialogue・Item・Chapter などの小さなゲーム方言で
  [OpenUI Lang](https://github.com/thesysdev) のプログラムを書き、`@openuidev/lang-core` がそれを解析します。
  解析に失敗するとエラーをモデルに返して修正させます（最大 2 回）。数値はすべてエンジンの上下限に
  収められます。それでも解析できなければ画面にエラーを表示し、既製のシーンで代用することはありません。
- **4 ステップでゲームをつくる。** アイデアから始めると、モデルが 7 枚の世界設定カード（前提、雰囲気、
  日常のルール、登場しないもの、名前の付け方、話し方、見た目）と 3〜8 章のストーリーを書きます。あとは
  作って遊ぶだけです。カードと章はどれも手で編集でき、1 枚・1 章だけを書き直すこともできます。章は
  ロック、挿入、並べ替えもできます。下書きは自動保存され、アプリを再起動しても残ります。
- **ひとつの大地に、ふたつの見た目。** HD-2D のジオラマ（three.js によるティルトシフト、ブルーム、影を
  落とす立ち絵スプライト）と、フラットな 16-bit のキャンバスです。<kbd>V</kbd> で切り替えられます。大地には
  昼、夕暮れ、夜の光があります。
- **章と場所は地図の上に。** 物語の扉は大地に立っています。すべての人に会い、すべての宝箱を開け、すべての
  敵を倒すと章がクリアになります。判定するのはモデルではなくホストです。横スクロールのステージやグリッド型の
  ダンジョンには、大地のあちこちにある入口から入ります。
- **戦闘はなくてもいい。** ワールドをつくるとき、「探索」（戦闘なし）、「冒険・銃」、「冒険・剣」から
  選べます。敵はリアルタイムで追ってきます。戦闘の計算式はバージョン付きの物理ルールなので、ワールドは
  つくられたときのルールのまま遊べます。
- **マルチプレイの大陸。** ワールドにはそれぞれ扉番号があります。番号を共有すると、ワールド同士が y-webrtc で
  ひとつの大陸になります。誰かのワールドを預かるゲームサーバーは存在しません。訪問者は名前、向き、歩く
  姿つきで表示されます。友だちの土地に残したメモは、**相手の**メモとして保存されます。ピアから届くデータは
  すべて、書き込まれる前に検証されます。
- **データはあなたのもの。** 公開したコンテンツは、sha256 ハッシュ付きで変更できないカートリッジになります。
  セーブはそのうちのひとつのリビジョンに固定されます。`.cartridge` でコンテンツを、`.spire-backup` で進行状況を
  別のマシンへ移せます。持ち運べるデータはランダムな AES-GCM データキーで暗号化され、そのキーはパスキーの
  PRF か OS のキーチェーンで保護されます。
- **Mod はプロンプトとツールだけで、コードは入らない。** `mod.yml` では、プロンプトのセクション、決まった
  `GameEffect` の語彙に対応する宣言型ツール、スキルを追加できます。土台は、DeepSeek Harness を手本に
  [Cordis](https://github.com/cordiverse/cordis) の上に組んだハーネスです。
- **サンドボックスの中の AI ワールド。** モデルが JavaScript を書けるのはここだけです。モデルがつくった小さな
  インタラクティブワールドは、新しいオリジンと nonce 付き CSP を持つ `sandbox="allow-scripts"` の iframe の
  中でだけ動きます。
- **正直な数字。** モデルの呼び出しはすべてローカルの使用量台帳に記録されます。記録するのはトークン数、
  キャッシュされたトークン数、ミリ秒で、プロンプトやキーは記録しません。HUD にはワールドごとの累計が出ます。
  ダミーのデータは一切表示しません。足りないものがあれば、画面がそのことと直し方を伝えます。
- **オンチェーンの来歴はオプション。** 公開したカートリッジは Sepolia 上で ENSv2 の名前を持てます。
  コンテンツ自体がチェーンに載ることはなく、チェーンを設定しなくてもすべての画面が動きます。

## スクリーンショット

<table>
  <tr>
    <td width="50%"><img src="docs/readme/land-continent.jpg" alt="HD-2D の大地に、同じ大陸の別ワールドからプレイヤー player-PUXA が訪れている"></td>
    <td width="50%"><img src="docs/readme/land-combat.jpg" alt="大地でのリアルタイム戦闘。レベル 2 の敵が 2 体迫り、HP は 40/100。左のカードが物語の進行を示す"></td>
  </tr>
  <tr>
    <td><sub><b>大陸。</b>ほかのプレイヤーのワールドが WebRTC でつながり、名前・向き・歩く姿つきで表示されます。</sub></td>
    <td><sub><b>戦闘。</b>敵がリアルタイムで追ってきます。左のカードは次の章を示しています。</sub></td>
  </tr>
  <tr>
    <td><img src="docs/readme/land-16bit.jpg" alt="同じ大地をフラットな 16-bit の見た目で描いたもの"></td>
    <td><img src="docs/readme/land-night.jpg" alt="HD-2D の見た目で見る夜の大地"></td>
  </tr>
  <tr>
    <td><sub><b>16-bit 表示。</b>同じ大地のフラット版。<kbd>V</kbd> で切り替えます。</sub></td>
    <td><sub><b>夜。</b>昼、夕暮れ、夜の光がジオラマとスプライトを照らします。</sub></td>
  </tr>
  <tr>
    <td><img src="docs/readme/create-world.jpg" alt="ゲームをつくる・ステップ 2：7 枚の編集できる世界設定カード。1 枚ずつ書き直しボタンがある"></td>
    <td><img src="docs/readme/create-story.jpg" alt="ゲームをつくる・ステップ 3：モデルが書いている章がストリーミング表示され、使用量とキャンセルボタンがある"></td>
  </tr>
  <tr>
    <td><sub><b>つくる・ワールド。</b>カードは手で直すことも、その 1 枚だけモデルに書き直させることもできます。</sub></td>
    <td><sub><b>つくる・ストーリー。</b>章は書かれたそばから表示されます。キャンセルすると処理中のリクエストが止まります。</sub></td>
  </tr>
  <tr>
    <td><img src="docs/readme/place-side.jpg" alt="大地から入った横スクロールの場所。浮かぶ足場のあいだにスライムがいる"></td>
    <td><img src="docs/readme/ai-worlds.jpg" alt="AI ワールドの画面。ひとことで小さなゲームを説明し、サンドボックスで遊ぶ"></td>
  </tr>
  <tr>
    <td><sub><b>場所。</b>横スクロールやダンジョンには、大地のあちこちにある入口から入ります。</sub></td>
    <td><sub><b>AI ワールド。</b>小さなゲームをひとことで説明して遊び、別のひとことでつくり変えます。</sub></td>
  </tr>
</table>

<p align="center">
  <img src="src/assets/generated/actors.png" alt="スプライトシート。上段に住人の役割 9 種、下段にモンスター 9 種" width="576"><br>
  <sub>住人とモンスター：役割ごと・種類ごとに 1 枚ずつ、画像モデルがビルド時に一度だけ描いたスプライトです。来歴は <code>src/assets/generated/actors.json</code> にあります。</sub>
</p>

## クイックスタート

**必要なもの。** Apple Silicon の macOS（現時点で検証済みの唯一のプラットフォーム）、[Bun](https://bun.sh)、
Node.js、Xcode Command Line Tools です（Bun 1.3.6 と Node.js 22.14 で確認しています）。macOS では、
`bun run dev` が Apple のオンデバイスモデルにつなぐ Swift ブリッジもビルドします。

```bash
git clone https://github.com/p2p-solidarity/unmapped.git
cd unmapped
bun install        # Electron のバイナリも取得されます
bun run dev        # main + preload + renderer（HMR 対応）
```

起動したら **タイトル → 設定 → モデル** を開き、文章を書かせるモデルを選びます。

### モデルを選ぶ

| プロバイダー | 既定のエンドポイント | キー | エンドツーエンド検証 |
| --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` · `gpt-5.4-mini` | 設定 → モデル、または `.env` の `OPENAI_API_KEY` | ✅ つくる、観測、章、場所 |
| llama.cpp | `http://127.0.0.1:8080/v1` | 不要 | 未検証 |
| Ollama | `http://127.0.0.1:11434/v1` · `qwen3.5:4b` | 不要 | 未検証（検出のみ確認） |
| Apple Foundation Models | `fm serve`（`127.0.0.1:11535`） | 不要（初回に `sudo fm license` が必要） | 未検証（検出のみ確認） |
| vLLM + [`thesysdev/OUI-1`](https://huggingface.co/thesysdev) | `http://127.0.0.1:8000/v1` | 不要 | 未検証 |
| OpenUI Gateway | `https://api.thesys.dev/v1/embed` | `THESYS_API_KEY` | 未検証 |
| OpenAI 互換の任意のサーバー | 任意の URL | 任意 | — |

「設定 → モデル」で入力したキーは OS のキーチェーンで暗号化され、読めるのは Electron のメインプロセスだけ
です。レンダラーに渡ることはありません。`.env` のキーもフォールバックとしてメインプロセスが読みます。形式は
[`.env.example`](.env.example) を参照してください。

<details>
<summary><b>llama.cpp でローカルモデルを動かす</b>（メモリ 16 GB の Apple Silicon Mac におすすめ）</summary>

```bash
brew install llama.cpp
scripts/download-model.sh qwen   # Qwen3.5-4B Q4_K_M、2.74 GB、Apache-2.0 → ~/models
llama-server -m ~/models/Qwen3.5-4B-Q4_K_M.gguf --port 8080 -c 16384 --jinja -ngl 99
```

`scripts/download-model.sh gemma` にすると Gemma 4 E4B（4.98 GB、Gemma ライセンス）をダウンロードします。
`MODEL_DIR` を設定すると保存先を変えられます。

</details>

### 操作

| 場面 | キー |
| --- | --- |
| 大地 | <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> またはクリックで移動 · <kbd>Shift</kbd> ダッシュ · <kbd>E</kbd> 調べる · <kbd>N</kbd> メモ · <kbd>V</kbd> 表示切替 · <kbd>F12</kbd> コンソール |
| 銃のあるワールド | <kbd>Space</kbd> / <kbd>F</kbd> 射撃 · 敵をクリックで射撃 |
| 横スクロール | <kbd>A</kbd><kbd>D</kbd> 移動 · <kbd>Space</kbd> ジャンプ · <kbd>E</kbd> 調べる |
| ダンジョン（一人称） | <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移動 · 左クリック 射撃 · <kbd>R</kbd> ターン終了 · <kbd>F</kbd> ライト · <kbd>E</kbd> 調べる |

いまいる場所で使えるキーは、常に HUD に表示されます。

## しくみ

```mermaid
flowchart TB
  subgraph create["つくる（ワールドごとに一度）"]
    idea["アイデア · 言語 · 遊び方"] --> bible["世界設定<br/>7 枚の編集できるカード"]
    bible --> chapters["3〜8 章"]
    chapters --> build["作って公開"]
  end
  build --> cart[("カートリッジ<br/>変更不可 · sha256")]
  cart --> save[("セーブ<br/>リビジョンを固定")]
  subgraph play["遊ぶ"]
    direction LR
    seed["シード + チャンク座標"] --> land["決定論的な大地<br/>保存しない · モデルを使わない"]
    land --> first{"未記録の<br/>場所？"}
    first -- "はい" --> llm["LLM が<br/>OpenUI Lang を書く"]
    llm --> parser["パーサー + 数値の制限<br/>修正は最大 2 回"]
    parser -- "通過" --> written["セーブに<br/>一度だけ書く"]
    parser -- "失敗のまま" --> err["エラー表示<br/>直し方つき"]
    first -- "いいえ" --> written
    written --> draw["HD-2D · 16-bit<br/>横スクロール · ダンジョン"]
  end
  save --> play
```

**モデルはお客さんで、真実は DSL。** プロンプトは毎回、Cordis ハーネス上で順番の決まったセクションから
組み立てられます。ペルソナ、世界のルール、DSL の仕様、Mod の伝承、伝承のホットスポットを含むワールドの
スナップショット、例、出力形式です。モデルの返答は、その方言のスキーマに照らして解析されます。エラーは
`OpenUIError[]` として返され、モデルは失敗した文だけを直します。モデルが `x=9000` のような値を書いても、
範囲内に収められます。そのまま信用されることはありません。

シーンはこのような見た目です。手書きのデモカートリッジ
[`cartridges-examples/demo-onsen-letters`](cartridges-examples/demo-onsen-letters/scenes/onsen_street.oui)
からの抜粋です。コンポーネントはすべて位置引数を取ります。

```text
root = Scene("湯屋街", "onsen_town", [contract, floor, sky, ambient, lanterns, stone_path, well, chiyo, koharu, letter_one, exit, letters])
floor = Floor(23, 23, "wood")
sky = Sky("#1c1520", "#2a1f28", 0.06)
lanterns = Light("point", "#ffd0a8", 1.7, 11, 11)
stone_path = Patch(10, 3, 3, 18, "stone")
well = Prop("well", 15, 13)
chiyo = NPC("chiyo", "千代", 12, 9, "merchant", "calm", "#b0426a", "tall", "ribbon", "fan")
koharu = NPC("koharu", "小春", 7, 13, "child", "joyful", "#f2b84b")
letter_one = Treasure("letter_one", 4, 17, ["褪色的信"])
exit = Exit(11, 3, "湯屋閣樓")
letters = Quest("letters", "向街上的人打聽，誰寄了那三封沒有署名的信。")
```

### エンジンが決して破らないルール

1. **歩くときにモデルを待たない。** 地形はシードだけで決まります。モデルがなくても大地は歩けます。その場合、
   各地は正直に「未記録」のまま残ります。
2. **やりとりの瞬間にモデルを呼ばない。** 会話と選択肢は観測のときに書かれ、選択は決定論的なアクションで
   処理されます。
3. **モデルは提案するだけ。** モデルの出力は、パーサーとルールの検査を通ってはじめて歴史になります。
4. **コンテンツは変更不可、進行状況はリビジョンに固定。** プレイ中にカートリッジへ書き込むことはありません。
   セーブはカートリッジの id、バージョン、ハッシュを正確に記録します。
5. **物理ルールにはバージョンがある。** ワールドの見た目や戦い方（地面、野生生物、戦闘の計算式）を変える
   ときは、`PHYSICS_VERSION` を上げます。物理バージョンの違うワールドが、同じ大陸にまとまることはありません。
6. **ダミーデータは使わない。** データを表示する画面は、必ず `idle | loading | ready | error` のどれかです。
   サンプルのワールド、決まり文句の NPC のセリフ、架空の仲間は表示しません。
7. **チェーンは完全に切れる。** 切っても、すべての画面がそのまま動きます。

エンジニアリング上の取り決め（モジュールの export、状態の持ち主、セキュリティのルール）はすべて
[`CLAUDE.md`](CLAUDE.md) にあります。

## ワールドはファイル

データはすべて Electron の userData フォルダーにあります。macOS では
`~/Library/Application Support/Unwritten Land/` です。改名前のプロダクト ID ですが、既存のセーブと
キーチェーンの項目をそのまま使えるように残しています。

```text
cartridges/<id>/<version>/        変更できない公開コンテンツ：manifest、ルール、シーン、世界設定、ストーリー（ハッシュ付き）
instances/<id>/saves/<save>/      リビジョンに固定された進行状況：save.json、因果、伝承、メモ、観測済みのチャンク
workspaces/create.<draft>/        「つくる」の下書き（自動保存）
mods/<name>/                      インストール済みの Mod：mod.yml + prompt/*.md + skills/
usage.jsonl                       モデル呼び出し 1 回につき 1 行：用途、モデル、トークン数、ミリ秒、結果
```

| ファイル | 中身 | 復元できる条件 |
| --- | --- | --- |
| `.cartridge` | コンテンツのみ（公開済みのリビジョン 1 つ） | どのマシンでも可。両側でハッシュが一致します |
| `.spire-backup` | 1 回分のプレイとそのセーブ（大地、伝承、メモ） | まったく同じカートリッジのリビジョンがあるマシン |

## いっしょに遊ぶ：大陸

ワールドにはそれぞれ変わらない**扉番号**があり、それがそのワールドの開く大陸のコードにもなります。タイトル画面で
「大陸に参加」を選ぶか、ゲーム内で自分の扉を開けて番号を共有してください。ワールドはそれぞれ自分の原点、
シード、セーブを持ったままです。参加するとアンカーが割り当てられ、各地はいちばん近いアンカーの領地になります。

- **やりとりされるもの：** 各ワールドの概要、観測済みのチャンク、メモ、リアルタイムの位置（awareness のみで、
  保存はしません）。
- **やりとりされないもの：** カートリッジ本体、ルール、ストーリー、頼みごと、敵。
- **信頼：** ピアの hello が大陸コード、プロトコル、物理バージョンと一致するまで、何も交換しません。その後も
  データは届くたびに検査されます。ピアが書き込めるのは自分のワールドとチャンクだけです。メモは誰の土地にも
  残せますが、既存のチャンクやメモを上書きすることは決してできません。
- **シグナリング：** 既定では公開の y-webrtc サーバーを使います。自分で立てることもできます
  （`PORT=4444 node node_modules/y-webrtc/bin/server.js`）。**設定 → シグナリングサーバー** に追加すれば、
  保存する前にそこで接続をテストできます。

## Mod

Mod は、YAML のマニフェスト、Markdown のプロンプトセクション、任意のスキルが入ったフォルダーです。JavaScript は
一切含みません。ツールは決まった効果の語彙に対するテンプレートで、モデルが渡した引数も、その結果できる効果も、
ハーネスが検証します。以下はサンプル Mod からの抜粋です。

```yaml
name: onsen-festival
version: 0.1.0
description: Every floor carries a hot-spring town undercurrent, and the lanterns can be lit.
prompt:
  - { name: onsen-lore, order: 420, file: prompt/lore.md }
tools:
  - name: light_lanterns
    description: Light the festival lanterns when the player has actually done something that would light them.
    parameters:
      color: { type: string, description: "Lantern colour as #rrggbb", required: true }
    effect: { kind: mutate_world, skyColor: "{{color}}", fogDensity: 0.012, biome: onsen_town }
skills: [skills]
```

全体は [`mods-examples/onsen-festival`](mods-examples/onsen-festival)、設計メモは
[`docs/harness.md`](docs/harness.md) にあります。

## オプション：オンチェーンの来歴

遊ぶだけなら、どれも必要ありません。何も設定しなければ、台帳が未設定であることを各画面がはっきり伝えます。

- **カートリッジとセーブの ENSv2 名（Sepolia）。** すべて `unmapped.eth` の下の一本のツリーに付きます。
  カートリッジのリビジョンは `<cartridge>.unmapped.eth`、リミックスは親の名前の下、セーブは
  `<save>.<cartridge>.unmapped.eth` で、プレイヤー自身のパスキーのアカウントが保有します。**ワールド →
  カートリッジ** でリビジョンに名前を付け（自分の名前を新しいリビジョンに向け）、**ENS 名で開く** で名前から
  正確なリビジョン、あるいはセーブのチェックポイントにたどり着けます。**ワールド → セーブ → このセーブの ENS
  名** では遊んだ記録を残し、進めたら更新します。レコードは id、バージョン、コンテンツハッシュだけ（セーブは
  その sha256、固定したバージョン、進行状況の一行）で、別の端末で復元したバックアップはハッシュから自分の
  名前を見つけます。
- **来歴台帳。** [`contracts/src/UnwrittenLedger.sol`](contracts/src/UnwrittenLedger.sol) は、誰がどのハッシュを
  公開し、それが何のリミックスなのかと、プレイヤーの短いメモを記録します。コンテンツはチェーンに載りません。
- **系譜マーケット（実験的・Sepolia）。** 名前の付いたカートリッジは発行できます。トークンは親ワールドの
  トークン建てで Uniswap の Continuous Clearing Auction により販売され、v4 フックが 1% のロイヤリティを系譜の
  上へ分配します（ワールド・親・祖父母に 50／30／20）。受け取るのはその時点で ENS 名を持っている人です。
  最初のワールド `aether-land.unmapped.eth` はオークション、精算、取引まで済んでいます。**ワールド →
  マーケット** では、パスキーで入札・精算・購入・ロイヤリティの支払いができます。ウォレットも ETH も要らず、
  アプリに鍵もありません。パスキーが小さなアカウントコントラクトを持ち、ガスステーション（Cloudflare Worker、
  `src/relay`）がマーケット自身の操作に限ってガス代を払います。新しいワールドの発行はまだ運営者のコマンド
  （`bun run lineage:demo launch`）です。
  読み取り専用のオークションページ: https://unmapped-auction.gimmychang.workers.dev。詳しくは
  [`docs/demo/lineage-market.md`](docs/demo/lineage-market.md)、
  [`docs/plans/lineage-market.md`](docs/plans/lineage-market.md) と
  [`contracts/README.md`](contracts/README.md) を参照してください。

チェーン用のキー（`UNWRITTEN_*`）を読むのはメインプロセスだけです。デプロイや発行のスクリプトは必ず人が手で
実行します。アプリはマーケット用の鍵を持たず、プレイヤーがパスキーで署名した操作を
`UNWRITTEN_LINEAGE_RELAY` のガスステーションに渡すだけです。

## 現在の状態

UNMAPPED はバージョン `0.1.0`、動作はする初期段階の研究版です。実際のアプリで動かして確かめた機能だけを
「検証済み」としています。実行のたびに、再生できる記録を [`docs/e2e/`](docs/e2e) に残しています。中身は
`run.json`（実際の操作手順）、`result.md`（計測した数値）、スクリーンショットです。

| 項目 | 状態 | 根拠 |
| --- | --- | --- |
| つくる：4 ステップ、ストリーミング、カード単位の書き直し、章の編集・ロック・並べ替え、再起動後の保持 | ✅ 検証済み | [create-four-step](docs/e2e/milestone-create-four-step/result.md) · [rev6-create](docs/e2e/milestone-rev6-create/result.md) |
| HD-2D と 16-bit の大地、昼・夕暮れ・夜 | ✅ 検証済み | [e2e-first](docs/e2e/milestone-e2e-first/result.md) · [land-lighting](docs/e2e/milestone-land-lighting/result.md) |
| 観測、メモ、伝承のセーブへの書き込み | ✅ 検証済み | [rev6-land](docs/e2e/milestone-rev6-land/result.md) |
| リアルタイム戦闘、倒れて復帰 | ✅ 検証済み。HD-2D の敵は静止時のみ確認し、移動中は未確認 | [integration](docs/e2e/milestone-integration/result.md) |
| 場所：横スクロールとダンジョン、出て入口に戻る | ✅ 検証済み | [play-loop](docs/e2e/milestone-play-loop/result.md) · [rename-unmapped](docs/e2e/milestone-rename-unmapped/result.md) |
| 2 つのアプリプロセス間の大陸 | ✅ 検証済み（ローカルのシグナリング） | [rev6-land](docs/e2e/milestone-rev6-land/result.md) · [visitor-position](docs/e2e/milestone-rev6-followup-visitor-position/result.md) · [signaling](docs/e2e/milestone-rev6-followup-signaling/result.md) |
| `.cartridge` の書き出しと読み込み、`.spire-backup` の復元 | ✅ 検証済み。ハッシュが一致 | [rev6-land](docs/e2e/milestone-rev6-land/result.md) |
| クラウドモデル（OpenAI `gpt-5.4-mini`）と使用量台帳 | ✅ 検証済み | [model-switch](docs/e2e/milestone-model-switch/result.md) · [rev6-create](docs/e2e/milestone-rev6-create/result.md) |
| ローカルモデルでの生成（llama.cpp、Ollama、Apple） | ⏳ 検出は確認済み、生成は未検証 | [model-switch](docs/e2e/milestone-model-switch/result.md) |
| AI ワールド（サンドボックスのインタラクティブワールド） | ✅ 検証済み | [acceptance](docs/experiments/interactive-works-acceptance.md) |
| Sepolia 上の ENSv2 カートリッジ名（以前の `ens:setup` の親） | ✅ 検証済み | [ensv2-cartridge-names](docs/e2e/milestone-ensv2-cartridge-names/result.md) |
| 名前ツリーの ENS 名：リミックスのカートリッジ、プレイヤーのセーブ、更新、復元したバックアップのハッシュ照合 | ✅ Sepolia で検証済み | [lineage-names](docs/e2e/milestone-lineage-names/result.md) |
| ガスステーション：アプリに鍵なし | ✅ 検証済み（アプリの流れはローカル実行で、デプロイした Worker も実際にテスト USDC の送信を 1 件実行） | [lineage-relay](docs/e2e/milestone-lineage-relay/result.md) |
| 系譜マーケット: アプリからパスキーで入札・精算・購入・ロイヤリティ | ✅ Sepolia で検証済み（Touch ID は仮想認証器で代用）。3 世代はドライランのみ | [lineage-demo](docs/e2e/milestone-lineage-demo/result.md) · [lineage-market](docs/e2e/milestone-lineage-market/result.md) |
| 仲間キャラクター | 🚧 ルールにはあるが、大地ではまだ描画も追従もしない | — |
| Windows / Linux | ❔ 未テスト。パッケージングは macOS のみ | — |

段階ごとの成果と計測値は、[`docs/architecture/afm3-dsl-architecture.html`](docs/architecture/afm3-dsl-architecture.html)
の 03 ページにあります。

## ロードマップ

現在の方針は **Revision 6** です（[エンジニアリングノート](docs/rev6-engineering.html) ·
[フェーズ 2 の計画](docs/plans/rev6-phase2.md)）。

- **共有される歴史。** 観測された内容はワールドのもので、みんなで共有します。最初に来た人が書いた版が残り、
  あとから来た人はそれを同期するだけで、生成し直しはしません。
- **痕跡が土台、同じ時間にいることが頂点。** ワールドは誰かがオンラインでいることを前提にしません。同じ
  同期のしくみが、同時にいればリアルタイムに、離れていればあとから追いつく形で動きます。
- **忘却。** 長いあいだ誰も訪れない場所は霧に戻り、ふたたび観測されるのを待ちます。歴史は消えず、古い姿は
  伝説になります。
- **戦いより世話を。** 基本の遊び方は探索で、戦闘は選んだときだけです。安全な家と町はかならずあります。
- **2D エンジンへの一本化。** 場所は `engine2d` に移り、AI ワールドは大地の中の「異界」になります。
- **ワールドの拍と噂。** 定期的な統合、季節の移り変わり、手入れがあります。噂は、ワールドの歴史で実際に
  起きたことだけを語ります。
- **モバイルを見すえた設計。** アセットはハッシュで必要なときに取得し、オフラインを優先し、入力はアクション表で
  扱います。

## 開発

| コマンド | 内容 |
| --- | --- |
| `bun run dev` | Electron + Vite（HMR 対応） |
| `bun run check` | 型チェック、Biome、600 行の上限、Vitest。変更を完了とするにはすべて通す必要があります |
| `bun run build` / `bun run dist` | 本番ビルド／electron-builder による macOS の `.dmg` |
| `bun run demo:cartridges` | `cartridges-examples/` のデモカートリッジをビルド |
| `bun run contracts:build` | Solidity の成果物を再コンパイル（リポジトリにコミット済み） |
| `bun run lineage:market --dry-run` | Sepolia 上でデプロイ → 3 世代 → オークション → スワップ → ロイヤリティをシミュレート |
| `bun run lineage:demo status\|launch\|seed-bids\|settle` | マーケットの運営ツール（launch と seed-bids は Sepolia のガスを使います） |
| `bun run web:deploy` | 読み取り専用のオークションページを Cloudflare にデプロイ |
| `bun run relay:key` / `relay:dev` / `relay:deploy` | ガスステーション：鍵を作る、ローカルで動かす、Cloudflare にデプロイ |

**エンドツーエンドの実行** では、Chrome DevTools Protocol で実際のアプリを操作します。userData は毎回
使い捨てのものを使います。

```bash
mkdir -p "$TMPDIR/ud"
AETHER_TEST_USER_DATA="$TMPDIR/ud" bun run dev --remoteDebuggingPort 9333   # バックグラウンドで実行
bun scripts/cdp-drive.ts "$(cat docs/e2e/<run>/run.json)"
```

<details>
<summary><b>プロジェクト構成</b></summary>

```text
src/
├── shared/      共通の契約：Result、ワールドの語彙、チャンク、物理、大陸、LLM 設定、IPC
├── dsl/         OpenUI Lang のゲーム方言：スキーマ、プロンプト、解析、修正、GBNF 文法、数値の上下限
├── harness/     Cordis のプロンプトセクション、ツール、スキル、GameEffect の接点、Mod の読み込み
├── main/        Electron のメインプロセス：カートリッジ、インスタンス、ワークスペース、鍵の保管、推論、使用量、AI ワールド、チェーン
├── preload/     contextBridge → window.seed
└── renderer/
    ├── app/        画面と HUD：タイトル、つくる、プレイ、大地、コンソール
    ├── engine2d/   大地：移動、当たり判定、ターゲット、物語の扉（16-bit キャンバス）
    ├── hd2d/       three.js の HD-2D レンダラーとタイトル背景
    ├── engine/     場所用の R3F シーン、戦闘ループ、パレット
    ├── narrative/  観測・章・場所の生成：プロンプト → チャット → 解析 → 修正
    ├── net/        大陸：y-webrtc のルーム、ゲート、シグナリング
    ├── identity/   パスキー PRF、キーチェーンのフォールバック、AES-GCM、ENS の解決
    ├── works/      AI ワールドのサンドボックスプレイヤー
    ├── i18n/       en · zh-TW · ja の文字列テーブル
    └── ui/         UI の基本部品とデザイントークン
contracts/       UnwrittenLedger と系譜マーケット（Solidity）
native/          Apple Foundation Models につなぐ Swift ブリッジ
docs/            アーキテクチャ、計画、調査、E2E の記録
```

</details>

<details>
<summary><b>一部の識別子に「Unwritten」や「Aether」が残っているのはなぜ？</b></summary>

プロジェクトは改名しました。プレイヤーに見える名前は、いまはすべて UNMAPPED／《無界之地》です。ただし、
変えるとデータ移行が必要になる識別子は旧名のまま残しています。`productName`／`appId`（userData フォルダーと、
保存したキーを包むキーチェーン項目を決めます）、`unwritten.*`／`aether.*` のストレージキー、`UNWRITTEN_*` の
環境変数、固定済みの ENS テキストキー、組み込みカートリッジの id `aether-land` です。

</details>

## コントリビュート

Issue もプルリクエストも歓迎します。PR を出す前に、次を確認してください。

1. **[`CLAUDE.md`](CLAUDE.md) を読む。** そこにあるルールは、どれも以前のコードがバグを起こしたことから
   生まれたものです。要点は次のとおりです。ファイルは 600 行以内、ダミーデータは使わない、エラーは値として
   返す（`Result<T>`）、色はトークンからだけ使う、プレイヤーに見える文字列は en・zh-TW・ja の 3 言語すべてを
   用意する。
2. **`bun run check` を実行して**、すべて通ることを確認する。
3. **実際のアプリで確かめる。** エンドツーエンドの実行が主なテストです。変更したフローについて、ほかの人が
   再生できる `docs/e2e/milestone-<flow>/` の記録（`run.json`、`result.md`、スクリーンショット）を追加して
   ください。
4. **失敗はそのまま報告する。** 赤いチェックも失敗した手順も、大事な情報です。

## セキュリティ

Mod とピアがあるため、レンダラーは常に信頼できないものとして扱います。`contextIsolation` と `sandbox` は常に
有効で、`nodeIntegration` は常に無効です。IPC で届くデータはすべてメインプロセスが zod で検証し、API キーや
チェーンのキーがメインプロセスの外に出ることはありません。モデルが生成した AI ワールドは、新しい `ulwork://`
オリジン上の `allow-scripts` だけを許可した iframe の中でのみ動きます。そのフレームには `allow-same-origin`、
`window.seed`、ファイルパス、秘密情報のどれも渡さず、フレームから届くメッセージはすべて検査します。

脆弱性を見つけた場合は、公開の Issue ではなく
[GitHub Security Advisories](https://github.com/p2p-solidarity/unmapped/security/advisories/new) から非公開で
報告してください。

## 謝辞

- [OpenUI](https://github.com/thesysdev)（`@openuidev/lang-core`）。そのパーサーがすべての正解の基準です
- [Cordis](https://github.com/cordiverse/cordis) と [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。プロンプト、ツール、Mod を支えるプラグインモデルです
- [three.js](https://threejs.org)、[React Three Fiber](https://github.com/pmndrs/react-three-fiber)、[Rapier](https://rapier.rs)、[Yjs](https://github.com/yjs/yjs) + [y-webrtc](https://github.com/yjs/y-webrtc)、[viem](https://viem.sh)、[zod](https://zod.dev)、[electron-vite](https://electron-vite.org)
- ローカル推論：[llama.cpp](https://github.com/ggml-org/llama.cpp)、[Ollama](https://ollama.com)、[Qwen](https://huggingface.co/Qwen)
- Pixel-boy／Pixel Archipel による [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack)（CC0）。タイルとキャラクターに使っています
- エッセイ [Large Lore Models](https://aw.network/posts/large-lore-models) と [Moving Castles: Zero](https://movingcastles.world/posts/zero)。「伝承は積み重なっていくもの」「モデルはつなぎ止めておくもの」という考え方のもとになりました

## ライセンス

コードは [Apache License 2.0](LICENSE) で提供しています。サードパーティのアセットはそれぞれのライセンスに
従います。Ninja Adventure のアートは CC0（[詳細](docs/licenses/ninja-adventure-cc0.md)）で、ダウンロードする
モデルの重みには各配布元のライセンスが適用されます。
