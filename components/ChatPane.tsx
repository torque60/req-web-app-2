'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Message, Phase } from '@/lib/types'

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

const PHASE_LABELS: Record<Phase, string> = {
  phase1: 'フェーズ 1: 企画・要件定義',
  phase2: 'フェーズ 2: 技術選定',
  done: '完了',
}

const PHASE_COLORS: Record<Phase, string> = {
  phase1: 'bg-indigo-100 text-indigo-700',
  phase2: 'bg-blue-100 text-blue-700',
  done: 'bg-green-100 text-green-700',
}

interface ChatPaneProps {
  messages: Message[]
  phase: Phase
  questionIndex: number
  isLoading: boolean
  onSend: (content: string) => void
}

export default function ChatPane({ messages, phase, questionIndex, isLoading, onSend }: ChatPaneProps) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading || phase === 'done') return
    onSend(text)
    setInput('')
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#f9fafb' }}>
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium ${PHASE_COLORS[phase]}`}>
            {PHASE_LABELS[phase]}
          </span>
          {phase === 'phase1' && (
            <span className="text-xs text-gray-400">{questionIndex} / 9 完了</span>
          )}
        </div>
      </div>

      {/* 注意書きバナー */}
      <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
        <p className="text-xs text-amber-700">
          ⚠️ 個人情報・機密情報は入力しないでください。入力内容はAI（Gemini）に送信されます。
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div className="markdown-chat">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUrl}>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1 items-center">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-gray-200 shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={
              phase === 'done'
                ? '企画・要件定義が完了しました'
                : 'メッセージを入力...'
            }
            disabled={phase === 'done' || isLoading}
            className="flex-1 px-3 py-2 text-sm text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || phase === 'done' || isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            送信
          </button>
        </div>
      </form>
    </div>
  )
}
