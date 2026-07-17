'use client'

// Slide 6 — A ficha equipada: o paperdoll REAL da ficha do personagem
// (anel de EquipmentSlot em volta da figura) com o set tier III montado e,
// na mochila, a arma IV recém-aprimorada + suprimentos. Num beat do
// roteiro, a arma IV "voa" da mochila para o slot de arma.

import React, { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import type { EquipmentSlotType } from '@prisma/client'
import { EquipmentSlot } from '@/components/EquipmentSlot'
import { getCatalogItemByName } from '@/lib/itemCatalog'
import { GOLD, GOLD_BRIGHT, BORDER_GOLD, PANEL_BG } from '@/components/crafting/bdoTheme'
import type { Item } from '@/types/item'
import { LootTile, type LootTileDef } from './LootTiles'
import { useJourney } from '../JourneyContext'
import { useSlideScript } from '../useSlideScript'
import {
  CLASS_GEAR,
  JOURNEY_ENHANCED_GEAR_LEVEL,
  JOURNEY_WEAPON_LEVEL,
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

const SUPPLY_TILES: LootTileDef[] = [
  { name: 'Poção de Vida Grande', emoji: '🧪', label: 'Poção de Vida Grande ×4', rarity: 'RARE' },
  { name: 'Poção de Mana', emoji: '🔵', label: 'Poção de Mana ×3', rarity: 'COMMON' },
  { name: 'Pedra Negra (Arma)', emoji: '⚒️', label: 'Pedra Negra (Arma) ×2', rarity: 'RARE' },
  { name: 'Barra de Ferro', emoji: '🧱', label: 'Barra de Ferro ×6', rarity: 'COMMON' },
]

const noop = () => {}

export default function Slide6GearSheet({ active, onNext }: JourneySlideProps) {
  const { classId, heroName, heroArt, visual } = useJourney()
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

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="relative h-full w-full overflow-y-auto md:overflow-hidden">
        <div className="h-full flex flex-col md:flex-row gap-3 p-3 pt-5 sm:p-4">
          {/* Paperdoll real da ficha */}
          <div
            className="md:w-[58%] rounded-[4px] border overflow-hidden flex flex-col"
            style={{ borderColor: BORDER_GOLD, background: PANEL_BG }}
          >
            <div className="flex items-center justify-between px-3 h-8 border-b border-black/70 bg-gradient-to-b from-[#2b2b2f] to-[#1a1a1d] shrink-0">
              <span className="text-xs font-bold" style={{ color: GOLD_BRIGHT }}>
                <span style={{ color: GOLD }}>🛡</span> Equipamento · {heroName}
              </span>
              <span className="text-[10px] text-[#8a8a90]">set tier III · arma IV</span>
            </div>

            <div className="relative flex-1 min-h-[260px] sm:min-h-[300px] flex items-start justify-center overflow-hidden py-2 pointer-events-none">
              <div
                className="relative shrink-0 origin-top scale-[0.58] min-[420px]:scale-[0.66] sm:scale-[0.72] lg:scale-[0.78]"
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
                  const level = isWeapon
                    ? JOURNEY_WEAPON_LEVEL
                    : s.type === 'NECKLACE' || s.type === 'RING_1' || s.type === 'RING_2' || s.type === 'BELT'
                      ? 0
                      : JOURNEY_ENHANCED_GEAR_LEVEL
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
          </div>

          {/* Mochila */}
          <div
            className="md:w-[42%] rounded-[4px] border overflow-hidden flex flex-col"
            style={{ borderColor: BORDER_GOLD, background: PANEL_BG }}
          >
            <div className="flex items-center justify-between px-3 h-8 border-b border-black/70 bg-gradient-to-b from-[#2b2b2f] to-[#1a1a1d] shrink-0">
              <span className="text-xs font-bold" style={{ color: GOLD_BRIGHT }}>
                <span style={{ color: GOLD }}>🎒</span> Mochila
              </span>
              <span className="text-[10px] text-[#8a8a90]">suprimentos p/ a próxima run</span>
            </div>
            <div className="flex-1 p-2.5 flex flex-col gap-2 min-h-[180px]">
              <AnimatePresence>
                {step >= 1 && !weaponEquipped && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -40, scale: 0.7 }}
                    transition={{ duration: 0.35 }}
                  >
                    <LootTile
                      tile={{ name: gear.weapon, emoji: '⚔️', label: `${gear.weapon} IV`, rarity: 'EPIC', highlight: true }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              {step >= 1 && (
                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2">
                  {SUPPLY_TILES.map((t, i) => (
                    <LootTile key={t.name} tile={t} delay={0.2 + i * 0.1} />
                  ))}
                </div>
              )}
              <AnimatePresence>
                {step >= 3 && (
                  <motion.p
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-auto text-[11px] font-bold text-center"
                    style={{ color: GOLD_BRIGHT }}
                  >
                    {weaponEquipped ? '⚔️ Arma IV equipada! ' : ''}Gear III dos pés à cabeça — pronto(a) para a próxima masmorra.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
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
