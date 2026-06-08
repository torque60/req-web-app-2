import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkSameOrigin } from '@/lib/security'
import { buildMarkdown } from '@/lib/markdown'
import { parseSnapshot, MAX_CONTENT_LENGTH } from '@/lib/mdfile'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const file = await prisma.mdFile.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: file.id,
    filename: file.filename,
    content: file.content,
    createdAt: file.createdAt,
    docState: file.docState,
    messages: file.messages,
    phase: file.phase,
    questionIndex: file.questionIndex,
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // docState から content(Markdown) をサーバ生成する
  const snap = parseSnapshot(body)
  if (!snap) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const content = buildMarkdown(snap.docState)
  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: 'Content too large' }, { status: 400 })
  }

  // 所有者確認（他ユーザーのセッションは更新不可）
  const existing = await prisma.mdFile.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await prisma.mdFile.update({
    where: { id },
    data: {
      content,
      docState: snap.docState as unknown as Prisma.InputJsonValue,
      messages: snap.messages as unknown as Prisma.InputJsonValue,
      phase: snap.phase,
      questionIndex: snap.questionIndex,
    },
    select: { id: true, updatedAt: true },
  })

  return NextResponse.json({ id: updated.id, updatedAt: updated.updatedAt })
}
