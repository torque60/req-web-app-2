import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkSameOrigin } from '@/lib/security'
import { buildPhase1Prompt, buildPhase2Prompt } from '@/lib/prompts'
import type { ChatRequest, ApiResponse } from '@/lib/types'

const MAX_MESSAGES = 50
const MAX_MESSAGE_LENGTH = 4000
const MAX_DOC_VALUE_LENGTH = 2000
const VALID_PHASES = new Set(['phase1', 'phase2', 'done'])
const DOC_KEYS = ['problem', 'target', 'goal', 'requirements', 'nonFunctional', 'completionConditions', 'constraints', 'outOfScope', 'risks', 'techStack']

function validateBody(body: unknown): body is ChatRequest {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>

  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > MAX_MESSAGES) return false
  for (const msg of b.messages) {
    if (!msg || typeof msg !== 'object') return false
    const m = msg as Record<string, unknown>
    if (m.role !== 'user' && m.role !== 'assistant') return false
    if (typeof m.content !== 'string' || m.content.length > MAX_MESSAGE_LENGTH) return false
  }

  if (typeof b.phase !== 'string' || !VALID_PHASES.has(b.phase)) return false

  if (typeof b.questionIndex !== 'number' || !Number.isInteger(b.questionIndex) || b.questionIndex < 0 || b.questionIndex > 9) return false

  if (!b.doc || typeof b.doc !== 'object' || Array.isArray(b.doc)) return false
  const doc = b.doc as Record<string, unknown>
  for (const key of DOC_KEYS) {
    if (typeof doc[key] !== 'string' || (doc[key] as string).length > MAX_DOC_VALUE_LENGTH) return false
  }

  return true
}

function extractJson(text: string): ApiResponse {
  const cleaned = text.trim()
  try {
    return JSON.parse(cleaned) as ApiResponse
  } catch {
    const codeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlock) return JSON.parse(codeBlock[1].trim()) as ApiResponse
    const raw = cleaned.match(/\{[\s\S]*\}/)
    if (raw) return JSON.parse(raw[0]) as ApiResponse
    throw new Error('Cannot parse JSON response')
  }
}

// 日付は UTC 基準で比較し、サーバーのタイムゾーンに依存しないようにする
function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ユーザーの API 使用カウントをチェックし、上限内なら原子的に increment する
async function checkAndIncrementRateLimit(userId: string): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { allowed: false, remaining: 0, limit: 0 }

  const needsReset = utcDay(new Date()) !== utcDay(new Date(user.apiCallResetAt))

  if (needsReset) {
    await prisma.user.update({
      where: { id: userId },
      data: { apiCallCount: 1, apiCallResetAt: new Date() },
    })
    return { allowed: true, remaining: user.apiCallLimit - 1, limit: user.apiCallLimit }
  }

  // 条件付き原子的更新: 上限未満のときだけ +1（並行リクエストでの上限超過を防ぐ）
  const result = await prisma.user.updateMany({
    where: { id: userId, apiCallCount: { lt: user.apiCallLimit } },
    data: { apiCallCount: { increment: 1 } },
  })

  if (result.count === 0) {
    return { allowed: false, remaining: 0, limit: user.apiCallLimit }
  }

  return { allowed: true, remaining: user.apiCallLimit - (user.apiCallCount + 1), limit: user.apiCallLimit }
}

// Gemini 呼び出しが失敗したときにカウントを返金する（0 未満にはしない）
async function refundRateLimit(userId: string): Promise<void> {
  try {
    await prisma.user.updateMany({
      where: { id: userId, apiCallCount: { gt: 0 } },
      data: { apiCallCount: { decrement: 1 } },
    })
  } catch {
    // 返金失敗は致命的ではないので握りつぶす
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. 認証チェック
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. CSRF: 異なるオリジンからのブラウザリクエストを拒否
    if (!checkSameOrigin(req)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 3. リクエストボディの解析と検証（無駄なレート消費を防ぐため API 呼び出し前に実施）
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    if (!validateBody(body)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { messages, phase, questionIndex, doc } = body

    const apiKey = process.env.GEMINI_API_KEY
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'

    if (!apiKey) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    // 4. レート制限チェック（検証通過後にのみカウント）
    const rateLimit = await checkAndIncrementRateLimit(session.user.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: `API 呼び出し上限（1日 ${rateLimit.limit} 回）に達しました。明日またお試しください。` },
        { status: 429 }
      )
    }

    const systemPrompt = phase === 'phase1'
      ? buildPhase1Prompt(questionIndex, doc)
      : buildPhase2Prompt(doc)

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
      systemInstruction: systemPrompt,
    })

    const allButLast = messages.slice(0, -1)
    const firstUserIndex = allButLast.findIndex(m => m.role === 'user')
    const history = (firstUserIndex >= 0 ? allButLast.slice(firstUserIndex) : []).map(m => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }))

    const lastMessage = messages[messages.length - 1]

    // 5. Gemini 呼び出し。失敗時はレート制限カウントを返金する
    let responseText: string
    try {
      const chat = model.startChat({ history })
      const result = await chat.sendMessage(lastMessage.content)
      responseText = result.response.text()
    } catch (e) {
      await refundRateLimit(session.user.id)
      throw e
    }

    try {
      const parsed = extractJson(responseText)
      return NextResponse.json({
        ...parsed,
        _rateLimit: { remaining: rateLimit.remaining, limit: rateLimit.limit },
      })
    } catch {
      console.error('AI response JSON parse failed')
      return NextResponse.json(
        { message: 'AIの応答を解析できませんでした。もう一度お試しください。', sectionKey: null, sectionContent: '', nextQuestion: questionIndex, phase },
        { status: 200 }
      )
    }
  } catch (e) {
    console.error('Unexpected API error:', e instanceof Error ? e.message : String(e))
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }
}
