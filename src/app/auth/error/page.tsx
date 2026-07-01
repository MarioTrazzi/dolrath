'use client'

// ============================================================
// DOLRATH — /auth/error
// Erro de autenticação no mesmo visual da landing/login (ArenaSky
// + glass card). Rota "bare" no AppShell.
// ============================================================

import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Home, Wallet } from 'lucide-react'
import { Suspense } from 'react'
import { ArenaSky, Button, GlassCard } from '@/components/landing/ui'

function getErrorMessage(error: string | null) {
  switch (error) {
    case 'Configuration':
      return 'Erro de configuração do servidor. Tente novamente em instantes.'
    case 'AccessDenied':
      return 'Acesso negado. Sua carteira não pôde ser validada.'
    case 'Verification':
      return 'Desafio de assinatura expirado ou inválido. Conecte a carteira de novo.'
    case 'CredentialsSignin':
      return 'Não foi possível validar sua assinatura. Tente conectar novamente.'
    default:
      return 'Ocorreu um erro inesperado durante o login.'
  }
}

function ErrorContent() {
  const searchParams = useSearchParams()
  const error = searchParams?.get('error') ?? null

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="w-full max-w-md"
    >
      <GlassCard className="p-8 sm:p-10 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 16 }}
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-error/30 bg-error/15 text-error"
        >
          <AlertTriangle size={30} />
        </motion.div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white text-balance">
          A rolagem falhou
        </h1>
        <p className="mt-3 mb-8 text-textsec text-pretty">{getErrorMessage(error)}</p>

        <div className="flex flex-col gap-3">
          <Button as="a" href="/auth/login" size="lg" className="w-full" icon={<Wallet size={18} />}>
            Tentar novamente
          </Button>
          <Button as="a" href="/" variant="secondary" className="w-full" icon={<Home size={16} />}>
            Voltar para a página inicial
          </Button>
        </div>
      </GlassCard>
    </motion.div>
  )
}

export default function AuthErrorPage() {
  return (
    <div className="relative min-h-screen bg-background text-white overflow-hidden">
      <ArenaSky starCount={30} parallax={false} />
      <main className="relative z-10 flex min-h-screen items-center justify-center px-4 py-12">
        <Suspense
          fallback={
            <GlassCard className="p-8 max-w-md w-full text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </GlassCard>
          }
        >
          <ErrorContent />
        </Suspense>
      </main>
    </div>
  )
}
