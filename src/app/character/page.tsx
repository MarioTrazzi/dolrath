// Página simplificada para deploy
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/I18nProvider'

export default function CharacterPage() {
  const t = useT()
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
        <h1 className="text-3xl font-bold text-text-primary mb-8">{t('My Characters')}</h1>

        <div className="rounded-[4px] border border-[#46464c] bg-[#1e1e21]/95 p-6 shadow-2xl shadow-black/60">
          <p className="text-text-secondary mb-4">
            {t('Character system under maintenance for deployment.')}
          </p>

          <div className="space-y-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full rounded-[3px] border border-[#8a6d3b] bg-gradient-to-b from-[#3a3325] to-[#241f16] py-2 px-4 font-semibold text-[#e7c682] transition-all hover:brightness-125"
            >
              {t('Back to Dashboard')}
            </button>

            <button
              onClick={() => router.push('/character/create')}
              className="w-full rounded-[3px] border border-[#46464c] bg-gradient-to-b from-[#2b2b2f] to-[#1c1c1f] py-2 px-4 font-semibold text-[#c9c9ce] transition-colors hover:border-[#8a6d3b] hover:text-white"
            >
              {t('Create New Character')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
