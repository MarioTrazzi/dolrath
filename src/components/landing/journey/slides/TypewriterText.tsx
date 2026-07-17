'use client'

// Painel-terminal que "digita" um trecho de prompt (efeito typewriter).
// Usado nos slides 1 e 2 para mostrar o prompt REAL que gera a arte do
// personagem — alusão a "o jogador ajuda a escolher o estilo".

import React, { useEffect, useState } from 'react'
import { BORDER_GOLD, GOLD } from '@/components/crafting/bdoTheme'

export default function TypewriterText({
  text,
  label,
  speedMs = 16,
  className = '',
}: {
  text: string
  label?: string
  speedMs?: number
  className?: string
}) {
  const [shown, setShown] = useState('')

  useEffect(() => {
    setShown('')
    if (!text) return
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setShown(text)
      return
    }
    let i = 0
    const id = setInterval(() => {
      i += 2
      setShown(text.slice(0, i))
      if (i >= text.length) clearInterval(id)
    }, speedMs)
    return () => clearInterval(id)
  }, [text, speedMs])

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
      <p className="font-mono text-[10px] leading-relaxed text-emerald-200/85 break-words">
        <span className="text-emerald-400/70 select-none">&gt; </span>
        {shown}
        <span className="inline-block w-[6px] h-[1em] align-middle ml-0.5 bg-emerald-300/80 animate-pulse" />
      </p>
    </div>
  )
}
