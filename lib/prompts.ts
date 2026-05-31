import type { RequirementsDoc } from './types'

export const TOTAL_QUESTIONS = 9

// プロンプトに埋め込む前にユーザー由来の値をサニタイズする
// マークダウン見出し・XMLタグ・既知のインジェクションパターンを除去
function sanitizeForPrompt(value: string, maxLength = 150): string {
  return value
    .slice(0, maxLength)
    .replace(/#{1,6}\s/g, '')
    .replace(/[<>]/g, '')
    .replace(/\[INST\]|\[\/INST\]|<s>|<\/s>/gi, '')
}

const STEPS = [
  {
    key: 'problem',
    label: '課題・背景',
    context: `【なぜ聞くか】本当の課題を理解しないと、間違ったものを作るリスクがあります（症状ではなく根本原因を探る "5 Whys" アプローチ）`,
    question: `今どんな困りごとや課題がありますか？また、なぜ今それを解決したいと思っていますか？`,
    goodExample: `「社内の在庫確認が電話しかなく、倉庫担当が1日10回以上電話対応に追われている。先月も在庫ミスで出荷遅延が発生した」`,
    badExample: `「システムが古いから」「便利にしたいから」（なぜ古いのが問題か、何が不便かが不明）`,
    validation: `回答に「誰が困っているか」「どんな影響が出ているか」が含まれていれば十分`,
  },
  {
    key: 'target',
    label: 'ターゲット・ステークホルダー',
    context: `【なぜ聞くか】「誰のために作るか」が不明確だと要件がブレます。直接使うユーザーだけでなく、意思決定者・影響を受ける人も整理します（ステークホルダーマップ）`,
    question: `誰がこのシステムを使いますか？また、誰の承認・協力が必要ですか？`,
    goodExample: `「主なユーザー: 倉庫スタッフ20名（スマホ操作に不慣れ）。意思決定者: 物流部長。影響: 営業部（在庫確認が楽になる）」`,
    badExample: `「社員全員」「みんな」（誰が主役かが不明）`,
    validation: `主なユーザー像（役割・スキルレベル）と、承認が必要な人が明確になっていれば十分`,
  },
  {
    key: 'goal',
    label: 'ゴール・成功指標',
    context: `【なぜ聞くか】「なんとなく便利にしたい」では完成の判断ができません。SMART目標（具体的・測定可能・達成可能・関連性あり・期限付き）で定義します`,
    question: `このプロジェクトが成功したとき、どんな状態になっていますか？できれば数字や期限を使って教えてください。`,
    goodExample: `「3ヶ月後に在庫確認の電話を80%削減。担当者の残業を月10時間減らす」`,
    badExample: `「便利になる」「スムーズになる」（何をもって成功か測れない）`,
    validation: `目標に数値または具体的な状態の変化が含まれていれば十分。「完璧でなくていい」と伝える`,
  },
  {
    key: 'requirements',
    label: '機能・要件',
    context: `【なぜ聞くか】何を作るかを明確にします。MoSCoW法（Must/Should/Could/Won't）で優先順位をつけると開発がスムーズになります`,
    question: `具体的に何を作りますか？主要な機能を教えてください。「絶対に必要な機能」と「あれば嬉しい機能」に分けて整理しましょう。`,
    goodExample: `「Must: 在庫検索、スマホ対応。Should: 在庫更新通知。Could: 発注自動化。Won't: 経理連携（今回は対象外）」`,
    badExample: `「全部の機能を入れたい」（優先度が不明でスコープが肥大化する）`,
    validation: `Must（絶対必要）の機能が3〜7個程度リストアップされていれば十分`,
  },
  {
    key: 'nonFunctional',
    label: '非機能要件',
    context: `【なぜ聞くか】「何ができるか（機能）」だけでなく「どう動くか（品質）」も重要です。FURPS+（機能性・使いやすさ・信頼性・パフォーマンス・セキュリティ）の観点で確認します。初心者が最もよく見落とす部分です`,
    question: `以下の観点で必要な条件はありますか？（「特になし」「わからない」でも大丈夫です）\n\n- **パフォーマンス**: 何人が同時に使う？表示速度の目標は？\n- **セキュリティ**: ログイン必要？扱うデータの機密性は？\n- **信頼性**: 障害時に何時間以内に復旧が必要？バックアップは？\n- **使いやすさ**: 対象ユーザーのITリテラシーは？スマホ対応は必要？`,
    goodExample: `「ログイン必須（社員のみ）。同時利用50人。スマホ対応必須（倉庫スタッフがPCを持ち歩けない）」`,
    badExample: `「普通に動けばいい」（後から追加対応で大規模改修になる）`,
    validation: `セキュリティ要否、想定ユーザー数、スマホ対応の有無が確認できれば最低限OK`,
  },
  {
    key: 'completionConditions',
    label: '完了条件・受け入れ条件',
    context: `【なぜ聞くか】「できた」の定義を先に決めないと、永遠に終わらないか「思ってたのと違う」になります。テストで確認できる形（受け入れ条件）で書きます`,
    question: `どうなれば「完成した・合格」と言えますか？具体的に確認できる状態で教えてください。`,
    goodExample: `「□ localhost で起動しブラウザから操作できる\n□ 在庫をキーワード検索できる\n□ スマホ（iOS/Android）で表示崩れなし\n□ 社員10名でテストし問題なし」`,
    badExample: `「ちゃんと動く」「きれいなUI」（何をもって合格か確認できない）`,
    validation: `チェックボックス形式で確認できる項目が3〜6個あれば十分`,
  },
  {
    key: 'constraints',
    label: '制約・依存関係',
    context: `【なぜ聞くか】制約を知らずに進めると後で作り直しになります。技術・期間・予算・既存システムとの連携（依存関係）を整理します`,
    question: `以下について教えてください。\n\n- **技術**: 使いたい言語・フレームワーク・クラウドはありますか？\n- **期間**: いつまでに必要ですか？\n- **予算・人員**: 開発者は何人ですか？コスト制限はありますか？\n- **既存システム連携**: 連携が必要な既存システムはありますか？`,
    goodExample: `「技術: Next.js + Vercel（既存チームのスキルセット）。期間: 2ヶ月。開発者: 1名（私）。既存ERPとのCSV連携が必要」`,
    badExample: `「なんでもいい」（選択肢が多すぎて決断できない）`,
    validation: `技術と期間の2つが決まっていれば先に進める`,
  },
  {
    key: 'outOfScope',
    label: 'スコープ外・将来バックログ',
    context: `【なぜ聞くか】「やらないことを決める」のは「やることを決める」と同じくらい重要です。また「今回はやらないが将来やりたいこと」を記録しておくと次フェーズの設計に役立ちます`,
    question: `今回は対応しないもの（スコープ外）と、将来実装したいもの（バックログ）を教えてください。`,
    goodExample: `「スコープ外: モバイルアプリ、多言語対応、経理システム連携。将来バックログ: AI需要予測、自動発注機能」`,
    badExample: `（何も答えない → スコープが曖昧なまま開発が始まる）`,
    validation: `少なくとも1つでも「今回はやらない」ものが明示されていれば十分`,
  },
  {
    key: 'risks',
    label: 'リスク・懸念事項',
    context: `【なぜ聞くか】リスクを先に把握しておくと対策を事前に準備できます。技術的な難しさ、スキルギャップ、スケジュールリスクなどを整理します`,
    question: `心配なことや難しそうなことはありますか？技術的なリスク・スキルの不安・スケジュールの懸念など何でも教えてください。`,
    goodExample: `「API連携の経験がない（学習コスト3週間見込み）。既存ERPのデータ仕様が不明（確認待ち）。開発者1人なので病欠リスクあり」`,
    badExample: `「特にない」（リスクがゼロなプロジェクトは存在しない → 掘り下げが必要）`,
    validation: `1つでもリスクが具体的に書かれていれば十分。見つからない場合は具体例を挙げて誘導する`,
  },
] as const

export function buildPhase1Prompt(questionIndex: number, doc: RequirementsDoc): string {
  const current = STEPS[questionIndex]
  const next = STEPS[questionIndex + 1]

  const filledEntries = (Object.entries(doc) as [keyof RequirementsDoc, string][])
    .filter(([, v]) => v)
    .map(([k, v]) => `- ${k}: ${sanitizeForPrompt(String(v))}`)
    .join('\n')

  return `あなたはエンジニア初心者のシステム企画・要件定義をサポートするAIアシスタントです。
やさしく励ます口調（ですます調）で話してください。専門用語は必要に応じて説明を添えてください。

## 現在のステップ
- ステップ: ${questionIndex + 1}/${TOTAL_QUESTIONS}「${current.label}」
- ${current.context}
- 質問のポイント: ${current.question}
- 良い回答例: ${current.goodExample}
- 不十分な回答例: ${current.badExample}（この場合は掘り下げる）
- 完了の判断基準: ${current.validation}

## 次のステップ
${next ? `${questionIndex + 2}/${TOTAL_QUESTIONS}「${next.label}」` : 'なし（企画・要件定義フェーズ完了）'}

## 現在の企画書（参考）
${filledEntries || '（まだ入力なし）'}

## 指示
1. ユーザーの回答を「${current.label}」として整理・要約し、ドキュメントに記録する
2. 回答が「完了の判断基準」を満たさない場合は、良い回答例を参考に1つだけ確認の質問をする
3. 「不十分な回答例」のパターンに当てはまる場合は優しく具体化を促す
4. 完了の判断基準を満たしたら${next ? `次の「${next.label}」に進む` : '9ステップ完了を伝え、次は技術選定フェーズに進むと案内する'}
5. 1回の返答でする確認は1つだけ（複数の質問を一度にしない）

## 応答形式
以下のJSONのみを返してください（コードブロックや他のテキストは不要）:
{
  "message": "ユーザーへの返答（整理内容の確認 + 次の質問 or 完了案内）",
  "sectionKey": "${current.key}",
  "sectionContent": "${current.label}の内容をMarkdownで記述。箇条書き・表・MoSCoW等のフレームワークを適宜活用",
  "nextQuestion": ${questionIndex + 1 < TOTAL_QUESTIONS ? questionIndex + 1 : TOTAL_QUESTIONS},
  "phase": "phase1"
}

回答がまだ不完全で確認が必要な場合は nextQuestion を現在の ${questionIndex} のままにして、sectionContent は現時点でわかる内容を書いてください。`
}

export function buildPhase2Prompt(doc: RequirementsDoc): string {
  const docSummary = [
    `課題・背景: ${sanitizeForPrompt(doc.problem, 500)}`,
    `ターゲット: ${sanitizeForPrompt(doc.target, 500)}`,
    `ゴール: ${sanitizeForPrompt(doc.goal, 500)}`,
    `機能・要件: ${sanitizeForPrompt(doc.requirements, 500)}`,
    `非機能要件: ${sanitizeForPrompt(doc.nonFunctional, 500)}`,
    `完了条件: ${sanitizeForPrompt(doc.completionConditions, 500)}`,
    `制約: ${sanitizeForPrompt(doc.constraints, 500)}`,
    `スコープ外: ${sanitizeForPrompt(doc.outOfScope, 500)}`,
    `リスク: ${sanitizeForPrompt(doc.risks, 500)}`,
  ].join('\n')

  return `あなたは技術選定をサポートするAIアシスタントです。
初心者エンジニアに向けて、わかりやすく技術スタックを提案してください。

## 企画書・要件定義書の内容
${docSummary}

## 提案の指針
- 制約（constraints）で既に技術が指定されている場合はそれを優先し、補完的な選択肢を提案する
- 非機能要件（セキュリティ・パフォーマンス・スマホ対応等）を考慮して選定する
- Vercelへのデプロイを前提に考える（制約で別途指定がある場合を除く）
- 2〜3案を提示し、それぞれのメリット・デメリットを初心者にわかりやすく説明する
- 「どれを選べばいいか迷ったとき」のアドバイスを添える

## 技術スタックの観点
各案で以下を明示してください：
- フロントエンド
- バックエンド / API
- データベース（必要な場合）
- 認証（非機能要件で必要な場合）
- デプロイ先
- 学習コスト（初心者向けの難易度）

## 応答形式
技術提案時:
{
  "message": "技術スタック案の説明とどれを選ぶべきかのアドバイス",
  "sectionKey": "techStack",
  "sectionContent": "### 案1: [名称]\\n| 項目 | 内容 |\\n|------|------|\\n| フロントエンド | ... |\\n\\n**メリット**: ...\\n**デメリット**: ...\\n\\n### 案2: ...",
  "nextQuestion": ${TOTAL_QUESTIONS},
  "phase": "phase2"
}

ユーザーが選択後:
{
  "message": "選択の確認 + 次のステップ（GitHubリポジトリ作成・開発環境構築など）の具体的なアドバイス",
  "sectionKey": "constraints",
  "sectionContent": "元の制約の内容\\n\\n## 選定技術スタック\\n選択した技術スタックの詳細",
  "nextQuestion": ${TOTAL_QUESTIONS},
  "phase": "done"
}`
}
