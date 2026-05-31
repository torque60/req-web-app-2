'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { RequirementsDoc, Phase } from '@/lib/types'
import { buildMarkdown, SECTIONS } from '@/lib/markdown'

function safeUrl(url: string): string | undefined {
  if (!url) return undefined
  if (url.startsWith('#') || url.startsWith('/') || url.startsWith('./') || url.startsWith('../')) return url
  try {
    const parsed = new URL(url)
    if (['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return url
    return undefined
  } catch {
    return undefined
  }
}

interface DocumentPaneProps {
  doc: RequirementsDoc
  phase: Phase
}

function downloadMarkdown(doc: RequirementsDoc) {
  const content = buildMarkdown(doc)
  const blob = new Blob([content], { type: 'text/markdown; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `project_plan_${new Date().toISOString().slice(0, 10)}.md`
  a.click()
  URL.revokeObjectURL(url)
}

export default function DocumentPane({ doc, phase }: DocumentPaneProps) {
  const filledCount = SECTIONS.filter(s => !!doc[s.key]).length
  const progress = Math.round((filledCount / SECTIONS.length) * 100)

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-6 py-3 border-b border-gray-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-700">企画書 / 要件定義書</h2>
          <span className="text-xs text-gray-400">{filledCount} / {SECTIONS.length} セクション</span>
        </div>
        <button
          onClick={() => downloadMarkdown(doc)}
          disabled={filledCount === 0}
          className="px-3 py-1.5 text-xs font-medium text-white bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          .md ダウンロード
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100 shrink-0">
        <div
          className="h-full bg-indigo-500 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Document content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="markdown-doc max-w-2xl mx-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUrl}>
            {buildMarkdown(doc)}
          </ReactMarkdown>
        </div>

        {phase === 'done' && (
          <div className="max-w-2xl mx-auto mt-6 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            企画・要件定義が完了しました。上の「.md ダウンロード」ボタンで保存できます。
          </div>
        )}
      </div>
    </div>
  )
}
