'use client'

/**
 * 🧪 Página DEV de preview das animações de habilidade da arena (sem auth/DB).
 * Cada botão dispara o BattleEvent correspondente num BattleScene mockado —
 * serve para conferir/ajustar os FX de AbilityFX.tsx sem entrar numa masmorra.
 */

import React, { useRef, useState } from 'react'
import BattleScene, { BattleEvent, FighterView } from '@/components/battle/BattleScene'

const HERO_BASE: FighterView = {
  id: 'hero', name: 'Herói', level: 12, race: 'Elfo', class: 'Monge',
  avatar: null, avatarEmoji: '🥋',
  hp: 180, maxHp: 220, mp: 60, maxMp: 80, stamina: 40, maxStamina: 60,
  combatStats: { ad: 42, ap: 18, dp: 14 },
  combatStatLabels: { ad: 'ATK', ap: 'DEF', dp: 'STR' },
  equipmentMap: {
    WEAPON: { id: 'w', name: 'Manoplas do Sentinela', type: 'GLOVES', enhancementLevel: 3, stats: { attackDamage: 24 } },
    SHIELD: { id: 's', name: 'Escudo do Guardião', type: 'SHIELD', enhancementLevel: 1, stats: { defense: 12 } },
    HELMET: { id: 'h', name: 'Elmo de Ferro', type: 'HELMET', stats: { defense: 8 } },
    ARMOR: { id: 'a', name: 'Peitoral de Ferro', type: 'ARMOR', stats: { defense: 14 } },
    BOOTS: { id: 'b', name: 'Botas de Malha', type: 'BOOTS', stats: { defense: 5 } },
  },
}

const FOE: FighterView = {
  id: 'foe', name: 'Lobo Faminto', level: 10, race: 'Floresta', class: 'Monstro',
  avatar: null, avatarEmoji: '🐺',
  hp: 140, maxHp: 200, mp: 0, maxMp: 0, stamina: 0, maxStamina: 0,
  combatStats: { ad: 30, ap: 12 },
  combatStatLabels: { ad: 'ATK', ap: 'DEF' },
}

type Trigger = { label: string; className?: string; ev: Omit<BattleEvent, 'id'>; heroClass?: string; heroForm?: string }

const T = (label: string, ev: Omit<BattleEvent, 'id'>, heroClass?: string, heroForm?: string): Trigger =>
  ({ label, ev, heroClass, heroForm })

const HIT = { kind: 'resolve' as const, attackerId: 'hero', defenderId: 'foe', defenseAction: 'none', hit: true, damage: 23, isCritical: false }

const GROUPS: { title: string; items: Trigger[] }[] = [
  {
    title: 'Básico + Ataque de Classe',
    items: [
      T('👊 Golpe', { ...HIT, action: 'basic' }),
      T('💥 Investida Pesada (Guerreiro)', { ...HIT, action: 'weapon' }, 'Guerreiro'),
      T('🗡️ Ataque Furtivo (Ladino)', { ...HIT, action: 'weapon' }, 'Ladino'),
      T('🔥 Bola de Fogo (Mago)', { ...HIT, action: 'weapon' }, 'Mago'),
      T('👊 Golpe Triplo (Monge)', { ...HIT, action: 'weapon' }, 'Monge'),
    ],
  },
  {
    title: 'Especiais de forma (dano)',
    items: [
      T('🔥 Sopro de Fogo', { ...HIT, action: 'dragon_breath', damage: 41 }),
      T('🩸 Mordida Sangrenta', { ...HIT, action: 'bite_bleeding', damage: 35 }),
      T('💥 Investida Imparável', { ...HIT, action: 'unstoppable_charge', damage: 38 }),
      T('🌀 Espiral Ascendente', { ...HIT, action: 'ascending_spiral', damage: 45 }),
      T('🌌 Explosão de Cosmo', { ...HIT, action: 'cosmo_burst', damage: 44 }),
      T('💥 Super Nova', { ...HIT, action: 'super_nova', damage: 42 }),
      T('💫 Golpe Atordoante', { ...HIT, action: 'stunning_blow', damage: 28 }),
      T('💫 Stun no monstro (proc)', { kind: 'status', actorId: 'foe', action: 'stun' }),
    ],
  },
  {
    title: 'Buffs de forma (aura no herói)',
    items: [
      T('🛡️ Escama de Dragão', { kind: 'buff', actorId: 'hero', action: 'dragon_scales' }),
      T('🛡️ Pele de Ferro', { kind: 'buff', actorId: 'hero', action: 'bear_guard' }),
      T('😤 Fúria Selvagem', { kind: 'buff', actorId: 'hero', action: 'wild_fury' }),
      T('🌬️ Voo Veloz', { kind: 'buff', actorId: 'hero', action: 'eagle_swift' }),
      T('🧘 Meditação', { kind: 'buff', actorId: 'hero', action: 'meditation' }),
      T('✨ Hyperfoco', { kind: 'buff', actorId: 'hero', action: 'hyperfocus' }),
    ],
  },
  {
    title: 'Monstro ataca / status no herói',
    items: [
      T('🐾 Garra (weapon)', { kind: 'resolve', attackerId: 'foe', defenderId: 'hero', action: 'weapon', defenseAction: 'none', hit: true, damage: 17 }),
      T('😈 Golpe Especial', { kind: 'resolve', attackerId: 'foe', defenderId: 'hero', action: 'special', defenseAction: 'none', hit: true, damage: 26 }),
      T('☠️ Envenenado', { kind: 'status', actorId: 'hero', action: 'poison' }),
      T('🩸 Sangrando', { kind: 'status', actorId: 'hero', action: 'bleed' }),
      T('💫 Atordoado', { kind: 'status', actorId: 'hero', action: 'stun' }),
    ],
  },
  {
    title: 'Momentos',
    items: [
      T('💨 Esquiva do monstro', { kind: 'resolve', attackerId: 'hero', defenderId: 'foe', action: 'weapon', defenseAction: 'none', hit: false, damage: 0 }, 'Monge'),
      T('💨 Esquiva do herói', { kind: 'resolve', attackerId: 'foe', defenderId: 'hero', action: 'basic', defenseAction: 'none', hit: false, damage: 0 }),
      T('✴️ CRÍTICO (Bola de Fogo)', { ...HIT, action: 'weapon', damage: 61, isCritical: true }, 'Mago'),
      T('🐉 Transformação', { kind: 'transform', actorId: 'hero' }, undefined, 'dragon'),
      T('🧪 Poção (item)', { kind: 'item', actorId: 'hero', hpRestored: 40, mpRestored: 15 }),
    ],
  },
]

export default function BattleFxPreview() {
  const counter = useRef(0)
  const [event, setEvent] = useState<BattleEvent | null>(null)
  const [heroClass, setHeroClass] = useState('Monge')
  const [heroForm, setHeroForm] = useState<string | null>(null)

  const hero: FighterView = {
    ...HERO_BASE,
    class: heroClass,
    isTransformed: !!heroForm,
    transformationType: heroForm,
  }

  const fire = (t: Trigger) => {
    if (t.heroClass) setHeroClass(t.heroClass)
    if (t.heroForm) setHeroForm(t.heroForm)
    counter.current += 1
    setEvent({ ...t.ev, id: counter.current })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <BattleScene className="h-[380px] flex-shrink-0" left={hero} right={FOE} currentTurnId="hero" event={event} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
        {GROUPS.map(g => (
          <div key={g.title}>
            <h2 className="text-xs font-black text-white/50 uppercase mb-1.5">{g.title}</h2>
            <div className="flex flex-wrap gap-1.5">
              {g.items.map(t => (
                <button
                  key={t.label}
                  onClick={() => fire(t)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
