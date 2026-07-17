'use client'

// Tiles de item com arte REAL (/items/<slug>.webp) e moldura de raridade —
// réplica da linguagem do card de espólio do DungeonRun (EffectChipList/
// ItemThumb + LOOT_RARITY_RING). Usado nos slides 3, 4, 6 e 8 da Jornada.

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { itemImagePath } from '@/lib/itemCatalog'

export interface LootTileDef {
  name: string
  emoji: string
  label: string
  rarity?: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY'
  /** Drop de destaque (pedra/RARE+): moldura dourada + brilho reforçado. */
  highlight?: boolean
}

export const LOOT_RARITY_RING: Record<string, { ring: string; glow: string; text: string }> = {
  COMMON:    { ring: 'border-zinc-400/50',    glow: 'rgba(161,161,170,0.35)', text: 'text-zinc-300' },
  UNCOMMON:  { ring: 'border-emerald-400/60', glow: 'rgba(52,211,153,0.45)',  text: 'text-emerald-300' },
  RARE:      { ring: 'border-sky-400/60',     glow: 'rgba(56,189,248,0.5)',   text: 'text-sky-300' },
  EPIC:      { ring: 'border-fuchsia-400/70', glow: 'rgba(232,121,249,0.55)', text: 'text-fuchsia-300' },
  LEGENDARY: { ring: 'border-amber-400/70',   glow: 'rgba(251,191,36,0.6)',   text: 'text-amber-300' },
}

export function ItemThumb({
  name,
  emoji,
  className = 'text-base',
}: {
  name: string
  emoji: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (failed) return <span className={className}>{emoji}</span>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={itemImagePath(name)}
      alt={name}
      onError={() => setFailed(true)}
      className="w-full h-full object-contain art-bright"
      referrerPolicy="no-referrer"
    />
  )
}

export function LootTile({ tile, delay = 0 }: { tile: LootTileDef; delay?: number }) {
  const frame = tile.highlight
    ? LOOT_RARITY_RING.LEGENDARY
    : LOOT_RARITY_RING[tile.rarity ?? 'COMMON'] ?? LOOT_RARITY_RING.COMMON
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 300, damping: 18 }}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border-2 ${tile.highlight ? 'bg-amber-400/10' : 'bg-white/5'} ${frame.ring}`}
      style={{ boxShadow: tile.highlight ? `0 0 22px ${frame.glow}, 0 0 8px ${frame.glow}` : `0 0 14px ${frame.glow}` }}
    >
      <span className="w-11 h-11 inline-flex items-center justify-center shrink-0 rounded-lg bg-black/20 text-2xl">
        <ItemThumb name={tile.name} emoji={tile.emoji} className="text-2xl" />
      </span>
      <span className={`text-xs font-bold font-combat leading-tight text-left ${frame.text}`}>
        {tile.label}
      </span>
    </motion.div>
  )
}

export default function LootTiles({ tiles, className = '' }: { tiles: LootTileDef[]; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-2 ${className}`}>
      {tiles.map((t, i) => (
        <LootTile key={t.name} tile={t} delay={0.15 + i * 0.12} />
      ))}
    </div>
  )
}
