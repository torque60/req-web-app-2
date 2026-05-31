export type Phase = 'phase1' | 'phase2' | 'done'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface RequirementsDoc {
  problem: string              // Q1: 課題・背景（5 Whys）
  target: string               // Q2: ターゲット・ステークホルダー
  goal: string                 // Q3: ゴール・成功指標（SMART）
  requirements: string         // Q4: 機能・要件（MoSCoW）
  nonFunctional: string        // Q5: 非機能要件（FURPS+）
  completionConditions: string // Q6: 完了条件・受け入れ条件
  constraints: string          // Q7: 制約・依存関係
  outOfScope: string           // Q8: スコープ外・将来バックログ
  risks: string                // Q9: リスク・懸念事項
  techStack: string            // フェーズ2: 技術スタック
}

export interface ApiResponse {
  message: string
  sectionKey: keyof RequirementsDoc | null
  sectionContent: string
  nextQuestion: number
  phase: Phase
}

export interface ChatRequest {
  messages: Message[]
  phase: Phase
  questionIndex: number
  doc: RequirementsDoc
}
