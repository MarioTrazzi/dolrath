'use client'

// Moldura "janela do jogo" da Jornada: divisória ornamental (a fronteira
// entre a landing e o jogo) + casca chumbo+ouro com barra de título em
// bisel e pips de canto em losango — mesma linguagem da EnhancementDialog
// e das bancadas de ofício.

import React from 'react'
import { Dices } from 'lucide-react'
import { GOLD, GOLD_BRIGHT, BORDER_GOLD, PANEL_BG } from '@/components/crafting/bdoTheme'
import { useT } from '@/lib/i18n/I18nProvider'

/** Divisória: linha dupla dourada com um d20 em losango ao centro.
    Montada sobre a borda inferior do hero — o losango fica metade na
    imagem, metade na seção da Jornada. */
export function JourneyDivider() {
  return (
    <div className="w-full flex items-center gap-3">
      <div className="flex-1 flex flex-col gap-[3px]">
        <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${BORDER_GOLD} 12%)` }} />
        <div className="h-px opacity-50" style={{ background: `linear-gradient(90deg, transparent, ${BORDER_GOLD} 12%)` }} />
      </div>
      <span className="h-1.5 w-1.5 rotate-45 border" style={{ borderColor: BORDER_GOLD, background: '#1e1e21' }} />
      <div
        className="grid h-12 w-12 rotate-45 place-items-center border-2 shrink-0"
        style={{ borderColor: BORDER_GOLD, background: '#141210', boxShadow: '0 0 18px rgba(201,162,95,0.35)' }}
      >
        <Dices className="-rotate-45 h-6 w-6" style={{ color: GOLD }} />
      </div>
      <span className="h-1.5 w-1.5 rotate-45 border" style={{ borderColor: BORDER_GOLD, background: '#1e1e21' }} />
      <div className="flex-1 flex flex-col gap-[3px]">
        <div className="h-px" style={{ background: `linear-gradient(90deg, ${BORDER_GOLD} 88%, transparent)` }} />
        <div className="h-px opacity-50" style={{ background: `linear-gradient(90deg, ${BORDER_GOLD} 88%, transparent)` }} />
      </div>
    </div>
  )
}

/** Pip de canto em losango (assinatura visual das dialogs do jogo). */
function CornerPip({ pos }: { pos: string }) {
  return (
    <span
      className={`absolute ${pos} z-20 h-[7px] w-[7px] rotate-45 border pointer-events-none`}
      style={{ borderColor: BORDER_GOLD, background: '#1e1e21' }}
    />
  )
}

/** Janela do jogo: barra de título em bisel + corpo (o viewport do carrossel). */
export function JourneyWindow({
  stepLabel,
  children,
}: {
  stepLabel: string
  children: React.ReactNode
}) {
  const t = useT()
  return (
    <div
      className="relative rounded-[4px] border shadow-2xl shadow-black/80"
      style={{ borderColor: BORDER_GOLD, background: PANEL_BG }}
    >
      <CornerPip pos="-top-[4px] -left-[4px]" />
      <CornerPip pos="-top-[4px] -right-[4px]" />
      <CornerPip pos="-bottom-[4px] -left-[4px]" />
      <CornerPip pos="-bottom-[4px] -right-[4px]" />

      {/* Barra de título em bisel */}
      <div className="flex items-center justify-between px-3 h-9 border-b border-black/70 bg-gradient-to-b from-[#2b2b2f] to-[#1a1a1d] rounded-t-[3px]">
        <span className="text-sm font-bold" style={{ color: GOLD_BRIGHT }}>
          <span style={{ color: GOLD }}>⚔</span> {t('Dolrath Journey')}
        </span>
        <span className="text-[11px] font-bold" style={{ color: GOLD_BRIGHT }}>
          {stepLabel}
        </span>
      </div>

      {children}
    </div>
  )
}
