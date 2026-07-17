// ============================================================
// Jornada Dolrath (landing) — dados roteirizados dos slides.
// Mesmo padrão das páginas /dev/*: componentes REAIS do jogo
// (BattleScene, DungeonMap, professionFx) dirigidos por dados
// fake, sem tocar em API/socket/DB.
// ============================================================

import type { BattleEvent, FighterView, EquipmentMap } from '@/components/battle/BattleScene'
import { races } from '@/lib/characterCreationData'
import { CLASSES } from '@/lib/gameData'
import { DUNGEONS } from '@/lib/dungeonAdventures'
import { PVP_TOP10_DOL_SPLIT, PVP_RANK_WIN_POINTS } from '@/lib/pvpRewards'

export type JourneyRaceId = 'draconiano' | 'metamorfo' | 'humano' | 'elfo'
export type JourneyClassId = 'warrior' | 'rogue' | 'mage' | 'monk'

export interface JourneyChoice {
  raceId: JourneyRaceId
  classId: JourneyClassId
}

/** Props padrão de todo slide do carrossel. */
export interface JourneySlideProps {
  active: boolean
  onNext: () => void
}

// ---------- Identidade do herói por raça ----------

export const RACE_HERO: Record<
  JourneyRaceId,
  { name: string; art: string; artTransformed: string }
> = {
  draconiano: { name: 'Gorrak', art: '/dracopvp.png', artTransformed: '/draco_transformed.png' },
  elfo: { name: 'Lyra', art: '/elfopvp.png', artTransformed: '/elfo_transformed.png' },
  humano: { name: 'Aldric', art: '/humanopvp.png', artTransformed: '/humano_transformed.png' },
  metamorfo: { name: 'Kaira', art: '/metamorfo_pvp.png', artTransformed: '/metamorfo_transformed.png' },
}

// Pares canônicos raça↔classe (espelham as artes reais dos NFTs de vitrine —
// a arte do Draconiano É um guerreiro, a da Elfa É uma ladina etc.; travar o
// par garante que a imagem nunca minta sobre a classe).
export const CANON_CLASS: Record<JourneyRaceId, JourneyClassId> = {
  humano: 'mage',
  elfo: 'rogue',
  draconiano: 'warrior',
  metamorfo: 'monk',
}
export const CANON_RACE: Record<JourneyClassId, JourneyRaceId> = {
  mage: 'humano',
  rogue: 'elfo',
  warrior: 'draconiano',
  monk: 'metamorfo',
}

/** Forma de transformação de cada raça (ids de TRANSFORMATION_ART/transformationSystem). */
export const FORM_BY_RACE: Record<JourneyRaceId, string> = {
  humano: 'seventh_sense',
  elfo: 'celestial',
  draconiano: 'dragon',
  metamorfo: 'wolf',
}

export const FORM_LABEL: Record<JourneyRaceId, { emoji: string; name: string; glow: string }> = {
  humano: { emoji: '✨', name: 'Sétimo Sentido', glow: '#e2e8f0' },
  elfo: { emoji: '🌟', name: 'Forma Celestial', glow: '#fbbf24' },
  draconiano: { emoji: '🐉', name: 'Dragão', glow: '#ef4444' },
  metamorfo: { emoji: '🐺', name: 'Lobo', glow: '#93c5fd' },
}

/** Especial de forma (mesmos action ids de transformationSpecials → AbilityFX). */
export const FORM_SPECIAL_ACTION: Record<JourneyRaceId, string> = {
  draconiano: 'dragon_breath',
  metamorfo: 'bite_bleeding',
  humano: 'cosmo_burst',
  elfo: 'super_nova',
}

export const FORM_SPECIAL_NAME: Record<JourneyRaceId, string> = {
  draconiano: '🔥 Sopro de Fogo',
  metamorfo: '🩸 Mordida Sangrenta',
  humano: '🌌 Explosão de Cosmo',
  elfo: '💥 Super Nova',
}

export const RACE_LIST = races
export const CLASS_LIST = CLASSES

export const CLASS_LABEL: Record<JourneyClassId, string> = {
  warrior: 'Guerreiro',
  rogue: 'Ladino',
  mage: 'Mago',
  monk: 'Monge',
}

export const RACE_LABEL: Record<JourneyRaceId, string> = {
  draconiano: 'Draconiano',
  metamorfo: 'Metamorfo',
  humano: 'Humano',
  elfo: 'Elfo',
}

/** Arma primária + secundária por classe — itens REAIS do catálogo (arte em /items). */
export const CLASS_GEAR: Record<JourneyClassId, { weapon: string; offhand: string; classAttack: string }> = {
  warrior: { weapon: 'Lâmina do Carrasco', offhand: 'Égide do Baluarte', classAttack: 'Investida Pesada' },
  rogue: { weapon: 'Arco da Tormenta', offhand: 'Adaga de Parada', classAttack: 'Ataque Furtivo' },
  mage: { weapon: 'Cajado do Bosque Antigo', offhand: 'Orbe de Cristal', classAttack: 'Bola de Fogo' },
  monk: { weapon: 'Manoplas da Fera', offhand: 'Talismã do Discípulo', classAttack: 'Golpe Triplo' },
}

export function classAttackName(classId: JourneyClassId): string {
  return CLASS_GEAR[classId].classAttack
}

export function heroName(raceId: JourneyRaceId): string {
  return RACE_HERO[raceId].name
}

export function heroArt(raceId: JourneyRaceId): string {
  return RACE_HERO[raceId].art
}

/** baseStats reais da raça (mesma fonte da tela de criação). */
export function heroBaseStats(raceId: JourneyRaceId) {
  const race = races.find(r => r.id === raceId)
  return race?.baseStats ?? { str: 10, agi: 10, int: 10, res: 10, hp: 100, mp: 60, crit: 5, speed: 8 }
}

// ---------- FighterView (BattleScene) ----------

// Gear com nomes REAIS do catálogo — o EquipSlot do BattleScene e o
// EquipmentSlot da ficha resolvem a arte /items/<slug>.webp sozinhos.
// enhanced ⇒ nível 18 (tier III) no set inteiro e 19 (tier IV) na ARMA
// (a arma que o slide de Aprimoramento leva de III para IV).
export const JOURNEY_ENHANCED_GEAR_LEVEL = 18 // III
export const JOURNEY_WEAPON_LEVEL = 19 // IV

export function buildEquipment(classId: JourneyClassId, enhanced: boolean): EquipmentMap {
  const gear = CLASS_GEAR[classId]
  const lvl = enhanced ? JOURNEY_ENHANCED_GEAR_LEVEL : 0
  const eq: EquipmentMap = {
    WEAPON: { id: 'w', name: gear.weapon, type: 'WEAPON', enhancementLevel: enhanced ? JOURNEY_WEAPON_LEVEL : 0, stats: { attackDamage: enhanced ? 38 : 8 } },
    SHIELD: { id: 's', name: gear.offhand, type: 'SHIELD', enhancementLevel: lvl, stats: { defense: enhanced ? 22 : 4 } },
    HELMET: { id: 'h', name: 'Elmo de Ferro', type: 'HELMET', enhancementLevel: lvl, stats: { defense: enhanced ? 18 : 3 } },
    ARMOR: { id: 'a', name: 'Couraça de Aço', type: 'ARMOR', enhancementLevel: lvl, stats: { defense: enhanced ? 26 : 5 } },
    GLOVES: { id: 'g', name: 'Manoplas do Sentinela', type: 'GLOVES', enhancementLevel: lvl, stats: { defense: enhanced ? 14 : 2 } },
    BOOTS: { id: 'b', name: 'Grevas de Aço', type: 'BOOTS', enhancementLevel: lvl, stats: { defense: enhanced ? 12 : 2 } },
  }
  if (enhanced) {
    eq.NECKLACE = { id: 'n', name: 'Amuleto de Ferro', type: 'NECKLACE', stats: { attackDamage: 12 } }
    eq.RING_1 = { id: 'r1', name: 'Anel do Duelista', type: 'RING', stats: { attackDamage: 9 } }
    eq.RING_2 = { id: 'r2', name: 'Anel do Sentinela', type: 'RING', stats: { defense: 9 } }
  }
  return eq
}

export function buildHeroFighter(
  choice: JourneyChoice,
  opts: { enhanced?: boolean; hp?: number; maxHp?: number; transformed?: boolean } = {},
): FighterView {
  const enhanced = !!opts.enhanced
  const maxHp = opts.maxHp ?? (enhanced ? 240 : 120)
  return {
    id: 'hero',
    name: heroName(choice.raceId),
    level: enhanced ? 12 : 1,
    race: RACE_LABEL[choice.raceId],
    class: CLASS_LABEL[choice.classId],
    avatar: heroArt(choice.raceId),
    hp: opts.hp ?? maxHp,
    maxHp,
    mp: enhanced ? 64 : 40,
    maxMp: enhanced ? 80 : 50,
    stamina: 46,
    maxStamina: 60,
    isTransformed: !!opts.transformed,
    transformationType: opts.transformed ? FORM_BY_RACE[choice.raceId] : null,
    transformationImage: RACE_HERO[choice.raceId].artTransformed,
    combatStats: enhanced ? { ad: 58, ap: 44, dp: 32 } : { ad: 14, ap: 9, dp: 8 },
    combatStatLabels: { ad: 'ATK', ap: 'DEF', dp: 'STR' },
    equipmentMap: buildEquipment(choice.classId, enhanced),
  }
}

/** Boss real da Floresta Sombria (dados de dungeonAdventures). */
export const FOREST_BOSS = DUNGEONS.floresta.boss
export const BOSS_SHOW_MAX_HP = 160

export function buildBossFighter(hp: number): FighterView {
  return {
    id: 'boss',
    name: FOREST_BOSS.name,
    level: 10,
    race: 'Floresta Sombria',
    class: FOREST_BOSS.title,
    avatar: FOREST_BOSS.image ?? null,
    avatarEmoji: FOREST_BOSS.emoji,
    hp,
    maxHp: BOSS_SHOW_MAX_HP,
    mp: 0,
    maxMp: 0,
    stamina: 0,
    maxStamina: 0,
    combatStats: { ad: 34, ap: 20 },
    combatStatLabels: { ad: 'ATK', ap: 'DEF' },
  }
}

/** Raça do oponente de PvP: Gorrak (draconiano); se o herói FOR o draconiano, Lyra (elfa). */
export function pvpOpponentRace(choice: JourneyChoice): JourneyRaceId {
  return choice.raceId === 'draconiano' ? 'elfo' : 'draconiano'
}

/** Oponente de PvP com gear real; `transformed` liga a forma no meio da luta. */
export function buildPvpOpponent(
  choice: JourneyChoice,
  hp: number,
  maxHp: number,
  opts: { transformed?: boolean } = {},
): FighterView {
  const raceId = pvpOpponentRace(choice)
  const classId = CANON_CLASS[raceId]
  return {
    ...buildHeroFighter({ raceId, classId }, { enhanced: true, hp, maxHp, transformed: opts.transformed }),
    id: 'foe',
    level: 13,
  }
}

// ---------- Roteiros de combate (BattleEvent sem id; o slide numera) ----------

export type ScriptedEvent = Omit<BattleEvent, 'id'>

export interface BattleStep {
  /** Momento (ms desde o início do ciclo) em que o passo dispara. */
  at: number
  event?: ScriptedEvent
  /** Snapshot de HP APÓS o passo (ausente = mantém). */
  heroHp?: number
  foeHp?: number
  /** Faixa de turno/etapa exibida no topo. */
  banner?: string | null
  log?: string
  /** Slide 6: 'ask' mostra o painel do d20; 'reveal' crava o resultado. */
  dice?: 'ask' | 'reveal' | null
  /** Slide 7: barra de ações visível (vez do jogador). */
  showActions?: boolean
  /** Liga a forma transformada do lutador a partir deste passo. */
  heroTransformed?: boolean
  foeTransformed?: boolean
  ended?: boolean
  loot?: boolean
  rewards?: boolean
}

export const BOSS_HERO_MAX_HP = 240

/** Slide 6 — boss fight: {hero} +15 vs Anciã da Mata. */
export const BOSS_SCRIPT: BattleStep[] = [
  { at: 0, banner: 'O confronto final da Floresta Sombria', heroHp: 240, foeHp: 160, dice: null, log: 'A Anciã da Mata desperta...' },
  { at: 1600, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'boss', action: 'weapon', defenseAction: 'none', hit: true, damage: 34 }, foeHp: 126, log: 'Seu golpe de classe acerta em cheio: 34 de dano!' },
  { at: 3800, event: { kind: 'resolve', attackerId: 'boss', defenderId: 'hero', action: 'special', defenseAction: 'none', hit: true, damage: 18 }, heroHp: 222, log: 'A Anciã responde com raízes corrompidas: 18 de dano.' },
  { at: 6000, event: { kind: 'item', actorId: 'hero', itemName: 'Poção de Vida Maior', hpRestored: 18 }, heroHp: 240, log: 'Você bebe uma Poção de Vida Maior (+18 HP).' },
  { at: 7800, dice: 'ask', banner: 'Golpe decisivo — role o d20!', log: 'O destino da luta está no dado...' },
  { at: 11000, dice: 'reveal', log: '🎲 19! Acerto crítico garantido.' },
  { at: 12600, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'boss', action: 'weapon', defenseAction: 'none', hit: true, damage: 61, isCritical: true }, foeHp: 65, dice: null, log: 'CRÍTICO! 61 de dano — a Anciã cambaleia!' },
  { at: 15000, event: { kind: 'resolve', attackerId: 'boss', defenderId: 'hero', action: 'weapon', defenseAction: 'none', hit: false, damage: 0 }, log: 'Você esquiva do golpe desesperado!' },
  { at: 17000, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'boss', action: 'weapon', defenseAction: 'none', hit: true, damage: 65 }, foeHp: 0, ended: true, log: 'Golpe final! A Guardiã Corrompida tomba.' },
  { at: 18800, loot: true, banner: null, log: 'A floresta silencia. O tesouro é seu.' },
]

export const PVP_HERO_MAX_HP = 240
export const PVP_FOE_MAX_HP = 230

/** Slide 7 — PvP didático por turnos. */
export const PVP_SCRIPT: BattleStep[] = [
  { at: 0, dice: 'ask', banner: 'Iniciativa — os dois jogadores rolam d20', heroHp: 240, foeHp: 230, log: 'A arena ruge. Dois heróis, um vencedor.' },
  { at: 1800, dice: 'reveal', log: '🎲 19 × 11 — você age primeiro!' },
  { at: 4200, dice: null, banner: '⚔️ Seu turno — escolha uma ação', showActions: true, log: 'Sua vez: Golpe, Ataque de Classe ou Especial.' },
  { at: 6600, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'foe', action: 'weapon', defenseAction: 'none', hit: true, damage: 28 }, foeHp: 202, showActions: false, log: 'Ataque de Classe: 28 de dano!' },
  { at: 9000, banner: '🛡️ Turno do oponente', event: { kind: 'resolve', attackerId: 'foe', defenderId: 'hero', action: 'weapon', defenseAction: 'none', hit: true, damage: 15 }, heroHp: 225, log: 'O oponente contra-ataca: 15 de dano.' },
  { at: 11400, banner: '⚔️ Seu turno', showActions: true, log: 'Os turnos alternam — cada escolha conta.' },
  { at: 13400, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'foe', action: 'weapon', defenseAction: 'none', hit: true, damage: 44, isCritical: true }, foeHp: 158, showActions: false, log: 'CRÍTICO! 44 de dano!' },
  { at: 15800, banner: '🛡️ Turno do oponente', event: { kind: 'resolve', attackerId: 'foe', defenderId: 'hero', action: 'basic', defenseAction: 'none', hit: false, damage: 0 }, log: 'Você esquiva por um triz!' },
  { at: 18000, banner: '⚔️ Seu turno', event: { kind: 'resolve', attackerId: 'hero', defenderId: 'foe', action: 'special', defenseAction: 'none', hit: true, damage: 158 }, foeHp: 0, ended: true, log: 'Especial de forma encerra a luta!' },
  { at: 20000, rewards: true, banner: null, log: 'Vitória! Ouro, XP e pontos de ranking.' },
]

// ---------- Slide 8: ranking fake + premiação real ----------

export const RANK_POOL_DOL = 1000
export { PVP_TOP10_DOL_SPLIT, PVP_RANK_WIN_POINTS }

export interface RankRow {
  rank: number
  name: string
  emoji: string
  points: number
  /** Linha do herói do visitante (destacada). */
  isHero?: boolean
}

/** Top 10 ilustrativo — o herói do visitante entra em #3. */
export function buildRankRows(choice: JourneyChoice): RankRow[] {
  const hero = heroName(choice.raceId)
  const raceEmoji: Record<JourneyRaceId, string> = {
    draconiano: '🐉', elfo: '🧝', humano: '⚔️', metamorfo: '🐺',
  }
  const others: [string, string, number][] = [
    ['Vharen, o Indomável', '🐉', 2140],
    ['Selune Vidraluna', '🧝', 1985],
    ['Bruma', '🐺', 1720],
    ['Sir Aldebrand', '⚔️', 1655],
    ['Nyx das Adagas', '🧝', 1590],
    ['Korga Quebra-Ossos', '🐉', 1470],
    ['Iris do Sétimo Véu', '⚔️', 1385],
    ['Fenn, o Errante', '🐺', 1290],
    ['Maeve Corvo-Real', '🧝', 1210],
  ]
  const rows: RankRow[] = []
  let oi = 0
  for (let rank = 1; rank <= 10; rank++) {
    if (rank === 3) {
      rows.push({ rank, name: hero, emoji: raceEmoji[choice.raceId], points: 1860, isHero: true })
    } else {
      const [name, emoji, points] = others[oi++]
      rows.push({ rank, name, emoji, points })
    }
  }
  return rows
}
