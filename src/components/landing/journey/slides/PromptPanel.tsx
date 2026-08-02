'use client'

// Painel-terminal com o prompt que gera a arte do personagem.
//
// ⚠️ Regra que não pode cair: o painel NUNCA muda de altura. Foi por isso que
// a primeira versão de typewriter foi removida daqui — o texto crescendo
// empurrava a imagem e o radar a cada frame. A digitação voltou (o slide 1
// precisa dela para contar que a arte nasce do prompt), mas agora a caixa é
// medida por um CLONE INVISÍVEL do texto completo e a fatia digitada entra
// sobreposta em `absolute`: o efeito é o mesmo e o layout fica parado.
//
// `text` sem `typed` = painel estático de sempre (slide 2 usa assim).

import React from 'react'
import { BORDER_GOLD, GOLD } from '@/components/crafting/bdoTheme'

export default function PromptPanel({
  text,
  typed,
  caret = false,
  label,
  className = '',
}: {
  /** Texto COMPLETO — é ele que reserva a altura da caixa. */
  text: string
  /** Fatia visível. Ausente = mostra tudo (modo estático). */
  typed?: string
  /** Cursor piscando no fim da fatia (enquanto está digitando). */
  caret?: boolean
  label?: string
  className?: string
}) {
  const visible = typed ?? text

  return (
    <div
      className={`rounded-[3px] border px-2.5 py-2 backdrop-blur-md ${className}`}
      style={{ borderColor: BORDER_GOLD, background: 'rgba(12,11,9,0.82)' }}
    >
      {label && (
        <div
          className="text-[9px] font-black uppercase tracking-[0.2em] mb-1"
          style={{ color: GOLD }}
        >
          {label}
        </div>
      )}
      <div className="relative">
        {/* Régua: ocupa a altura do texto inteiro e nunca é lida/vista. */}
        <p className="invisible font-mono text-[9px] leading-relaxed whitespace-pre-line" aria-hidden>
          <span>&gt; </span>
          {text}
        </p>
        <p className="absolute inset-0 font-mono text-[9px] leading-relaxed text-emerald-200/85 whitespace-pre-line break-words">
          <span className="text-emerald-400/70 select-none">&gt; </span>
          {visible}
          {caret && (
            <span
              className="inline-block w-[5px] h-[9px] -mb-[1px] ml-[1px] bg-emerald-300/80 animate-pulse"
              aria-hidden
            />
          )}
        </p>
      </div>
    </div>
  )
}
