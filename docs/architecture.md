# アーキテクチャ

## 全体構成

Next.js App Router の単一アプリ内に、フロントエンド（Client Components）と
バックエンド（Route Handlers）が同居する構成。状態は原則クライアント側に保持し、
永続化が必要なもの（要件書・利用カウント・セッション）のみ DB に保存する。

```
ブラウザ (Client Components)
  app/page.tsx ── 中央オーケストレーター（会話・doc・フェーズの状態を保持）
    ├─ components/ChatPane     対話 UI
    ├─ components/DocumentPane 要件書プレビュー＋.mdダウンロード
    └─ components/HistoryPane  保存済み要件書の一覧／DL／削除
        │
        │ fetch (same-origin)
        ▼
Route Handlers (app/api/*)
    ├─ /api/chat            Gemini 呼び出し・レート制限
    ├─ /api/mdfiles         要件書の一覧(GET)・保存(POST)・削除(DELETE)
    ├─ /api/mdfiles/[id]    要件書の本文取得(GET)
    └─ /api/auth/[...nextauth]  NextAuth ハンドラ
        │
        ├─ lib/auth      NextAuth 設定（Google OAuth + ホワイトリスト）
        ├─ lib/prisma    PrismaClient シングルトン
        ├─ lib/security  CSRF（same-origin）チェック
        └─ lib/prompts   Gemini へのシステムプロンプト生成
        │
        ▼
    Google Gemini API        Supabase (PostgreSQL) ── Prisma
```

## レイヤの責務

| レイヤ | 責務 | やらないこと |
|--------|------|-------------|
| **page.tsx（オーケストレーター）** | 会話履歴・要件書(doc)・フェーズ・質問インデックスの状態管理、API 呼び出しの調停 | ビジネスロジック（プロンプト生成・検証） |
| **components/**（プレゼンテーション） | 表示と入力受付のみ。props で受け取り、コールバックで通知 | API 直接呼び出し（※ HistoryPane のみ自己完結で取得） |
| **app/api/**（Route Handlers） | 認証・CSRF・入力検証・レート制限・外部 API 呼び出し・DB 操作 | UI 状態の保持 |
| **lib/**（ドメイン） | 純粋なロジック（プロンプト生成・Markdown 整形・型・接続管理） | HTTP の知識（security.ts を除く） |

## 対話の状態遷移

会話の進行は `phase` と `questionIndex`（0〜9）の2変数で表現される。
両者はクライアント（`page.tsx`）が保持し、API 呼び出しのたびに送信する。
サーバはステートレスで、毎回送られた `phase` / `questionIndex` / `doc` をもとにプロンプトを組み立てる。

```
phase1 (questionIndex 0 → 8 を1問ずつ前進)
   │  各ステップで AI が回答を整理し doc[sectionKey] を埋める
   │  回答が不十分なら questionIndex を据え置き、深掘り質問を返す
   ▼  nextQuestion が 9 に到達
phase2 (技術選定)
   │  page.tsx が useEffect で自動トリガー（phase2Triggered で1回限り）
   │  AI が技術スタック案を提示 → ユーザー選択
   ▼  AI レスポンスの phase が "done"
done (入力欄は無効化、ダウンロード／保存のみ可能)
```

- フェーズ判定は **AI レスポンスの `phase` フィールド**と **`nextQuestion >= 9`** の2経路で行う（`page.tsx` の `callApi()`）。
- `phase2` への遷移時、クライアントは合成メッセージ「企画・要件定義フェーズが完了しました。技術スタックの選定をお願いします。」を自動投入する（`page.tsx` の phase2 自動トリガー `useEffect`）。

## データフロー: 1回の対話

```
1. ユーザーが ChatPane に入力 → page.tsx handleSend()
2. messages に user メッセージを追加し POST /api/chat
   body: { messages, phase, questionIndex, doc }
3. サーバ: 認証 → CSRF → 入力検証 → レート制限(+1) の順に通過判定
4. lib/prompts でシステムプロンプト生成（doc の値はサニタイズして埋め込み）
5. Gemini に history + 最新メッセージを送信（responseMimeType: application/json）
   失敗時はレート制限カウントを返金して 503
6. レスポンス JSON を extractJson() で堅牢にパース
7. クライアントへ返却（_rateLimit 付き）
8. page.tsx: sectionKey/sectionContent で doc を更新、message を会話に追加、
   nextQuestion/phase で状態遷移
```

## 永続化の方針

- **作業中のセッション（要件書 `doc` ＋会話 `messages` ＋進行状態）**: 変更が **debounce（約2.5秒）で自動保存**される。
  1件の `MdFile` をセッションとして create→以降 update し、リロード・離脱後も履歴から再開できる。
- **手動保存**: 「クラウド保存」ボタンで即時保存（自動保存と同じ `MdFile` を更新）。
- **API 利用カウント**: `User.apiCallCount` に保持。UTC 日付が変わると次回呼び出し時にリセット。
- **ログインセッション**: NextAuth の DB セッション（`Session` テーブル、PrismaAdapter）。

## データフロー: 自動保存

```
1. doc / messages / phase / questionIndex のいずれかが変化
2. page.tsx が debounce タイマー（約2.5秒）をセット（変化のたびにリセット）
3. 発火時、要件書が空（filledCount===0）ならスキップ
4. currentFileId が無ければ POST /api/mdfiles で create → 返却 id を保持
   currentFileId が有れば PUT /api/mdfiles/[id] で update
5. サーバは docState から content(Markdown) を生成し、スナップショットごと保存
6. ヘッダーに保存ステータス（保存中… / 保存しました）を表示
```

## データフロー: セッションの再開

```
1. 履歴ペインで「開く」を押す
2. GET /api/mdfiles/[id] がスナップショット全体を返す
3. 進行中の会話があれば破棄確認の上、page.tsx が
   messages / doc / phase / questionIndex / currentFileId を復元
4. 以降の入力はそのセッションの続きとして自動保存される
   （スナップショットが空の古いレコードは content のみ表示し会話は復元しない）
```

## デプロイ構成

- Vercel にデプロイ。`build` スクリプトは `prisma generate && next build`。
- DB は Supabase。`DATABASE_URL`（pooler: port 6543, `?pgbouncer=true`）と
  `DIRECT_URL`（direct: port 5432, マイグレーション用）を分離。
- 本番では Google OAuth の承認済みリダイレクト URI に
  `https://<本番ドメイン>/api/auth/callback/google` を登録する。
