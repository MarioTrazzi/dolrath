'use client'

// Slide 4 — Forja + Processamento + Alquimia lado a lado, com os rigs
// REAIS das bancadas (professionFx) ciclando em cascata. Mensagem-chave:
// os ofícios alimentam a evolução do personagem — culminando no gear +15.

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnvilRig, GrinderRig, NoFailSeal, type RigMaterial } from '@/components/crafting/professionFx'
import { GOLD, GOLD_BRIGHT, BORDER_GOLD, PANEL_BG, type CraftPhase } from '@/components/crafting/bdoTheme'
import AlchemyMiniRig from './AlchemyMiniRig'
import { useSlideScript } from '../useSlideScript'
import type { JourneySlideProps } from '../journeyData'

// 0 forja canaliza · 1 forja pronta · 2 proc canaliza · 3 proc pronto ·
// 4 alq canaliza · 5 alq pronta · 6 gear sobe p/ +15 · 7 hold
const TIMES = [0, 1700, 2600, 4300, 5200, 6900, 7900, 9600]

const FORGE_MATS: RigMaterial[] = [
  { name: 'Barra de Ferro', emoji: '🔩', have: 4, need: 2 },
  { name: 'Couro Curtido', emoji: '🟤', have: 3, need: 1 },
]
const PROC_MATS: RigMaterial[] = [
  { name: 'Minério de Ferro', emoji: '🪨', have: 8, need: 2 },
]
const ALCH_MATS: RigMaterial[] = [
  { name: 'Extrato de Erva', emoji: '🌿', have: 3, need: 1 },
  { name: 'Água Pura', emoji: '💧', have: 2, need: 1 },
  { name: 'Cristal Moído', emoji: '💠', have: 2, need: 1 },
]

interface BenchDef {
  key: 'forge' | 'proc' | 'alch'
  icon: string
  title: string
  chargeStep: number
  materials: RigMaterial[]
  outputName: string
  outputEmoji: string
  hint: string
}

const BENCHES: BenchDef[] = [
  { key: 'forge', icon: '🔨', title: 'Forja', chargeStep: 0, materials: FORGE_MATS, outputName: 'Espada Longa', outputEmoji: '⚔️', hint: 'Craft e reparo de gear' },
  { key: 'proc', icon: '⚙️', title: 'Processamento', chargeStep: 2, materials: PROC_MATS, outputName: 'Barra de Ferro', outputEmoji: '🔩', hint: 'Refina insumos brutos' },
  { key: 'alch', icon: '⚗️', title: 'Alquimia', chargeStep: 4, materials: ALCH_MATS, outputName: 'Poção de Vida', outputEmoji: '🧪', hint: 'Poções de combate' },
]

function benchPhase(step: number, chargeStep: number): CraftPhase {
  if (step < chargeStep) return 'idle'
  if (step === chargeStep) return 'charging'
  return 'done'
}

export default function Slide4Crafting({ active, onNext }: JourneySlideProps) {
  const { step, cycle } = useSlideScript(active, TIMES, { loopDelayMs: 3800 })
  // Clique numa bancada dispara o craft dela na hora (override local)
  const [manual, setManual] = useState<{ key: string; phase: CraftPhase; id: number } | null>(null)

  useEffect(() => {
    if (!manual || manual.phase !== 'charging') return
    const t = setTimeout(() => setManual(m => (m ? { ...m, phase: 'done' } : m)), 1600)
    return () => clearTimeout(t)
  }, [manual])

  useEffect(() => {
    // Reset do override a cada ciclo do roteiro
    setManual(null)
  }, [cycle])

  const plusLevel = step >= 6 ? 15 : 14

  return (
    <div className="relative h-full w-full flex flex-col overflow-hidden">
      <div className="shrink-0 text-center px-4 pt-12 pb-2">
        <p className="text-sm sm:text-base font-bold text-white">
          Forje, processe e transmute — <span style={{ color: GOLD_BRIGHT }}>tudo alimenta a evolução do seu herói</span>
        </p>
        <p className="text-[11px] text-textsec mt-0.5">
          Nível de profissão é da conta inteira · toque numa bancada para trabalhar
        </p>
      </div>

      {/* Bancadas: faixa com scroll-snap no mobile, 3 colunas no desktop */}
      <div className="flex-1 min-h-0 flex md:grid md:grid-cols-3 gap-3 px-3 pb-2 overflow-x-auto md:overflow-visible snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {BENCHES.map(bench => {
          const auto = benchPhase(step, bench.chargeStep)
          const phase = manual?.key === bench.key ? manual.phase : auto
          const chargeId = manual?.key === bench.key ? 1000 + manual.id : cycle * 10 + bench.chargeStep
          return (
            <button
              key={bench.key}
              onClick={() => setManual({ key: bench.key, phase: 'charging', id: Date.now() })}
              className="relative shrink-0 snap-center w-[86%] sm:w-[330px] md:w-auto rounded-lg border text-left overflow-hidden"
              style={{ borderColor: BORDER_GOLD, background: PANEL_BG }}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-black/60">
                <span className="text-xs font-bold" style={{ color: GOLD_BRIGHT }}>
                  <span style={{ color: GOLD }}>{bench.icon}</span> {bench.title}
                </span>
                <span className="text-[10px] text-[#8a8a90]">{bench.hint}</span>
              </div>
              <div className="relative py-2 origin-top scale-[0.82] sm:scale-90 md:scale-[0.82] lg:scale-90">
                {bench.key === 'forge' && (
                  <AnvilRig
                    phase={phase}
                    chargeId={chargeId}
                    materials={bench.materials}
                    outputName={bench.outputName}
                    outputEmoji={bench.outputEmoji}
                    glowColor="rgba(224,118,58,0.5)"
                    plate={phase === 'done' ? '×1' : null}
                    statusNode={<span className="text-[10px] font-bold text-emerald-300">92% ✓</span>}
                  />
                )}
                {bench.key === 'proc' && (
                  <GrinderRig
                    phase={phase}
                    chargeId={chargeId}
                    materials={bench.materials}
                    outputName={bench.outputName}
                    outputEmoji={bench.outputEmoji}
                    glowColor="rgba(194,206,221,0.5)"
                    plate={phase === 'done' ? '×4' : null}
                    statusNode={<NoFailSeal />}
                  />
                )}
                {bench.key === 'alch' && (
                  <AlchemyMiniRig
                    phase={phase}
                    chargeId={chargeId}
                    materials={bench.materials}
                    outputName={bench.outputName}
                    outputEmoji={bench.outputEmoji}
                  />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {/* Card do gear evoluindo até +15 */}
      <div className="shrink-0 px-3 pb-3 flex items-center justify-center gap-3">
        <div
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg border"
          style={{ borderColor: step >= 6 ? GOLD_BRIGHT : BORDER_GOLD, background: PANEL_BG, boxShadow: step >= 6 ? '0 0 22px rgba(231,198,130,0.35)' : undefined }}
        >
          <span className="grid h-9 w-9 place-items-center border text-lg" style={{ borderColor: BORDER_GOLD, background: '#141210' }}>
            ⚔️
          </span>
          <div>
            <div className="text-xs font-bold text-white">
              Espada Longa{' '}
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={plusLevel}
                  initial={{ scale: 1.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="inline-block font-black"
                  style={{ color: GOLD_BRIGHT }}
                >
                  +{plusLevel}
                </motion.span>
              </AnimatePresence>
            </div>
            <div className="text-[10px] text-[#8a8a90]">Aprimoramento com pedras dropadas nas masmorras</div>
          </div>
          {step >= 6 && (
            <motion.span
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: -6 }}
              className="ml-1 px-1.5 py-0.5 border text-[9px] font-black uppercase tracking-widest"
              style={{ color: GOLD_BRIGHT, borderColor: GOLD_BRIGHT, background: 'rgba(201,162,95,0.12)' }}
            >
              Pronto p/ o boss
            </motion.span>
          )}
        </div>
        {step >= 7 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onNext}
            className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse shrink-0"
          >
            Voltar à run →
          </motion.button>
        )}
      </div>
    </div>
  )
}
