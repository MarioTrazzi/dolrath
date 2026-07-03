'use client'

// Página DEV: renderiza o DungeonRun com personagem falso e as rotas
// /api/dungeon/run/* STUBADAS no fetch (sem DB/auth) pra validar o layout de
// combate no mobile. Mesmo espírito do /dev/battle-fx.
import { useState, useEffect } from 'react'
import DungeonRun, { DungeonCharacter } from '@/components/dungeon/DungeonRun'
import { DUNGEONS, scaleMonster, pickMonster } from '@/lib/dungeonAdventures'

const DUNGEON = DUNGEONS.floresta

const CHAR: DungeonCharacter = {
  id: 'dev-char',
  name: 'Drakmon',
  level: 3,
  experience: 603,
  nextLevelExperience: 1128,
  race: 'draconiano',
  class: 'monk',
  avatar: null,
  hp: 182,
  maxHp: 182,
  mp: 100,
  maxMp: 100,
  stamina: 156,
  maxStamina: 156,
  attack: 37,
  defense: 23,
  magicPower: 8,
  str: 18,
  agi: 12,
  int: 8,
  def: 10,
  equipment: [],
}

function installFetchStub() {
  const real = window.fetch.bind(window)
  let stamina = 156
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

    if (url.includes('/api/dungeon/run/start')) return json({ runId: 'dev-run', stamina })
    if (url.includes('/api/dungeon/run/heartbeat')) return json({ active: true })
    if (url.includes('/api/dungeon/run/step')) {
      stamina -= 4
      // Sempre MONSTRO (1 inimigo) — é o layout que queremos ver.
      const monster = scaleMonster(pickMonster(DUNGEON), DUNGEON, CHAR.level, { tier: 1, isMain: false })
      return json({ type: 'monster', roll: 14, monster, stamina })
    }
    if (url.includes('/api/dungeon/run/')) return json({ ok: true, active: false })
    if (url.includes('/api/character/')) return json({ ok: true })
    return real(input as RequestInfo, init)
  }
}

export default function DungeonMockPage() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    installFetchStub()
    setReady(true)
  }, [])
  if (!ready) return null
  return (
    <DungeonRun
      dungeon={DUNGEON}
      character={CHAR}
      onExit={() => window.location.reload()}
    />
  )
}
