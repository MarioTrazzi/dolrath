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
      <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-accent flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary to-accent p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-text-primary mb-8">Meus Personagens</h1>
        
        <div className="glass-card p-6">
          <p className="text-text-secondary mb-4">
            Sistema de personagens em manutenção para deployment.
          </p>
          
          <div className="space-y-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-primary text-white py-2 px-4 rounded-lg hover:bg-primary/80 transition-colors"
            >
              Voltar ao Dashboard
            </button>
            
            <button
              onClick={() => router.push('/character/create')}
              className="w-full bg-secondary text-white py-2 px-4 rounded-lg hover:bg-secondary/80 transition-colors"
            >
              Criar Novo Personagem
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
