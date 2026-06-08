# 要件定義サポートAI ver.2

AIと対話しながらシステムの企画・要件定義・技術選定を進めるWebアプリです。
Google ログイン・要件書のクラウド保存・API利用制限を備えた本番デプロイ版です。

## 主な機能

- **対話型の要件定義**: AI（Gemini）との対話で要件を段階的に整理し、リアルタイムでドキュメント化
- **技術スタック選定サポート**: 整理した要件をもとに技術スタックの候補を提示
- **Google ログイン**: NextAuth による Google OAuth 認証
- **自動保存**: 要件書・会話の変更を自動でDBに保存（手動「クラウド保存」も利用可）
- **会話の保存と再開**: 会話履歴と進行状態を保存し、履歴から過去のセッションを開いて続きから会話を再開
- **API レート制限**: ユーザーごとに1日あたりの利用回数を制限
- **アクセス制御**: ホワイトリスト（許可メール制）のオン/オフ切り替え

## 技術スタック

| 分類 | 使用技術 |
|------|----------|
| フレームワーク | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS |
| AI | Google Gemini API |
| 認証 | NextAuth.js (Google OAuth) |
| DB / ORM | Supabase (PostgreSQL) + Prisma 5 |
| デプロイ | Vercel |

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、各値を設定します。

```bash
cp .env.example .env
```

| 変数 | 説明 |
|------|------|
| `GEMINI_API_KEY` | Google Gemini API キー |
| `GEMINI_MODEL` | 使用モデル（例: `gemini-3.1-flash-lite`） |
| `DATABASE_URL` | Supabase pooler 接続文字列（port 6543, `?pgbouncer=true` 付き） |
| `DIRECT_URL` | Supabase direct 接続文字列（port 5432） |
| `NEXTAUTH_SECRET` | セッション暗号化キー（`openssl rand -base64 32` で生成） |
| `NEXTAUTH_URL` | アプリのURL（ローカルは `http://localhost:3000`） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth 認証情報 |
| `WHITELIST_ENABLED` | ホワイトリスト機能のオン/オフ（`true`/`false`） |
| `ALLOWED_EMAILS` | 許可するメールアドレス（カンマ区切り） |

### 3. データベースのマイグレーション

```bash
npx prisma migrate deploy   # 既存マイグレーションを適用
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開きます。

## データベースの確認

```bash
npx prisma studio
```

ブラウザでテーブルの中身をGUI確認できます。

## デプロイ

Vercel に GitHub リポジトリを連携し、上記の環境変数を設定してデプロイします。
本番では Google OAuth の「承認済みリダイレクト URI」に
`https://<本番ドメイン>/api/auth/callback/google` を追加してください。
