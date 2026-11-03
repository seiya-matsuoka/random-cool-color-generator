# 技術設計

本書は [要件定義](01-requirements.md) と [画面設計](02-screen-design.md) を実現する構成・処理を定義する。
画面の表示・操作は画面設計に、生成・保存・検証・配信の構成は本書に定義する。

## 1. 技術構成

| 用途           | 採用技術・方針                                                                    |
| -------------- | --------------------------------------------------------------------------------- |
| アプリ         | React / TypeScript / Vite                                                         |
| スタイル       | Tailwind CSS v4。公式の Vite プラグインを使用する                                 |
| 実行環境       | Node.js 24 系、npm。CI も同じ Node.js メジャーを使用する                          |
| 状態管理       | React 標準の state / hooks。グローバル状態管理ライブラリは導入しない              |
| 生成           | Web Crypto API の SHA-256、標準の日時・文字列変換 API                             |
| 保存           | `localStorage`、手書きの実行時検証。DB・外部保存ライブラリは導入しない            |
| 整形・静的検査 | Prettier / ESLint / TypeScript                                                    |
| 単体テスト     | Vitest / `@vitest/coverage-v8`。基本のテスト環境は Node.js                        |
| ブラウザテスト | Playwright / `@axe-core/playwright`。Chromium を使用する                          |
| UI の独立確認  | Storybook の React / Vite 対応構成、TypeScript の CSF3、Docs / Controls / Actions |
| CI・公開       | GitHub Actions / GitHub Pages                                                     |

- 依存パッケージの版は [package.json](../../package.json)、解決結果は [package-lock.json](../../package-lock.json) に固定する。
  Node.js は [.node-version](../../.node-version) の 24.16.0 を使用し、CI も同じファイルを参照する。
- Storybook のテスト統合、Interaction tests、Chromatic、外部への Storybook 公開は今回の対象外とする。
- Router、Redux、スキーマ検証ライブラリ、CSS コンポーネントライブラリは導入しない。
- `jsdom` や React Testing Library を前提にしない。
  UI とブラウザの統合は E2E で確認する。
- 生成物・cache・ローカル設定は `.gitignore`、整形対象と書式は Prettier の設定で管理する。

## 2. 責務と配置

主要な配置を次に示す。
UI、画面状態の調整、生成・保存処理と、それぞれを対象とする検証コードを分ける。

```text
src/
  App.tsx                    # 画面の組み立て
  main.tsx                   # React の起動
  index.css                  # Tailwind と共通スタイル
  components/                # props で表示する UI、同居する Story
  hooks/                     # 画面状態と非同期処理の調整
  lib/                       # 型、生成・変換、記録操作、保存・検証、単体テスト
e2e/                         # Playwright のシナリオとテスト専用データ
.storybook/                  # Storybook 設定
.github/workflows/           # 品質チェックと Pages への配信
scripts/                    # Storybook・Playwright の実行、素材の再生成
public/                     # ファビコン・OGP PNG・配布用ライセンス表示
assets/site/                # OGP 元 SVG
docs/before-development/     # 開発前の設計書
docs/after-development/      # 完成状態の設計書
AGENTS.md                    # プロジェクト固有のエージェント向け指示
```

- UI コンポーネントは生成や `localStorage` を直接操作せず、表示用 props と操作のコールバックを受け取る。
- 生成・変換・記録配列の操作は、可能な範囲を副作用のない関数にする。
- 保存処理は読み込み、検証、書き込み、対象キーの削除をまとめ、失敗を判別できる結果を返す。
- hook が現在の表示、一覧、処理中、通知、ダイアログ、保存状態を調整する。
  汎用的なサービス層や DI コンテナは作らない。
- 保存領域、日時、ダイジェスト関数などは、必要な関数に引数で渡せる程度の小さな境界を用意し、テストで置き換えられるようにする。
- 表示色の記録を履歴・お気に入りの配列参照と分離する。
  一覧から削除されても表示中の記録を保持できるようにする。

主要なファイルと責務は次のとおりである。

| ファイル                                        | 責務                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `src/main.tsx` / `src/App.tsx`                  | StrictMode で起動し、hook の返却値を画面へ接続する                  |
| `src/components/GeneratorScreen.tsx` と表示部品 | 現在色・一覧・通知・確認を props で表示し、操作をコールバックで返す |
| `src/components/ui-state.ts`                    | 色の有無、生成中、登録状態、上限、保存状態から操作可否を求める      |
| `src/hooks/useColorGenerator.ts`                | 初回生成、領域別の状態、通知、確認と非同期結果を調整する            |
| `src/lib/color.ts` / `generate-color.ts`        | 色の変換と生成候補・再試行を扱う                                    |
| `src/lib/records.ts` / `date-time.ts`           | 一覧の配列操作と日時の書式化を行う                                  |
| `src/lib/storage-validation.ts` / `storage.ts`  | 保存値の検証・正常化と、最新内容への保存・削除を行う                |

## 3. 色の生成

### 3.1. 入力とシード

1. 初回表示またはユーザー操作を 1 回の生成要求として受け付ける。
2. 受け付け時の `Date.now()` を `timestamp` として 1 回取得する。
3. ページ内の生成要求の `sequence` を 1 から開始し、要求ごとに 1 増やす。
4. `attempt` を 0 から開始し、次の UTF-8 文字列を SHA-256 に渡す。

```text
rccg:v1:<timestamp>:<sequence>:<attempt>
```

- 数値は 10 進整数の文字列とし、桁埋めやロケール依存の区切り文字を使用しない。
- `Date.now()` は年月日を含む Unix epoch からのミリ秒であり、年月日時分秒を別々に連結する必要はない。
- `sequence` は同じミリ秒の要求を区別するために使用する。
  再読み込みで 1 に戻り、保存済み履歴の件数とは連動しない。
- 失敗した要求も連番を消費する。
  無効なボタンへの操作や候補の再試行では連番を進めない。
- 1 回の要求内では `timestamp` と `sequence` を固定し、再試行時は `attempt` だけを変える。
- `Math.random()`、ユーザー情報、端末情報、記録 ID はシードに含めない。

### 3.2. SHA-256 から HSL への変換

- `TextEncoder` と `crypto.subtle.digest('SHA-256', ...)` を使用する。
  独自のハッシュ関数は作らない。
- 32 バイトのダイジェストの先頭 12 バイトを、4 バイトずつビッグエンディアンの符号なし 32 bit 整数として読む。
  オフセットは 0 / 4 / 8 とする。
- 得た値を `u0` / `u1` / `u2` として、次の式で整数の HSL を求める。

```text
h = 160 + (u0 % 111)    // 160..270
s = 65  + (u1 % 36)     // 65..100
l = 25  + (u2 % 46)     // 25..70
```

- ハッシュ全文は小文字の 16 進数 64 桁に変換する。
- 入力が少し変わるとダイジェストが大きく変わる性質を利用する。
  ただし、有限の色域への変換後の色が毎回一意になることは保証しない。
- 剰余による小さな分布の偏りは許容する。
  抽選やセキュリティ用途の乱数生成として扱わない。

### 3.3. HSL から RGB / HEX への変換

S と L を 0〜1 に正規化した値を `S` / `L` とし、通常の HSL 変換を使用する。

```text
C = (1 - abs(2 * L - 1)) * S
X = C * (1 - abs((h / 60) % 2 - 1))
m = L - C / 2
```

H の区間に応じて `(r', g', b')` を決める。

| H の区間      | `(r', g', b')` |
| ------------- | -------------- |
| 0〜60 未満    | `(C, X, 0)`    |
| 60〜120 未満  | `(X, C, 0)`    |
| 120〜180 未満 | `(0, C, X)`    |
| 180〜240 未満 | `(0, X, C)`    |
| 240〜300 未満 | `(X, 0, C)`    |
| 300〜360 未満 | `(C, 0, X)`    |

- 各チャンネルを `Math.round((channel + m) * 255)` で整数にし、0〜255 の値として扱う。
- 各チャンネルを 2 桁の 16 進数へ変換し、大文字の `#RRGGBB` とする。
- 色見本はこの HEX を使用する。
  RGB の表示は HEX の整数値から求め、HSL は生成時の値を表示する。
  量子化後の RGB から HSL を再算出しない。

### 3.4. 直前と同じ色の扱い

- 現在の表示色があれば、その HEX を比較対象にする。
- 表示色のない初回要求では、読み込めた履歴の先頭の HEX を比較対象にする。
  履歴がなければ比較なしとする。
- 候補の HEX が比較対象と同じ場合、`attempt` を増やして再試行する。
- `attempt` は 0〜7 とする。
  8 候補がすべて一致した場合は失敗を返す。
- ダイジェスト API の失敗はその要求の失敗とし、API のエラーを繰り返し再試行しない。
- 成功した候補だけを記録とし、UUID を割り当てて履歴へ追加する。
  候補の不採用や失敗では履歴・お気に入りを変更しない。

### 3.5. 固定入力の確認用データ

次は固定した入力に対する SHA-256 と変換結果の期待値である。
単体テストと実 Web Crypto を使うブラウザ検証は、この値との一致を検証する。

```text
timestamp: 1792335600000
sequence: 1
attempt: 0
seed: rccg:v1:1792335600000:1:0
SHA-256: 633a637f07947c0c24e199416bd098faea3ce2a47d3adbcb3838e0856e3e00ab
HSL: hsl(207 77% 50%)
RGB: rgb(29 137 226)
HEX: #1D89E2
```

この時刻は UTC では `2026-10-18T15:00:00.000Z`、UTC+09:00 では `2026-10-19 00:00:00.000` に相当する。

### 3.6. 生成処理の入出力

`generateColor(request, dependencies?)` は、日時・連番・比較対象の HEX を受け取り、採用した `ColorRecord` を Promise で返す。
日時・連番の採番は呼び出し側が行い、生成処理の中では変更しない。
`dependencies` にはダイジェスト関数と ID 生成関数を個別に渡せる。
未指定時は Web Crypto を使用し、テストでは衝突や失敗を固定条件で再現するために置き換える。

`digestToHsl` / `digestToHash` はダイジェストを変換し、`hslToRgb` / `rgbToHex` / `hexToRgb` は表示形式の変換を担当する。
入力の日時・連番・比較用 HEX の妥当性は呼び出し側の前提とする。
8 候補すべての衝突、ダイジェストの不正な長さ、API や UUID 生成の失敗は Promise の拒否として返す。
履歴・お気に入りや画面はこの関数で変更せず、呼び出し側が成功時に反映する。

## 4. 記録と保存形式

### 4.1. 生成記録

```ts
type ColorRecord = {
  id: string;
  generatedAt: number;
  sequence: number;
  attempt: number;
  hash: string;
  hsl: { h: number; s: number; l: number };
  hex: string;
};

type StoredCollection = {
  version: 1;
  items: ColorRecord[];
};
```

- `id` は生成成功時に `crypto.randomUUID()` で作る記録単位の ID とし、追跡用の利用者 ID として使用しない。
- `generatedAt` はシードに使用した `timestamp` とする。
  RGB と表示用日時文字列は重複保存しない。
- 表示日時は `generatedAt` を表示時のローカルタイムゾーンへ変換し、`YYYY-MM-DD HH:mm:ss.SSS UTC±HH:MM` とする。
  元のタイムゾーン自体は保存しない。
- 一覧からの再表示では保存した記録を使用し、ハッシュ・色・日時を生成し直さない。
- お気に入りは記録のスナップショットを保持する。
  履歴内の ID への参照だけにしない。

### 4.2. キーと配列のルール

| 領域       | キー                                    | 並び順・同一性                                          |
| ---------- | --------------------------------------- | ------------------------------------------------------- |
| 履歴       | `random-cool-color-generator:history`   | 生成の新しい順。最大 20 件。異なる ID の同じ HEX は許容 |
| お気に入り | `random-cool-color-generator:favorites` | 登録の新しい順。最大 20 色。HEX で重複を除く            |

- 形式のバージョンはキーではなく envelope の `version` で管理する。
- 履歴への追加は新しい記録を先頭に置き、超過分を末尾から除外する。
- お気に入りへの追加は最新の配列を確認し、既存の HEX は変更しない。
  未登録で 20 色未満の場合だけ先頭へ追加する。
- 通常の書き込み前に最新の保存内容を読み直し、別タブの変更に操作を適用する。
- お気に入りの解除は HEX を指定して行う。
  確認時点で既に対象がなくなっていれば、変更不要として通知する。
- 日時による再ソートはしない。
  お気に入りの登録順は配列の順序で保持する。

### 4.3. 配列操作の関数

| 関数                             | 入力と返却値                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `appendHistory(history, record)` | 先頭追加して 20 件へ切り詰めた新しい配列を返す                                  |
| `addFavorite(favorites, record)` | HEX の重複を上限より先に判定し、`added` / `duplicate` / `full` と次の一覧を返す |
| `removeFavorite(favorites, hex)` | 対象 HEX を除き、`removed` / `not-found` と次の一覧を返す                       |

入力配列は変更せず、お気に入りへの追加では記録とネストした hsl を複製してスナップショットを作る。
これらの関数の返却値は配列の更新案であり、保存成功を意味しない。
保存処理がその案を永続化し、hook が結果に応じて画面へ反映する。

## 5. 保存データの検証と失敗時の動作

### 5.1. 読み込み時の検証

読み込みと JSON 解析の例外を扱い、TypeScript の型アサーションだけで信頼しない。

1. キーが存在しない場合は正常な空の一覧とする。
2. JSON がオブジェクト、`version` が 1、`items` が配列であることを確認する。
3. 各記録について次を確認する。
   - UUID の形式、`generatedAt` が有効な日時に変換できる非負の安全な整数であること。
   - `sequence` が 1 以上の安全な整数、`attempt` が 0〜7 の整数であること。
   - `hash` が小文字の 16 進数 64 桁、`hex` が大文字の `#RRGGBB` であること。
   - HSL が整数で採用範囲内にあり、ハッシュの先頭 12 バイトから求める HSL と一致すること。
   - HSL を変換した HEX が保存されている HEX と一致すること。
4. 正常な記録を元の順序で残す。
   履歴は ID、お気に入りは HEX の重複を先頭優先で除き、上限 20 件を適用する。
5. 一部の記録の除外、重複・上限の調整があれば通知する。
   読み込みだけで保存内容を書き換えず、次の明示的な保存操作時に正常化した内容を使用する。

非空の `items` の全件が不正な場合、JSON 全体を解析できない場合、envelope が不正な場合、未対応の `version` の場合は、該当領域を破損保護状態にする。
正常な空配列は破損と扱わない。

保存データの検証は事故や不整合への対処であり、改ざん防止や署名検証ではない。
未知の追加プロパティは保存へ持ち越さず、検証済みの項目から独立した記録を作る。

### 5.2. 履歴

| 状態                         | 表示と保存の方針                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 正常                         | 最新の保存内容へ生成記録を追加し、書き込み成功後の一覧を共有する                                                                          |
| 読み取り・書き込みの利用不可 | 最後に利用できた一覧と新しい記録をタブ内で最大 20 件保持する。保存不可を通知し、再読み込みまで書き込みと外部タブとの同期を止める          |
| 破損保護                     | 読み込めない生データを上書きせず、新しい履歴はタブ内で最大 20 件保持する。通常の全件削除を無効にし、確認付きの `Reset history` を表示する |

- 生成そのものが成功していれば、履歴保存に失敗しても色を表示する。
- 保存時に異常へ移行した場合も、その時点で保持していた正常な一覧をタブ内に残す。
- 正常時の全件削除は対象キーへの `removeItem` に成功してから一覧を空にする。
  失敗時は一覧を維持して保存不可を通知する。
- 保存不可モードで既にタブ内の履歴だけを扱っている場合は、確認文で範囲を明示してタブ内の履歴を削除できる。
  保存済みデータまで消したと案内しない。
- 保存不可モードの復旧は再読み込みとする。
  破損保護モードは確認付きリセットまたは再読み込みで再評価する。

### 5.3. お気に入り

- 読み込めた正常な一覧を保持し、登録・解除では最新の保存内容を再確認する。
- 書き込む次の配列を作り、`setItem` が成功してから画面の一覧を更新する。
- 失敗時は対象操作の前の状態を維持し、エラーを通知する。
  他タブから正常に反映済みの変更を巻き戻すことはしない。
- 保存領域が利用できない状態、破損保護状態では追加・解除を無効にし、既に読み込めた色の再表示だけを可能にする。
- 利用不可ではブラウザ設定の確認・再読み込みを案内する。
  破損保護では `Reset favorites` を表示する。
- 上限到達や重複は保存エラーと区別する。
  上限で登録できなくても、登録済みの色の解除は可能とする。

### 5.4. 破損・未対応データのリセット

- 通常操作とは別に、異常がある対象領域にだけリセットを表示する。
- ユーザーの確認後に該当キーだけを `removeItem` で削除する。
  `localStorage.clear()` は使用しない。
- 成功時は対象一覧を空にし、正常保存モードへ戻す。
  現在の表示色ともう一方の一覧は保持する。
- 履歴リセットではタブ内に保持していた履歴も空にする。
  自動で再生成・再登録しない。
- 確認時の raw と現在値が一致し、現在も保護対象である場合だけ削除する。
  確認中に正常化・削除・別の破損値への変更があれば削除を止め、再読み込みを案内する。
- 削除に失敗した場合は状態を変更せず、エラーを表示する。
- 未対応バージョンの自動移行や、壊れた内容を推測して修復する処理は導入しない。

### 5.5. タブ間の反映

- ブラウザの `storage` イベントを監視し、アプリ専用の 2 キーに関する更新だけを扱う。
- `key` が `null` のイベントでは、自分の 2 キーだけを読み直す。
  他のキーの内容は列挙しない。
- 正常保存モードの一覧を読み直し、同じ検証を適用して画面へ反映する。
  現在の表示色、詳細・一覧の開閉状態、生成連番は変えない。
- `storage` イベントは変更元のタブには届かないため、操作したタブの状態は書き込み成功時に更新する。
- 異常なデータを受け取った場合は、その領域を保護して通知する。
  既に保存不可・破損保護になった領域は自動復帰させず、リセットまたは再読み込みで再評価する。
- 読み直しと書き込みの間の完全な同時更新は防げない。
  後の書き込みが残る方式とし、ロック、マージ用ログ、分散同期は追加しない。

### 5.6. 保存 adapter の型と結果

`StoragePort` は getItem / setItem / removeItem に限定し、列挙と全消去を含めない。
`StorageProvider` は必要な時点で保存領域を取得する関数であり、localStorage のプロパティ取得時の例外も adapter 内で扱う。

```ts
type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type StorageProvider = () => StoragePort;

type CollectionAdjustments = { invalid: number; duplicate: number; overflow: number };
type ValidatedCollection =
  | { status: 'ready'; items: ColorRecord[]; adjustments: CollectionAdjustments }
  | { status: 'protected'; raw: string };
type CollectionRead = ValidatedCollection | { status: 'unavailable' };

type CollectionMutation =
  | {
      status: 'saved' | 'duplicate' | 'full' | 'not-found';
      items: ColorRecord[];
      adjustments: CollectionAdjustments;
    }
  | { status: 'protected'; raw: string }
  | { status: 'unavailable'; historyFallback?: ColorRecord[] };
type CollectionReset = { status: 'saved' | 'changed' | 'unavailable' };
```

| 関数                                           | 責務・結果の扱い                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `validateCollection(raw, kind)`                | JSON の解析と検証を行い、正常な一覧・調整数または保護対象 raw を返す               |
| `readCollection(kind, provide?)`               | 対象領域を独立して取得・検証する。取得・読み取り例外は `unavailable` とする        |
| `mutateCollection(operation, provide?)`        | 最新の保存内容へ追加・解除・履歴削除を適用し、永続化の結果を返す                   |
| `resetCollection(kind, expectedRaw, provide?)` | 確認した raw と最新値を照合し、保護対象を削除する。変化していれば `changed` とする |

`saved` だけが書き込み・削除の成功を意味する。
重複・上限・対象消失は保存例外と区別する。
履歴保存に失敗した場合の `historyFallback` は、読めた最新一覧に新しい記録を追加したタブ内利用用の値である。
未保存のお気に入りの更新案は公開せず、保存成功前に UI を変更しない。
保護対象の raw は Reset の一致確認にだけ使い、UI へ表示しない。

## 6. 起動と画面状態の制御

- 起動時は履歴とお気に入りを独立して読み込み、その後に初回の生成要求を開始する。
  片方の異常で全体の起動を中止しない。
- 起動用の Promise を hook 内の ref に保持し、Strict Mode の effect 再実行でも同じ初回タスクを利用する。
  effect の cleanup 後に古い購読先へ反映せず、有効な購読先で一度だけ結果と履歴保存を確定する。
- render、state 初期化関数、state 更新関数の内部で、生成・保存などの副作用を実行しない。
- 処理中フラグと同期的な再入防止を設け、連打でも生成要求を二重に受け付けない。
- 生成要求ごとに比較対象の HEX を確定し、処理中の一覧選択・保存変更を止める。
- 生成成功時は現在の記録を更新して履歴保存を行う。
  保存失敗は生成失敗とは別の通知にする。
- 非同期処理の終了前にアンマウントされた場合は、古い画面への状態反映を行わない。
- 確認ダイアログの対象は操作種別と HEX など必要な値で保持する。
  保存時には最新の一覧を確認し直す。

画面状態は `useColorGenerator` が管理し、`App` が `GeneratorScreen` へ props として渡す。
表示用の state と、最新値や同期的な処理の管理に使う ref を分ける。

| 値                                 | 役割                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------- |
| `model` / `latest`                 | 描画用 state と、非同期 callback から参照する最新モデル                 |
| `startup` / `initialCommitted`     | 初期読み込み・生成の Promise を共有し、有効な購読先から一度だけ確定する |
| `busy` / `generationId`            | 同期的な生成の再入防止と、生成結果の識別                                |
| `mounted` と effect 内の購読フラグ | unmount 後や古い effect の購読先への反映を止める                        |
| `noticeId`                         | 操作通知を識別し、新しい操作の後に古い非同期結果を表示しない            |

モデルは現在の記録、履歴とお気に入りの領域状態、生成中、操作通知、確認対象を持つ。
各領域は `ready` / `unavailable` / `protected` と一覧を持ち、調整案内と保護対象 raw を必要に応じて保持する。
`publish` は有効な購読中だけ最新モデルと描画を更新し、state 更新関数内で保存を行わない。
unmount 時はイベント購読を解除し、完了後の保存・描画を止める。
Web Crypto の計算そのものを中断したとは扱わない。

確認対象は `pending` に操作種別・対象 HEX・タブ内削除の区別・確認時の raw を保持する。
`confirmationFor` が表示用の情報へ変換し、`onConfirm` が対象を同期的に消費してから保存処理を呼ぶ。
同じ callback の二重呼び出しでも、同じ削除を繰り返さない。
UI の操作可否は `getUiState` から求める。
hook の各操作でも最新の生成中・確認中・保存状態を再確認し、無効な要求を受け付けない。

## 7. コピーと日時表示

- コピーはユーザー操作を起点に `navigator.clipboard.writeText()` を使用する。
- コピーに失敗した場合は例外を扱い、画面のコードを選択してコピーする方法を案内する。
  非推奨の `execCommand` による代替処理は追加しない。
- コピーごとに通知の識別値を更新する。
  新しい生成・選択・コピー・保存操作、表示記録の切り替え、unmount の後には古いコピー完了の通知を反映しない。
- 日時は `generatedAt` から求める。
  ミリ秒を 3 桁、UTC オフセットを `±HH:MM` で表示する。
- オフセットは表示対象の日時に対応する値を使う。
  表示文字列のロケール差でテストが不安定にならないようにする。

## 8. テストと Storybook の設計

### 8.1. 単体テスト

- Vitest の Node.js 環境で、生成・変換、記録配列の操作、保存データの検証、保存アダプターを確認する。
- 日時、ダイジェスト、UUID、保存領域を必要に応じて固定値や小さなテスト用オブジェクトへ置き換える。
- 既知値、範囲の端、8 回の再試行、API 失敗、上限、重複、破損、保存例外を確認する。
- 候補の衝突はダイジェスト関数を置き換えて再現し、「大量に生成すれば偶然衝突しないはず」という確率依存のテストにしない。
- カバレッジは `src/lib` の生成・記録・保存ロジック全体を対象にし、未 import の対象ファイルも含める。
  テスト、Story、UI の組み立ては集計対象から除く。
- V8 の text / HTML レポートを作成するが、任意の割合による合否基準は設けない。
  重要な分岐の確認内容を優先する。

生成・保存の単体テストに加えて、`ui-state.test.ts` で UI の操作可否を検証する。
この単体テストも検査対象だが、coverage の集計対象は `src/lib` に限定する。
hook と実際の DOM・ブラウザの統合は E2E で検証する。

### 8.2. E2E とアクセシビリティ

- 開発サーバーではなく、本番用ビルドを `vite preview` で配信してテストする。
- 配信先は `127.0.0.1:4173`、`strictPort` を有効にし、既存の不明なサーバーを再利用しない。
- Playwright の `baseURL` は `http://127.0.0.1:4173/random-cool-color-generator/` とする。
  相対遷移でこのサブパスを維持する。
- Chromium のデスクトップ幅とモバイル幅を projects で分ける。
  モバイル幅の実行を実機検証と同一視しない。
- 日時や記録をテスト専用の固定値で制御し、各テストのブラウザコンテキストと保存領域を分離する。
  タブ間確認は同じコンテキスト内の 2 ページで行う。
- 保存例外・破損はテスト用に注入する。
  利用者のブラウザプロファイルや実際の保存データは使用しない。
- role / accessible name に基づく locator と状態の待機を使用し、固定時間の sleep に依存しない。
- `@axe-core/playwright` は初期画面、詳細とデータのある一覧を開いた状態などで実行する。
  キーボード操作・表示崩れ・操作感は別途手動で確認する。
- 本番用ビルドのコードとブラウザの通信を確認し、外部 API・CDN・解析の導入がなく、生成・保存操作による記録の送信や URL への付加がないことを確認する。
  配信物の取得に必要な通信と区別する。
- CI 失敗時の HTML レポートと trace を保存する。
  記録内容はテスト専用データに限定する。

本番 runner の `playwright.config.ts` は `e2e/specs` を対象とし、1280×900 と 390×844 の viewport を用意する。
追加の狭幅検査は viewport を変更して行う。
共通 fixture は専用の固定データと API の成功・失敗・保留を用意し、許可した localhost 以外の request を遮断して試み自体を失敗として扱う。
実 Clipboard API の検証は、その独立 context で書いた固定値だけを読み戻す。

`playwright.lifecycle.config.ts` は開発用の `e2e/harness` と `e2e/lifecycle` を対象とする。
baseURL は `http://127.0.0.1:5173/random-cool-color-generator/` とし、Strict Mode の effect 再実行、callback の二重呼び出し、unmount 後の反映を検証する。
本番 runner と補助 runner は分離し、どちらも reuseExistingServer を false にする。
harness と制御用コードはアプリのエントリーポイントから import せず、本番 dist に含めない。

静的メタ情報の検証では、HTTP 応答 HTML を切り離した文書として解析し、合意した値・重複・欠落・base の置換を検証する。
request fixture の通信はブラウザの route 監視とは別なので、接続前に localhost の URL を照合し、redirect を追わない。
画像は同じローカル配信先から取得し、形式・実寸・背景の透過を検証する。
canonical の正式 URL は読み込みアセットと区別し、それ以外の外部参照・生成記録の送信・URL への付加を禁止する。
axe の violations と incomplete は分けて保存し、自動検査と表示・操作による確認を別の検証として扱う。

### 8.3. Storybook

- TypeScript の CSF3 で Story を作成し、Docs / Controls / Actions の基本を使用する。
- 実際の保存 hook は呼び出さず、固定 props とモックのコールバックで状態を再現する。
- Storybook 起動・初期化・ビルドの前から `STORYBOOK_DISABLE_TELEMETRY=true` を設定する。
  設定ファイルの `core.disableTelemetry: true` も併用する。
- `scripts/storybook.mjs` が子プロセスの起動前に環境変数を設定し、導入済み CLI を呼び出す。
  `storybook` / `build-storybook` はこの wrapper を通す。
  CI でも設定評価前から同じ環境変数を渡す。

- 初期化時の起動イベントは設定ファイルだけでは抑止できないため、環境変数を先に用意する。
- crash report を有効にしない。
  AI / MCP 連携、外部公開サービス、不要なサンプルや追加の統合機能を導入しない。

- crash report を有効にする環境指定は子プロセスへ渡さず、設定の `core.enableCrashReports` も false にする。
- Storybook の静的 build の base は `./` とし、アプリ用の Pages base を変更しない。
- Docs の自動生成と明示したモックの Actions を使い、play 関数による操作テストは追加しない。

## 9. npm scripts の構成

現在のコマンド構成を次に示す。
リポジトリのルートで `npm run <script>` を使用し、PowerShell では `npm.cmd run <script>` として実行ファイルを明示できる。

| script                   | 内容                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| `dev`                    | Vite 開発サーバー。127.0.0.1:5173、strictPort                                     |
| `build`                  | `vite build`。アプリの本番用 dist を生成する                                      |
| `preview`                | Vite preview。127.0.0.1:4173、strictPort                                          |
| `format`                 | Prettier による全体の整形。限定した変更では既存 CLI に対象を明示する              |
| `format:check`           | Prettier による対象ファイルの確認                                                 |
| `lint`                   | `eslint . --max-warnings 0`                                                       |
| `typecheck`              | `tsc -b`。アプリ・設定・単体テスト・Story・E2E の型検査                           |
| `test`                   | `vitest run`                                                                      |
| `test:watch`             | `vitest` の watch 実行                                                            |
| `test:coverage`          | `vitest run --coverage`                                                           |
| `e2e:install`            | wrapper 経由で Chromium を取得する                                                |
| `test:e2e:production`    | wrapper 経由で本番用の playwright.config.ts を実行する                            |
| `test:browser-lifecycle` | wrapper 経由で補助用の playwright.lifecycle.config.ts を実行する                  |
| `test:e2e`               | 本番 E2E → ライフサイクル補助検証                                                 |
| `test:e2e:ui`            | 本番用設定で Playwright の UI mode を開く                                         |
| `storybook`              | wrapper 経由の開発サーバー。127.0.0.1:6006、exact-port、自動 open・版確認を無効化 |
| `build-storybook`        | wrapper 経由の Storybook 静的 build                                               |
| `check`                  | format check → lint → type check → 単体テストと coverage                          |
| `verify`                 | check → アプリ build → Storybook build → 本番 E2E → ライフサイクル補助検証        |

- `test:e2e` / `test:e2e:ui` はビルド済みの `dist` を前提にする。
  単独実行時は先に `build` を実行する。
  `verify` は必要なビルドを順に行う。
- Playwright は `scripts/playwright.mjs` 経由で導入済み CLI を使用し、npx の暗黙の取得を行わない。
  `PLAYWRIGHT_BROWSERS_PATH=0` で取得先と実行先を合わせ、TEMP / TMP / TMPDIR は `node_modules/.cache/playwright-tmp` に向ける。
- Chromium の取得コマンドは初回導入用とし、通常の検証で毎回取得しない。
- ローカルの npm の cache・ログは、プロセス環境の `NPM_CONFIG_CACHE` でリポジトリ内の `.npm-cache` へ向ける。
- `.prettierignore` で生成物、`docs/before-development/`、`AGENTS.md` を除外し、整形による計画記録や作業ルールの意図しない変更を防ぐ。
- 生成物の `dist/`、`coverage/`、`storybook-static/`、`playwright-report/`、`test-results/` は Git 管理対象から除外する。

## 10. CI と公開構成

- GitHub Actions は `main` 向けの Pull Request と `main` への push で品質チェックを実行する。
  通常の品質ジョブ名は `verify` とし、定義は [.github/workflows/ci.yml](../../.github/workflows/ci.yml) に置く。
- required check にしたジョブが文書変更だけで実行されない状態を避けるため、今回のワークフローにファイルパスによる実行除外は設けない。
- Node.js 24 系、`npm ci`、必要な Chromium の導入、`npm run verify` を使用する。
  CI の Storybook telemetry も無効にする。
- 失敗時にテストレポートを artifact として残し、成功したアプリの `dist` を Pages 用 artifact として扱う。

- GitHub Pages の source は GitHub Actions とし、`main` の品質チェック成功後に、そこで検査したものと同一の `dist` をデプロイする。
  デプロイ前に別のビルドを作らない。
- デプロイは `main` への push だけを対象とする。
  PR からは公開しない。
- GitHub の通常ジョブは必要最小限の読み取り権限とし、公開ジョブにだけ `pages: write` / `id-token: write` と `github-pages` environment を設定する。
- Vite の `base` は `/random-cool-color-generator/` とする。
- 公開先は `https://seiya-matsuoka.github.io/random-cool-color-generator/` とする。
- 公開可否を切り替える独自変数や公開用の別 build は設けない。
  `main` 更新は品質確認の成功後に再公開へつながる。
- Dependabot は導入しない。
  依存更新は必要時に公式の変更内容を確認し、lock ファイルと検証結果を含めて手動で扱う。

### 10.1. 品質確認と配信物

verify は ubuntu-24.04 上で .node-version を参照し、npm ci、Chromium と runner 用 OS 依存の導入、npm run verify を順に実行する。
失敗時はテスト用データだけを含むレポート・trace を `browser-failure-reports` として保存し、保持期間は 7 日とする。
品質確認に成功した main push だけが dist を `github-pages` artifact に保存する。
保持期間は 1 日、hidden files は除外する。
Storybook、coverage、テストレポート、harness、利用者データは公開対象に含めない。

deploy は verify に依存し、github-pages environment に限定する。
公開だけを concurrency で直列化し、進行中の公開を中断しない。
開始時に main の最新コミットと実行対象を照合し、一致しなければ公開 step をスキップする。
取得失敗や不正な応答では公開を止め、古い内容の公開による巻き戻しを防ぐ。
configure-pages は Pages の自動有効化を行わず、deploy-pages は同じ実行の artifact を使用する。
公開 job 内で checkout・依存導入・再 build を行わない。

### 10.2. 静的 HTML のメタ情報と素材の参照

共有サービスの JavaScript 実行を前提にせず、情報を静的 HTML の head に置く。
`lang="en"`、文字コード、viewport に加え、次を指定する。

| 項目                                               | 値・参照方法                                                                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| title / og:title / twitter:title / og:site_name    | Random Cool Color Generator                                                                              |
| description / og:description / twitter:description | Generate cool colors, copy HEX, RGB, and HSL codes, and keep your history and favorites in this browser. |
| canonical / og:url                                 | 末尾の / を含む正式公開 URL                                                                              |
| og:type / og:locale                                | website / en_US                                                                                          |
| og:image / twitter:image                           | 正式公開 URL に og-image.png を付けた絶対 URL                                                            |
| og:image:type / width / height                     | image/png / 1200 / 630                                                                                   |
| og:image:alt / twitter:image:alt                   | Random Cool Color Generator with cyan, blue, and violet color swatches.                                  |
| twitter:card                                       | summary_large_image                                                                                      |
| theme-color                                        | #F8FAFC                                                                                                  |
| PNG ファビコン                                     | `%BASE_URL%favicon-32x32.png`、image/png、32x32                                                          |
| SVG ファビコン                                     | `%BASE_URL%favicon.svg`、image/svg+xml、any                                                              |

ファビコンは PNG、SVG の順で指定する。
Vite が BASE_URL を `/random-cool-color-generator/` へ置換し、public は URL に含めない。
正式 URL と共有画像の絶対 URL に、ローカルの URL・生成記録・利用者情報を含めない。
OGP の画像寸法・背景・図案は画面設計に定義する。

### 10.3. 素材の元データと再生成

ファビコンの元データは `public/favicon.svg`、OGP の元データは `assets/site/og-image.svg` とする。
`scripts/generate-site-assets.mjs` は既存 Playwright と取得済み Chromium で SVG を描画し、`public/favicon-32x32.png` と `public/og-image.png` を生成する。
再生成する場合は、リポジトリのルートで次を実行する。

```powershell
node scripts/generate-site-assets.mjs
```

専用一時領域と非永続 context を使い、offline と request の遮断を併用する。
XML の妥当性を検査し、すべての描画が完了してから PNG を書き込む。
外部素材、画像生成サービス、オンライン変換、外部フォントの取得は使用しない。
OGP はローカルの Arial / Helvetica / sans-serif で描画するため、環境による字体差があり得る。
通常の build・CI は管理対象の PNG をそのままコピーし、再生成を行わない。

### 10.4. ライセンスと配布用表示

自作コード・文書・SVG / PNG にはルートの [MIT License](../../LICENSE) を適用する。
第三者コードの著作権と利用条件は元の表示を保持する。
[public/THIRD_PARTY_NOTICES.txt](../../public/THIRD_PARTY_NOTICES.txt) に、自作部分の MIT 本文と、配信する React / React DOM / Scheduler、Tailwind CSS、Vite・Rolldown の補助コードに対応する表示を区別して収める。
原文は導入済みパッケージの LICENSE と第三者表示から保持する。

ルート LICENSE と node_modules の内容は dist へ自動コピーされない。
配布用表示は public コピーで `dist/THIRD_PARTY_NOTICES.txt` に含め、正式公開 URL の同名ファイルとして配信する。
依存や配信コードを変更するときは対象と表示の対応を見直す。
追加のライセンス生成依存、公開用の別 build、アプリ内の表示処理は設けない。

## 11. プライバシーと技術上の境界

- 生成記録をネットワーク送信、URL パラメーター、外部解析、外部エラー収集へ載せない。
- 実行時のフォント、JavaScript、CSS はアプリの配信物を使用し、外部 CDN を参照しない。
- 保存する UUID は生成記録の識別に限定し、端末を継続的に識別する ID は作らない。
- `localStorage` は同一オリジン単位で共有される。
  GitHub Pages の同じドメインの別パスも同じ保存領域を利用するため、キーの接頭辞は衝突・誤削除の防止であり、アクセス制御ではない。
- ブラウザ保存を暗号化された機密情報保管場所として説明しない。
  ブラウザの削除や他の同一オリジンのコードによる変更は本アプリで防げない。
- 静的ファイル取得、開発時のパッケージ取得、CI の実行には通信がある。
  アプリが生成記録を外部送信しないことと区別する。

## 12. 主な公式資料

- [Vite: Getting Started](https://vite.dev/guide/)
- [Vite: Deploying a Static Site](https://vite.dev/guide/static-deploy.html)
- [Tailwind CSS: Using Vite](https://tailwindcss.com/docs/installation/using-vite)
- [MDN: localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [MDN: storage event](https://developer.mozilla.org/en-US/docs/Web/API/Window/storage_event)
- [MDN: Same-origin policy](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Same-origin_policy)
- [Vitest: Coverage](https://vitest.dev/guide/coverage.html)
- [Playwright: Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright: Web server](https://playwright.dev/docs/test-webserver)
- [Playwright: Accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [Storybook: React with Vite](https://storybook.js.org/docs/get-started/frameworks/react-vite)
- [Storybook: Telemetry](https://storybook.js.org/docs/configure/telemetry)

パッケージの導入時は、ここに記載した方針に合う現行の公式手順と互換性を確認する。
