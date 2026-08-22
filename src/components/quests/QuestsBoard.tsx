'use client'

// 🗺️ Missões — recompensa de login diário (conta), cadeia tutorial "A Jornada do
// Herói" (um passo por vez) e missões diárias (reset à meia-noite UTC).
// Painel reutilizável: abre na dialog do /dashboard (QuestsButton) e na rota
// /quests, que ficou de pé para não quebrar links antigos.
import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'
import { QuestCard, type QuestView } from '@/components/quests/QuestCard'
import { GOLD, GOLD_BRIGHT, BEVEL_COLOR_BTN_CLASS, BEVEL_VARIANTS, BdoWindow } from '@/components/crafting/bdoTheme'
import { useT, useI18n } from '@/lib/i18n/I18nProvider'
import { localizeItemName } from '@/lib/i18n/catalog'

interface QuestsResponse {
  tutorial: { current: QuestView | null; completedCount: number; total: number; done: boolean }
  dailies: QuestView[]
  dailyLogin: { claimedToday: boolean; streak: number; nextGold: number }
  claimableCount: number
}

export default function QuestsBoard({ onSummary }: { onSummary?: (claimableCount: number) => void } = {}) {
  const t = useT()
  const { locale } = useI18n()
  const { data: session } = useSession()
  const { activeCharacterId, refresh: refreshActiveCharacter, loading: characterLoading } = useActiveCharacter()

  const [data, setData] = useState<QuestsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)

  const fetchQuests = useCallback(async () => {
    if (!activeCharacterId) return
    try {
      const res = await fetch(`/api/quests?characterId=${activeCharacterId}`)
      if (!res.ok) throw new Error(t('Failed to load quests'))
      const body: QuestsResponse = await res.json()
      setData(body)
      onSummary?.(Number(body?.claimableCount) || 0)
    } catch (e) {
      console.error(e)
      toast.error(t('Failed to load quests'))
    } finally {
      setIsLoading(false)
    }
  }, [activeCharacterId, onSummary])

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
      if (!res.ok) throw new Error(body?.error || t('Failed to claim quest'))
      const parts = [
        body.granted.gold > 0 ? `+${body.granted.gold} 🪙` : null,
        body.granted.xp > 0 ? `+${body.granted.xp} XP` : null,
        ...(body.granted.items ?? []).map(
          (it: { name: string; qty: number }) => `${it.qty}× ${localizeItemName(it.name, locale)}`,
        ),
      ].filter(Boolean)
      toast.success(t('Quest claimed! {rewards}', { rewards: parts.join(', ') }))
      if (body.leveledUp) toast.success(t('⬆️ You reached level {n}!', { n: body.newLevel }))
      refreshActiveCharacter() // ouro/XP na navbar
      await fetchQuests()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('Failed to claim quest'))
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
      if (!res.ok) throw new Error(body?.error || t('Failed to claim the daily reward'))
      toast.success(
        t(
          body.streak > 1
            ? '+{gold} 🪙 in the bank! Streak: {n} days 🔥'
            : '+{gold} 🪙 in the bank! Streak: {n} day 🔥',
          { gold: body.gold, n: body.streak },
        ),
      )
      await fetchQuests()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('Failed to claim the daily reward'))
    } finally {
      setClaimingId(null)
    }
  }

  if (characterLoading || (activeCharacterId && isLoading)) {
    return <div className="py-10 text-center text-sm text-[#8a8a90]">{t('Loading quests…')}</div>
  }

  if (!activeCharacterId) {
    return (
      <div className="py-10 text-center">
        <p className="text-lg text-[#dcdce0]">{t('You do not have a hero yet.')}</p>
        <Link href="/character/create" className="mt-3 inline-block font-semibold" style={{ color: GOLD }}>
          Criar personagem →
        </Link>
      </div>
    )
  }

  if (!data) return null

  const { tutorial, dailies, dailyLogin } = data

  return (
    <div className="space-y-6" style={{ fontFamily: "'Barlow', sans-serif" }}>
      {/* 🎁 Login diário (recompensa da CONTA → banco) */}
      <BdoWindow icon="🎁" title={t('Daily Reward')} bodyClassName="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[#8a8a90]">
              {t('Streak: ')}
              <span className="font-semibold" style={{ color: GOLD_BRIGHT }}>
                {t(dailyLogin.streak > 1 ? '{n} days 🔥' : '{n} day 🔥', { n: dailyLogin.streak })}
              </span>
            </p>
            <p className="mt-1 text-sm text-[#8a8a90]">
              {dailyLogin.claimedToday
                ? t("Today's reward claimed — come back tomorrow (+{gold} 🪙).", { gold: dailyLogin.nextGold })
                : (
                  <>
                    {t("Today's claim: ")}
                    <span className="font-semibold text-yellow-300">🪙 {dailyLogin.nextGold}</span>
                    {t(' straight into the account bank.')}
                  </>
                )}
            </p>
          </div>
          {dailyLogin.claimedToday ? (
            <span className="text-sm font-semibold text-emerald-400">{t('Claimed ✓')}</span>
          ) : (
            <button
              onClick={claimDailyLogin}
              disabled={claimingId === 'daily-login'}
              className={`${BEVEL_COLOR_BTN_CLASS} px-5 py-2 text-sm ${claimingId === 'daily-login' ? 'cursor-wait opacity-60' : ''}`}
              style={BEVEL_VARIANTS.gold}
            >
              {claimingId === 'daily-login' ? t('Claiming…') : t('Claim')}
            </button>
          )}
        </div>
      </BdoWindow>

      {/* 🧭 Cadeia tutorial — um passo por vez */}
      <BdoWindow
        icon="🧭"
        title={t("The Hero's Journey")}
        right={<span className="text-sm font-semibold tabular-nums" style={{ color: GOLD }}>{tutorial.completedCount}/{tutorial.total}</span>}
        bodyClassName="p-4"
      >
        {tutorial.done ? (
          <p className="text-sm font-semibold text-emerald-400">{t('Journey complete ✅ — Dolrath recognises a veteran.')}</p>
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
      <BdoWindow icon="📅" title={t('Daily Quests')} right={<span className="text-xs text-[#8a8a90]">{t('reset at midnight UTC')}</span>} bodyClassName="space-y-3 p-4">
        {dailies.map((q) => (
          <QuestCard key={q.id} quest={q} onClaim={claimQuest} claiming={claimingId === q.id} />
        ))}
      </BdoWindow>
    </div>
  )
}
