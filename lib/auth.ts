import { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import { prisma } from '@/lib/prisma'

// WHITELIST_ENABLED=false で誰でもログイン可能になる（デフォルト: true）
const WHITELIST_ENABLED = process.env.WHITELIST_ENABLED !== 'false'

// 許可するメールアドレス（カンマ区切りで .env の ALLOWED_EMAILS に設定）
// fail-closed: 未設定の場合は誰もログインできない（設定忘れによる全世界公開を防ぐ）
const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  : []

if (WHITELIST_ENABLED && ALLOWED_EMAILS.length === 0) {
  console.warn('[auth] ALLOWED_EMAILS が未設定のため、すべてのログインを拒否します（fail-closed）。')
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!WHITELIST_ENABLED) return true
      if (ALLOWED_EMAILS.length === 0) return false
      return ALLOWED_EMAILS.includes(user.email?.toLowerCase() ?? '')
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
}
