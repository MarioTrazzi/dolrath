'use client'

// 🗺️ As missões moram no /dashboard desde que a navbar encolheu. Esta rota
// continua de pé (links antigos, deep-link do ponto dourado) montando o mesmo
// painel.
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import QuestsBoard from '@/components/quests/QuestsBoard'

export default function QuestsPage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/login')
  }, [status, router])

  if (status === 'loading') {
    return <div className="min-h-[60dvh] grid place-items-center text-[#8a8a90]">Carregando missões…</div>
  }

  return (
    <div className="min-h-[100dvh] p-4 sm:p-6" style={{ fontFamily: "'Barlow', sans-serif" }}>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold tracking-wide text-[#dcdce0]">🗺️ Missões</h1>
        <QuestsBoard />
      </div>
    </div>
  )
}
