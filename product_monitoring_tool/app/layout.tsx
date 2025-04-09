import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '竞品监控工具',
  description: '监控竞品文档变化',
  generator: 'v0.dev',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
