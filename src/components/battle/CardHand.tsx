'use client'

/**
 * 🃏 MÃO DE CARTAS DO COMBATE — componente PRESENTACIONAL puro (zero fetch, zero regra
 * de jogo), no mesmo espírito de SkillTreePanel/KingdomMap.
 *
 * Substitui visualmente o flyout de texto do CombatShell ("⚔️ Ataque" → lista vertical):
 * cada ação vira uma carta com o DADO dela, o custo e o efeito visíveis de relance. A
 * mecânica não muda em nada — quem monta a lista (DungeonRun no PvE, combat/page no PvP)
 * continua dono do que é jogável, do custo e do que acontece ao jogar (`onPlay`).
 *
 * Por isso `CombatCard` é um SUPERCONJUNTO de `CombatAttackOption` (CombatShell.tsx):
 * os mesmos `key/locked/onPick` mais os campos de apresentação. Migrar uma tela é
 * acrescentar `emoji/tone/die/costLabel`, não reescrever a montagem.
 *
 * 📱 Mobile-first: a fileira rola na horizontal e a carta tem 68×94 px — 4 cartas cabem
 * em 360 px de viewport. Toque = joga; toque LONGO (ou hover no desktop) = abre o
 * detalhe, seguindo o padrão tap/long-press que o combate já adotou no lugar do hover.
 *
 * Estilo chumbo+ouro herdado de crafting/bdoTheme.tsx (a EnhancementDialog é a
 * referência do design system). O tom da moldura diz o PAPEL da carta de longe:
 *   basic (cinza) · class (ouro) · special (roxo, habilidade de forma) · buff (verde).
 */

import { useEffect, useRef, useState } from 'react'
import { BORDER, BORDER_GOLD, GOLD_BRIGHT } from '@/components/crafting/bdoTheme'

/** Papel da carta — define a cor da moldura (leitura instantânea, sem ler o texto). */
export type CombatCardTone = 'basic' | 'class' | 'special' | 'buff'

export type CombatCard = {
  /** id estável (o mesmo `key` do CombatAttackOption) */
  key: string
  /** nome já temperado pela arma/rank (specialDisplayName/classAttackDisplayName) */
  name: string
  emoji: string
  tone: CombatCardTone
  /** lados do dado que a carta rola. Ausente = não rola (buff aplica direto). */
  die?: number
  /** custo curto no canto: '8🔵'. Vazio/ausente = grátis. */
  costLabel?: string
  /** 1 linha de efeito, mostrada no detalhe (toque longo) */
  effectLine?: string
  locked: boolean
  /** por que está travada: 'recarga 2', 'MP'… — aparece na tarja da carta */
  lockReason?: string
  onPlay: () => void
}

/** Molduras por papel — mesma família do BEVEL_VARIANTS do bdoTheme. */
const TONE: Record<CombatCardTone, { border: string; bg: string; glow: string; ink: string }> = {
  basic: {
    border: BORDER,
    bg: 'linear-gradient(180deg, #2b2b2f, #17171a)',
    glow: 'rgba(160,160,170,0.22)',
    ink: '#c9c9ce',
  },
  class: {
    border: BORDER_GOLD,
    bg: 'linear-gradient(180deg, #3a3325, #1e1a12)',
    glow: 'rgba(201,162,95,0.35)',
    ink: GOLD_BRIGHT,
  },
  special: {
    border: '#5b3b8a',
    bg: 'linear-gradient(180deg, #2e2540, #17121f)',
    glow: 'rgba(139,92,246,0.35)',
    ink: '#c9b3ec',
  },
  buff: {
    border: '#2f6b3a',
    bg: 'linear-gradient(180deg, #25351f, #131a0f)',
    glow: 'rgba(74,180,94,0.32)',
    ink: '#a7e8b4',
  },
}

const LONG_PRESS_MS = 420

// Os nomes canônicos das habilidades já vêm com o emoji embutido ("🔥 Sopro de Fogo"),
// enquanto o Ataque de Classe não ("Investida Pesada"). A carta quer os dois separados —
// o emoji é a arte, o resto é a legenda. Congelar os nomes é regra do projeto
// (server/socket-server.js compartilha as strings), então separamos na hora de exibir.
// (o tsconfig do projeto mira es5, então nada de `\p{L}` com a flag `u` aqui)
const WORD_CHAR = /[A-Za-zÀ-ÿ0-9]/

/** Separa o emoji do começo do nome; sem emoji, usa `fallback`. */
export function splitCardEmoji(name: string, fallback: string): { emoji: string; label: string } {
  const i = name.indexOf(' ')
  // O primeiro token é emoji quando não tem NENHUMA letra/dígito ("🛡️" sim, "Investida" não).
  if (i > 0 && !WORD_CHAR.test(name.slice(0, i))) {
    return { emoji: name.slice(0, i), label: name.slice(i + 1) }
  }
  return { emoji: fallback, label: name }
}

export default function CardHand({
  cards,
  className = '',
}: {
  cards: CombatCard[]
  className?: string
}) {
  // Carta com o detalhe aberto (toque longo / hover). null = nenhuma.
  const [detailKey, setDetailKey] = useState<string | null>(null)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Marca que o toque LONGO já abriu o detalhe: o clique que vem depois não deve jogar.
  const longPressed = useRef(false)

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  useEffect(() => clearPress, [])

  // Uma carta que sai da mão (ou trava) não pode deixar um detalhe órfão na tela.
  useEffect(() => {
    if (detailKey && !cards.some(c => c.key === detailKey)) setDetailKey(null)
  }, [cards, detailKey])

  if (cards.length === 0) return null

  return (
    <div className={`relative w-full ${className}`}>
      {/* pt-2 dá o espaço pro card "levantar" no hover sem ser cortado pelo overflow */}
      <div className="flex items-end justify-center gap-1.5 overflow-x-auto overscroll-x-contain px-1 pt-2 pb-0.5">
        {cards.map(card => {
          const tone = TONE[card.tone]
          const open = detailKey === card.key

          const startPress = () => {
            longPressed.current = false
            clearPress()
            pressTimer.current = setTimeout(() => {
              longPressed.current = true
              setDetailKey(card.key)
            }, LONG_PRESS_MS)
          }

          return (
            <div key={card.key} className="relative shrink-0">
              {open && (
                <div
                  className="absolute bottom-full left-1/2 z-50 mb-2 w-52 -translate-x-1/2 rounded-[4px] border p-2.5 shadow-2xl shadow-black/70"
                  style={{ borderColor: tone.border, background: '#1e1e21' }}
                >
                  <div className="text-[11px] font-semibold" style={{ color: tone.ink }}>
                    {card.emoji} {card.name}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] text-[#8a8a90]">
                    {card.die != null && <span>🎲 d{card.die}</span>}
                    <span>{card.costLabel || 'grátis'}</span>
                  </div>
                  {card.effectLine && (
                    <div className="mt-1.5 text-[10px] leading-snug text-[#c9c9ce]">
                      {card.effectLine}
                    </div>
                  )}
                  {card.locked && card.lockReason && (
                    <div className="mt-1.5 text-[10px] font-semibold text-[#e09a3a]">
                      🔒 {card.lockReason}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={card.locked}
                title={card.effectLine || card.name}
                onPointerDown={startPress}
                onPointerUp={clearPress}
                onPointerLeave={() => {
                  clearPress()
                  setDetailKey(k => (k === card.key ? null : k))
                }}
                onPointerCancel={clearPress}
                onContextMenu={e => e.preventDefault()}
                onMouseEnter={() => setDetailKey(card.key)}
                onClick={() => {
                  clearPress()
                  // O clique sintético que segue o toque longo só fecha o detalhe.
                  if (longPressed.current) {
                    longPressed.current = false
                    return
                  }
                  setDetailKey(null)
                  card.onPlay()
                }}
                className={`relative flex h-[94px] w-[68px] flex-col items-center overflow-hidden rounded-[4px] border transition-all sm:h-[108px] sm:w-[80px] ${
                  card.locked
                    ? 'cursor-not-allowed opacity-40 grayscale'
                    : 'hover:-translate-y-1.5 active:translate-y-0'
                }`}
                style={{
                  borderColor: tone.border,
                  background: tone.bg,
                  boxShadow: card.locked
                    ? 'none'
                    : `inset 0 1px 0 rgba(255,255,255,0.10), 0 0 12px ${tone.glow}`,
                }}
              >
                {/* dado (esq.) e custo (dir.) na tarja superior */}
                <div className="flex w-full items-center justify-between px-1 pt-1">
                  <span
                    className="rounded-[2px] border border-black/50 bg-black/45 px-1 font-mono text-[9px] font-bold leading-[1.35]"
                    style={{ color: tone.ink }}
                  >
                    {card.die != null ? `d${card.die}` : '—'}
                  </span>
                  <span className="font-mono text-[9px] font-bold leading-[1.35] text-white/70">
                    {card.costLabel || ''}
                  </span>
                </div>

                <span className="flex flex-1 items-center justify-center text-[26px] leading-none sm:text-[30px]">
                  {card.emoji}
                </span>

                <span
                  className="line-clamp-2 w-full border-t border-black/50 bg-black/40 px-1 py-1 text-center text-[8.5px] font-semibold leading-[1.15] sm:text-[9.5px]"
                  style={{ color: tone.ink }}
                >
                  {card.name}
                </span>

                {card.locked && card.lockReason && (
                  <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-black/75 py-0.5 text-center text-[8.5px] font-bold text-[#e09a3a]">
                    {card.lockReason}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
