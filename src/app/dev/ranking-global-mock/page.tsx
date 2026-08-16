'use client'

// Página DEV: renderiza a /ranking REAL com /api/ranking stubada no fetch (sem
// DB, sem auth, sem carteira). Substitui o antigo /dev/season-mock, que existia
// para conferir pote/inscrição/curva do top 20 — tudo removido com a premiação.
//
// Cenários pela URL:
//   /dev/ranking-global-mock            → placar cheio, com o herói do jogador em #7
//   /dev/ranking-global-mock?rows=0     → placar vazio (estado inicial do jogo)
//   /dev/ranking-global-mock?me=0       → visitante sem personagem pontuado
import { useEffect, useState } from 'react'
import RankingPage from '@/app/ranking/page'

const CLASSES = ['warrior', 'rogue', 'mage', 'monk']
const RACES = ['humano', 'elfo', 'draconiano', 'metamorfo']

function installFetchStub() {
  const real = window.fetch.bind(window)
  const params = new URLSearchParams(window.location.search)
  const rows = Number(params.get('rows') ?? 24)
  const withMe = params.get('me') !== '0'

  const leaderboard = Array.from({ length: rows }, (_, i) => ({
    rank: i + 1,
    characterId: i === 6 ? 'me' : `c${i}`,
    name: i === 6 ? 'Lyra' : `Herói ${i + 1}`,
    level: 40 - i,
    class: CLASSES[i % 4],
    race: RACES[i % 4],
    avatar: null,
    points: Math.max(0, 4200 - i * 175),
    wins: Math.max(0, 168 - i * 7),
    losses: 20 + i * 3,
  }))

  const mine = leaderboard.find((r) => r.characterId === 'me')
  const payload = {
    leaderboard,
    me:
      withMe && mine
        ? {
            characterId: mine.characterId,
            name: mine.name,
            points: mine.points,
            wins: mine.wins,
            losses: mine.losses,
            rank: mine.rank,
          }
        : null,
  }

  window.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    if (url.startsWith('/api/ranking')) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return real(input, init)
  }) as typeof window.fetch
}

export default function RankingGlobalMockPage() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    installFetchStub()
    setReady(true)
  }, [])

  if (!ready) return null
  return <RankingPage />
}
