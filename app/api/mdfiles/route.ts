import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkSameOrigin } from '@/lib/security'

const MAX_FILES_PER_USER = 100

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const files = await prisma.mdFile.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, filename: true, createdAt: true },
  })

  return NextResponse.json(files)
}

export async function POST(req: NextRequest) {
  if (!checkSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  if (typeof b.filename !== 'string' || typeof b.content !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  if (b.content.length > 100000) {
    return NextResponse.json({ error: 'Content too large' }, { status: 400 })
  }

  // ユーザーあたりの保存件数上限（ストレージ肥大の防止）
  const existingCount = await prisma.mdFile.count({ where: { userId: session.user.id } })
  if (existingCount >= MAX_FILES_PER_USER) {
    return NextResponse.json(
      { error: `保存件数の上限（${MAX_FILES_PER_USER} 件）に達しました。不要な要件書を削除してください。` },
      { status: 409 }
    )
  }

  const file = await prisma.mdFile.create({
    data: {
      userId: session.user.id,
      filename: b.filename.slice(0, 200),
      content: b.content,
    },
  })

  return NextResponse.json({ id: file.id, filename: file.filename, createdAt: file.createdAt })
}

export async function DELETE(req: NextRequest) {
  if (!checkSameOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  if (typeof b.id !== 'string') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const file = await prisma.mdFile.findFirst({
    where: { id: b.id, userId: session.user.id },
  })

  if (!file) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await prisma.mdFile.delete({ where: { id: b.id } })
  return NextResponse.json({ success: true })
}
