'use client'

// Painel-terminal ESTÁTICO com o trecho de prompt que gera a arte do
// personagem — texto completo já escrito, sem typewriter: o painel nunca
// muda de altura nem mexe nos elementos ao redor.

import React from 'react'
import { BORDER_GOLD, GOLD } from '@/components/crafting/bdoTheme'

export default function PromptPanel({
  text,
  label,
  className = '',
}: {
  text: string
  label?: string
  className?: string
}) {
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
      <p className="font-mono text-[9px] leading-relaxed text-emerald-200/85 break-words">
        <span className="text-emerald-400/70 select-none">&gt; </span>
        {text}
      </p>
    </div>
  )
}
