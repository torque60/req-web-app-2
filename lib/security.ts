import type { NextRequest } from 'next/server'

/**
 * CSRF 対策: ブラウザが付与する Origin ヘッダと Host を照合し、
 * 別オリジンからの書き込みリクエストを拒否する。
 *
 * - Origin が無いリクエスト（同一オリジンの一部 GET / 非ブラウザクライアント）は
 *   ここでは判定せず true を返す（認証で別途保護される）。
 * - 書き込み系（POST/DELETE 等）ハンドラの冒頭で呼ぶこと。
 */
export function checkSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true

  const host = req.headers.get('host') ?? ''
  return origin.endsWith(`//${host}`)
}
