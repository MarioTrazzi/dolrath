'use client'

// Página DEV: renderiza a /ranking real com /api/ranking e /api/ranking/enroll
// STUBADAS no fetch (sem DB, sem auth, sem carteira). Serve para conferir o
// card de inscrição, o pote decomposto, a curva do top 20, o selo de
// elegibilidade e a entressafra.
//
// Cenários pela URL:
//   /dev/season-mock                    → temporada ativa, 100 inscritos
//   /dev/season-mock?heroes=500         → pote maior (curva escala)
//   /dev/season-mock?state=offseason    → entressafra (mundo aberto, sem placar)
//   /dev/season-mock?enrolled=1         → todos os heróis já inscritos
//   /dev/season-mock?matches=4          → abaixo do piso de elegibilidade
import { useEffect, useState } from 'react'
import RankingPage from '@/app/ranking/page'
import { PVP_SEASON_DOL_SPLIT, PVP_PAYOUT_MIN_MATCHES } from '@/lib/pvpRewards'

const CLASSES = ['warrior', 'rogue', 'mage', 'monk']
const RACES = ['humano', 'elfo', 'draconiano', 'metamorfo']

function installFetchStub() {
  const real = window.fetch.bind(window)
  const params = new URLSearchParams(window.location.search)
  const heroes = Number(params.get('heroes') || 100)
  const offseason = params.get('state') === 'offseason'
  const allEnrolled = params.get('enrolled') === '1'
  const myMatches = Number(params.get('matches') ?? 18)

  // A pool é a soma das inscrições: 100 DOL por herói inscrito.
  const potDol = heroes * 100
  const now = Date.now()

  const leaderboard = Array.from({ length: 24 }, (_, i) => ({
    rank: i + 1,
    characterId: i === 6 ? 'me' : `c${i}`,
    name: i === 6 ? 'Lyra' : `Herói ${i + 1}`,
    level: 40 - i,
    class: CLASSES[i % 4],
    race: RACES[i % 4],
    avatar: null,
    points: 900 - i * 31,
    wins: 36 - i,
    losses: 4 + (i % 7),
  }))

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

    if (url.includes('/api/ranking/enroll')) {
      if (init?.method === 'POST') {
        return json({ success: true, season: { id: 's1', name: 'Temporada 1' } })
      }
      return json({
        season: {
          id: 's1',
          name: offseason ? 'Temporada 2' : 'Temporada 1',
          status: 'active',
          endsAt: new Date(now + 86_400_000 * 92).toISOString(),
        },
        costDol: 100,
        // Fase 1: inscrição avulsa fechada. Passe ?entry=1 para ver o fluxo pago.
        enrollmentOpen: params.get('entry') === '1',
        characters: [
          { id: 'me', name: 'Lyra', level: 34, class: 'rogue', race: 'elfo', avatar: null, enrolled: true },
          { id: 'c2', name: 'Bruma', level: 12, class: 'mage', race: 'humano', avatar: null, enrolled: allEnrolled },
        ],
      })
    }

    if (url.includes('/api/ranking')) {
      return json({
        season: {
          id: 's1',
          name: 'Temporada 1',
          startsAt: new Date(now - 86_400_000 * 28).toISOString(),
          endsAt: new Date(now + 86_400_000 * (offseason ? 5 : 92)).toISOString(),
          status: offseason ? 'offseason' : 'active',
          scoring: !offseason,
          potDol,
          seededDol: 0,
          fundedDol: potDol,
          entries: heroes,
          competingAccounts: Math.round(heroes * 0.72),
        },
        entryCostDol: 100,
        minMatchesForPayout: PVP_PAYOUT_MIN_MATCHES,
        leaderboard,
        me: {
          characterId: 'me',
          name: 'Lyra',
          points: 900 - 6 * 31,
          wins: Math.max(0, myMatches - 4),
          losses: Math.min(4, myMatches),
          rank: 7,
          enrolled: true,
          matchesToEligible: Math.max(0, PVP_PAYOUT_MIN_MATCHES - myMatches),
        },
        myEnrolledCharacterIds: ['me'],
        payoutPreview: PVP_SEASON_DOL_SPLIT.map((pct, i) => ({
          rank: i + 1,
          dol: Math.round(potDol * pct * 100) / 100,
          pct,
        })),
        seasons: [
          { id: 's1', name: 'Temporada 1', status: 'active', startsAt: '', endsAt: '' },
          { id: 's0', name: 'Temporada 0', status: 'ended', startsAt: '', endsAt: '' },
        ],
      })
    }

    return real(input as any, init)
  }
}

export default function SeasonMockPage() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    installFetchStub()
    setReady(true)
  }, [])

  if (!ready) return null
  return <RankingPage />
}
