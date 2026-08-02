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
import type { TFunction } from '@/lib/i18n/t'

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

export const RACE_HERO: Record<JourneyRaceId, { name: string }> = {
  draconiano: { name: 'Gorrak' },
  elfo: { name: 'Lyra' },
  humano: { name: 'Aldric' },
  metamorfo: { name: 'Kaira' },
}

/**
 * Arte das 16 combinações raça×classe (`public/character-seeds/`) — é ela que
 * sustenta a promessa do slide 1: a imagem sai da SUA combinação, não de uma
 * prateleira de 4 artes prontas.
 *
 * ⚠️ Os nomes NÃO seguem um template único, então não monte a string na mão:
 * 9 combinações nasceram do gerador (`<raça>-<classe>.webp`) e 7 foram
 * exportadas de personagens reais do banco, com o nome do herói na frente
 * (`drakmon-draconiano-warrior.webp`). Um template ingênuo dá 404 em 7 das 16.
 * Fontes: scripts/{missing,existing}-character-image-manifest.json.
 *
 * `transformed` é a arte da forma da raça (dragão/celestial/7º sentido/urso).
 * Metamorfo+Monge é a exceção: a folha exportada veio com sufixo `-default`.
 */
export const COMBO_ART: Record<string, { art: string; transformed: string }> = {
  'draconiano-warrior': {
    art: '/character-seeds/drakmon-draconiano-warrior.webp',
    transformed: '/character-seeds/drakmon-draconiano-warrior-dragon.webp',
  },
  'draconiano-rogue': {
    art: '/character-seeds/demond-draconiano-rogue.webp',
    transformed: '/character-seeds/demond-draconiano-rogue-dragon.webp',
  },
  'draconiano-mage': {
    art: '/character-seeds/noatasrk-draconiano-mage.webp',
    transformed: '/character-seeds/noatasrk-draconiano-mage-dragon.webp',
  },
  'draconiano-monk': {
    art: '/character-seeds/drakark-draconiano-monk.webp',
    transformed: '/character-seeds/drakark-draconiano-monk-dragon.webp',
  },
  'elfo-warrior': {
    art: '/character-seeds/elfo-warrior.webp',
    transformed: '/character-seeds/elfo-warrior-celestial.webp',
  },
  'elfo-rogue': {
    art: '/character-seeds/arkantos-elfo-rogue.webp',
    transformed: '/character-seeds/arkantos-elfo-rogue-celestial.webp',
  },
  'elfo-mage': {
    art: '/character-seeds/elfo-mage.webp',
    transformed: '/character-seeds/elfo-mage-celestial.webp',
  },
  'elfo-monk': {
    art: '/character-seeds/elfo-monk.webp',
    transformed: '/character-seeds/elfo-monk-celestial.webp',
  },
  'humano-warrior': {
    art: '/character-seeds/humano-warrior.webp',
    transformed: '/character-seeds/humano-warrior-seventh_sense.webp',
  },
  'humano-rogue': {
    art: '/character-seeds/humano-rogue.webp',
    transformed: '/character-seeds/humano-rogue-seventh_sense.webp',
  },
  'humano-mage': {
    art: '/character-seeds/amir-humano-mage.webp',
    transformed: '/character-seeds/amir-humano-mage-seventh_sense.webp',
  },
  'humano-monk': {
    art: '/character-seeds/humano-monk.webp',
    transformed: '/character-seeds/humano-monk-seventh_sense.webp',
  },
  'metamorfo-warrior': {
    art: '/character-seeds/metamorfo-warrior.webp',
    transformed: '/character-seeds/metamorfo-warrior-bear.webp',
  },
  'metamorfo-rogue': {
    art: '/character-seeds/metamorfo-rogue.webp',
    transformed: '/character-seeds/metamorfo-rogue-bear.webp',
  },
  'metamorfo-mage': {
    art: '/character-seeds/metamorfo-mage.webp',
    transformed: '/character-seeds/metamorfo-mage-bear.webp',
  },
  'metamorfo-monk': {
    art: '/character-seeds/sotarkan-metamorfo-monk.webp',
    transformed: '/character-seeds/sotarkan-metamorfo-monk-default.webp',
  },
}

// Classe "clássica" de cada raça. NÃO trava mais o seletor do slide 1 (a arte
// existe nas 16 combinações) — sobrou como o casamento que monta o oponente de
// PvP em `buildPvpOpponent`. O mapa inverso (CANON_RACE) morreu junto do trava.
export const CANON_CLASS: Record<JourneyRaceId, JourneyClassId> = {
  humano: 'mage',
  elfo: 'rogue',
  draconiano: 'warrior',
  metamorfo: 'monk',
}

/** Forma de transformação de cada raça (ids de TRANSFORMATION_ART/transformationSystem).
    Metamorfo = URSO: é a forma da arte metamorfo_transformed.png (Kaira vira um urso). */
export const FORM_BY_RACE: Record<JourneyRaceId, string> = {
  humano: 'seventh_sense',
  elfo: 'celestial',
  draconiano: 'dragon',
  metamorfo: 'bear',
}

// Nomes EN canônicos (chaves do dicionário) — os slides renderizam via t().
export const FORM_LABEL: Record<JourneyRaceId, { emoji: string; name: string; glow: string }> = {
  humano: { emoji: '✨', name: 'Seventh Sense', glow: '#e2e8f0' },
  elfo: { emoji: '🌟', name: 'Celestial Form', glow: '#fbbf24' },
  draconiano: { emoji: '🐉', name: 'Dragon', glow: '#ef4444' },
  metamorfo: { emoji: '🐻', name: 'Bear', glow: '#d97706' },
}

/** Especial de forma (mesmos action ids de transformationSpecials → AbilityFX). */
export const FORM_SPECIAL_ACTION: Record<JourneyRaceId, string> = {
  draconiano: 'dragon_breath',
  metamorfo: 'unstoppable_charge',
  humano: 'cosmo_burst',
  elfo: 'super_nova',
}

export const FORM_SPECIAL_NAME: Record<JourneyRaceId, string> = {
  draconiano: '🔥 Fire Breath',
  metamorfo: '💥 Unstoppable Charge',
  humano: '🌌 Cosmo Burst',
  elfo: '💥 Super Nova',
}

// ---------- Prompts (vitrine da landing) ----------
// EN canônico (espelha os prompts REAIS de characterImagePrompt.ts); a versão
// PT vive no dicionário — os slides fazem t(prompt) ANTES de fatiar.

export const RACE_PROMPT: Record<JourneyRaceId, string> = {
  draconiano:
    'Draconic heritage: subtle dragon scales on the arms, jaw and brow, reptilian eyes, ' +
    'an ember glow beneath the skin and an imposing bearing that hints at the sleeping dragon. ' +
    'Palette: deep crimson and molten gold.',
  metamorfo:
    'Shapeshifter heritage: a fully human adventurer in normal form — no fur, claws or ' +
    'animal traits; only the feral presence and watchful eyes betray the beast they can become. ' +
    'Palette: moss green and bone.',
  humano:
    'Human heritage: a determined, adaptable adventurer with expressive features and a resilient bearing, ' +
    'an inner spark announcing the awakening of the 7th Sense. Palette: warm amber and steel blue.',
  elfo:
    'Elven heritage: elegant, ethereal features, long pointed ears, luminous eyes and a graceful ' +
    'arcane beauty, with a faint astral glow hinting at the Celestial Form. Palette: silver-green and pale gold.',
}

export const CLASS_PROMPT: Record<JourneyClassId, string> = {
  warrior:
    'Warrior class: battle-worn heavy armor, a great melee weapon, ' +
    'a wide and powerful stance, scars and a hardened expression.',
  rogue:
    'Rogue class: light leather armor and hood, daggers or a bow, an agile crouched stance, ' +
    'face in shadow and quick, dangerous body language.',
  mage:
    'Mage class: arcane robes with runic detailing, a glowing staff, vivid magical energy ' +
    'with runes floating around the hands and a sharp, penetrating gaze.',
  monk:
    'Monk class: simple monastic garments with wrapped fists, a disciplined, balanced ' +
    'martial stance, a serene expression and a faint chi energy around the body.',
}

/** Prompt (EN canônico) da arte da forma transformada — só as formas usadas na Jornada. */
export const FORM_PROMPT: Record<JourneyRaceId, string> = {
  draconiano:
    'Draconic ascension: the same character erupting into the ancestral dragon form — crimson and gold ' +
    'scales spreading across the face and arms, reptilian eyes glowing, horns and gusts of fire, ' +
    'a red-orange ember aura. The original outfit remains visible beneath the scales.',
  metamorfo:
    'Mighty bear form: the same character growing into a colossal bear — thick brown fur, ' +
    'a massive torso, enormous claws and an unshakable stance, an amber aura of pure resilience. ' +
    'The original outfit remains on the body, stretched by the new mass.',
  humano:
    'Awakening of the 7th Sense: body, face and outfit stay exactly as in the base art. A white cosmic ' +
    'aura explodes around them: radiant inner light, glowing eyes, galaxies and cosmo stars ' +
    'swirling across the body, hair lifted by sheer power.',
  elfo:
    'Celestial Form: the same character ascending into a being of astral light — golden-white radiance, ' +
    'arcane runes orbiting the body, luminous skin and eyes, translucent angelic beams. ' +
    'The original face and outfit remain clearly visible beneath the light.',
}

/** Estilo travado — 1ª frase de DOLRATH_STYLE_BASE (characterImagePrompt.ts:14). */
export const STYLE_PROMPT =
  'Fantasy RPG portrait in the dark-fantasy world of Dolrath: cinematic digital ' +
  'painting, dramatic volumetric light, moody palette, collectible-art quality.'

/**
 * Prompt EXIBIDO enquanto a arte "é gerada" no slide 1. Espelha o formato real
 * de `buildCombinationPreprompt` (estilo travado → linha da raça → linha da
 * classe, characterImagePrompt.ts:95-99); só vem encurtado, porque o texto
 * inteiro passa de 900 caracteres e levaria ~15s datilografando.
 *
 * Traduz ANTES de fatiar: em PT as frases têm outro comprimento.
 */
export function buildArtPrompt(raceId: JourneyRaceId, classId: JourneyClassId, t: TFunction): string {
  const trim = (s: string, max: number) => {
    if (s.length <= max) return s
    const cut = s.slice(0, max)
    const at = cut.lastIndexOf(' ')
    return `${cut.slice(0, at > 0 ? at : max)}…`
  }
  return [
    trim(t(STYLE_PROMPT), 150),
    `${t('Race: {name}.', { name: t(RACE_LABEL[raceId]) })} ${trim(t(RACE_PROMPT[raceId]), 130)}`,
    `${t('Class: {name}.', { name: t(CLASS_LABEL[classId]) })} ${trim(t(CLASS_PROMPT[classId]), 110)}`,
  ].join('\n')
}

export const RACE_LIST = races
export const CLASS_LIST = CLASSES

export const CLASS_LABEL: Record<JourneyClassId, string> = {
  warrior: 'Warrior',
  rogue: 'Rogue',
  mage: 'Mage',
  monk: 'Monk',
}

export const RACE_LABEL: Record<JourneyRaceId, string> = {
  draconiano: 'Draconian',
  metamorfo: 'Shapeshifter',
  humano: 'Human',
  elfo: 'Elf',
}

// Hints EN canônicos p/ os cards do Slide 1 (os catálogos do jogo ainda são PT;
// aqui a vitrine mostra EN e o dicionário devolve o PT original).
export const RACE_HINT: Record<JourneyRaceId, string> = {
  draconiano: 'Dragon Transformation',
  metamorfo: 'Animal Transformation',
  humano: 'Supreme Adaptability',
  elfo: 'Arcane Mastery',
}

export const CLASS_HINT: Record<JourneyClassId, string> = {
  warrior: 'Battle Fury',
  rogue: 'Sneak Attack',
  mage: 'Fireball',
  monk: 'Iron Fist',
}

export const RACE_TRANSFORM_HINT: Record<JourneyRaceId, string> = {
  draconiano: 'Dragon',
  metamorfo: 'Any Animal',
  humano: '7th Sense Awakening',
  elfo: 'Celestial Form',
}

/** Arma primária + secundária por classe — itens REAIS do catálogo (arte em /items).
 *  weapon/offhand ficam com o nome PT do catálogo (chave que resolve a imagem);
 *  classAttack é EN canônico (dicionário traduz p/ PT no render). */
export const CLASS_GEAR: Record<JourneyClassId, { weapon: string; offhand: string; classAttack: string }> = {
  warrior: { weapon: 'Lâmina do Carrasco', offhand: 'Égide do Baluarte', classAttack: 'Heavy Charge' },
  rogue: { weapon: 'Arco da Tormenta', offhand: 'Adaga de Parada', classAttack: 'Sneak Attack' },
  mage: { weapon: 'Cajado do Bosque Antigo', offhand: 'Orbe de Cristal', classAttack: 'Fireball' },
  monk: { weapon: 'Manoplas da Fera', offhand: 'Talismã do Discípulo', classAttack: 'Triple Strike' },
}

export function classAttackName(classId: JourneyClassId): string {
  return CLASS_GEAR[classId].classAttack
}

export function heroName(raceId: JourneyRaceId): string {
  return RACE_HERO[raceId].name
}

/** Chave do COMBO_ART / dos sprites de caminhada. */
export function comboKey(raceId: JourneyRaceId, classId: JourneyClassId): string {
  return `${raceId}-${classId}`
}

export const JOURNEY_RACE_IDS: JourneyRaceId[] = ['draconiano', 'elfo', 'humano', 'metamorfo']
export const JOURNEY_CLASS_IDS: JourneyClassId[] = ['warrior', 'rogue', 'mage', 'monk']

/**
 * Combinações que o SORTEIO evita. Fora: draconiano+monge — é a única sem
 * boneco de caminhada em `heroSprites.ts`, e o sorteio não deveria empurrar
 * justo ela para a masmorra do slide 3 (escolhida na mão continua valendo; a
 * cena cai no retrato antigo, sem quebrar). Volta pra cá quando a folha existir.
 */
const AUTO_PICK_SKIP = new Set(['draconiano-monk'])

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

/** Combinação inteira no sorteio (visitante parado sem escolher nada). */
export function randomCombo(): JourneyChoice {
  const pool: JourneyChoice[] = []
  for (const raceId of JOURNEY_RACE_IDS) {
    for (const classId of JOURNEY_CLASS_IDS) {
      if (!AUTO_PICK_SKIP.has(comboKey(raceId, classId))) pool.push({ raceId, classId })
    }
  }
  return pickRandom(pool)
}

/** Completa só a metade que falta, preservando a escolha real do visitante. */
export function randomClassFor(raceId: JourneyRaceId): JourneyClassId {
  const pool = JOURNEY_CLASS_IDS.filter(c => !AUTO_PICK_SKIP.has(comboKey(raceId, c)))
  return pickRandom(pool.length ? pool : JOURNEY_CLASS_IDS)
}

export function randomRaceFor(classId: JourneyClassId): JourneyRaceId {
  const pool = JOURNEY_RACE_IDS.filter(r => !AUTO_PICK_SKIP.has(comboKey(r, classId)))
  return pickRandom(pool.length ? pool : JOURNEY_RACE_IDS)
}

export function heroArt(raceId: JourneyRaceId, classId: JourneyClassId): string {
  return COMBO_ART[comboKey(raceId, classId)].art
}

export function heroArtTransformed(raceId: JourneyRaceId, classId: JourneyClassId): string {
  return COMBO_ART[comboKey(raceId, classId)].transformed
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
    avatar: heroArt(choice.raceId, choice.classId),
    hp: opts.hp ?? maxHp,
    maxHp,
    mp: enhanced ? 64 : 40,
    maxMp: enhanced ? 80 : 50,
    stamina: 46,
    maxStamina: 60,
    isTransformed: !!opts.transformed,
    transformationType: opts.transformed ? FORM_BY_RACE[choice.raceId] : null,
    transformationImage: heroArtTransformed(choice.raceId, choice.classId),
    combatStats: enhanced ? { ad: 58, ap: 44, dp: 32 } : { ad: 14, ap: 9, dp: 8 },
    combatStatLabels: { ad: 'ATK', ap: 'DEF', dp: 'STR' },
    equipmentMap: buildEquipment(choice.classId, enhanced),
  }
}

/** Boss real da Floresta Sombria (dados de dungeonAdventures). */
export const FOREST_BOSS = DUNGEONS.floresta.boss
export const BOSS_SHOW_MAX_HP = 160

export function buildBossFighter(hp: number, locale: 'en' | 'pt' = 'en'): FighterView {
  const en = locale === 'en'
  return {
    id: 'boss',
    name: en && FOREST_BOSS.nameEn ? FOREST_BOSS.nameEn : FOREST_BOSS.name,
    level: 10,
    race: en ? 'Gloomwood Forest' : 'Floresta Sombria',
    class: en && FOREST_BOSS.titleEn ? FOREST_BOSS.titleEn : FOREST_BOSS.title,
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

/** Slide 8 — boss fight: golpes normais → TRANSFORMAÇÃO → especial de forma → d20 decisivo.
 *  Recebe t() do slide: os textos são EN canônico e o dicionário traduz p/ PT. */
export function buildBossScript(raceId: JourneyRaceId, t: TFunction): BattleStep[] {
  const form = FORM_LABEL[raceId]
  const name = heroName(raceId)
  const formName = t(form.name)
  return [
    { at: 0, banner: t('The final confrontation of the Gloomwood Forest'), heroHp: 240, foeHp: 160, dice: null, log: t('The Elder of the Grove awakens...') },
    { at: 1600, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'boss', action: 'weapon', defenseAction: 'none', hit: true, damage: 30 }, foeHp: 130, log: t('Your class attack lands true: 30 damage!') },
    { at: 3800, event: { kind: 'resolve', attackerId: 'boss', defenderId: 'hero', action: 'special', defenseAction: 'none', hit: true, damage: 22 }, heroHp: 218, log: t('The Elder answers with corrupted roots: 22 damage.') },
    { at: 6000, event: { kind: 'transform', actorId: 'hero' }, heroTransformed: true, banner: t('{emoji} {name} awakens: {form}!', { emoji: form.emoji, name, form: formName }), log: t('TRANSFORMATION! {emoji} {form} unleashed.', { emoji: form.emoji, form: formName }) },
    { at: 8600, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'boss', action: FORM_SPECIAL_ACTION[raceId], defenseAction: 'none', hit: true, damage: 52 }, foeHp: 78, banner: null, log: t('{special}: 52 damage!', { special: t(FORM_SPECIAL_NAME[raceId]) }) },
    { at: 11000, dice: 'ask', banner: t('Decisive blow — roll the d20!'), log: t('The fate of the fight rides on the dice...') },
    { at: 14200, dice: 'reveal', log: t('🎲 19! Guaranteed critical hit.') },
    { at: 15800, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'boss', action: FORM_SPECIAL_ACTION[raceId], defenseAction: 'none', hit: true, damage: 78, isCritical: true }, foeHp: 0, dice: null, ended: true, banner: null, log: t('CRITICAL! 78 damage — the Corrupted Warden falls.') },
    { at: 17800, loot: true, log: t('The forest goes silent. The treasure is yours.') },
  ]
}

export const PVP_HERO_MAX_HP = 240
export const PVP_FOE_MAX_HP = 230

/** Slide 9 — PvP didático: o oponente TRANSFORMA no meio da luta e mesmo
 *  assim perde, porque o herói tira sorte grande (nat 20) no dado final. */
export function buildPvpScript(choice: JourneyChoice, t: TFunction): BattleStep[] {
  const foeRace = pvpOpponentRace(choice)
  const foeName = heroName(foeRace)
  const foeForm = FORM_LABEL[foeRace]
  const foeFormName = t(foeForm.name)
  const name = heroName(choice.raceId)
  return [
    { at: 0, dice: 'ask', banner: t('Initiative — both players roll a d20'), heroHp: 240, foeHp: 230, log: t('The arena roars. Two heroes, one winner.') },
    { at: 1800, dice: 'reveal', log: t('🎲 19 × 11 — {name} acts first!', { name }) },
    { at: 4200, dice: null, banner: t('⚔️ Your turn — choose an action'), showActions: true, log: t('Your move: Strike, Class Attack or Special.') },
    { at: 6600, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'foe', action: 'weapon', defenseAction: 'none', hit: true, damage: 28 }, foeHp: 202, showActions: false, log: t('Class Attack: 28 damage!') },
    { at: 9000, banner: t("⚔️ Opponent's turn"), event: { kind: 'resolve', attackerId: 'foe', defenderId: 'hero', action: 'weapon', defenseAction: 'none', hit: true, damage: 15 }, heroHp: 225, log: t('{name} counterattacks: 15 damage.', { name: foeName }) },
    { at: 11400, event: { kind: 'transform', actorId: 'foe' }, foeTransformed: true, banner: t('{emoji} {name} awakens: {form}!', { emoji: foeForm.emoji, name: foeName, form: foeFormName }), log: t('{name} transforms — their power surges!', { name: foeName }) },
    { at: 14000, event: { kind: 'resolve', attackerId: 'foe', defenderId: 'hero', action: FORM_SPECIAL_ACTION[foeRace], defenseAction: 'none', hit: true, damage: 34 }, heroHp: 191, log: t("{name}'s form special: 34 damage. The fight tightens!", { name: foeName }) },
    { at: 16600, banner: t('⚔️ Your turn'), showActions: true, log: t('Transformed or not, they bleed. Answer back!') },
    { at: 18800, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'foe', action: 'weapon', defenseAction: 'none', hit: true, damage: 26 }, foeHp: 176, showActions: false, log: t('Class Attack: 26 damage!') },
    { at: 21200, dice: 'ask', banner: t('🎲 Everything on the final roll!'), log: t('One strike. One die. One winner.') },
    { at: 24200, dice: 'reveal', log: t('🎲 NAT 20! Huge luck on the dice!') },
    { at: 25800, event: { kind: 'resolve', attackerId: 'hero', defenderId: 'foe', action: 'special', defenseAction: 'none', hit: true, damage: 176, isCritical: true }, foeHp: 0, dice: null, ended: true, banner: null, log: t('MAX CRITICAL! {name} falls even transformed.', { name: foeName }) },
    { at: 27800, rewards: true, log: t('Victory! Gold, XP and ranking points.') },
  ]
}

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
    ['Vharen the Untamed', '🐉', 2140],
    ['Selune Moonglass', '🧝', 1985],
    ['Bruma', '🐺', 1720],
    ['Sir Aldebrand', '⚔️', 1655],
    ['Nyx of the Daggers', '🧝', 1590],
    ['Korga Bonebreaker', '🐉', 1470],
    ['Iris of the Seventh Veil', '⚔️', 1385],
    ['Fenn the Wanderer', '🐺', 1290],
    ['Maeve Kingsraven', '🧝', 1210],
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
