'use client'

// ============================================================
// DOLRATH — /auth/login
// Mesma cena da landing: céu enluarado (ArenaSky), navbar de vidro
// mínima e o card de login centralizado. Rota "bare" (AppShell não
// injeta a Navbar global aqui).
// ============================================================

import Link from 'next/link'
import { motion } from 'framer-motion'
import { LoginForm } from '@/components/auth/LoginForm'
import { ArenaSky } from '@/components/landing/ui'

export default function LoginPage() {
  return (
    <div className="relative min-h-screen bg-background text-white overflow-hidden">
      <ArenaSky starCount={36} parallax={false} />

      {/* Navbar mínima (vidro, igual à landing) — só o caminho de volta */}
      <header className="fixed top-0 inset-x-0 z-50">
        <nav className="mx-auto max-w-7xl px-4 sm:px-6" aria-label="Navegação">
          <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-secondary/70 backdrop-blur-xl px-4 sm:px-6 py-3 shadow-2xl shadow-black/20">
            <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight text-white">
              <span aria-hidden="true">⚔️</span>
              <span>Dolrath</span>
            </Link>
            <Link
              href="/doc"
              className="px-4 py-2 rounded-lg text-sm font-medium text-textsec hover:text-white hover:bg-white/5 transition-colors"
            >
              Docs
            </Link>
          </div>
        </nav>
      </header>

      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 pt-24 pb-12">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          <LoginForm />
        </motion.div>
      </main>
    </div>
  )
}
