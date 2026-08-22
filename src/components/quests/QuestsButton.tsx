'use client'

// 🗺️ Missões no /dashboard — a superfície é só um botão com o contador de
// resgates pendentes; o painel inteiro (login diário, Jornada do Herói e
// diárias) abre em dialog, pra não empurrar carteira/personagens pra baixo.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider'
import QuestsBoard from '@/components/quests/QuestsBoard'
import { BdoDialogShell, BEVEL_COLOR_BTN_CLASS, BEVEL_VARIANTS, GOLD } from '@/components/crafting/bdoTheme'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { refreshCharacterAlerts } from '@/hooks/useCharacterNotifications'

export default function QuestsButton() {
  const { data: session } = useSession()
  const { activeCharacterId } = useActiveCharacter()
  const { t } = useI18n()

  const [open, setOpen] = useState(false)
  const [claimable, setClaimable] = useState<number | null>(null)
  // A dialog só monta depois do 1º clique; até lá quem busca o contador é aqui.
  const openedOnce = useRef(false)

  const fetchBadge = useCallback(async () => {
    if (!activeCharacterId) return
    try {
      const res = await fetch(`/api/quests?characterId=${activeCharacterId}`)
      if (!res.ok) return
      const body = await res.json()
      setClaimable(Number(body?.claimableCount) || 0)
    } catch {
      // Badge é decorativo: falha silenciosa, o painel mostra o erro de verdade.
    }
  }, [activeCharacterId])

  useEffect(() => {
    if (session && activeCharacterId && !openedOnce.current) fetchBadge()
  }, [session, activeCharacterId, fetchBadge])

  const hasClaimable = (claimable ?? 0) > 0

  return (
    <>
      <button
        type="button"
        onClick={() => {
          openedOnce.current = true
          setOpen(true)
        }}
        className={`${BEVEL_COLOR_BTN_CLASS} inline-flex w-full items-center justify-center gap-2 px-5 py-2.5 text-sm sm:w-auto ${hasClaimable ? 'animate-pulse' : ''}`}
        style={BEVEL_VARIANTS.gold}
        title={t('Quests')}
      >
        <span>🗺️</span>
        <span>{t('Quests')}</span>
        {hasClaimable && (
          <span
            className="ml-1 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#1a1a1d]"
            style={{ background: GOLD }}
          >
            {claimable}
          </span>
        )}
      </button>

      <BdoDialogShell
        open={open}
        onClose={() => {
          setOpen(false)
          // Resgatou algo aqui dentro? O selo do card do herói tem de saber.
          refreshCharacterAlerts()
        }}
        icon="🗺️"
        title={t('Quests')}
        maxWidthClass="max-w-2xl"
      >
        <div className="p-4">
          <QuestsBoard onSummary={setClaimable} />
        </div>
      </BdoDialogShell>
    </>
  )
}
