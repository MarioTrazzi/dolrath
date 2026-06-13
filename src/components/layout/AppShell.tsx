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
    <div className="relative min-h-screen bg-background text-white overflow-x-hidden">
      {/* Ambiência da landing: glows sutis de cena (primary + roxo) */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[80rem] h-[26rem] rounded-full blur-3xl"
          style={{ background: 'rgba(233,69,96,0.10)' }}
        />
        <div
          className="absolute top-1/3 -left-40 w-[34rem] h-[34rem] rounded-full blur-3xl"
          style={{ background: 'rgba(147,51,234,0.12)' }}
        />
      </div>
      <Navbar />
      <main className="pt-24">{children}</main>
    </div>
  )
}
