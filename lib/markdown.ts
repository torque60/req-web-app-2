import type { RequirementsDoc } from './types'

const SECTIONS: { key: keyof RequirementsDoc; label: string }[] = [
  { key: 'problem',              label: '課題・背景' },
  { key: 'target',               label: 'ターゲット・ステークホルダー' },
  { key: 'goal',                 label: 'ゴール・成功指標' },
  { key: 'requirements',         label: '機能・要件' },
  { key: 'nonFunctional',        label: '非機能要件' },
  { key: 'completionConditions', label: '完了条件・受け入れ条件' },
  { key: 'constraints',          label: '制約・依存関係' },
  { key: 'outOfScope',           label: 'スコープ外・将来バックログ' },
  { key: 'risks',                label: 'リスク・懸念事項' },
  { key: 'techStack',            label: '技術スタック' },
]

export function buildMarkdown(doc: RequirementsDoc): string {
  const today = new Date().toISOString().slice(0, 10)
  const lines: string[] = [`# 企画書 / 要件定義書`, `_作成日: ${today}_`, '']

  for (const { key, label } of SECTIONS) {
    lines.push(`## ${label}`)
    lines.push(doc[key] || '_（未入力）_')
    lines.push('')
  }

  return lines.join('\n')
}

export { SECTIONS }
