import { SECTIONS } from '@/lib/markdown'
import type { RequirementsDoc, Message } from '@/lib/types'

// 保存系API（POST/PUT）で共有する制約と検証
export const MAX_FILES_PER_USER = 100
export const MAX_CONTENT_LENGTH = 100000

const MAX_MESSAGES = 200
const MAX_MESSAGE_LENGTH = 8000
const DOC_KEYS = SECTIONS.map((s) => s.key)
const VALID_PHASES = new Set(['phase1', 'phase2', 'done'])

export interface ParsedSnapshot {
  docState: RequirementsDoc
  messages: Message[]
  phase: 'phase1' | 'phase2' | 'done'
  questionIndex: number
}

// セッションスナップショットの入力を検証し、正規化した値を返す。不正なら null。
export function parseSnapshot(body: unknown): ParsedSnapshot | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>

  if (!b.docState || typeof b.docState !== 'object' || Array.isArray(b.docState)) return null
  const ds = b.docState as Record<string, unknown>
  const docState = {} as Record<string, string>
  for (const key of DOC_KEYS) {
    const v = ds[key]
    if (typeof v !== 'string') return null
    docState[key] = v
  }

  if (!Array.isArray(b.messages) || b.messages.length > MAX_MESSAGES) return null
  const messages: Message[] = []
  for (const m of b.messages) {
    if (!m || typeof m !== 'object') return null
    const mm = m as Record<string, unknown>
    if (mm.role !== 'user' && mm.role !== 'assistant') return null
    if (typeof mm.content !== 'string' || mm.content.length > MAX_MESSAGE_LENGTH) return null
    messages.push({ role: mm.role, content: mm.content })
  }

  if (typeof b.phase !== 'string' || !VALID_PHASES.has(b.phase)) return null

  if (
    typeof b.questionIndex !== 'number' ||
    !Number.isInteger(b.questionIndex) ||
    b.questionIndex < 0 ||
    b.questionIndex > 9
  ) {
    return null
  }

  return {
    docState: docState as unknown as RequirementsDoc,
    messages,
    phase: b.phase as 'phase1' | 'phase2' | 'done',
    questionIndex: b.questionIndex,
  }
}
