'use client'

// 🗺️ Missões — recompensa de login diário (conta), cadeia tutorial "A Jornada do
// Herói" (um passo por vez) e missões diárias (reset à meia-noite UTC).
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'
import { QuestCard, type QuestView } from '@/components/quests/QuestCard'
import { GOLD, GOLD_BRIGHT, BEVEL_COLOR_BTN_CLASS, BEVEL_VARIANTS, BdoWindow } from '@/components/crafting/bdoTheme'

interface QuestsResponse {
  tutorial: { current: QuestView | null; completedCount: number; total: number; done: boolean }
  dailies: QuestView[]
  dailyLogin: { claimedToday: boolean; streak: number; nextGold: number }
  claimableCount: number
}

export default function QuestsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { activeCharacterId, refresh: refreshActiveCharacter, loading: characterLoading } = useActiveCharacter()

  const [data, setData] = useState<QuestsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/login')
  }, [status, router])

  const fetchQuests = useCallback(async () => {
    if (!activeCharacterId) return
    try {
      const res = await fetch(`/api/quests?characterId=${activeCharacterId}`)
      if (!res.ok) throw new Error('Erro ao carregar missões')
      setData(await res.json())
    } catch (e) {
      console.error(e)
      toast.error('Erro ao carregar missões')
    } finally {
      setIsLoading(false)
    }
  }, [activeCharacterId])

  useEffect(() => {
    if (session && activeCharacterId) fetchQuests()
  }, [session, activeCharacterId, fetchQuests])

  const claimQuest = async (questId: string) => {
    if (!activeCharacterId || claimingId) return
    setClaimingId(questId)
    try {
      const res = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: activeCharacterId, questId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Erro ao resgatar missão')
      const parts = [
        body.granted.gold > 0 ? `+${body.granted.gold} 🪙` : null,
        body.granted.xp > 0 ? `+${body.granted.xp} XP` : null,
        ...(body.granted.items ?? []).map((it: { name: string; qty: number }) => `${it.qty}× ${it.name}`),
      ].filter(Boolean)
      toast.success(`Missão resgatada! ${parts.join(', ')}`)
      if (body.leveledUp) toast.success(`⬆️ Subiu para o nível ${body.newLevel}!`)
      refreshActiveCharacter() // ouro/XP na navbar
      await fetchQuests()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao resgatar missão')
    } finally {
      setClaimingId(null)
    }
  }

  const claimDailyLogin = async () => {
    if (claimingId) return
    setClaimingId('daily-login')
    try {
      const res = await fetch('/api/quests/daily-login', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error || 'Erro ao resgatar recompensa diária')
      toast.success(`+${body.gold} 🪙 no banco! Sequência: ${body.streak} dia${body.streak > 1 ? 's' : ''} 🔥`)
      await fetchQuests()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao resgatar recompensa diária')
    } finally {
      setClaimingId(null)
    }
  }

  if (status === 'loading' || characterLoading || (activeCharacterId && isLoading)) {
    return (
      <div className="min-h-[60dvh] grid place-items-center text-[#8a8a90]">Carregando missões…</div>
    )
  }

  if (!activeCharacterId) {
    return (
      <div className="min-h-[60dvh] grid place-items-center p-4">
        <div className="text-center">
          <p className="text-lg text-[#dcdce0]">Você ainda não tem um herói.</p>
          <Link href="/character/create" className="mt-3 inline-block font-semibold" style={{ color: GOLD }}>
            Criar personagem →
          </Link>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { tutorial, dailies, dailyLogin } = data

  return (
    <div className="min-h-[100dvh] p-4 sm:p-6" style={{ fontFamily: "'Barlow', sans-serif" }}>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold tracking-wide text-[#dcdce0]">🗺️ Missões</h1>

        {/* 🎁 Login diário (recompensa da CONTA → banco) */}
        <BdoWindow icon="🎁" title="Recompensa Diária" bodyClassName="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-[#8a8a90]">
                Sequência: <span className="font-semibold" style={{ color: GOLD_BRIGHT }}>{dailyLogin.streak} dia{dailyLogin.streak > 1 ? 's' : ''} 🔥</span>
              </p>
              <p className="mt-1 text-sm text-[#8a8a90]">
                {dailyLogin.claimedToday
                  ? `Recompensa de hoje resgatada — volte amanhã (+${dailyLogin.nextGold} 🪙).`
                  : (
                    <>Resgate de hoje: <span className="font-semibold text-yellow-300">🪙 {dailyLogin.nextGold}</span> direto no banco da conta.</>
                  )}
              </p>
            </div>
            {dailyLogin.claimedToday ? (
              <span className="text-sm font-semibold text-emerald-400">Resgatada ✓</span>
            ) : (
              <button
                onClick={claimDailyLogin}
                disabled={claimingId === 'daily-login'}
                className={`${BEVEL_COLOR_BTN_CLASS} px-5 py-2 text-sm ${claimingId === 'daily-login' ? 'cursor-wait opacity-60' : ''}`}
                style={BEVEL_VARIANTS.gold}
              >
                {claimingId === 'daily-login' ? 'Resgatando…' : 'Resgatar'}
              </button>
            )}
          </div>
        </BdoWindow>

        {/* 🧭 Cadeia tutorial — um passo por vez */}
        <BdoWindow
          icon="🧭"
          title="A Jornada do Herói"
          right={<span className="text-sm font-semibold tabular-nums" style={{ color: GOLD }}>{tutorial.completedCount}/{tutorial.total}</span>}
          bodyClassName="p-4"
        >
          {tutorial.done ? (
            <p className="text-sm font-semibold text-emerald-400">Jornada concluída ✅ — Dolrath reconhece um veterano.</p>
          ) : tutorial.current ? (
            <QuestCard
              quest={tutorial.current}
              onClaim={claimQuest}
              claiming={claimingId === tutorial.current.id}
              highlight
            />
          ) : null}
        </BdoWindow>

        {/* 📅 Diárias */}
        <BdoWindow icon="📅" title="Missões Diárias" right={<span className="text-xs text-[#8a8a90]">renovam à meia-noite UTC</span>} bodyClassName="space-y-3 p-4">
          {dailies.map((q) => (
            <QuestCard key={q.id} quest={q} onClaim={claimQuest} claiming={claimingId === q.id} />
          ))}
        </BdoWindow>
      </div>
    </div>
  )
}
