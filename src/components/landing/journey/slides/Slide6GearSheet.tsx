'use client'

// Slide 6 — A ficha equipada: o paperdoll REAL da ficha do personagem
// (anel de EquipmentSlot em volta da figura) com o set tier III montado,
// os stats da ficha (FOR/DEF/AGI/INT/CRÍT + AD/AP/DP) embaixo do anel e,
// à direita, o InventoryPanel REAL do jogo (busca, grade de slots,
// "Slots do Inventário X/10 +", barra de GOLD). Num beat do roteiro, a
// arma IV sai do inventário para o slot de arma — e os stats sobem junto.

import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Sword, Shield, Zap, Brain, Star } from 'lucide-react'
import type { EquipmentSlotType } from '@prisma/client'
import { EquipmentSlot } from '@/components/EquipmentSlot'
import InventoryPanel from '@/components/inventory/InventoryPanel'
import type { InventoryRow } from '@/components/inventory/CharacterItemGrid'
import { getCatalogItemByName } from '@/lib/itemCatalog'
import { applyEnhancementToStats } from '@/lib/enhancementSystem'
import { GOLD, GOLD_BRIGHT, BORDER_GOLD, PANEL_BG } from '@/components/crafting/bdoTheme'
import type { Item } from '@/types/item'
import { useJourney } from '../JourneyContext'
import { useSlideScript } from '../useSlideScript'
import {
  CLASS_GEAR,
  JOURNEY_ENHANCED_GEAR_LEVEL,
  JOURNEY_WEAPON_LEVEL,
  heroBaseStats,
  type JourneySlideProps,
} from '../journeyData'

// 0 gear III no boneco · 1 mochila abre · 2 arma IV auto-equipa · 3 msg · 4 CTA
const TIMES = [0, 1400, 3000, 4200, 5400]

const FRAME = '#8a6d3b'

/** Item real do catálogo no shape da ficha (EquipmentSlot resolve a arte pelo nome). */
function catalogItem(name: string): Item | undefined {
  const c = getCatalogItemByName(name)
  if (!c) return undefined
  return {
    id: `journey-${name}`,
    name: c.name,
    description: c.description,
    image: null,
    type: c.type as Item['type'],
    level: c.level,
    goldPrice: c.goldPrice,
    stats: c.stats as Item['stats'],
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }
}

/** Consumível/material fake no shape de Item (arte resolve por nome em /items). */
function supplyRow(name: string, quantity: number, description: string, stats: Record<string, any> | null, level = 1): InventoryRow {
  return {
    id: `journey-inv-${name}`,
    quantity,
    item: {
      id: `journey-inv-${name}`,
      name,
      description,
      image: null,
      type: 'CONSUMABLE' as Item['type'],
      level,
      goldPrice: 0,
      stats: stats as Item['stats'],
      createdAt: new Date(0),
      updatedAt: new Date(0),
    },
  }
}

/** Nível de aprimoramento por slot (arma IV, set III, acessórios crus). */
function slotLevel(slot: string): number {
  if (slot === 'WEAPON') return JOURNEY_WEAPON_LEVEL
  if (slot === 'NECKLACE' || slot === 'RING_1' || slot === 'RING_2' || slot === 'BELT') return 0
  return JOURNEY_ENHANCED_GEAR_LEVEL
}

const noop = () => {}

export default function Slide6GearSheet({ active, onNext }: JourneySlideProps) {
  const { classId, raceId, heroName, heroArt, visual } = useJourney()
  const { step } = useSlideScript(active, TIMES, { loopDelayMs: 5600 })

  const gear = CLASS_GEAR[classId]
  const weaponEquipped = step >= 2

  const items = useMemo(() => {
    return {
      WEAPON: catalogItem(gear.weapon),
      SHIELD: catalogItem(gear.offhand),
      HELMET: catalogItem('Elmo de Ferro'),
      ARMOR: catalogItem('Couraça de Aço'),
      GLOVES: catalogItem('Manoplas do Sentinela'),
      BOOTS: catalogItem('Grevas de Aço'),
      NECKLACE: catalogItem('Amuleto de Ferro'),
      RING_1: catalogItem('Anel do Duelista'),
      RING_2: catalogItem('Anel do Sentinela'),
    } as Record<string, Item | undefined>
  }, [gear])

  // Soma dos bônus do gear equipado (stats REAIS do catálogo × multiplicador do
  // nível, o mesmo cálculo da ficha) — a arma só conta depois de equipada.
  const eq = useMemo(() => {
    const totals = { str: 0, agi: 0, int: 0, def: 0 }
    for (const [slot, item] of Object.entries(items)) {
      if (!item?.stats) continue
      if (slot === 'WEAPON' && !weaponEquipped) continue
      const s = applyEnhancementToStats(item.stats as Record<string, any>, slotLevel(slot))
      totals.str += s.str || 0
      totals.agi += s.agi || 0
      totals.int += s.int || 0
      totals.def += s.def || 0
    }
    return totals
  }, [items, weaponEquipped])

  const base = heroBaseStats(raceId)

  // Mochila = inventário real: a arma IV (até ser equipada) + suprimentos.
  const invRows = useMemo<InventoryRow[]>(() => {
    const rows: InventoryRow[] = []
    if (!weaponEquipped && items.WEAPON) {
      rows.push({
        id: 'journey-inv-weapon',
        quantity: 1,
        enhancementLevel: JOURNEY_WEAPON_LEVEL,
        item: items.WEAPON,
      })
    }
    rows.push(
      supplyRow('Poção de Vida Grande', 4, 'Restaura 80 HP instantaneamente em combate.', { healAmount: 80, effect: 'instant', battleUsable: true }, 5),
      supplyRow('Poção de Mana', 3, 'Restaura 30 MP instantaneamente em combate.', { manaAmount: 30, effect: 'instant', battleUsable: true }),
      supplyRow('Pedra Negra (Arma)', 2, 'Fragmento de poder antigo. Aprimora armas de +1 a +15 na Mesa de Forja.', null),
      supplyRow('Barra de Ferro', 6, 'Ferro fundido e batido em barra; o esqueleto de todo equipamento incomum.', null),
    )
    return rows
  }, [items, weaponEquipped])

  // Anel de slots da ficha real (coords de character/[characterId]/page.tsx)
  const RING: Array<{ key: string; type: string; top: number; left: number }> = [
    { key: 'HELMET', type: 'HELMET', top: 8, left: 229 },
    { key: 'ARMOR', type: 'ARMOR', top: 76, left: 78 },
    { key: 'NECKLACE', type: 'NECKLACE', top: 76, left: 380 },
    { key: 'WEAPON', type: 'WEAPON', top: 156, left: 44 },
    { key: 'SHIELD', type: 'SHIELD', top: 156, left: 414 },
    { key: 'GLOVES', type: 'GLOVES', top: 236, left: 78 },
    { key: 'RING_1', type: 'RING_1', top: 236, left: 380 },
    { key: 'BOOTS', type: 'BOOTS', top: 304, left: 150 },
    { key: 'BELT', type: 'BELT', top: 304, left: 229 },
    { key: 'RING_2', type: 'RING_2', top: 304, left: 308 },
  ]

  // Linhas de stats no formato exato da ficha (/character/[id])
  const secondary = [
    { icon: <Sword size={16} style={{ color: '#e8d08a' }} />, label: 'FOR', value: Math.round(base.str + eq.str) },
    { icon: <Shield size={16} style={{ color: '#6aa9d6' }} />, label: 'DEF', value: Math.round(base.res + eq.def) },
    { icon: <Zap size={16} style={{ color: '#8fd6e0' }} />, label: 'AGI', value: Math.round(base.agi + eq.agi) },
    { icon: <Brain size={16} style={{ color: '#c3a6ec' }} />, label: 'INT', value: Math.round(base.int + eq.int) },
    { icon: <Star size={16} style={{ color: '#f0c873' }} />, label: 'CRÍT', value: `${((base.agi + eq.agi) * 0.2).toFixed(1)}%` },
  ]

  const mainRows = [
    { icon: <Sword size={16} style={{ color: '#c98a6a' }} />, label: 'Ataque (AD)', base: base.str, bonus: Math.round(eq.str) },
    { icon: <Zap size={16} style={{ color: '#b06ae0' }} />, label: 'Poder Mágico (AP)', base: base.int, bonus: Math.round(eq.int) },
    { icon: <Shield size={16} style={{ color: '#6aa9d6' }} />, label: 'Defesa (DP)', base: base.res, bonus: Math.round(eq.def) },
  ]

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="relative h-full w-full overflow-y-auto md:overflow-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="h-full flex flex-col md:flex-row gap-3 p-3 pt-5 sm:p-4">
          {/* Paperdoll real da ficha + stats */}
          <div
            className="md:w-[58%] rounded-[4px] border overflow-hidden flex flex-col md:overflow-y-auto md:[scrollbar-width:none] md:[&::-webkit-scrollbar]:hidden"
            style={{ borderColor: BORDER_GOLD, background: PANEL_BG }}
          >
            <div className="flex items-center justify-between px-3 h-8 border-b border-black/70 bg-gradient-to-b from-[#2b2b2f] to-[#1a1a1d] shrink-0">
              <span className="text-xs font-bold" style={{ color: GOLD_BRIGHT }}>
                <span style={{ color: GOLD }}>🛡</span> Equipamento · {heroName}
              </span>
              <span className="text-[10px] text-[#8a8a90]">set tier III · arma IV</span>
            </div>

            <div className="relative min-h-[240px] sm:min-h-[260px] md:min-h-[280px] flex items-start justify-center overflow-hidden py-2 pointer-events-none">
              <div
                className="relative shrink-0 origin-top scale-[0.58] min-[420px]:scale-[0.64] sm:scale-[0.68] lg:scale-[0.72]"
                style={{ width: 512, height: 392 }}
              >
                {/* figura central: a arte do herói */}
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    top: 24, left: '50%', transform: 'translateX(-50%)', width: 150, height: 272,
                    background: `radial-gradient(70% 50% at 50% 20%, ${visual.raceVisual.accent}1f, transparent 60%)`,
                    zIndex: 1,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroArt}
                    alt={heroName}
                    style={{ width: 142, height: 264, objectFit: 'cover', borderRadius: 6, opacity: 0.96 }}
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div
                  className="absolute"
                  style={{ top: 290, left: '50%', transform: 'translateX(-50%)', width: 120, height: 16, background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 70%)', zIndex: 0 }}
                />

                {RING.map(s => {
                  const isWeapon = s.type === 'WEAPON'
                  const item = isWeapon ? (weaponEquipped ? items.WEAPON : undefined) : items[s.type]
                  const level = item ? slotLevel(s.type) : 0
                  return (
                    <div key={s.key} style={{ position: 'absolute', top: s.top, left: s.left, zIndex: 2 }}>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.15 + RING.findIndex(r => r.key === s.key) * 0.07, type: 'spring', stiffness: 260, damping: 18 }}
                        className={isWeapon && !weaponEquipped ? 'animate-pulse' : undefined}
                        style={
                          isWeapon && weaponEquipped
                            ? { filter: 'drop-shadow(0 0 10px rgba(231,198,130,0.7))' }
                            : undefined
                        }
                      >
                        <EquipmentSlot
                          compact
                          accent={FRAME}
                          type={s.type as EquipmentSlotType}
                          item={item}
                          enhancementLevel={item ? level : 0}
                          onEquip={noop}
                          onUnequip={noop}
                        />
                      </motion.div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Seletor de forma da ficha (estático na landing) */}
            <div className="flex items-center justify-center shrink-0" style={{ gap: 10, marginTop: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: visual.borderColor, letterSpacing: '0.3px' }}>
                Forma Original
              </span>
              <div className="flex items-center" style={{ gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: visual.borderColor, boxShadow: `0 0 8px ${visual.borderColor}` }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(255,255,255,0.25)' }} />
              </div>
            </div>

            {/* Atributos secundários (FOR/DEF/AGI/INT/CRÍT) — mesma faixa da ficha.
                O gear entra na soma; equipar a arma IV faz os números subirem. */}
            <div className="flex justify-center shrink-0" style={{ gap: 16, padding: '8px 14px 10px', marginTop: 4, background: '#19191c', borderTop: '1px solid rgba(0,0,0,0.6)' }}>
              {secondary.map(a => (
                <div key={a.label} className="flex flex-col items-center" style={{ gap: 3 }}>
                  {a.icon}
                  <motion.span
                    key={`${a.label}-${a.value}`}
                    initial={{ scale: 1.25, color: '#86efac' }}
                    animate={{ scale: 1, color: '#dcdce0' }}
                    transition={{ duration: 0.5 }}
                    className="tabular-nums"
                    style={{ fontSize: 13, fontWeight: 700 }}
                  >
                    {a.value}
                  </motion.span>
                  <span style={{ fontSize: '9px', color: '#77777d', letterSpacing: '0.14em' }}>{a.label}</span>
                </div>
              ))}
            </div>

            {/* Stats principais (AD/AP/DP): base + bônus verde dos equipamentos,
                como na ficha real. */}
            <div className="shrink-0" style={{ padding: '2px 18px 8px', borderTop: '1px solid rgba(0,0,0,0.6)' }}>
              {mainRows.map((row, i, arr) => (
                <div key={row.label} className="flex items-center justify-between" style={{ padding: '6px 0', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <span style={{ fontSize: 9, color: GOLD }}>✦</span>
                    {row.icon}
                    <span style={{ fontSize: 12.5, color: '#c9c9ce' }}>{row.label}</span>
                  </div>
                  <div className="flex items-baseline" style={{ gap: 6 }}>
                    <span className="tabular-nums" style={{ fontSize: 18, fontWeight: 700, color: '#ece7da' }}>{row.base}</span>
                    {row.bonus > 0 && (
                      <motion.span
                        key={`${row.label}-${row.bonus}`}
                        initial={{ scale: 1.3, opacity: 0.4 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.45 }}
                        className="tabular-nums"
                        style={{ fontSize: 13, fontWeight: 700, color: '#86efac' }}
                      >
                        +{row.bonus}
                      </motion.span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inventário — o painel REAL do jogo (busca, grade, slots, GOLD) */}
          <div className="md:w-[42%] flex flex-col gap-2 min-h-0">
            <InventoryPanel
              items={invRows}
              totalSlots={10}
              accent={visual.borderColor}
              characterId="journey"
              slotLabel="Slots do Inventário"
              onExpand={noop}
              expandTitle="Expandir +5 slots (custo: 1000 GOLD)"
              goldText="1009.0"
            />
            <AnimatePresence>
              {step >= 3 && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[11px] font-bold text-center shrink-0"
                  style={{ color: GOLD_BRIGHT }}
                >
                  {weaponEquipped ? '⚔️ Arma IV equipada — os stats subiram na hora! ' : ''}
                  Gear III dos pés à cabeça: pronto(a) para a próxima masmorra.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>

        {step >= 4 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={onNext}
            className="absolute bottom-3 right-3 z-30 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shadow-[0_0_18px_rgba(233,69,96,0.5)] animate-pulse"
          >
            Voltar à trilha →
          </motion.button>
        )}
      </div>
    </DndProvider>
  )
}
