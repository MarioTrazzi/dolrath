// ============================================================
// Definições das 4 masmorras temáticas de Dolrath
// - Floresta Sombria, Caverna de Cristal, Pântano Maldito, Ruínas Arcanas
// - Cada uma com monstros, boss, tabela de eventos d20 e identidade visual
// - Usado pela experiência nova de masmorras (DungeonRun + BattleScene)
// ============================================================

import { getDungeonConsumables, rollEquipmentDrop, getCommonForgeMaterials, type Rarity } from './itemCatalog'
import { pickIngredient } from './alchemy'
import { STONE_NAMES } from './enhancementSystem'
import { computeLevers, powerScale, deriveGearTier, type CombatClass } from './combatModel'

export type DungeonId = 'floresta' | 'caverna' | 'pantano' | 'ruinas'

export interface DungeonMonsterDef {
  name: string
  emoji: string
  /** Arte do bicho (webp gerado por scripts/generate-monster-images.ts). Quando
   *  ausente, a UI cai no emoji. */
  image?: string
  baseHp: number
  baseAttack: number
  baseDefense: number
  /** Chance de esquiva (0..1) — identidade do bicho, igual ao evade do PROFILE do
   *  jogador: invariante de escala (não cresce com nível/gear), só flavor de agilidade. */
  baseEvade: number
}

/** Slug do asset de imagem de um monstro (mesma normalização dos itens). */
export function monsterImageSlug(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Caminho do asset de imagem de um monstro. */
export function monsterImagePath(name: string): string {
  return `/monsters/${monsterImageSlug(name)}.webp`
}

export interface DungeonBossDef extends DungeonMonsterDef {
  title: string
}

export type DungeonEventKind = 'trap' | 'monster' | 'nothing' | 'gold' | 'item' | 'blessing'

export interface DungeonEventDef {
  kind: DungeonEventKind
  /** Faixa do d20 que ativa este evento (inclusive) */
  min: number
  max: number
  icon: string
  title: string
  description: string
  /** trap: % do HP máximo perdido */
  trapDamagePct?: number
  /** gold/blessing: ouro = aleatório entre [min, max] * nível */
  goldPerLevel?: [number, number]
  /** item: nomes possíveis (sorteia um) */
  itemNames?: string[]
  itemRarity?: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC'
  /** blessing: efeitos percentuais sobre o máximo + XP por nível */
  blessing?: { hpPct?: number; mpPct?: number; staminaPct?: number; xpPerLevel?: number }
}

export interface DungeonDef {
  id: DungeonId
  name: string
  emoji: string
  tagline: string
  description: string
  /** Salas PRINCIPAIS (monstro garantido + loot melhor) antes do boss */
  rooms: number
  /** Nós menores entre cada sala principal (chance reduzida de monstro, mais fracos) */
  minorNodes: number
  /** Nível recomendado para entrar (gating de progressão) */
  levelReq: number
  /** Nível-TOPO do band: onde o boss é vencido com o gear-alvo (boss ancora aqui, fixo).
   *  Floresta 1→10, Caverna 10→25, Pântano 25→40, Ruínas 40→50. */
  clearLevel: number
  /** Multiplicador de dificuldade (escala monstros e recompensas) */
  difficulty: number
  difficultyStars: number
  /** Cor de destaque (hex) para bordas/brilhos */
  accent: string
  accentSoft: string
  /** Classes tailwind do gradiente do card de seleção */
  cardGradient: string
  /** Ação de explorar (única por masmorra) */
  exploreAction: string
  exploreHint: string
  enterText: string
  monsters: DungeonMonsterDef[]
  boss: DungeonBossDef
  events: DungeonEventDef[]
  /** Frases temáticas quando nada é encontrado */
  ambience: string[]
}

export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  floresta: {
    id: 'floresta',
    name: 'Floresta Sombria',
    emoji: '🌲',
    tagline: 'Trilhas vivas sob a luz da lua',
    description:
      'Uma mata ancestral onde as árvores sussurram e vagalumes guiam — ou enganam — os viajantes. Fontes élficas escondidas curam quem as encontra.',
    rooms: 3,
    minorNodes: 2,
    levelReq: 1,
    clearLevel: 10,
    difficulty: 1.0,
    difficultyStars: 1,
    accent: '#34d399',
    accentSoft: 'rgba(52,211,153,0.35)',
    cardGradient: 'from-emerald-950 via-green-900 to-emerald-950',
    exploreAction: 'Seguir a trilha',
    exploreHint: 'Role o d20 para se embrenhar na mata',
    enterText: 'Você cruza a fronteira das árvores. A luz da lua mal atravessa a copa...',
    monsters: [
      { name: 'Lobo Faminto', emoji: '🐺', image: '/monsters/lobo-faminto.webp', baseHp: 42, baseAttack: 9, baseDefense: 3, baseEvade: 0.16 },
      { name: 'Aranha Gigante', emoji: '🕷️', image: '/monsters/aranha-gigante.webp', baseHp: 38, baseAttack: 11, baseDefense: 2, baseEvade: 0.12 },
      { name: 'Javali Furioso', emoji: '🐗', image: '/monsters/javali-furioso.webp', baseHp: 55, baseAttack: 8, baseDefense: 5, baseEvade: 0.05 },
      { name: 'Ent Corrompido', emoji: '🌳', image: '/monsters/ent-corrompido.webp', baseHp: 70, baseAttack: 10, baseDefense: 7, baseEvade: 0.02 },
    ],
    // Arte do boss já existe e é reaproveitada (gerada anteriormente).
    boss: { name: 'Anciã da Mata', title: 'Guardiã Corrompida', emoji: '🌲', image: '/boss-ancia-da-mata.webp', baseHp: 110, baseAttack: 12, baseDefense: 7, baseEvade: 0.08 },
    events: [
      {
        kind: 'trap', min: 1, max: 2, icon: '🌿', title: 'Espinhos Venenosos!',
        description: 'Você pisa em um arbusto de espinhos encantados que rasgam suas pernas.',
        trapDamagePct: 10,
      },
      {
        kind: 'monster', min: 3, max: 9, icon: '⚔️', title: 'Emboscada na mata!',
        description: 'Algo se move entre as árvores... e ataca!',
      },
      {
        kind: 'nothing', min: 10, max: 11, icon: '🍃', title: 'Trilha tranquila',
        description: '',
      },
      {
        kind: 'gold', min: 12, max: 14, icon: '💰', title: 'Bolsa de um viajante',
        description: 'Entre raízes, você encontra a bolsa perdida de um viajante azarado.',
        goldPerLevel: [15, 35],
      },
      {
        kind: 'item', min: 15, max: 17, icon: '🌱', title: 'Colheita rara',
        description: 'Plantas raras crescem onde a luz da lua toca o chão.',
        itemNames: ['Erva Medicinal', 'Cogumelo Lunar', 'Seiva Ancestral'],
        itemRarity: 'UNCOMMON',
      },
      {
        kind: 'blessing', min: 18, max: 20, icon: '✨', title: 'Fonte Élfica',
        description: 'Uma fonte cristalina brilha entre as pedras. Suas águas restauram corpo e espírito.',
        blessing: { hpPct: 30, mpPct: 20 },
      },
    ],
    ambience: [
      'Apenas o canto distante de uma coruja acompanha seus passos.',
      'Vagalumes dançam ao redor, mas a trilha segue vazia.',
      'As árvores parecem observar você... mas nada acontece.',
    ],
  },

  caverna: {
    id: 'caverna',
    name: 'Caverna de Cristal',
    emoji: '💎',
    tagline: 'Túneis que brilham no escuro',
    description:
      'Galerias profundas onde cristais pulsam com luz própria. Veios de ouro atraem mineradores — e as criaturas que os devoraram.',
    rooms: 4,
    minorNodes: 2,
    levelReq: 10,
    clearLevel: 25,
    difficulty: 1.15,
    difficultyStars: 2,
    accent: '#22d3ee',
    accentSoft: 'rgba(34,211,238,0.35)',
    cardGradient: 'from-slate-950 via-indigo-950 to-cyan-950',
    exploreAction: 'Descer pelos túneis',
    exploreHint: 'Role o d20 para explorar as galerias',
    enterText: 'O eco dos seus passos se mistura ao gotejar distante. Cristais iluminam o caminho...',
    monsters: [
      { name: 'Morcego Sombrio', emoji: '🦇', baseHp: 34, baseAttack: 10, baseDefense: 2, baseEvade: 0.18 },
      { name: 'Goblin Minerador', emoji: '👺', baseHp: 45, baseAttack: 9, baseDefense: 4, baseEvade: 0.10 },
      { name: 'Slime de Cristal', emoji: '🟣', baseHp: 50, baseAttack: 8, baseDefense: 6, baseEvade: 0.02 },
      { name: 'Golem de Pedra', emoji: '🗿', baseHp: 78, baseAttack: 11, baseDefense: 9, baseEvade: 0.03 },
    ],
    boss: { name: 'Wyrm Cristalino', title: 'Senhor das Profundezas', emoji: '🐉', baseHp: 130, baseAttack: 14, baseDefense: 9, baseEvade: 0.08 },
    events: [
      {
        kind: 'trap', min: 1, max: 3, icon: '🪨', title: 'Desabamento!',
        description: 'O teto range e pedras despencam sobre você!',
        trapDamagePct: 12,
      },
      {
        kind: 'monster', min: 4, max: 10, icon: '⚔️', title: 'Olhos no escuro!',
        description: 'Um brilho se move entre os cristais... não é um cristal.',
      },
      {
        kind: 'nothing', min: 11, max: 12, icon: '💧', title: 'Galeria silenciosa',
        description: '',
      },
      {
        kind: 'gold', min: 13, max: 16, icon: '💎', title: 'Veio de cristais brutos',
        description: 'Você quebra um veio de cristais e recolhe os fragmentos valiosos.',
        goldPerLevel: [25, 50],
      },
      {
        kind: 'item', min: 17, max: 18, icon: '🔮', title: 'Formação rara',
        description: 'Um cristal perfeito pulsa com energia arcana.',
        itemNames: ['Cristal de Mana', 'Geodo Brilhante', 'Quartzo Rúnico'],
        itemRarity: 'UNCOMMON',
      },
      {
        kind: 'blessing', min: 19, max: 20, icon: '🌟', title: 'Veio de Ouro Puro',
        description: 'Uma parede inteira reluz dourada. Você enche os bolsos!',
        goldPerLevel: [60, 100],
        blessing: { xpPerLevel: 10 },
      },
    ],
    ambience: [
      'O gotejar ecoa pelos túneis. Nada além de pedra e brilho.',
      'Cristais pulsam devagar, como um coração adormecido.',
      'Um vento frio sobe das profundezas, mas o caminho está livre.',
    ],
  },

  pantano: {
    id: 'pantano',
    name: 'Pântano Maldito',
    emoji: '🐊',
    tagline: 'Névoa, lodo e luzes que mentem',
    description:
      'Um lamaçal coberto de névoa onde fogos-fátuos dançam sobre tesouros afundados. Cada passo pode ser o último — ou o mais rico.',
    rooms: 4,
    minorNodes: 3,
    levelReq: 25,
    clearLevel: 40,
    difficulty: 1.3,
    difficultyStars: 3,
    accent: '#a3e635',
    accentSoft: 'rgba(163,230,53,0.3)',
    cardGradient: 'from-stone-950 via-emerald-950 to-lime-950',
    exploreAction: 'Atravessar o lamaçal',
    exploreHint: 'Role o d20 para avançar pela névoa',
    enterText: 'A lama engole suas botas. Luzes azuladas piscam na névoa, chamando você...',
    monsters: [
      { name: 'Sapo Venenoso', emoji: '🐸', baseHp: 36, baseAttack: 12, baseDefense: 2, baseEvade: 0.14 },
      { name: 'Serpente do Lodo', emoji: '🐍', baseHp: 44, baseAttack: 13, baseDefense: 3, baseEvade: 0.13 },
      { name: 'Bruxa do Brejo', emoji: '🧙‍♀️', baseHp: 52, baseAttack: 15, baseDefense: 4, baseEvade: 0.10 },
      { name: 'Crocodilo Ancião', emoji: '🐊', baseHp: 68, baseAttack: 14, baseDefense: 6, baseEvade: 0.04 },
    ],
    boss: { name: 'Hidra do Pântano', title: 'Terror de Três Cabeças', emoji: '🐲', baseHp: 150, baseAttack: 16, baseDefense: 10, baseEvade: 0.07 },
    events: [
      {
        kind: 'trap', min: 1, max: 4, icon: '☠️', title: 'Gás Pantanoso!',
        description: 'Bolhas estouram na lama liberando um gás tóxico que queima seus pulmões.',
        trapDamagePct: 15,
      },
      {
        kind: 'monster', min: 5, max: 11, icon: '⚔️', title: 'A lama se move!',
        description: 'O que parecia um tronco abre os olhos...',
      },
      {
        kind: 'nothing', min: 12, max: 13, icon: '🌫️', title: 'Névoa parada',
        description: '',
      },
      {
        kind: 'gold', min: 14, max: 16, icon: '💰', title: 'Tesouro afundado',
        description: 'Seus dedos tocam metal no fundo da lama: moedas de um baú naufragado.',
        goldPerLevel: [30, 60],
      },
      {
        kind: 'item', min: 17, max: 18, icon: '🧪', title: 'Ingrediente raro',
        description: 'Componentes alquímicos que só crescem em água apodrecida.',
        itemNames: ['Lótus Negra', 'Veneno de Sapo', 'Escama de Crocodilo'],
        itemRarity: 'RARE',
      },
      {
        kind: 'blessing', min: 19, max: 20, icon: '🔵', title: 'Fogo-Fátuo Guia',
        description: 'Uma luz azulada gira ao seu redor e infunde você com energia espectral.',
        blessing: { mpPct: 30, staminaPct: 25, xpPerLevel: 20 },
      },
    ],
    ambience: [
      'Bolhas estouram preguiçosamente na lama. Nada se aproxima.',
      'A névoa engole todos os sons. Você segue em frente.',
      'Um fogo-fátuo pisca ao longe e desaparece.',
    ],
  },

  ruinas: {
    id: 'ruinas',
    name: 'Ruínas Arcanas',
    emoji: '🏛️',
    tagline: 'Um império morto que ainda sonha',
    description:
      'Colunas partidas e altares cobertos de runas guardam o saber de um império extinto. Os mortos patrulham os corredores — e odeiam visitas.',
    rooms: 5,
    minorNodes: 3,
    levelReq: 40,
    clearLevel: 50,
    difficulty: 1.45,
    difficultyStars: 4,
    accent: '#c084fc',
    accentSoft: 'rgba(192,132,252,0.35)',
    cardGradient: 'from-stone-950 via-amber-950 to-purple-950',
    exploreAction: 'Vasculhar os escombros',
    exploreHint: 'Role o d20 para investigar as ruínas',
    enterText: 'Poeira de séculos cobre o salão. Runas mortas acendem à sua passagem...',
    monsters: [
      { name: 'Esqueleto Guerreiro', emoji: '💀', baseHp: 48, baseAttack: 13, baseDefense: 5, baseEvade: 0.06 },
      { name: 'Espectro Errante', emoji: '👻', baseHp: 40, baseAttack: 16, baseDefense: 3, baseEvade: 0.18 },
      { name: 'Múmia Real', emoji: '🧟', baseHp: 64, baseAttack: 14, baseDefense: 7, baseEvade: 0.03 },
      { name: 'Gárgula de Obsidiana', emoji: '🦅', baseHp: 74, baseAttack: 15, baseDefense: 9, baseEvade: 0.08 },
    ],
    boss: { name: 'Lich Imperador', title: 'O Que Não Morre', emoji: '👑', baseHp: 170, baseAttack: 18, baseDefense: 11, baseEvade: 0.09 },
    events: [
      {
        kind: 'trap', min: 1, max: 3, icon: '🏹', title: 'Armadilha de Flechas!',
        description: 'Um clique sob seu pé — flechas antigas cortam o ar!',
        trapDamagePct: 12,
      },
      {
        kind: 'monster', min: 4, max: 11, icon: '⚔️', title: 'Os mortos despertam!',
        description: 'Ossos raspam na pedra. Algo se levanta das sombras.',
      },
      {
        kind: 'nothing', min: 12, max: 12, icon: '🕯️', title: 'Salão vazio',
        description: '',
      },
      {
        kind: 'gold', min: 13, max: 15, icon: '🏺', title: 'Cofre antigo',
        description: 'Atrás de um afresco rachado, um cofre cheio de moedas imperiais.',
        goldPerLevel: [35, 70],
      },
      {
        kind: 'item', min: 16, max: 18, icon: '📜', title: 'Relíquia do império',
        description: 'Um artefato intacto após séculos de poeira.',
        itemNames: ['Relíquia Antiga', 'Pergaminho Arcano', 'Amuleto Imperial'],
        itemRarity: 'RARE',
      },
      {
        kind: 'blessing', min: 19, max: 20, icon: '🔮', title: 'Altar Arcano',
        description: 'O altar reconhece você. Conhecimento de eras flui pela sua mente.',
        blessing: { mpPct: 20, xpPerLevel: 40 },
      },
    ],
    ambience: [
      'Estátuas sem rosto vigiam o corredor vazio.',
      'Runas piscam fracas no teto, como estrelas morrendo.',
      'O vento atravessa as colunas com um lamento baixo.',
    ],
  },
}

export const DUNGEON_LIST: DungeonDef[] = [
  DUNGEONS.floresta,
  DUNGEONS.caverna,
  DUNGEONS.pantano,
  DUNGEONS.ruinas,
]

// ============================================================
// Escalonamento de monstros e sorteios
// ============================================================

export interface ScaledMonster {
  id: string
  name: string
  emoji: string
  /** Arte do bicho (se houver) — a UI usa como avatar no combate. */
  image?: string
  level: number
  hp: number
  maxHp: number
  attack: number
  defense: number
  /** Poder mágico (AP) — alimenta o ataque especial. 0 em monstros sem especial. */
  magicPower: number
  /** Pode usar ataque especial (Investida Arcana). Os fraquinhos das primeiras
   *  salas não têm; o boss e as últimas salas antes dele têm. */
  hasSpecial: boolean
  goldReward: number
  xpReward: number
  isBoss: boolean
  /** escala de poder enxuto (S) do monstro — usada no K da mitigação (ver monsterLevers). */
  scale: number
  /** Chance de esquiva (0..1) — vem direto de baseEvade (invariante de escala, como o
   *  evade do PROFILE do jogador). O monstro nunca rola dado; só essa % decide. */
  evade: number
}

// ============================================================
// TUNING DE DIFICULDADE — DADO-COMO-PLUS + BANDS DE NÍVEL (validado em
// scripts/dungeon-difficulty-sim.js; combate em combatModel.resolveHit/resolveMonsterHit).
//
// Cada masmorra é a JORNADA do levelReq até o clearLevel (band). O BOSS ancora no
// clearLevel FIXO (não no nível do jogador) → under-leveled trava, over-leveled vira farm.
// Boss = GATE de gear, NORMALIZADO POR CLASSE (PvE single-player) p/ cada classe vencer
// ~65% no gear-ALVO (Floresta PRI · Caverna DUO · Pântano TRI · Ruínas TET).
// As SALAS/NÓS são uma RAMPA: os primeiros (2 menores + 1ª principal) são vencíveis por
// PELADO no levelReq; cada degrau sobe o nível/gear esperado até a última sala (perto do
// boss). As salas gateiam o NÍVEL; o boss gateia o GEAR.
// ============================================================
const BOSS_POW_MULT = 0.9    // poder do boss = âncora.power × isto
const BOSS_ARM_MULT = 0.8    // armadura do boss = MON_ARMOR × S × isto
const MON_ARMOR = 96         // armadura neutra de referência (média dos PROFILEs do nv50)
const TIER_POWER_STEP = 0.6  // p/ recompensas (gold/xp) por sala — não afeta o combate

// HP do boss = âncora.hp × BOSS_HP_MULT[masmorra][classe] (resolvido no sim p/ ~65% no
// gear-alvo). Recalibrado 2026-06-30 pro modelo dado-como-plus (resolveHit/
// resolveMonsterHit) — o spread entre classes encolheu bastante vs. o modelo antigo de
// disputa de margem (ex.: floresta era 4.70/2.85/3.32/3.88, guerreiro≫ladino).
const BOSS_HP_MULT: Record<DungeonId, Record<CombatClass, number>> = {
  floresta: { warrior: 2.76, rogue: 2.74, mage: 2.62, monk: 2.90 }, // ×0.93 p/ subir o win-alvo de ~65%→~75% (sim: scripts/pve-race-class-sim.js)
  caverna:  { warrior: 2.73, rogue: 2.95, mage: 2.93, monk: 2.93 },
  pantano:  { warrior: 2.89, rogue: 2.93, mage: 2.82, monk: 3.03 },
  ruinas:   { warrior: 3.03, rogue: 3.00, mage: 2.70, monk: 3.25 },
}
// Rampa das salas/nós: o HP-mult cresce ao longo do band (1ª sala fácil → última perto do
// boss). Nó menor = fração extra mais fraca. (Boss usa a tabela acima.)
const ROOM_HP_LO = 1.4, ROOM_HP_HI = 3.0
const MINOR_HP_FAC = 0.7, MINOR_STR_FAC = 0.78
const GEAR_TIER_FLOOR = 0.25 // piso de gear "pelado" (= GEAR_FLOOR do modelo)

// Gear-ALVO (raridade × aprimoramento) por masmorra → tier + HP sintético (espelha o sim).
const TARGET_GEAR: Record<DungeonId, { rarity: string; enh: number }> = {
  floresta: { rarity: 'UNCOMMON', enh: 16 },  // PRI
  caverna:  { rarity: 'RARE', enh: 17 },       // DUO
  pantano:  { rarity: 'EPIC', enh: 18 },       // TRI
  ruinas:   { rarity: 'LEGENDARY', enh: 19 },  // TET
}

// Build de REFERÊNCIA por classe (âncora "jogador típico", NÃO o jogador real) — espelha o
// dungeon-sim: criação 18 pts, cap 10/stat, +1/nível, raça neutra (humano +2 em tudo).
const REF_RACE = { str: 2, agi: 2, int: 2, def: 2 }
const REF_CLASS_BONUS: Record<CombatClass, { str: number; agi: number; int: number; def: number }> = {
  warrior: { str: 4, agi: 0, int: 0, def: 3 },
  rogue:   { str: 0, agi: 4, int: 2, def: 0 },
  mage:    { str: 0, agi: 0, int: 5, def: 0 },
  monk:    { str: 0, agi: 4, int: 0, def: 4 },
}
const REF_BUILD: Record<CombatClass, Record<string, number>> = {
  warrior: { str: 0.7, def: 0.3 },
  rogue:   { agi: 0.85, def: 0.15 },
  mage:    { int: 0.85, def: 0.15 },
  monk:    { agi: 0.55, def: 0.45 },
}
const REF_CLASSES: CombatClass[] = ['warrior', 'rogue', 'mage', 'monk']
const REF_CREATION_PTS = 18, REF_STAT_CAP = 10, REF_SET_HP = 42

function refAttrs(klass: CombatClass, level: number) {
  const w = REF_BUILD[klass]
  const out: Record<string, number> = { str: 0, agi: 0, int: 0, def: 0 }
  const levelPts = Math.max(0, level - 1)
  let spill = 0
  for (const k of Object.keys(w)) { const want = Math.round(REF_CREATION_PTS * w[k]); out[k] = Math.min(REF_STAT_CAP, want); spill += want - out[k] }
  out.def = Math.min(REF_STAT_CAP, out.def + spill)
  for (const k of Object.keys(w)) out[k] += Math.round(levelPts * w[k])
  const cb = REF_CLASS_BONUS[klass]
  return {
    str: out.str + REF_RACE.str + cb.str, agi: out.agi + REF_RACE.agi + cb.agi,
    int: out.int + REF_RACE.int + cb.int, def: out.def + REF_RACE.def + cb.def,
  }
}
const refGearHp = (enh: number) => Math.floor(REF_SET_HP * (enh <= 0 ? 1 : enh <= 15 ? 1 + enh * 0.08 : 2.5))
const targetGearTierOf = (t: { rarity: string; enh: number }) =>
  deriveGearTier(Array.from({ length: 9 }, () => ({ rarity: t.rarity, enhancementLevel: t.enh })))

// Âncora NEUTRA (classe-independente) em (nível, gearTier, gearHp) arbitrários: média do
// poder/HP das 4 classes de referência. Carrega os componentes FLAT (HP base 80 + tilt).
function anchorAt(level: number, gearTier: number, gearHp: number) {
  let powerSum = 0, hpSum = 0
  for (const k of REF_CLASSES) {
    const a = refAttrs(k, level)
    powerSum += computeLevers(k, level, gearTier, a).power
    hpSum += 80 + a.str * 2 + a.def * 4 + gearHp
  }
  return { power: powerSum / REF_CLASSES.length, hp: hpSum / REF_CLASSES.length }
}
const meanBy = <T,>(arr: T[], f: (x: T) => number) => arr.reduce((s, x) => s + f(x), 0) / arr.length
const lerp = (a: number, b: number, p: number) => a + (b - a) * Math.max(0, Math.min(1, p))

export interface NodeScaling {
  /** 1..rooms — qual sala principal (nós menores herdam o tier da próxima sala) */
  tier: number
  /** true em sala principal (monstro garantido, mais forte) */
  isMain: boolean
  isBoss?: boolean
}

// Progresso do nó no BAND [0,1]: 1ª sala perto de 0, última perto de 1; boss = 1.
function nodeProgress(s: NodeScaling, rooms: number): number {
  if (s.isBoss) return 1
  const base = s.tier / (rooms + 1)
  return s.isMain ? base : Math.max(0.04, base - 0.5 / (rooms + 1)) // menor = antes da sala
}

export function scaleMonster(
  def: DungeonMonsterDef,
  dungeon: DungeonDef,
  _characterLevel: number,
  s: NodeScaling,
  combatClass: CombatClass = 'warrior'
): ScaledMonster {
  const tg = TARGET_GEAR[dungeon.id]
  const targetTier = targetGearTierOf(tg)
  const targetHp = refGearHp(tg.enh)

  let level: number, gearTier: number, gearHp: number, hpMult: number, strFac: number
  if (s.isBoss) {
    // Boss ancora no TOPO do band (fixo) com o gear-ALVO; HP normalizado por classe.
    level = dungeon.clearLevel
    gearTier = targetTier
    gearHp = targetHp
    hpMult = BOSS_HP_MULT[dungeon.id]?.[combatClass] ?? 4.0
    strFac = 1
  } else {
    // RAMPA: nível/gear esperados interpolam do levelReq (pelado) ao clearLevel (gear-alvo).
    const p = nodeProgress(s, dungeon.rooms)
    level = Math.round(lerp(dungeon.levelReq, dungeon.clearLevel, p))
    gearTier = lerp(GEAR_TIER_FLOOR, targetTier, p)
    gearHp = Math.floor(lerp(0, targetHp, p))
    hpMult = lerp(ROOM_HP_LO, ROOM_HP_HI, p) * (s.isMain ? 1 : MINOR_HP_FAC)
    strFac = s.isMain ? 1 : MINOR_STR_FAC
  }

  const anchor = anchorAt(level, gearTier, gearHp)
  const S = powerScale(level, gearTier)
  // nível do monstro: boss = clearLevel+2 (= bossLevel do sim, p/ K); salas = seu nível-rampa.
  const monLevel = Math.max(1, s.isBoss ? dungeon.clearLevel + 2 : level)

  // Identidade relativa do monstro (Lobo ≠ Javali) via razão dos stats-base sobre a média.
  const ms = dungeon.monsters
  const rHp = s.isBoss ? 1 : def.baseHp / meanBy(ms, m => m.baseHp)
  const rAtk = s.isBoss ? 1 : def.baseAttack / meanBy(ms, m => m.baseAttack)
  const rDef = s.isBoss ? 1 : def.baseDefense / meanBy(ms, m => m.baseDefense)

  const attack = Math.max(1, Math.floor(anchor.power * BOSS_POW_MULT * strFac * rAtk))
  const defense = Math.max(0, Math.floor(MON_ARMOR * S * BOSS_ARM_MULT * strFac * rDef))
  const hp = Math.max(1, Math.floor(anchor.hp * hpMult * rHp))

  const bossTitle = s.isBoss && 'title' in def ? ` • ${(def as DungeonBossDef).title}` : ''
  // Especial: o boss e as salas PRINCIPAIS mais próximas dele (cresce com a dificuldade);
  // nós menores nunca têm.
  const specialFromTier = dungeon.rooms - (dungeon.difficultyStars - 1)
  const hasSpecial = !!s.isBoss || (!!s.isMain && s.tier >= specialFromTier)
  // Recompensas (gold/xp) seguem dificuldade × tier da sala (independem do combate).
  const d = dungeon.difficulty
  const tierFactor = 1 + (s.tier - 1) * TIER_POWER_STEP
  return {
    id: `${s.isBoss ? 'boss' : 'monster'}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: s.isBoss ? `👑 ${def.name}${bossTitle}` : def.name,
    emoji: def.emoji,
    image: def.image,
    level: monLevel,
    hp,
    maxHp: hp,
    attack,
    defense,
    // AP um pouco acima do ataque físico para o especial ser ameaçador.
    magicPower: hasSpecial ? Math.floor(attack * 1.2) : 0,
    hasSpecial,
    goldReward: Math.floor((s.isBoss ? 150 + Math.random() * 150 : s.isMain ? 25 + Math.random() * 25 : 6 + Math.random() * 10) * d * tierFactor),
    xpReward: Math.floor((s.isBoss ? 150 + Math.random() * 100 : s.isMain ? 35 + Math.random() * 25 : 12 + Math.random() * 12) * d * tierFactor),
    isBoss: !!s.isBoss,
    scale: S,
    // Invariante de escala (igual ao evade do PROFILE do jogador) — vem direto do
    // flavor do bicho, não escala com nível/gear.
    evade: def.baseEvade,
  }
}

export function pickMonster(dungeon: DungeonDef): DungeonMonsterDef {
  return dungeon.monsters[Math.floor(Math.random() * dungeon.monsters.length)]
}

// ============================================================
// PACOTE DE MONSTROS (só em nó MENOR) — a "válvula de escape" do early-game.
// Em vez de um único bicho que pode ser intransponível (o draw uniforme do
// pickMonster às vezes entrega o tanque na 1ª sala), o nó menor pode trazer
// 1–3 bichos: quanto MAIS bichos, mais FRACO cada um. O jogador escolhe o alvo,
// e derrotar pelo menos UM já concede XP — então um nv1 sempre tem como progredir.
// O orçamento de ameaça é "dividido": o pacote é um pouco mais de ameaça TOTAL
// (atrito + chip de fustigamento no cliente), mas cada peça é bem mais matável.
// Sala principal e boss continuam SOLO (o teste limpo do degrau / o gate de gear).
// ============================================================
const MINOR_PACK_WEIGHTS: { size: number; weight: number }[] = [
  { size: 1, weight: 0.40 },
  { size: 2, weight: 0.35 },
  { size: 3, weight: 0.25 },
]
// Fator de HP/recompensa POR membro conforme o tamanho do pacote (> 1/N: o pacote
// tem MAIS HP/recompensa total — luta mais longa e mais XP por limpar tudo).
const PACK_SHARE: Record<number, number> = { 1: 1, 2: 0.6, 3: 0.45 }
// Fator de ATAQUE POR membro ≈ 1/N: como TODOS atacam por rodada (estilo FF/Chrono),
// o dano de um monstro é "dividido" entre os 2-3 → a soma dos ataques do pacote por
// rodada ≈ 1 monstro solo (matar um já reduz o dano da próxima rodada = focar compensa).
const PACK_ATK_SHARE: Record<number, number> = { 1: 1, 2: 0.5, 3: 0.34 }

function rollPackSize(): number {
  const total = MINOR_PACK_WEIGHTS.reduce((s, w) => s + w.weight, 0)
  let r = Math.random() * total
  for (const w of MINOR_PACK_WEIGHTS) {
    if (r < w.weight) return w.size
    r -= w.weight
  }
  return 1
}

// Sorteia o ENCONTRO de um nó: array de 1..3 monstros já escalados. Sala principal/
// boss devolvem sempre 1 (use scaleMonster direto p/ o boss). Cada membro do pacote
// pode ser um arquétipo diferente (variedade) e leva o fator PACK_SHARE nos stats.
export function scaleMonsterGroup(
  dungeon: DungeonDef,
  characterLevel: number,
  s: NodeScaling,
  combatClass: CombatClass = 'warrior'
): ScaledMonster[] {
  const size = s.isMain || s.isBoss ? 1 : rollPackSize()
  const hpShare = PACK_SHARE[size] ?? 1
  const atkShare = PACK_ATK_SHARE[size] ?? 1
  const out: ScaledMonster[] = []
  for (let i = 0; i < size; i++) {
    const m = scaleMonster(pickMonster(dungeon), dungeon, characterLevel, s, combatClass)
    if (size > 1) {
      m.hp = Math.max(1, Math.floor(m.hp * hpShare))
      m.maxHp = m.hp
      m.attack = Math.max(1, Math.floor(m.attack * atkShare))
      m.magicPower = Math.floor(m.magicPower * atkShare)
      m.goldReward = Math.max(1, Math.floor(m.goldReward * hpShare))
      m.xpReward = Math.max(1, Math.floor(m.xpReward * hpShare))
      m.id = `${m.id}-${i}` // garante id único dentro do pacote
    }
    out.push(m)
  }
  return out
}

export function eventForRoll(dungeon: DungeonDef, roll: number): DungeonEventDef {
  return (
    dungeon.events.find(e => roll >= e.min && roll <= e.max) ||
    dungeon.events.find(e => e.kind === 'nothing') ||
    dungeon.events[0]
  )
}

// ============================================================
// LOOT POR SORTE — o d20 rolado ao avançar define a QUALIDADE do
// achado. Nada é garantido: a sorte só aumenta as chances.
//   1–5   (low)  → materiais de craft + poucas moedas
//   6–13  (mid)  → chances melhores
//   14–20 (high) → chances ainda maiores (itens/consumíveis melhores)
// Pedras de aprimoramento são raras — e ainda mais raras em nós menores.
// ============================================================
export type LuckTier = 'low' | 'mid' | 'high'

export function luckTier(roll: number): LuckTier {
  if (roll <= 5) return 'low'
  if (roll <= 13) return 'mid'
  return 'high'
}

export type LootKind = 'ingredient' | 'consumable' | 'item' | 'stone' | 'material'

export interface LootDrop {
  name: string
  kind: LootKind
  rarity?: string
  emoji: string
  /** Equipamento já aprimorado ao cair (ex.: floresta dropa +4..+7). */
  enhancement?: number
}
export interface NodeLoot {
  gold: number
  drops: LootDrop[]
  /** Fonte revitalizadora: restaura HP/MP no cliente. Quando true, não há ouro nem itens. */
  fountain?: boolean
}

export type LootNodeKind = 'minor' | 'main' | 'boss'

const LUCK_CFG: Record<
  LuckTier,
  {
    goldBase: number; goldVar: number; pMaterial: number; pConsumable: number; pStone: number; pShard: number;
    // Items: normal (nós principais/menores) + boss (covil)
    pItemCommon: number; pItemUncommon: number;
    pItemRare: number; pItemEpic: number;
  }
> = {
  low: {
    goldBase: 4, goldVar: 8, pMaterial: 0.7, pConsumable: 0.18, pStone: 0.03, pShard: 0.12,
    pItemCommon: 0.10, pItemUncommon: 0.05,
    pItemRare: 0.02, pItemEpic: 0.01,
  },
  mid: {
    goldBase: 10, goldVar: 16, pMaterial: 0.5, pConsumable: 0.35, pStone: 0.08, pShard: 0.22,
    pItemCommon: 0.25, pItemUncommon: 0.15,
    pItemRare: 0.07, pItemEpic: 0.04,
  },
  high: {
    goldBase: 18, goldVar: 30, pMaterial: 0.3, pConsumable: 0.45, pStone: 0.15, pShard: 0.32,
    pItemCommon: 0.40, pItemUncommon: 0.25,
    pItemRare: 0.15, pItemEpic: 0.07,
  },
}

// Nó menor dropa menos; pedra mais rara nele; sala/boss dão mais ouro. Pedra de
// aprimoramento vem PRINCIPALMENTE de monstro (boss 2.5× + main sempre-monstro).
const NODE_LOOT_MULT: Record<LootNodeKind, { all: number; stone: number; gold: number }> = {
  minor: { all: 0.8, stone: 0.4, gold: 0.8 },
  main: { all: 1.0, stone: 1.0, gold: 1.3 },
  boss: { all: 1.0, stone: 2.5, gold: 2.0 },
}

const pickFrom = <T>(arr: T[]): T | undefined => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined)
const rarityOf = (x: { rarity: unknown }) => String(x.rarity).toUpperCase()

// 🎁 Raridade de EQUIPAMENTO por masmorra: o que cai em nó normal vs. no chefe.
// Regra: nó normal NUNCA dropa a raridade-âncora da masmorra; o chefe é quem a libera.
// Floresta (1ª): nó = comum/incomum; chefe = também raro.
const DUNGEON_GEAR_RARITY: Record<DungeonId, { node: Rarity[]; boss: Rarity[] }> = {
  floresta: { node: ['COMMON', 'UNCOMMON'], boss: ['RARE'] },
  caverna:  { node: ['UNCOMMON', 'RARE'],   boss: ['RARE', 'EPIC'] },
  pantano:  { node: ['RARE'],               boss: ['EPIC'] },
  ruinas:   { node: ['RARE', 'EPIC'],       boss: ['EPIC', 'LEGENDARY'] },
}

// Chance de cair UM equipamento (arma/armadura/acessório) num nó normal, por tier de
// sorte do d20. Propositalmente baixo: arma/armadura é "achado de sorte" — precisa de
// sorte na rolagem (tier) E sorte aqui. O chefe segue com chance própria (cfg).
const NODE_GEAR_CHANCE: Record<LuckTier, number> = { low: 0.05, mid: 0.15, high: 0.30 }

// Quando um equipamento cai num nó, esta é a chance de ele ser INCOMUM de OUTRA classe
// (item que o personagem atual não equipa) — incentivo a criar/treinar outro herói.
const CROSS_CLASS_CHANCE = 0.2

// Acessórios (anel/colar/cinto) NUNCA caem aprimorados — começam no tier base.
// Só armas/armaduras podem vir com +N embutido.
const ACCESSORY_TYPES = new Set(['RING', 'NECKLACE', 'BELT'])

// Floresta empurra pra alquimia: Pó de Fênix (revive) quase não se usa nesse
// início, então só passa a cair a partir da Caverna. Em troca, ingrediente de
// alquimia cai bem mais na Floresta (ver DUNGEON_INGREDIENT_MULT) pra bancar
// craft de poção de vida/mana.
const CONSUMABLE_MIN_DIFFICULTY_STARS: Record<string, number> = {
  'Pó de Fênix': 2,
}

// Multiplica a chance de ingrediente de alquimia (não afeta material de forja,
// que usa o mesmo cfg.pMaterial). Floresta ganha mais pra sustentar o craft de
// poção de vida/mana logo cedo.
const DUNGEON_INGREDIENT_MULT: Record<DungeonId, number> = {
  floresta: 1.8,
  caverna: 1,
  pantano: 1,
  ruinas: 1,
}

// Aprimoramento JÁ embutido no drop, por masmorra. A floresta entrega itens +4..+7
// (o +7 é raro). null = item cai +0.
const DUNGEON_DROP_ENH: Record<DungeonId, { min: number; max: number } | null> = {
  floresta: { min: 4, max: 7 },
  caverna:  null,
  pantano:  null,
  ruinas:   null,
}

// Sorteia o aprimoramento embutido: pesa para o piso, +max é raro; sorte alta empurra um degrau.
function rollDropEnhancement(dungeonId: DungeonId, tier: LuckTier): number {
  const band = DUNGEON_DROP_ENH[dungeonId]
  if (!band) return 0
  const r = Math.random()
  let lvl = band.min
  if (r > 0.55) lvl = band.min + 1
  if (r > 0.80) lvl = band.min + 2
  if (r > 0.94) lvl = band.max
  if (tier === 'high') lvl = Math.max(lvl, band.min + 1) // sorte alta garante 1 acima do piso
  return Math.min(band.max, lvl)
}

export function rollNodeLoot(
  dungeon: DungeonDef,
  roll: number,
  nodeKind: LootNodeKind,
  level: number,
  race?: string | null,
  charClass?: string | null,
): NodeLoot {
  // roll é o d20 da exploração que determina a qualidade (tier) dos drops
  // RARE e EPIC só aparecem em BOSS
  const tier = luckTier(roll)
  const cfg = LUCK_CFG[tier]
  const mult = NODE_LOOT_MULT[nodeKind]
  const drops: LootDrop[] = []
  const isBoss = nodeKind === 'boss'

  const gold = Math.max(
    0,
    Math.floor((cfg.goldBase + Math.random() * cfg.goldVar) * mult.gold * dungeon.difficulty * (1 + level * 0.04))
  )

  // ingrediente de alquimia (espólio de craft de poção).
  // Nó normal → COMUM/INCOMUM; chefe → também RARO/ÉPICO.
  if (Math.random() < cfg.pMaterial * mult.all * DUNGEON_INGREDIENT_MULT[dungeon.id]) {
    const rarities = isBoss
      ? (['COMMON', 'UNCOMMON', 'RARE', 'EPIC'] as const)
      : (['COMMON', 'UNCOMMON'] as const)
    const ing = pickIngredient([...rarities])
    if (ing) drops.push({ name: ing.name, kind: 'ingredient', rarity: rarityOf(ing), emoji: ing.emoji })
  }
  // material de forja (couro/ferro/estilhaços/especiais de arma). Cai em exploração e
  // luta; chão dá só COMUM, sorte mid/high libera o Ferro (INCOMUM).
  if (Math.random() < cfg.pMaterial * mult.all) {
    const pool = getCommonForgeMaterials().filter(
      (m) => m.rarity === 'COMMON' || (tier !== 'low' && m.rarity === 'UNCOMMON'),
    )
    const mat = pickFrom(pool)
    if (mat) drops.push({ name: mat.name, kind: 'material', rarity: rarityOf(mat), emoji: mat.emoji })
  }
  // Estilhaço de Pedra Negra (Arma/Armadura): ligante de TODA receita de forja
  // (10 viram 1 Pedra Negra). É o material de craft "corrente" — deve ser bem
  // frequente. Roll dedicado (não some no sorteio uniforme dos outros materiais).
  if (Math.random() < cfg.pShard * mult.all) {
    const shard = Math.random() < 0.5
      ? { name: 'Estilhaço de Pedra Negra (Arma)', emoji: '🔸' }
      : { name: 'Estilhaço de Pedra Negra (Armadura)', emoji: '🔹' }
    drops.push({ name: shard.name, kind: 'material', rarity: 'COMMON', emoji: shard.emoji })
  }
  // Estilhaço de Memória (repara raro/épico/lendário): SOMENTE no chefe (1 por boss).
  if (isBoss) {
    drops.push({ name: 'Estilhaço de Memória', kind: 'material', rarity: 'RARE', emoji: '🧠' })
  }
  // consumível de masmorra
  if (Math.random() < cfg.pConsumable * mult.all) {
    const all = getDungeonConsumables()
    const pool = all.filter(c => rarityOf(c) === 'COMMON')
    const c = pickFrom(pool.length ? pool : all)
    if (c) drops.push({ name: c.name, kind: 'consumable', rarity: rarityOf(c), emoji: '🧪' })
  }

  // 🎁 EQUIPAMENTO: sorteado por ELEGIBILIDADE (classe + raça + nível), nunca um
  // item aleatório de nível alto. Arma/armadura é "achado de sorte": chance baixa,
  // gateada pelo tier do d20. O peso de raridade faz COMUM dominar; o item cai já
  // aprimorado (floresta: +4..+7). Às vezes vem um INCOMUM de OUTRA classe (teaser).
  const gearRarity = DUNGEON_GEAR_RARITY[dungeon.id]
  const pushGear = (i: { name: string; rarity: unknown; type?: string } | null | undefined) => {
    if (i) drops.push({
      name: i.name, kind: 'item', rarity: rarityOf(i), emoji: '📦',
      // acessório não vem aprimorado; só arma/armadura ganha o +N da masmorra.
      enhancement: ACCESSORY_TYPES.has(String(i.type)) ? 0 : rollDropEnhancement(dungeon.id, tier),
    })
  }

  if (Math.random() < NODE_GEAR_CHANCE[tier] * mult.all) {
    if (Math.random() < CROSS_CLASS_CHANCE) {
      // Incomum de outra classe; se nada elegível (ex.: nível baixo), volta ao próprio.
      pushGear(
        rollEquipmentDrop(dungeon.id, level, race, charClass, ['UNCOMMON'], { mode: 'foreign' })
        ?? rollEquipmentDrop(dungeon.id, level, race, charClass, gearRarity.node, { mode: 'own' })
      )
    } else {
      pushGear(rollEquipmentDrop(dungeon.id, level, race, charClass, gearRarity.node, { mode: 'own' }))
    }
  }

  // Gear de raridade superior só em BOSS
  if (isBoss) {
    // gear de chefe: chance = soma das chances raro+épico
    const pBossGear = (cfg.pItemRare + cfg.pItemEpic) * mult.all
    if (Math.random() < pBossGear) {
      // Tenta a raridade boa do chefe; se o jogador está subnivelado para ela
      // (nada elegível), cai para a raridade do nó — chefe nunca volta de mãos vazias.
      pushGear(
        rollEquipmentDrop(dungeon.id, level, race, charClass, gearRarity.boss, { mode: 'own' })
        ?? rollEquipmentDrop(dungeon.id, level, race, charClass, gearRarity.node, { mode: 'own' })
      )
    }
    // poção raro/épica PRONTA (alternativa ao craft) — chance baixa, só boss
    if (Math.random() < cfg.pItemRare * mult.all) {
      const pool = getDungeonConsumables().filter(c => {
        const r = rarityOf(c)
        if (r !== 'RARE' && r !== 'EPIC') return false
        const minStars = CONSUMABLE_MIN_DIFFICULTY_STARS[c.name]
        if (minStars && dungeon.difficultyStars < minStars) return false
        return true
      })
      const c = pickFrom(pool)
      if (c) drops.push({ name: c.name, kind: 'consumable', rarity: rarityOf(c), emoji: '🧪' })
    }
  }

  // pedra de aprimoramento
  if (Math.random() < cfg.pStone * mult.stone) {
    const concentrated = dungeon.difficultyStars >= 3
    const stone = concentrated
      ? Math.random() < 0.4
        ? STONE_NAMES.WEAPON_CONCENTRATED
        : STONE_NAMES.ARMOR_CONCENTRATED
      : Math.random() < 0.5
        ? STONE_NAMES.WEAPON_BASIC
        : STONE_NAMES.ARMOR_BASIC
    drops.push({ name: stone, kind: 'stone', rarity: 'COMMON', emoji: '⚒️' })
  }

  return { gold, drops }
}

// ============================================================
// 💀 DROP POR ABATE (2026-07-02) — o monstro é a fonte PRINCIPAL de estilhaço,
// creditado a CADA abate individual (recuar depois de matar 1 de 3 ainda rende
// algo — antes o espólio só saía quando o pacote inteiro caía). O boss garante
// Pedra(s) Negra(s) INTEIRA(S): é o coração da economia de aprimoramento.
// Constantes calibradas em scripts/farm-progression-sim.js — metas: main full
// +15 em ~1 semana com 5 chars (~7d), ~1 mês solo ou p/ o esquadrão inteiro.
// ============================================================
const KILL_SHARD_CHANCE: Record<LootNodeKind, number> = { minor: 0.4, main: 0.6, boss: 0.6 }
const BOSS_KILL_STONES = { min: 1, max: 3 }

export function rollKillLoot(nodeKind: LootNodeKind, isBoss: boolean): LootDrop[] {
  const drops: LootDrop[] = []
  if (isBoss) {
    const n = BOSS_KILL_STONES.min + Math.floor(Math.random() * (BOSS_KILL_STONES.max - BOSS_KILL_STONES.min + 1))
    for (let i = 0; i < n; i++) {
      const stone = Math.random() < 0.5 ? STONE_NAMES.WEAPON_BASIC : STONE_NAMES.ARMOR_BASIC
      drops.push({ name: stone, kind: 'stone', rarity: 'UNCOMMON', emoji: '🪨' })
    }
    return drops
  }
  if (Math.random() < KILL_SHARD_CHANCE[nodeKind]) {
    const shard = Math.random() < 0.5
      ? { name: 'Estilhaço de Pedra Negra (Arma)', emoji: '🔸' }
      : { name: 'Estilhaço de Pedra Negra (Armadura)', emoji: '🔹' }
    drops.push({ name: shard.name, kind: 'material', rarity: 'COMMON', emoji: shard.emoji })
  }
  return drops
}
