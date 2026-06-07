# 認証・認可・セキュリティ

## 認証（Authentication）

- **方式**: NextAuth.js 4 + Google OAuth。設定は `lib/auth.ts`、ハンドラは `app/api/auth/[...nextauth]/route.ts`。
- **セッション**: PrismaAdapter による **DB セッション**（`Session` テーブル）。
- **セッション拡張**: `session()` コールバックで `session.user.id = user.id` を注入。
  型は `types/next-auth.d.ts` で `Session.user.id: string` を宣言。
  全 API はこの `session.user.id` の有無でログイン判定する。
- **サインイン画面**: `pages.signIn = '/auth/signin'`（カスタム画面、`app/auth/signin/page.tsx`）。

## 認可（Authorization）— メールホワイトリスト

`lib/auth.ts` の `signIn` コールバックでログイン可否を制御する。

```
WHITELIST_ENABLED (env, 既定 true)
  false → 誰でもログイン可
  true  → ALLOWED_EMAILS に含まれるメールのみ許可
ALLOWED_EMAILS (env, カンマ区切り)
  未設定 かつ WHITELIST_ENABLED=true → 全員拒否（fail-closed）
```

- **fail-closed 設計**: 設定忘れによる「全世界公開」を防ぐため、ホワイトリスト有効＋メール未設定なら全拒否し、起動時に警告ログを出す。
- メール照合は小文字化して比較。

## API レート制限

- ユーザー単位で **1日 N 回**（`User.apiCallLimit`、既定 50）。判定は **UTC 日付**基準。
- 実装は `app/api/chat/route.ts` の `checkAndIncrementRateLimit()`:
  - UTC 日付が `apiCallResetAt` と異なれば、カウントを 1 にリセットして許可。
  - 同日なら「`apiCallCount < apiCallLimit` のときだけ +1」という**条件付き原子的更新**（`updateMany`）。
    並行リクエストでの上限超過を防ぐ。
  - 上限到達時は **429**。
- **返金**: Gemini 呼び出しが失敗したら `refundRateLimit()` でカウントを -1（0 未満にしない）。失敗は握りつぶす。
- 検証順序: 認証 → CSRF → 入力検証 → レート制限。**API 呼び出し前**に検証を済ませ、無駄なレート消費を防ぐ。

## CSRF 対策（same-origin）

- `lib/security.ts` の `checkSameOrigin()` を**全書き込み系**（`/api/chat` POST、`/api/mdfiles` POST/DELETE、`/api/mdfiles/[id]` PUT）の冒頭で呼ぶ。
- `Origin` ヘッダ末尾が `//<Host>` と一致しなければ **403**。`Origin` 無しのリクエストは通す（認証で別途保護）。

## 入力検証

`/api/chat` の `validateBody()`:

| 項目 | 制約 |
|------|------|
| `messages` | 配列、1〜50件 |
| `messages[].role` | `'user'` または `'assistant'` |
| `messages[].content` | 文字列、≤ 4000文字 |
| `phase` | `phase1` / `phase2` / `done` のいずれか |
| `questionIndex` | 整数 0〜9 |
| `doc` | オブジェクト。10キー全て string・各 ≤ 2000文字 |

`/api/mdfiles` POST / `/api/mdfiles/[id]` PUT: `content` は文字列必須・≤ 100,000文字。
`messages` を保存する場合は会話の保存サイズ上限（JSON 化したサイズの上限）を超えないこと。POST は保存件数 ≤ 100、PUT は所有者（`userId`）一致を確認する。

## プロンプトインジェクション対策

- `lib/prompts.ts` の `sanitizeForPrompt()` が、`doc` 由来のユーザー入力をシステムプロンプトへ埋め込む前にサニタイズ:
  - 最大長で切り詰め（フェーズ1: 150、フェーズ2: 500文字）
  - Markdown 見出し記号 `#〜######`、山括弧 `<` `>`、`[INST]`/`[/INST]`/`<s>`/`</s>` を除去。
- Gemini は `responseMimeType: 'application/json'` で JSON 出力を強制。さらに `extractJson()` が
  生テキスト → コードブロック内 → `{...}` 抽出 の順にフォールバックして堅牢にパースする。

## 出力側のサニタイズ（XSS）

- AI 応答・要件書は `react-markdown` + `remark-gfm` で描画。`ChatPane` / `DocumentPane` の `safeUrl()` が
  `http/https/mailto` と相対・アンカー以外の URL（`javascript:` 等）を遮断する。

## 機密情報の取り扱い

- UI に「個人情報・機密情報を入力しない」旨の常時バナーを表示（入力は Gemini に送信されるため）。
- サインイン画面に「Google のメールと名前のみ使用」と明記。
- サーバの例外詳細はログのみに出し、クライアントには汎用メッセージ（503 等）を返す。

## 環境変数

セキュリティに関わる挙動（ホワイトリストの fail-closed、レート制限の上限など）は本ドキュメントが仕様の出典です。
**環境変数名とその設定値の一覧**は、リポジトリルートの [README.md](../README.md) が唯一のソースです（`.env` はコミットしない）。
