'use client'

// Slide 5 — Aprimoramento REAL: a arma da classe subindo de III (TRI) para
// IV (TET) no miolo fiel da EnhancementDialog — Pedra Negra Mágica
// Concentrada, circuito de chance, moldura em losango (DiamondSlot),
// botão em bisel e o "✨ SUCESSO!".

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DiamondSlot,
  BevelButton,
  chanceColorClass,
  GOLD,
  GOLD_BRIGHT,
  BORDER_GOLD,
  PANEL_BG,
  CHARGE_MS,
} from '@/components/crafting/bdoTheme'
import { itemImagePath } from '@/lib/itemCatalog'
import { ItemThumb } from './LootTiles'
import { useJourney } from '../JourneyContext'
import { useSlideScript } from '../useSlideScript'
import { CLASS_GEAR, type JourneySlideProps } from '../journeyData'

// 0 apresenta · 1 chance/failstacks · 2 forjando (CHARGE_MS) · 3 ✨SUCESSO ·
// 4 placa IV + mensagem · 5 CTA
const TIMES = [0, 1100, 2600, 4400, 5300, 6600]

const STONE = 'Pedra Negra Mágica Concentrada (Arma)'

export default function Slide5Enhancement({ active, onNext }: JourneySlideProps) {
  const { classId, heroName } = useJourney()
  const { step, cycle, advance } = useSlideScript(active, TIMES, { loopDelayMs: 4800 })

  const weapon = CLASS_GEAR[classId].weapon
  const charging = step === 2
  const success = step >= 3
  const chance = success ? 1.0 : 24.0
  const failstacks = success ? 0 : 41

  return (
    <div className="relative h-full w-full overflow-y-auto md:overflow-hidden grid place-items-center p-3">
      <div
        className="w-full max-w-md rounded-[4px] border shadow-2xl shadow-black/70"
        style={{ borderColor: BORDER_GOLD, background: PANEL_BG }}
      >
        {/* Barra de título em bisel (como a dialog real) */}
        <div className="flex items-center justify-between px-3 h-9 border-b border-black/70 bg-gradient-to-b from-[#2b2b2f] to-[#1a1a1d]">
          <span className="text-sm font-bold" style={{ color: GOLD_BRIGHT }}>
            <span style={{ color: GOLD }}>⚒</span> Aprimoramento
          </span>
          <span className="text-[10px] text-[#8a8a90]">Mesa de Forja · {heroName}</span>
        </div>

        <div className="p-4">
          {/* Circuito: pedra → trilha → losango do item */}
          <div className="flex items-center justify-center gap-2.5 sm:gap-4 mb-3">
            {/* Tile do material */}
            <div className="relative shrink-0">
              <div
                className="h-14 w-14 overflow-hidden border p-px shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]"
                style={{ borderColor: BORDER_GOLD, background: '#141210' }}
              >
                <ItemThumb name={STONE} emoji="⚒️" className="text-2xl" />
              </div>
              <span className="absolute -bottom-1.5 -right-1.5 rounded-[2px] border border-black/80 px-1 text-[10px] font-bold bg-[#101012] text-[#e7c682]">
                ×{success ? 2 : 3}
              </span>
            </div>

            {/* Trilha-circuito com nó em losango + chance */}
            <div className="relative flex-1 max-w-[130px] h-px" style={{ background: charging || success ? GOLD : '#3c3c41' }}>
              <span
                className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border bg-[#1e1e21]"
                style={{ borderColor: charging || success ? GOLD : '#3c3c41' }}
              />
              <AnimatePresence>
                {step >= 1 && (
                  <motion.span
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`absolute left-1/2 -top-7 -translate-x-1/2 text-lg font-black ${success ? 'text-red-400' : chanceColorClass(chance / 100)}`}
                  >
                    {chance.toFixed(1)}%
                  </motion.span>
                )}
              </AnimatePresence>
              {charging && (
                <motion.span
                  initial={{ left: '0%' }}
                  animate={{ left: '100%' }}
                  transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                  className="absolute top-1/2 -translate-y-1/2 h-1.5 w-6 rounded-full"
                  style={{ background: GOLD_BRIGHT, boxShadow: `0 0 10px ${GOLD_BRIGHT}` }}
                />
              )}
            </div>

            {/* Losango do item (moldura real da dialog) */}
            <DiamondSlot
              size={124}
              active
              plate={success ? 'IV' : 'III'}
              verdict={success ? 'success' : null}
              charging={charging}
              verdictKey={cycle}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={itemImagePath(weapon)} alt={weapon} className="h-full w-full object-cover" loading="lazy" />
            </DiamondSlot>
          </div>

          {/* Nome + progressão */}
          <div className="text-center mb-3">
            <div className="text-sm font-semibold text-cyan-300">{weapon}</div>
            <div className="flex items-center justify-center gap-3 text-xl font-bold">
              <span className={success ? 'text-gray-500' : 'text-gray-300'}>III</span>
              <span style={{ color: GOLD }}>→</span>
              <span className={success ? 'text-amber-300' : 'text-gray-500'}>IV</span>
            </div>
          </div>

          {/* Chance + failstacks */}
          <AnimatePresence>
            {step >= 1 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-2 gap-2.5 mb-3"
              >
                <div className="rounded-[3px] border border-white/10 bg-black/40 p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wide text-gray-500">Chance de sucesso</div>
                  <div className={`text-lg font-bold ${success ? 'text-red-400' : chanceColorClass(chance / 100)}`}>
                    {chance.toFixed(1)}%
                  </div>
                  <div className="h-3 text-[9px] text-red-300/70">{success ? 'próx.: V · PEN' : ' '}</div>
                </div>
                <div className="rounded-[3px] border border-white/10 bg-black/40 p-2 text-center">
                  <div className="text-[9px] uppercase tracking-wide text-gray-500">Failstacks</div>
                  <div className={`text-lg font-bold ${success ? 'text-gray-500' : 'text-purple-400'}`}>🔥 {failstacks}</div>
                  <div className="h-3 text-[9px] text-white/40">{success ? 'zerado no sucesso' : ' '}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Faixa de forja / veredito */}
          <div className="relative mb-3 min-h-[2.4rem] text-center">
            {charging && (
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 0.7 }}
                className="text-sm font-semibold text-amber-300"
              >
                ⚒️ Forjando...
              </motion.span>
            )}
            {success && (
              <motion.div initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <span className="text-base font-black text-yellow-300">✨ SUCESSO!</span>
                {step >= 4 && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs font-bold text-green-300 mt-0.5"
                  >
                    {weapon} agora é <span className="text-amber-300">IV (TET)</span> — dano em outro patamar.
                  </motion.div>
                )}
              </motion.div>
            )}
          </div>

          <BevelButton
            onClick={() => {
              if (step < 2) advance()
            }}
            busy={charging}
            busyLabel="⚒️ Forjando..."
            disabled={success}
          >
            ⚒️ Aprimoramento
          </BevelButton>
        </div>
      </div>

      {/* CTA */}
      {step >= 5 && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={onNext}
          className="absolute bottom-3 right-3 z-30 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
        >
          Ver a ficha equipada →
        </motion.button>
      )}
    </div>
  )
}
