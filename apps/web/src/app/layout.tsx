import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'We Gotchu',
  description: 'Plan an event, reserve a venue, and buy supplies through one approved plan.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
