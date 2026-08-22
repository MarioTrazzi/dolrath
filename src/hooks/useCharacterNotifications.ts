'use client'

// 🔔 Selo de avisos por personagem — uma leitura para a conta inteira, dividida
// entre o card do dashboard e o seletor de herói da navbar. Quem resgata algo
// (missão, ponto de atributo, coleta) dispara `refreshCharacterAlerts()` e todos
// os selos montados se atualizam sem recarregar a página.
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import type { CharacterAlerts } from '@/lib/characterNotifications'

export type { CharacterAlerts }

const REFRESH_EVENT = 'dolrath:character-alerts-refresh'

export function refreshCharacterAlerts() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REFRESH_EVENT))
}

export function useCharacterNotifications() {
  const { data: session, status } = useSession()
  const [alertsByCharId, setAlertsByCharId] = useState<Record<string, CharacterAlerts>>({})

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !session) return
    try {
      const res = await fetch('/api/character/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const body = await res.json()
      setAlertsByCharId(body?.byCharacterId ?? {})
    } catch {
      // Selo é decorativo: falha em silêncio, a página em si mostra o erro real.
    }
  }, [session, status])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const onRefresh = () => { load() }
    window.addEventListener(REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(REFRESH_EVENT, onRefresh)
  }, [load])

  return { alertsByCharId, refresh: load }
}
