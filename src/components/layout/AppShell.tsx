'use client'

import { usePathname } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { AppBackground } from '@/components/layout/AppBackground'

// Rotas que usam chrome próprio (hero/tela cheia de auth) e por isso NÃO
// recebem a Navbar global do app nem o fundo/pt compartilhados.
const BARE_ROUTES = ['/']
const BARE_PREFIXES = ['/auth']

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const path = pathname ?? ''
  const bare = BARE_ROUTES.includes(path) || BARE_PREFIXES.some((p) => path.startsWith(p))

  if (bare) {
    return <>{children}</>
  }

  return (
    <div className="relative min-h-screen text-text-primary">
      <AppBackground />
      <Navbar />
      {/* pt generoso para acomodar a navbar de vidro flutuante (mt-3 + py-3) */}
      <main className="pt-24">{children}</main>
    </div>
  )
}
