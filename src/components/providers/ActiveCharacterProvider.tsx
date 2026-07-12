'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { computeStaminaRegen, STAMINA_REGEN } from '@/lib/staminaSystem'
import { computeGatherTicks } from '@/lib/gathering'

// 🦸 Personagem ATIVO global. Antes cada página (inventário/loja/masmorra/combate)
// buscava a lista e escolhia o "primeiro" como ativo, com seu próprio <select>.
// Agora há uma única fonte da verdade: o herói escolhido no diálogo da navbar.
// A escolha persiste em localStorage para sobreviver a navegações/recargas.
export interface ActiveCharacter {
  id: string
  name: string
  race: string
  class: string
  avatar?: string | null
  level: number
  experience?: number
  gold?: number
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  stamina: number
  maxStamina: number
  staminaUpdatedAt?: string
  /** Sessão de coleta viva (vem de /api/character/me quando o herói está coletando). */
  gathering?: { fieldId: string; status: string; lastTickAt: string; inventoryFull?: boolean }
  failstacks?: number
  isAlive?: boolean
  // Campos extras vêm livres de /api/character/me; não os tipamos todos.
  [key: string]: unknown
}

interface ActiveCharacterContextType {
  characters: ActiveCharacter[]
  activeCharacter: ActiveCharacter | null
  activeCharacterId: string | null
  setActiveCharacterId: (id: string) => void
  loading: boolean
  refresh: () => void
}

const STORAGE_KEY = 'dolrath:activeCharacterId'

const ActiveCharacterContext = createContext<ActiveCharacterContextType | undefined>(undefined)

export function ActiveCharacterProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const [characters, setCharacters] = useState<ActiveCharacter[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // Tick para o regen passivo "subir sozinho" na UI sem refetch. Recalculamos a
  // stamina viva a partir do snapshot do servidor (stamina + staminaUpdatedAt);
  // como nunca mutamos esse snapshot, recomputar é idempotente (sem dupla soma).
  const [staminaTick, setStaminaTick] = useState(0)

  const fetchCharacters = useCallback(async () => {
    if (!session) {
      setCharacters([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/character/me', { cache: 'no-store' })
      if (!res.ok) {
        setCharacters([])
        return
      }
      const data = await res.json()
      const list: ActiveCharacter[] = Array.isArray(data) ? data : data ? [data] : []
      setCharacters(list)
    } catch {
      setCharacters([])
    } finally {
      setLoading(false)
    }
  }, [session])

  useEffect(() => {
    if (session) {
      fetchCharacters()
    } else {
      setCharacters([])
      setActiveId(null)
    }
  }, [session, fetchCharacters])

  // Personagem criado em outra parte da app (fluxo de criação dispara
  // `dolrath:character-created`): recarrega a lista e já marca o recém-criado
  // como ativo, para ele aparecer na navbar na hora — sem refresh manual.
  useEffect(() => {
    const onCreated = (e: Event) => {
      const detail = (e as CustomEvent).detail as { characterId?: string } | undefined
      const newId = detail?.characterId ? String(detail.characterId) : null
      if (newId) {
        // Grava antes do fetch: o efeito de reconciliação escolhe o id salvo
        // assim que a lista atualizar.
        try {
          if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, newId)
        } catch {
          /* localStorage indisponível — segue, cai no primeiro da lista */
        }
      }
      fetchCharacters()
    }
    window.addEventListener('dolrath:character-created', onCreated as EventListener)
    return () => window.removeEventListener('dolrath:character-created', onCreated as EventListener)
  }, [fetchCharacters])

  // Reconcilia o id ativo sempre que a lista muda: mantém a escolha salva se
  // ainda existir; senão cai no primeiro personagem.
  useEffect(() => {
    if (characters.length === 0) {
      setActiveId(null)
      return
    }
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
    const valid = stored && characters.some((c) => c.id === stored)
    setActiveId(valid ? stored : characters[0].id)
  }, [characters])

  // Reavalia a stamina viva periodicamente. O tick real só muda a cada
  // tickSeconds (15 min) — regen (+2) OU coleta (−3) —, mas recomputar é
  // idempotente e barato, então limitamos o refresh a no máx. 60s para o
  // número não ficar visivelmente defasado quando um tick acontece com a aba
  // aberta. Só liga quando há alguém regenerando ou coletando, evitando
  // re-render à toa com tudo cheio e ninguém trabalhando.
  useEffect(() => {
    const anyTicking = characters.some(
      (c) => c.stamina < c.maxStamina || c.gathering?.status === 'active'
    )
    if (!anyTicking) return
    const refreshSeconds = Math.min(STAMINA_REGEN.tickSeconds, 60)
    const id = setInterval(() => setStaminaTick((t) => t + 1), refreshSeconds * 1000)
    return () => clearInterval(id)
  }, [characters])

  // Stamina viva derivada do snapshot do servidor + hora atual. Recalculada a
  // cada tick (e a cada fetch). O snapshot original em `characters` fica intacto.
  // Coletando (sessão ativa): o relógio INVERTE — nada de regen; debitamos os
  // tiques de coleta (−3/15min desde lastTickAt), espelhando o que o servidor
  // vai persistir no próximo sync. Coleta pausada por inventário cheio congela.
  const liveCharacters = useMemo(
    () =>
      characters.map((c) => {
        if (c.gathering?.status === 'active') {
          if (c.gathering.inventoryFull) return c
          const { staminaSpent } = computeGatherTicks({
            lastTickAt: new Date(c.gathering.lastTickAt),
            stamina: c.stamina,
          })
          return staminaSpent > 0 ? { ...c, stamina: c.stamina - staminaSpent } : c
        }
        return c.staminaUpdatedAt && c.stamina < c.maxStamina
          ? {
              ...c,
              stamina: computeStaminaRegen({
                stamina: c.stamina,
                maxStamina: c.maxStamina,
                staminaUpdatedAt: c.staminaUpdatedAt,
              }).stamina,
            }
          : c
      }),
    // staminaTick avança no intervalo de 15s e força o recomputo da stamina viva.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [characters, staminaTick]
  )

  const setActiveCharacterId = useCallback((id: string) => {
    setActiveId(id)
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* localStorage indisponível (modo privado) — segue só em memória */
    }
  }, [])

  const activeCharacter = useMemo(
    () => liveCharacters.find((c) => c.id === activeId) ?? null,
    [liveCharacters, activeId]
  )

  const value = useMemo<ActiveCharacterContextType>(
    () => ({
      characters: liveCharacters,
      activeCharacter,
      activeCharacterId: activeId,
      setActiveCharacterId,
      loading,
      refresh: fetchCharacters,
    }),
    [liveCharacters, activeCharacter, activeId, setActiveCharacterId, loading, fetchCharacters]
  )

  return <ActiveCharacterContext.Provider value={value}>{children}</ActiveCharacterContext.Provider>
}

export function useActiveCharacter() {
  const context = useContext(ActiveCharacterContext)
  if (context === undefined) {
    throw new Error('useActiveCharacter must be used within an ActiveCharacterProvider')
  }
  return context
}
