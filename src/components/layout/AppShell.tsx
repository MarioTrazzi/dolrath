'use client'

import { usePathname } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'

// Rotas que usam chrome próprio (navbar/hero full-bleed) e por isso NÃO
// recebem a Navbar global do app nem o wrapper de gradiente/pt-16.
const BARE_ROUTES = ['/']

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const bare = BARE_ROUTES.includes(pathname ?? '')

  if (bare) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-accent">
      <Navbar />
      <main className="pt-16">{children}</main>
    </div>
  )
}
