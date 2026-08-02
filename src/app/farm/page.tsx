'use client'

// 🌾 A Fazenda virou uma das duas faces da Coleta: o Mapa do Reino leva a ela
// pela Vila de Dolrath. Esta rota fica de pé só para não quebrar links antigos.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function FarmRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/gathering?view=farm')
  }, [router])

  return (
    <div className="min-h-[60dvh] grid place-items-center text-[#8a8a90]">Abrindo a fazenda…</div>
  )
}
