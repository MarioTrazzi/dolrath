'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { useSession } from 'next-auth/react'

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

  const setActiveCharacterId = useCallback((id: string) => {
    setActiveId(id)
    try {
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* localStorage indisponível (modo privado) — segue só em memória */
    }
  }, [])

  const activeCharacter = useMemo(
    () => characters.find((c) => c.id === activeId) ?? null,
    [characters, activeId]
  )

  const value = useMemo<ActiveCharacterContextType>(
    () => ({
      characters,
      activeCharacter,
      activeCharacterId: activeId,
      setActiveCharacterId,
      loading,
      refresh: fetchCharacters,
    }),
    [characters, activeCharacter, activeId, setActiveCharacterId, loading, fetchCharacters]
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
