# API 契約

すべての API は Next.js App Router の Route Handler（`app/api/**/route.ts`）。
**全エンドポイントがログイン必須**（NextAuth の DB セッション）。書き込み系は CSRF（same-origin）チェック付き。

共通エラー:

| ステータス | 条件 | ボディ |
|-----------|------|--------|
| 401 | 未ログイン（`session.user.id` 無し） | `{ "error": "Unauthorized" }` |
| 403 | 別オリジンからの書き込み（CSRF） | `{ "error": "Forbidden" }` |
| 400 | ボディが不正・検証失敗 | `{ "error": "Invalid request" }` |

---

## POST /api/chat

AI との対話1ターンを処理する中核エンドポイント。認証 → CSRF → 入力検証 → レート制限 → Gemini 呼び出しの順。

### リクエスト
```jsonc
{
  "messages": [ { "role": "user" | "assistant", "content": "..." } ],  // 1〜50件、各content ≤ 4000文字
  "phase": "phase1" | "phase2" | "done",
  "questionIndex": 0,        // 整数 0〜9
  "doc": {                   // 全キー必須・各値 ≤ 2000文字（string）
    "problem": "", "target": "", "goal": "", "requirements": "",
    "nonFunctional": "", "completionConditions": "", "constraints": "",
    "outOfScope": "", "risks": "", "techStack": ""
  }
}
```
検証は `validateBody()` が担い、1つでも条件を外れると 400（Gemini 呼び出し前に弾きレート消費を防ぐ）。

### レスポンス（200）
```jsonc
{
  "message": "ユーザーへの返答テキスト",
  "sectionKey": "problem" | ... | "techStack" | null,  // 更新対象セクション
  "sectionContent": "Markdown 文字列",                  // doc[sectionKey] に格納される
  "nextQuestion": 1,                                    // 次の questionIndex
  "phase": "phase1" | "phase2" | "done",
  "_rateLimit": { "remaining": 49, "limit": 50 }        // サーバが付与
}
```

AI の応答が JSON として解析できない場合も **200** を返し、`message` にエラー文・`sectionKey: null` を設定する（会話を止めない設計）。

### エラー

| ステータス | 条件 |
|-----------|------|
| 429 | 当日のレート上限到達。`{ "error": "API 呼び出し上限（1日 N 回）に達しました。…" }` |
| 503 | `GEMINI_API_KEY` 未設定、または予期せぬ例外（詳細はサーバログのみ） |

---

## GET /api/mdfiles

ログインユーザーの保存済み要件書を**一覧**で返す（本文は含まない）。`createdAt` 降順。

### レスポンス（200）
```jsonc
[ { "id": "...", "filename": "...", "createdAt": "ISO8601" } ]
```

---

## POST /api/mdfiles

セッションを**新規作成**する（初回保存）。要件書のスナップショットも一緒に保存する。

### リクエスト
```jsonc
{
  "filename": "string",            // 先頭200文字に切り詰めて保存
  "content": "string",             // Markdown 本文、≤ 100,000文字
  "docState": { /* RequirementsDoc */ },  // 任意・再開用の生データ
  "messages": [ { "role": "...", "content": "..." } ],  // 任意・会話履歴
  "phase": "phase1" | "phase2" | "done",   // 任意
  "questionIndex": 0               // 任意・整数 0〜9
}
```
`docState`/`messages`/`phase`/`questionIndex` は任意。省略すると要件書のみのレコードになる。

### レスポンス（200）
```jsonc
{ "id": "...", "filename": "...", "createdAt": "ISO8601" }
```
作成後、クライアントは返却された `id` を保持し、以降の保存は `PUT /api/mdfiles/[id]` で行う。

### エラー

| ステータス | 条件 |
|-----------|------|
| 400 | `filename`/`content` が文字列でない、content が 100,000 文字超、または `messages` が上限超 |
| 409 | 保存件数が上限（100件）に到達 |

---

## DELETE /api/mdfiles

自分の要件書を**削除**する。

### リクエスト
```jsonc
{ "id": "string" }
```

### レスポンス（200）
```jsonc
{ "success": true }
```

| ステータス | 条件 |
|-----------|------|
| 404 | 指定 id が存在しない、または他ユーザーの所有（`userId` で絞り込むため区別不可） |

---

## PUT /api/mdfiles/[id]

既存セッションのスナップショットを**上書き更新**する。自動保存・手動保存ともにこのエンドポイントを使う（初回作成後）。

### リクエスト
```jsonc
{
  "content": "string",             // Markdown 本文、≤ 100,000文字
  "docState": { /* RequirementsDoc */ },
  "messages": [ { "role": "...", "content": "..." } ],
  "phase": "phase1" | "phase2" | "done",
  "questionIndex": 0
}
```
`filename` は更新しない（作成時のまま固定）。

### レスポンス（200）
```jsonc
{ "id": "...", "updatedAt": "ISO8601" }
```

### エラー

| ステータス | 条件 |
|-----------|------|
| 400 | `content` が文字列でない、content が 100,000 文字超、または `messages` が上限超 |
| 404 | 指定 id が存在しない、または自分の所有でない（`userId` で絞り込むため区別不可） |

---

## GET /api/mdfiles/[id]

セッション全体を**取得**する（会話再開・ダウンロード用）。

### レスポンス（200）
```jsonc
{
  "id": "...", "filename": "...", "content": "Markdown全文", "createdAt": "ISO8601",
  "docState": { /* RequirementsDoc | null */ },
  "messages": [ { "role": "...", "content": "..." } ],  // null の場合あり
  "phase": "phase1" | "phase2" | "done" | null,
  "questionIndex": 0                                     // null の場合あり
}
```
スナップショット列が `null` の古いレコードを開いた場合、会話は復元されず content（要件書）のみ利用できる。

| ステータス | 条件 |
|-----------|------|
| 404 | 指定 id が存在しない、または自分の所有でない |

> 注: `params` は Next.js 16 仕様に従い `Promise<{ id: string }>`。`await params` で取り出す。

---

## /api/auth/[...nextauth]（GET / POST）

NextAuth.js のハンドラ。Google OAuth のサインイン・コールバック・サインアウト・セッション取得を担う。
設定は [auth-and-security.md](./auth-and-security.md) を参照。
