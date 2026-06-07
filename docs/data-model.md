# データモデル

定義元: `prisma/schema.prisma` / マイグレーション: `prisma/migrations/20260531133758_init/`
データベース: Supabase (PostgreSQL)。すべての ID は `cuid()`。

## ER 概要

```
User 1 ──< Account        (NextAuth: OAuth 連携情報)
     1 ──< Session        (NextAuth: ログインセッション)
     1 ──< MdFile         (保存済みセッション = 要件書 + 会話履歴)
VerificationToken         (NextAuth: 単独・メール認証用)
```

すべての子テーブルは `onDelete: Cascade`。User 削除時に Account / Session / MdFile も削除される。

## NextAuth 必須テーブル

NextAuth.js + PrismaAdapter が要求する標準スキーマ。アプリ独自ロジックからは直接操作しない。

### Account
OAuth プロバイダ（Google）の連携情報。`@@unique([provider, providerAccountId])`。

### Session
DB セッション戦略のセッション。`sessionToken` が一意。`expires` で失効管理。

### VerificationToken
メールリンク認証用（本アプリは Google OAuth のみのため実質未使用だが、スキーマとして保持）。

## カスタムテーブル

### User

ユーザーアカウント。NextAuth 標準フィールドに加え、**API レート制限フィールド**を独自に持つ。

| フィールド | 型 | 既定値 | 説明 |
|-----------|-----|--------|------|
| `id` | String | `cuid()` | 主キー |
| `name` | String? | — | 表示名（Google プロフィール由来） |
| `email` | String? `@unique` | — | メールアドレス。ホワイトリスト照合に使用 |
| `emailVerified` | DateTime? | — | NextAuth 標準 |
| `image` | String? | — | アバター URL |
| `createdAt` | DateTime | `now()` | 作成日時 |
| `apiCallCount` | Int | `0` | 当日の API 呼び出し回数 |
| `apiCallResetAt` | DateTime | `now()` | カウントの基準日時。UTC 日付がこれと異なれば次回リセット |
| `apiCallLimit` | Int | `50` | 1日あたりの呼び出し上限 |

**レート制限のセマンティクス**（実装は `app/api/chat/route.ts`）:
- 判定は **UTC 日付**で行い、サーバのタイムゾーンに依存しない。
- カウントは「上限未満のときだけ +1」という条件付き原子的更新（`updateMany` の `where` 条件）で行い、並行リクエストでの上限超過を防ぐ。
- Gemini 呼び出しが失敗した場合はカウントを返金（decrement）する。
- 上限はユーザーごとに `apiCallLimit` で可変（既定 50）。引き上げは DB の値を変更する。

### MdFile

1件の**要件定義セッション**を表す。要件書（Markdown 全文）に加え、会話の再開に必要な
スナップショット（要件書の生データ・会話履歴・進行状態）を保持する。要件書1件 = 会話1セッションが対応する。

| フィールド | 型 | 既定値 | 説明 |
|-----------|-----|--------|------|
| `id` | String | `cuid()` | 主キー |
| `userId` | String | — | 所有者（User.id） |
| `filename` | String | — | ファイル名。保存時に**先頭200文字に切り詰め** |
| `content` | String | — | Markdown 本文。保存時に**100,000文字まで**（API で検証）。`docState` から `buildMarkdown()` で生成される |
| `docState` | Json? | — | `RequirementsDoc` の生データ。要件書の再開・再生成に使う |
| `messages` | Json? | — | 会話履歴 `{ role, content }[]`。会話の再開に使う |
| `phase` | String? | — | 進行フェーズ `'phase1' \| 'phase2' \| 'done'` |
| `questionIndex` | Int? | — | フェーズ1の質問位置（0〜9） |
| `createdAt` | DateTime | `now()` | 作成日時。一覧は降順表示 |
| `updatedAt` | DateTime | `@updatedAt` | 更新日時。自動保存のたびに更新される |

スナップショット列（`docState` / `messages` / `phase` / `questionIndex`）はいずれも nullable。
これらが空の `MdFile` は要件書のみのレコードとして扱われ、開いても会話は復元されない（後方互換）。

**保存のセマンティクス**（実装は `app/api/mdfiles/route.ts` と `app/api/mdfiles/[id]/route.ts`）:
- セッションは初回保存で1件 `create` され、以降は同じ `id` を `PUT` で `update` する。1セッションは件数を増やさない。
- 保存時、サーバは受け取った `docState` から `content`（Markdown）を生成して保存する（両者をドリフトさせない）。
- 1ユーザーあたり最大 **100件**（`MAX_FILES_PER_USER`）。超過時は 409。
- 取得・更新・削除は必ず `userId` で絞り込み、他ユーザーのセッションにアクセスできない。

## マイグレーション運用

- スキーマ変更時は `prisma migrate dev`（開発）/ `prisma migrate deploy`（本番）。
- `build` で `prisma generate` が走るため、Vercel デプロイ時にクライアントは自動再生成される。
- 接続はマイグレーション用に `DIRECT_URL`（5432）、実行時に `DATABASE_URL`（pooler 6543）を使用。
