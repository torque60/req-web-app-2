# モジュール仕様（Bricks & Studs）

各モジュールを **brick（単一責務の自己完結ユニット）**、その公開インターフェースを **stud（他が依存する接続点）** として記述する。
brick の内部実装を変更しても stud（シグネチャ・型）を保てば、他モジュールに影響しない。

---

## lib/ — ドメインロジック

### lib/types.ts
**責務**: アプリ全体で共有する型定義の単一ソース。

**Stud（公開型）**:
- `Phase` = `'phase1' | 'phase2' | 'done'`
- `Message` = `{ role: 'user' | 'assistant'; content: string }`
- `RequirementsDoc` — 要件書の10セクション（problem〜techStack、すべて string）
- `ApiResponse` — `/api/chat` のレスポンス形
- `ChatRequest` — `/api/chat` のリクエスト形
- `SessionSnapshot` — 再開に必要な状態 `{ docState: RequirementsDoc; messages: Message[]; phase: Phase; questionIndex: number }`
- `MdFileDetail` — `GET /api/mdfiles/[id]` のレスポンス形（`id`/`filename`/`content`/`createdAt` ＋ スナップショット各値、スナップショットは null 可）

`RequirementsDoc` のキー集合は **prompts.ts / markdown.ts / chat の検証 / page.tsx の初期値**が共有する。キー追加時はこれら全てを更新する。

### lib/prompts.ts
**責務**: Gemini に渡すシステムプロンプトの生成。フェーズ1の9ステップ定義を保持。

**Stud**:
- `TOTAL_QUESTIONS: number` = 9
- `buildPhase1Prompt(questionIndex: number, doc: RequirementsDoc): string`
- `buildPhase2Prompt(doc: RequirementsDoc): string`

**内部**:
- `STEPS` — 9ステップの定義（各: key/label/context/question/goodExample/badExample/validation）。
  5 Whys・ステークホルダーマップ・SMART・MoSCoW・FURPS+ 等のフレームワークを内包。
- `sanitizeForPrompt(value, maxLength)` — doc 由来の値をプロンプト埋め込み前にサニタイズ
  （見出し記号・`<>`・`[INST]`等のインジェクションパターン除去）。詳細は [auth-and-security.md](./auth-and-security.md)。
- 出力は「JSON のみを返す」よう指示するプロンプト（`responseMimeType: application/json` と併用）。

### lib/markdown.ts
**責務**: `RequirementsDoc` を1枚の Markdown 文書に整形。

**Stud**:
- `buildMarkdown(doc: RequirementsDoc): string` — 見出し付き Markdown を生成。未入力欄は `_（未入力）_`。
- `SECTIONS: { key; label }[]` — 表示順を定義する10セクションのリスト（進捗率計算にも使用）。

> `prompts.ts` の `STEPS` と `markdown.ts` の `SECTIONS` はともに「セクションの順序とラベル」を持つ。
> 役割が異なる（プロンプト生成 vs 表示整形）ため別定義だが、**キー集合は一致させる**こと。

### lib/prisma.ts
**責務**: `PrismaClient` のシングルトン提供（開発時のホットリロードでの多重生成を防止）。

**Stud**: `prisma: PrismaClient`

### lib/auth.ts
**責務**: NextAuth 設定（Google OAuth + ホワイトリスト認可 + セッション拡張）。

**Stud**: `authOptions: NextAuthOptions`

詳細は [auth-and-security.md](./auth-and-security.md)。

### lib/security.ts
**責務**: CSRF 対策の same-origin 判定。

**Stud**: `checkSameOrigin(req: NextRequest): boolean`
- `Origin` ヘッダと `Host` を照合。`Origin` 無しは `true`（認証で別途保護）。
- 書き込み系ハンドラ（POST/DELETE）の冒頭で呼ぶ。

---

## components/ — プレゼンテーション（Client Components）

いずれも表示と入力受付に専念し、ビジネスロジックを持たない。

### components/ChatPane.tsx
**責務**: 対話 UI（メッセージ一覧、フェーズ表示、入力欄、ローディング表示）。

**Stud（props）**: `{ messages, phase, questionIndex, isLoading, onSend(content) }`
- assistant メッセージは `react-markdown`（GFM）で描画。`safeUrl()` で危険な URL を遮断。
- `phase === 'done'` で入力欄を無効化。

### components/DocumentPane.tsx
**責務**: 要件書のライブプレビューと `.md` ダウンロード。

**Stud（props）**: `{ doc, phase }`
- `buildMarkdown(doc)` を描画。進捗バー（`SECTIONS` 充足率）を表示。
- ダウンロードは Blob 生成 → `project_plan_YYYY-MM-DD.md`。

### components/HistoryPane.tsx
**責務**: 保存済みセッションの一覧・**再開（開く）**・本文DL・削除。一覧取得とDL/削除は自分で API を呼ぶ。

**Stud（props）**: `{ onClose(); onOpen(id) }`
- `GET /api/mdfiles` で一覧取得、`GET /api/mdfiles/[id]` でDL、`DELETE /api/mdfiles` で削除。
- 「開く」ボタンは `onOpen(id)` を呼ぶだけで、復元処理自体は `page.tsx`（`restoreSession`）が行う。

---

## app/ — ルーティングとオーケストレーション

### app/page.tsx（中央オーケストレーター）
**責務**: 会話・要件書(doc)・フェーズ・質問インデックスの状態を一元管理し、`/api/chat` 呼び出しを調停。
要件書・会話の **debounce 自動保存** と、履歴からの **セッション復元** も担う。
未ログイン時はログイン画面、`status==='loading'` 時はローダーを表示。

主な状態: `messages` / `phase` / `questionIndex` / `doc` / `isLoading` / `currentFileId`（編集中セッションの `MdFile.id`、未保存なら null） / `saveStatus`（保存中・保存済み表示） / UI 状態（mobileTab, showHistory）。
主な関数:
- `callApi()`（`/api/chat` 呼び出しと状態反映）、`handleSend()`、フェーズ2自動トリガーの `useEffect`
- 自動保存の `useEffect`: `doc`/`messages`/`phase`/`questionIndex` の変化を debounce（約2.5秒）で監視し、`currentFileId` が無ければ `POST`、有れば `PUT /api/mdfiles/[id]` で保存
- `restoreSession(id)`: `GET /api/mdfiles/[id]` を取得し、進行中の会話があれば破棄確認の上、全状態と `currentFileId` を復元
- `handleSaveToDb()`: 手動の即時保存（自動保存と同じ保存ロジックを使う）

### app/layout.tsx / app/providers.tsx
- `layout.tsx`: ルートレイアウト、フォント、`<Providers>` でラップ。
- `providers.tsx`: `SessionProvider`（NextAuth クライアント）。

### app/auth/signin/page.tsx
カスタムサインイン画面（`authOptions.pages.signIn` で指定）。`callbackUrl` を尊重して `signIn('google')`。

### types/next-auth.d.ts
NextAuth の `Session.user` に `id: string` を追加する型拡張。`session()` コールバックが `user.id` を注入することと対応。
