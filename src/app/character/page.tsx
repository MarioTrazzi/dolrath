// Página simplificada para deploy
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CharacterPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Verificação simples de autenticação
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/user/profile')
        if (!response.ok) {
          router.push('/auth/login')
          return
        }
        setIsLoading(false)
      } catch (error) {
        router.push('/auth/login')
      }
    }

    checkAuth()
  }, [router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pb-16">
      <h1 className="text-3xl font-bold text-text-primary mb-8">Meus Personagens</h1>

      <div className="glass-card p-6">
        <p className="text-textsec mb-6">
          Sistema de personagens em manutenção para deployment.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-gradient-to-r from-primary to-primary-dark text-white hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] transition-all"
          >
            Voltar ao Dashboard
          </button>

          <button
            onClick={() => router.push('/character/create')}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold bg-surface/60 border border-white/10 text-white hover:border-white/20 hover:bg-surface/80 active:scale-[0.98] transition-all"
          >
            Criar Novo Personagem
          </button>
        </div>
      </div>
    </div>
  )
}
