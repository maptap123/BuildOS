import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BuildOS',
  description: 'JDC Construction operating system',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BuildOS',
  },
}

export const viewport: Viewport = {
  themeColor: '#1b2b4a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-surface font-sans antialiased">{children}</body>
    </html>
  )
}
