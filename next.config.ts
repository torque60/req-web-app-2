import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development'

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'unsafe-inline' は Next.js のインラインブートストラップに必要。
      // 'unsafe-eval' は開発モードの React が必要（本番では除外）。
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      // 'unsafe-inline'(style) は Tailwind 等のため維持
      "style-src 'self' 'unsafe-inline'",
      // Google プロフィール画像
      "img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.googleusercontent.com",
      "font-src 'self'",
      // NextAuth の Google OAuth リダイレクト + Gemini API
      "connect-src 'self' https://accounts.google.com https://generativelanguage.googleapis.com",
      // Google OAuth 同意画面は別ウィンドウではなくリダイレクトで開くため frame-src は不要
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
