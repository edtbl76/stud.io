import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { LayoutShell } from '@/components/layout/LayoutShell'

export const metadata: Metadata = {
  title: 'STUD.io',
  description: 'Local studio management platform',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>
          <LayoutShell>{children}</LayoutShell>
        </Providers>
      </body>
    </html>
  )
}
