'use client'

// Slide 4 — Forja + Processamento + Alquimia lado a lado, com os rigs
// REAIS das bancadas (professionFx) ciclando em cascata. Mensagem-chave:
// os ofícios alimentam a evolução do personagem — culminando no gear +15.

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnvilRig, GrinderRig, NoFailSeal, type RigMaterial } from '@/components/crafting/professionFx'
import { GOLD, GOLD_BRIGHT, BORDER_GOLD, PANEL_BG, type CraftPhase } from '@/components/crafting/bdoTheme'
import AlchemyMiniRig from './AlchemyMiniRig'
import { LootTile, type LootTileDef } from './LootTiles'
import { useSlideScript } from '../useSlideScript'
import type { JourneySlideProps } from '../journeyData'

// 0 forja canaliza · 1 forja pronta · 2 proc canaliza · 3 proc pronto ·
// 4 alq canaliza · 5 alq pronta · 6 balanço do espólio · 7 hold/CTA
const TIMES = [0, 1700, 2600, 4300, 5200, 6900, 7900, 9600]

// Itens REAIS do catálogo — a arte /items/<slug>.webp resolve pelo nome.
const FORGE_MATS: RigMaterial[] = [
  { name: 'Barra de Ferro', emoji: '🧱', have: 4, need: 2 },
  { name: 'Couro Curtido', emoji: '🟤', have: 3, need: 1 },
]
const PROC_MATS: RigMaterial[] = [
  { name: 'Ferro', emoji: '🔩', have: 8, need: 2 },
]
const ALCH_MATS: RigMaterial[] = [
  { name: 'Erva Medicinal', emoji: '🌿', have: 3, need: 1 },
  { name: 'Água Pura', emoji: '💧', have: 2, need: 1 },
  { name: 'Cristal de Mana', emoji: '🔮', have: 2, need: 1 },
]

// Balanço da sessão de craft: os 3 itens obtidos em maior quantidade.
const HAUL_TILES: LootTileDef[] = [
  { name: 'Barra de Ferro', emoji: '🧱', label: 'Barra de Ferro ×12', rarity: 'COMMON' },
  { name: 'Couro Curtido', emoji: '🟤', label: 'Couro Curtido ×8', rarity: 'COMMON' },
  { name: 'Poção de Vida', emoji: '🧪', label: 'Poção de Vida ×6', rarity: 'COMMON' },
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
  { key: 'forge', icon: '🔨', title: 'Forja', chargeStep: 0, materials: FORGE_MATS, outputName: 'Couraça de Aço', outputEmoji: '🛡️', hint: 'Craft e reparo de gear' },
  { key: 'proc', icon: '⚙️', title: 'Processamento', chargeStep: 2, materials: PROC_MATS, outputName: 'Barra de Ferro', outputEmoji: '🧱', hint: 'Refina insumos brutos' },
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

      {/* Bancadas: empilhadas com rolagem vertical no mobile, 3 colunas no desktop */}
      <div className="flex-1 min-h-0 flex flex-col md:grid md:grid-cols-3 gap-3 px-3 pb-2 overflow-y-auto md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {BENCHES.map(bench => {
          const auto = benchPhase(step, bench.chargeStep)
          const phase = manual?.key === bench.key ? manual.phase : auto
          const chargeId = manual?.key === bench.key ? 1000 + manual.id : cycle * 10 + bench.chargeStep
          return (
            <button
              key={bench.key}
              onClick={() => setManual({ key: bench.key, phase: 'charging', id: Date.now() })}
              className="relative shrink-0 w-full md:w-auto rounded-lg border text-left overflow-hidden"
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

      {/* Balanço do espólio: os 3 itens obtidos em maior quantidade */}
      <div className="shrink-0 px-3 pb-3">
        <AnimatePresence>
          {step >= 6 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-2xl rounded-lg border px-3 py-2.5"
              style={{ borderColor: GOLD_BRIGHT, background: PANEL_BG, boxShadow: '0 0 22px rgba(231,198,130,0.3)' }}
            >
              <div className="flex flex-col sm:flex-row items-center gap-2.5">
                <div className="grid grid-cols-1 min-[430px]:grid-cols-3 gap-2 flex-1 w-full">
                  {HAUL_TILES.map((t, i) => (
                    <LootTile key={t.name} tile={t} delay={0.12 * i} />
                  ))}
                </div>
                <div className="flex flex-col items-center sm:items-end gap-1.5 shrink-0">
                  <span className="text-xs font-black" style={{ color: GOLD_BRIGHT }}>
                    Prontos para mais uma masmorra — e mais gold! 💰
                  </span>
                  {step >= 7 && (
                    <motion.button
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={onNext}
                      className="px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
                    >
                      Aprimorar a arma →
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
