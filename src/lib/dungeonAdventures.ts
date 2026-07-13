// ============================================================
// Definições das 4 masmorras temáticas de Dolrath
// - Floresta Sombria, Caverna de Cristal, Pântano Maldito, Ruínas Arcanas
// - Cada uma com monstros, boss, tabela de eventos d20 e identidade visual
// - Usado pela experiência nova de masmorras (DungeonRun + BattleScene)
// ============================================================

import { getDungeonConsumables, rollEquipmentDrop, getIngredientByName, getForgeMaterialByName, type Rarity } from './itemCatalog'
import { STONE_NAMES, getStatMultiplier } from './enhancementSystem'
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
      { name: 'Morcego Sombrio', emoji: '🦇', image: '/monsters/morcego-sombrio.webp', baseHp: 34, baseAttack: 10, baseDefense: 2, baseEvade: 0.18 },
      { name: 'Goblin Minerador', emoji: '👺', image: '/monsters/goblin-minerador.webp', baseHp: 45, baseAttack: 9, baseDefense: 4, baseEvade: 0.10 },
      { name: 'Slime de Cristal', emoji: '🟣', image: '/monsters/slime-de-cristal.webp', baseHp: 50, baseAttack: 8, baseDefense: 6, baseEvade: 0.02 },
      { name: 'Golem de Pedra', emoji: '🗿', image: '/monsters/golem-de-pedra.webp', baseHp: 78, baseAttack: 11, baseDefense: 9, baseEvade: 0.03 },
    ],
    boss: { name: 'Wyrm Cristalino', title: 'Senhor das Profundezas', emoji: '🐉', image: '/monsters/wyrm-cristalino.webp', baseHp: 130, baseAttack: 14, baseDefense: 9, baseEvade: 0.08 },
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
      { name: 'Sapo Venenoso', emoji: '🐸', image: '/monsters/sapo-venenoso.webp', baseHp: 36, baseAttack: 12, baseDefense: 2, baseEvade: 0.14 },
      { name: 'Serpente do Lodo', emoji: '🐍', image: '/monsters/serpente-do-lodo.webp', baseHp: 44, baseAttack: 13, baseDefense: 3, baseEvade: 0.13 },
      { name: 'Bruxa do Brejo', emoji: '🧙‍♀️', image: '/monsters/bruxa-do-brejo.webp', baseHp: 52, baseAttack: 15, baseDefense: 4, baseEvade: 0.10 },
      { name: 'Crocodilo Ancião', emoji: '🐊', image: '/monsters/crocodilo-anciao.webp', baseHp: 68, baseAttack: 14, baseDefense: 6, baseEvade: 0.04 },
    ],
    boss: { name: 'Hidra do Pântano', title: 'Terror de Três Cabeças', emoji: '🐲', image: '/monsters/hidra-do-pantano.webp', baseHp: 150, baseAttack: 16, baseDefense: 10, baseEvade: 0.07 },
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
      { name: 'Esqueleto Guerreiro', emoji: '💀', image: '/monsters/esqueleto-guerreiro.webp', baseHp: 48, baseAttack: 13, baseDefense: 5, baseEvade: 0.06 },
      { name: 'Espectro Errante', emoji: '👻', image: '/monsters/espectro-errante.webp', baseHp: 40, baseAttack: 16, baseDefense: 3, baseEvade: 0.18 },
      { name: 'Múmia Real', emoji: '🧟', image: '/monsters/mumia-real.webp', baseHp: 64, baseAttack: 14, baseDefense: 7, baseEvade: 0.03 },
      { name: 'Gárgula de Obsidiana', emoji: '🦅', image: '/monsters/gargula-de-obsidiana.webp', baseHp: 74, baseAttack: 15, baseDefense: 9, baseEvade: 0.08 },
    ],
    boss: { name: 'Lich Imperador', title: 'O Que Não Morre', emoji: '👑', image: '/monsters/lich-imperador.webp', baseHp: 170, baseAttack: 18, baseDefense: 11, baseEvade: 0.09 },
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
// As SALAS/NÓS são uma RAMPA do gear de ENTRADA (= alvo da masmorra anterior; floresta
// = pelado) ao gear-ALVO: a 1ª sala já espera quem FECHOU a masmorra anterior, e cada
// degrau sobe até a última sala (perto do boss). As salas gateiam o NÍVEL+gear da banda;
// o boss gateia o GEAR-alvo. Ver ROOM_RAMP/ENTRY_GEAR (fase de SALAS do sim).
// ============================================================
const BOSS_POW_MULT = 0.9    // poder do boss = âncora.power × isto
const BOSS_ARM_MULT = 0.8    // armadura do boss = MON_ARMOR × S × isto
const MON_ARMOR = 96         // armadura neutra de referência (média dos PROFILEs do nv50)
const TIER_POWER_STEP = 0.6  // p/ recompensas (gold/xp) por SALA (s.tier) — não afeta o combate

// 🏆 TIER DA MASMORRA (Diablo 4): 1..MAX_DUNGEON_TIER. Tier ↑ = monstro mais forte
// (poder/HP) e recompensa/drops melhores. Concentrada só a partir de CONCENTRATED_MIN_TIER.
// Os passos são a ALAVANCA — os valores finais saem do sim (Fase E / dungeon-difficulty-sim).
export const MAX_DUNGEON_TIER = 5
export const CONCENTRATED_MIN_TIER = 3
const DUNGEON_TIER_POWER_STEP = 0.18  // +18% em poder/HP do monstro por tier acima de 1
const DUNGEON_TIER_REWARD_STEP = 0.15 // +15% em gold/xp por tier acima de 1
export const clampDungeonTier = (t: unknown) =>
  Math.max(1, Math.min(MAX_DUNGEON_TIER, Math.floor(Number(t) || 1)))
const dungeonTierPowerMult = (tier: number) => 1 + (clampDungeonTier(tier) - 1) * DUNGEON_TIER_POWER_STEP
const dungeonTierRewardMult = (tier: number) => 1 + (clampDungeonTier(tier) - 1) * DUNGEON_TIER_REWARD_STEP

// HP do boss = âncora.hp × BOSS_HP_MULT[masmorra][classe] (resolvido no sim p/ ~65% no
// gear-alvo). Recalibrado 2026-06-30 pro modelo dado-como-plus (resolveHit/
// resolveMonsterHit) — o spread entre classes encolheu bastante vs. o modelo antigo de
// disputa de margem (ex.: floresta era 4.70/2.85/3.32/3.88, guerreiro≫ladino).
// 🎚️ CURVA DE DIFICULDADE (2026-07-06): win-alvo no gear-ALVO cresce em degraus —
// 1ª masmorra trivial → 4ª bem difícil. Resolvido por classe no dungeon-difficulty-sim
// (TARGET_WIN por masmorra: floresta ~88% · caverna ~78% · pantano ~63% · ruinas ~52%).
// Re-sincronizado 2026-07-09 (tiers I–V reforçados + refGearHp corrigido): cada célula
// foi escalada pelo ratio hpMult_novo/hpMult_antigo resolvido no dungeon-difficulty-sim,
// preservando a curva de dificuldade original por masmorra.
const BOSS_HP_MULT: Record<DungeonId, Record<CombatClass, number>> = {
  floresta: { warrior: 2.46, rogue: 2.32, mage: 2.27, monk: 2.55 }, // ~88% — muito fácil (onboarding)
  caverna:  { warrior: 2.50, rogue: 2.61, mage: 2.59, monk: 2.60 }, // ~78% — moderada, ainda fácil
  pantano:  { warrior: 2.87, rogue: 3.12, mage: 2.99, monk: 3.11 }, // ~63% — moderada, um pouco difícil
  ruinas:   { warrior: 3.32, rogue: 3.54, mage: 3.34, monk: 3.62 }, // ~52% — bem difícil
}
// 🎚️ RAMPA DAS SALAS POR MASMORRA (fase de SALAS do dungeon-difficulty-sim, 2026-07-06).
// Antes eram escalares únicos (hp 1.4→3.0, minor 0.7/0.78, poder 0.9 do boss) estimados à
// mão — junto com a rampa de gear "pelada", as salas de Caverna/Pântano/Ruínas saíam
// triviais (nv4 matava "monstro nv40"). Agora cada sala tem um jogador-GATE explícito
// (nível lerp(levelReq−3, clearLevel−2, p) com gear lerp(entrada, alvo, p)) que vence
// ~60%; o sim resolve hpLo/hpHi por binary-search e o alívio do nó menor p/ o jogador
// UMA-BANDA-ATRÁS vencer ~45% no 1º nó (arranha XP, não farma). `pow` das salas novas é
// 1.15 (> boss 0.9): golpe mais perigoso + hpMult menor = mesmo win% com luta mais curta
// (o boss é a maratona; a sala é o susto). Floresta = valores antigos (onboarding OK).
const ROOM_RAMP: Record<DungeonId, { pow: number; hpLo: number; hpHi: number; minorHp: number; minorStr: number }> = {
  floresta: { pow: 0.90, hpLo: 1.40, hpHi: 3.00, minorHp: 0.70, minorStr: 0.78 },
  caverna:  { pow: 1.15, hpLo: 2.30, hpHi: 2.45, minorHp: 0.73, minorStr: 0.85 },
  pantano:  { pow: 1.15, hpLo: 2.40, hpHi: 2.50, minorHp: 0.80, minorStr: 0.90 },
  ruinas:   { pow: 1.15, hpLo: 2.50, hpHi: 2.50, minorHp: 0.89, minorStr: 0.94 },
}
const GEAR_TIER_FLOOR = 0.25 // piso de gear "pelado" (= GEAR_FLOOR do modelo)

// Gear-ALVO (raridade × aprimoramento) por masmorra → tier + HP sintético (espelha o sim).
const TARGET_GEAR: Record<DungeonId, { rarity: string; enh: number }> = {
  floresta: { rarity: 'UNCOMMON', enh: 16 },  // PRI
  caverna:  { rarity: 'RARE', enh: 17 },       // DUO
  pantano:  { rarity: 'EPIC', enh: 18 },       // TRI
  ruinas:   { rarity: 'LEGENDARY', enh: 19 },  // TET
}

// Gear de ENTRADA por masmorra = o ALVO da masmorra ANTERIOR (null = pelado). A rampa
// das salas interpola entrada→alvo: quem chega na Ruína enfrenta desde a 1ª sala um
// "nv40 de verdade" (épico TRI), não um nv40 pelado — o muro que motiva voltar depois.
const ENTRY_GEAR: Record<DungeonId, { rarity: string; enh: number } | null> = {
  floresta: null,
  caverna:  { rarity: 'UNCOMMON', enh: 16 },  // PRI (alvo da Floresta)
  pantano:  { rarity: 'RARE', enh: 17 },       // DUO (alvo da Caverna)
  ruinas:   { rarity: 'EPIC', enh: 18 },       // TRI (alvo do Pântano)
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
// HP sintético do set de referência escala com a MESMA curva do enhancement real
// (antes era um espelho stale: +8%/nível e flat 2.5 nos tiers I–V; corrigido junto
// com os tiers reforçados 2026-07-09 — BOSS_HP_MULT foi re-sincronizado na mesma data).
const refGearHp = (enh: number) => Math.floor(REF_SET_HP * getStatMultiplier(enh))
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
  characterLevel: number,
  s: NodeScaling,
  combatClass: CombatClass = 'warrior',
  tier: number = 1,
): ScaledMonster {
  const tierPow = dungeonTierPowerMult(tier)   // monstro mais forte em tier alto
  const tierReward = dungeonTierRewardMult(tier) // recompensa melhor em tier alto
  const tg = TARGET_GEAR[dungeon.id]
  const targetTier = targetGearTierOf(tg)
  const targetHp = refGearHp(tg.enh)

  let level: number, gearTier: number, gearHp: number, hpMult: number, strFac: number, powMult: number
  if (s.isBoss) {
    // Boss ancora no TOPO do band (fixo) com o gear-ALVO; HP normalizado por classe.
    level = dungeon.clearLevel
    gearTier = targetTier
    gearHp = targetHp
    hpMult = BOSS_HP_MULT[dungeon.id]?.[combatClass] ?? 4.0
    strFac = 1
    powMult = BOSS_POW_MULT
  } else {
    // RAMPA: gear esperado interpola do gear de ENTRADA (alvo da masmorra anterior;
    // floresta = pelado) ao gear-ALVO no clearLevel — ver ENTRY_GEAR/ROOM_RAMP.
    const p = nodeProgress(s, dungeon.rooms)
    // O NÍVEL da sala ACOMPANHA o jogador (não é a faixa fixa): encontra o jogador onde
    // ele está, com TETO na rampa do nó (over-leveled → farm) e PISO no levelReq. Assim
    // não existe "muro de nível" nas salas — quem está under-geared sente o atrito pelo
    // GEAR, não por um bicho de nível muito acima. O BOSS continua ancorado no clearLevel.
    const bandLevel = Math.round(lerp(dungeon.levelReq, dungeon.clearLevel, p))
    level = Math.max(dungeon.levelReq, Math.min(bandLevel, Math.round(characterLevel || 0)))
    const entry = ENTRY_GEAR[dungeon.id]
    const entryTier = entry ? targetGearTierOf(entry) : GEAR_TIER_FLOOR
    const entryHp = entry ? refGearHp(entry.enh) : 0
    gearTier = lerp(entryTier, targetTier, p)
    gearHp = Math.floor(lerp(entryHp, targetHp, p))
    const ramp = ROOM_RAMP[dungeon.id]
    hpMult = lerp(ramp.hpLo, ramp.hpHi, p) * (s.isMain ? 1 : ramp.minorHp)
    strFac = s.isMain ? 1 : ramp.minorStr
    powMult = ramp.pow
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

  const attack = Math.max(1, Math.floor(anchor.power * powMult * strFac * rAtk * tierPow))
  const defense = Math.max(0, Math.floor(MON_ARMOR * S * BOSS_ARM_MULT * strFac * rDef * tierPow))
  const hp = Math.max(1, Math.floor(anchor.hp * hpMult * rHp * tierPow))

  const bossTitle = s.isBoss && 'title' in def ? ` • ${(def as DungeonBossDef).title}` : ''
  // Especial: o boss e as salas PRINCIPAIS mais próximas dele (cresce com a dificuldade);
  // nós menores nunca têm.
  const specialFromTier = dungeon.rooms - (dungeon.difficultyStars - 1)
  const hasSpecial = !!s.isBoss || (!!s.isMain && s.tier >= specialFromTier)
  // Recompensas (gold/xp): o BOSS segue a dificuldade da masmorra (é o clímax); as SALAS
  // seguem o NÍVEL EFETIVO do monstro (= nível do jogador, já que as salas o acompanham).
  // Assim, farmar salas de uma masmorra dura estando SUB-NIVELADO não infla o ganho — o
  // fator por nível (0.9 + level·0.011) reproduz a antiga curva de dificuldade, mas por
  // NÍVEL (nv10≈1.01, nv25≈1.18, nv50≈1.45) em vez de por masmorra.
  const rewardScale = s.isBoss ? dungeon.difficulty : 0.9 + level * 0.011
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
    goldReward: Math.floor((s.isBoss ? 150 + Math.random() * 150 : s.isMain ? 25 + Math.random() * 25 : 6 + Math.random() * 10) * rewardScale * tierFactor * tierReward),
    xpReward: Math.floor((s.isBoss ? 150 + Math.random() * 100 : s.isMain ? 35 + Math.random() * 25 : 12 + Math.random() * 12) * rewardScale * tierFactor * tierReward),
    isBoss: !!s.isBoss,
    scale: S,
    // Invariante de escala (igual ao evade do PROFILE do jogador) — vem direto do
    // flavor do bicho, não escala com nível/gear.
    evade: def.baseEvade,
  }
}

// Ameaça relativa de um arquétipo (HP + peso da defesa): ordena o pool do mais
// matável ao tanque — a base do earlyPool e do viés da 1ª sala.
const threatOf = (m: DungeonMonsterDef) => m.baseHp + 6 * m.baseDefense

// Os 2 arquétipos mais FRACOS da masmorra (ex.: Floresta = Aranha + Lobo;
// Caverna = Morcego + Goblin). É o pool do 1º nó menor travado da run.
export function earlyPoolOf(dungeon: DungeonDef): DungeonMonsterDef[] {
  return [...dungeon.monsters].sort((a, b) => threatOf(a) - threatOf(b)).slice(0, 2)
}

// earlyBias: nos nós menores da 1ª SALA o sorteio pesa 2× pró-fracos — elimina
// o "Ent na porta" do nível 1 sem travar a variedade. Salas 2+ seguem uniformes.
export function pickMonster(dungeon: DungeonDef, opts?: { earlyBias?: boolean }): DungeonMonsterDef {
  const pool = opts?.earlyBias ? [...dungeon.monsters, ...earlyPoolOf(dungeon)] : dungeon.monsters
  return pool[Math.floor(Math.random() * pool.length)]
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
// opts.forcedSize/pool: usados pela TRAVA do 1º nó menor da run (pacote fixo de
// 3 sorteados só do earlyPool — a "luta de calibração" do nível 1);
// opts.earlyBias: viés pró-fracos nos demais nós menores da 1ª sala.
export function scaleMonsterGroup(
  dungeon: DungeonDef,
  characterLevel: number,
  s: NodeScaling,
  combatClass: CombatClass = 'warrior',
  tier: number = 1,
  opts?: { forcedSize?: number; pool?: DungeonMonsterDef[]; earlyBias?: boolean },
): ScaledMonster[] {
  const size = opts?.forcedSize ?? (s.isMain || s.isBoss ? 1 : rollPackSize())
  const hpShare = PACK_SHARE[size] ?? 1
  const atkShare = PACK_ATK_SHARE[size] ?? 1
  const out: ScaledMonster[] = []
  for (let i = 0; i < size; i++) {
    const def = opts?.pool?.length
      ? opts.pool[Math.floor(Math.random() * opts.pool.length)]
      : pickMonster(dungeon, { earlyBias: opts?.earlyBias })
    const m = scaleMonster(def, dungeon, characterLevel, s, combatClass, tier)
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
// LOOT POR SORTE — o d20 rolado ao avançar é um MULTIPLICADOR da chance
// natural de cada drop: fator = roll/10 (10 = a média; 9 = ×0.9, 8 = ×0.8 …
// 1 = ×0.1; 15 = ×1.5; 20 = ×2.0). Sem regra especial por faixa — o jogador
// indexa pelo badge 🎲: número = multiplicador. Única exceção: nat 20 é o
// CRÍTICO (Pedra Negra garantida 40/60 arma/armadura + estilhaço por abate
// garantido). Chances naturais em BASE_LOOT (abaixo).
// O LuckTier (3 faixas) permanece só para decisões de ENCONTRO (chance de
// monstro em nó menor, fonte revitalizadora) — o espólio usa o roll exato.
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

// 🌿 POOLS DE MATERIAL POR MASMORRA — a reintrodução dos insumos de alquimia/
// forja/processamento nos drops (o jogador SOLO de 1 personagem precisa de uma
// fonte confiável; a Coleta segue sendo a fonte EFICIENTE em volume). Os nomes
// vêm dos catálogos reais (INGREDIENT_CATALOG/FORGE_MATERIAL_CATALOG) e os
// insumos crus do Processamento são exatamente estes (Ferro, Couro, ervas…).
// O rótulo do pool é o SLOT do pacote, não a raridade do item — o drop carrega
// a raridade real do catálogo.
const DUNGEON_MATERIAL_POOLS: Record<DungeonId, { common: string[]; uncommon: string[] }> = {
  floresta: {
    common: ['Erva Medicinal', 'Água Pura', 'Flor de Mana', 'Raiz Vigorosa', 'Couro', 'Madeira Flexível'],
    uncommon: ['Seiva Ancestral', 'Seiva de Ent'],
  },
  caverna: {
    common: ['Ferro Pesado', 'Metal Leve', 'Cristal Bruto', 'Água Pura', 'Couro'],
    uncommon: ['Ferro', 'Cristal de Mana'],
  },
  pantano: {
    common: ['Cogumelo Lunar', 'Raiz Vigorosa', 'Couro', 'Erva Medicinal'],
    uncommon: ['Glândula de Veneno', 'Seiva Ancestral'],
  },
  ruinas: {
    common: ['Fragmentos de Joias', 'Metal Leve', 'Flor de Mana'],
    uncommon: ['Pó de Osso', 'Cristal de Mana', 'Ferro'],
  },
}

// Ingredientes de CHEFE (raro/épico) — só no pacote do boss e, em tier 4+, com
// chance pequena nos pacotes 19–20 (identidade de farm dos tiers altos).
const BOSS_INGREDIENTS = {
  rare: ['Sangue de Monstro', 'Lótus Negra'],
  epic: ['Pena de Fênix', 'Essência Cristalina'],
}

// Resolve um drop de material do pool da masmorra (ingrediente OU material de
// forja — o kind sai do catálogo em que o nome existe).
function materialDrop(dungeon: DungeonDef, pool: 'common' | 'uncommon'): LootDrop | null {
  const name = pickFrom(DUNGEON_MATERIAL_POOLS[dungeon.id][pool])
  if (!name) return null
  const ing = getIngredientByName(name)
  const mat = ing ? undefined : getForgeMaterialByName(name)
  const meta = ing ?? mat
  if (!meta) return null
  return { name, kind: ing ? 'ingredient' : 'material', rarity: String(meta.rarity), emoji: meta.emoji }
}

function bossIngredientDrop(rarity: 'rare' | 'epic'): LootDrop | null {
  const name = pickFrom(BOSS_INGREDIENTS[rarity])
  const ing = name ? getIngredientByName(name) : undefined
  if (!ing) return null
  return { name: ing.name, kind: 'ingredient', rarity: String(ing.rarity), emoji: ing.emoji }
}

// ============================================================
// 🎲 LOOT MULTIPLICATIVO — o d20 modula a chance NATURAL de cada drop.
//   node: espólio do NÓ (achado de exploração ou limpar o pacote de monstros)
//   kill: espólio POR ABATE — o d20 rolado ANTES do combate (lootRoll do
//         RunPending) modula o drop de cada monstro morto; recuar depois de
//         matar 1 de 3 num nó de sorte 20 ainda rende drop dobrado.
// fator = roll/10 (1 = ×0.1 … 10 = ×1.0 … 20 = ×2.0), teto 0.95 por slot.
// Nat 20 = CRÍTICO: pedra do nó garantida (split 40/60 arma/armadura) e
// estilhaço por abate garantido — o resto fica no ×2.0.
// Chances naturais (BASE_LOOT) calibradas no scripts/dungeon-loot-sim.ts
// (EV=1): fator médio do d20 = 1.05, então base ≈ EV alvo por nó. Âncora:
// paridade ±8% em t1 com a tabela dabcc62 (Floresta: ~355 gold, 3.2 pedraB,
// 6.2 estilh, 8.1 mats, 1.7 gear, 2.7 cons); mats de tier alto caem ~20%
// (perderam o "garantido" dos rolls baixos — inerente ao modelo). Redesign
// 2026-07-13 (pedido do Mario): substitui a tabela artesanal D20_LOOT_PACKS
// de 20 linhas — morrem o material garantido dos rolls 1–5, o incomum
// garantido do 17+ e os gates de faixa (killStone 14+, poção rara 18–19);
// tudo agora escala linear e o jogador indexa número → multiplicador.
// ============================================================
// Base única de ouro: 9+14 (média 16) × goldMult do fator.
const GOLD_BASE = 9
const GOLD_VAR = 14

// Chances NATURAIS = o que cai com roll 10 (a média do dado).
const BASE_LOOT = {
  goldMult: 1.25,        // ouro do nó (roll 20 = ×2.5, teto igual ao antigo)
  pMat: 0.65,            // material de craft temático da masmorra
  matUncFrac: 0.30,      // fração do material que vem do pool incomum
  pShard: 0.21,          // Estilhaço de Pedra Negra (ligante da forja)
  pConsumable: 0.24,     // consumível comum
  pConsumableRare: 0.015,// poção rara/épica pronta
  pGear: 0.15,           // equipamento elegível
  pStone: 0.10,          // Pedra Negra inteira (nat 20 ignora e GARANTE)
  killShard: 0.52,       // estilhaço POR ABATE
  killMatChance: 0.18,   // material temático POR ABATE
  killMatUncFrac: 0.30,  // fração incomum do killMat
  killStone: 0.02,       // pedra POR ABATE
}

interface LootPackCfg {
  goldMult: number
  pMat: number
  matUncFrac: number
  pShard: number
  pConsumable: number
  pConsumableRare: number
  pGear: number
  pStone: number // 1.0 = pedra garantida (nat 20)
  killShard: number
  killMat: { chance: number; uncFrac: number }
  killStone: number
}

const rollFactor = (roll: number) => Math.max(1, Math.min(20, Math.floor(roll) || 1)) / 10

const lootPackOf = (roll: number): LootPackCfg => {
  const f = rollFactor(roll)
  const crit = f >= 2 // nat 20
  const c = (base: number) => Math.min(0.95, base * f)
  return {
    goldMult: BASE_LOOT.goldMult * f,
    pMat: c(BASE_LOOT.pMat),
    matUncFrac: Math.min(1, BASE_LOOT.matUncFrac * f),
    pShard: c(BASE_LOOT.pShard),
    pConsumable: c(BASE_LOOT.pConsumable),
    pConsumableRare: c(BASE_LOOT.pConsumableRare),
    pGear: c(BASE_LOOT.pGear),
    pStone: crit ? 1.0 : c(BASE_LOOT.pStone),
    killShard: crit ? 1.0 : c(BASE_LOOT.killShard),
    killMat: { chance: c(BASE_LOOT.killMatChance), uncFrac: Math.min(1, BASE_LOOT.killMatUncFrac * f) },
    killStone: c(BASE_LOOT.killStone),
  }
}

// Nó menor dropa menos; pedra mais rara nele; sala/boss dão mais ouro. Pedra de
// aprimoramento vem PRINCIPALMENTE de monstro (boss 2.5× + main sempre-monstro).
const NODE_LOOT_MULT: Record<LootNodeKind, { all: number; stone: number; gold: number }> = {
  minor: { all: 0.8, stone: 0.6, gold: 0.8 },
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

// Gear/poção/ingrediente de CHEFE: chances próprias (as duas primeiras absorvem o
// antigo cfg.pItemRare/pItemEpic da sorte máxima: 0.15 + 0.07).
const BOSS_GEAR_CHANCE = 0.22        // gear de raridade-âncora do chefe
const BOSS_RARE_POTION_CHANCE = 0.15 // poção rara/épica pronta (alternativa ao craft)
const BOSS_ING_RARE_CHANCE = 0.35    // ingrediente RARO de chefe (Sangue de Monstro…)
const BOSS_ING_EPIC_CHANCE = 0.10    // ingrediente ÉPICO de chefe (Pena de Fênix…)
// Em tier de masmorra 4+, os pacotes 19–20 podem trazer 1 ingrediente de chefe
// fora do covil — identidade de farm dos tiers altos.
const HIGH_TIER_BOSS_ING_MIN_TIER = 4
const HIGH_TIER_BOSS_ING_CHANCE = 0.15

// Quando um equipamento cai num nó, esta é a chance de ele ser INCOMUM de OUTRA classe
// (item que o personagem atual não equipa) — incentivo a criar/treinar outro herói.
const CROSS_CLASS_CHANCE = 0.2

// Acessórios (anel/colar/cinto) NUNCA caem aprimorados — começam no tier base.
// Só armas/armaduras podem vir com +N embutido.
const ACCESSORY_TYPES = new Set(['RING', 'NECKLACE', 'BELT'])

// Pó de Fênix (revive) quase não se usa no início, então só passa a cair a partir
// da Caverna (2★+).
const CONSUMABLE_MIN_DIFFICULTY_STARS: Record<string, number> = {
  'Pó de Fênix': 2,
}

// Aprimoramento JÁ embutido no drop, por masmorra. A floresta entrega itens +4..+7
// (o +7 é raro). null = item cai +0.
const DUNGEON_DROP_ENH: Record<DungeonId, { min: number; max: number } | null> = {
  floresta: { min: 4, max: 7 },
  caverna:  null,
  pantano:  null,
  ruinas:   null,
}

// Sorteia o aprimoramento embutido: pesa para o piso, +max é raro; sorte alta
// (roll 14+) empurra um degrau; o nat 20 empurra mais um (gear do jackpot).
function rollDropEnhancement(dungeonId: DungeonId, roll: number): number {
  const band = DUNGEON_DROP_ENH[dungeonId]
  if (!band) return 0
  const r = Math.random()
  let lvl = band.min
  if (r > 0.55) lvl = band.min + 1
  if (r > 0.80) lvl = band.min + 2
  if (r > 0.94) lvl = band.max
  if (roll >= 14) lvl = Math.max(lvl, band.min + 1) // sorte alta garante 1 acima do piso
  if (roll >= 20) lvl += 1                          // jackpot: +1 degrau extra
  return Math.min(band.max, lvl)
}

export function rollNodeLoot(
  dungeon: DungeonDef,
  roll: number,
  nodeKind: LootNodeKind,
  level: number,
  race?: string | null,
  charClass?: string | null,
  dungeonTier: number = 1,
): NodeLoot {
  // roll é o d20 da exploração — fator linear sobre as chances naturais (BASE_LOOT).
  // RARE e EPIC de gear só aparecem em BOSS (DUNGEON_GEAR_RARITY).
  const pack = lootPackOf(roll)
  const mult = NODE_LOOT_MULT[nodeKind]
  const drops: LootDrop[] = []
  const isBoss = nodeKind === 'boss'
  const dt = clampDungeonTier(dungeonTier)
  const tierReward = dungeonTierRewardMult(dungeonTier)          // gold melhor no tier alto
  const dropsConcentrated = dt >= CONCENTRATED_MIN_TIER          // concentrada nos tiers altos
  // Tier de masmorra em slots de CHANCE: multiplica com teto 0.95 (slot garantido
  // não multiplica — nele o tier age em QUANTIDADE, ver abaixo).
  const tierChance = (p: number) => Math.min(0.95, p * tierReward)
  // Quantidade extra nos slots GARANTIDOS: +1 material em t3, +2 em t5.
  const matBonusQty = dt >= 5 ? 2 : dt >= 3 ? 1 : 0

  const gold = Math.max(
    0,
    Math.floor((GOLD_BASE + Math.random() * GOLD_VAR) * pack.goldMult * mult.gold * dungeon.difficulty * (1 + level * 0.04) * tierReward)
  )

  // 🌿 Material de craft (ingrediente de alquimia OU material de forja, temático
  // da masmorra). Pool incomum e quantidade extra de tier escalam com o roll
  // (o bônus de qtd fica no 17+, herdeiro do antigo "slot garantido").
  if (Math.random() < pack.pMat * mult.all) {
    const pool = Math.random() < pack.matUncFrac ? 'uncommon' : 'common'
    const qty = roll >= 17 ? 1 + matBonusQty : 1
    for (let i = 0; i < qty; i++) {
      const d = materialDrop(dungeon, pool)
      if (d) drops.push(d)
    }
  }
  // Ingrediente de CHEFE fora do covil: só tier 4+ e pacotes 19–20.
  if (!isBoss && dt >= HIGH_TIER_BOSS_ING_MIN_TIER && roll >= 19 && Math.random() < HIGH_TIER_BOSS_ING_CHANCE) {
    const d = bossIngredientDrop('rare')
    if (d) drops.push(d)
  }

  // Estilhaço de Pedra Negra (Arma/Armadura): ligante de TODA receita de forja
  // (10 viram 1 Pedra Negra). É o material de craft "corrente" — deve ser bem
  // frequente. Roll dedicado (não some no sorteio uniforme dos outros materiais).
  if (Math.random() < pack.pShard * mult.all) {
    const shard = Math.random() < STONE_WEAPON_SHARE
      ? { name: 'Estilhaço de Pedra Negra (Arma)', emoji: '🔸' }
      : { name: 'Estilhaço de Pedra Negra (Armadura)', emoji: '🔹' }
    drops.push({ name: shard.name, kind: 'material', rarity: 'COMMON', emoji: shard.emoji })
  }
  // Estilhaço de Memória (repara raro/épico/lendário): SOMENTE no chefe (1 por boss).
  if (isBoss) {
    drops.push({ name: 'Estilhaço de Memória', kind: 'material', rarity: 'RARE', emoji: '🧠' })
  }
  // consumível de masmorra
  if (Math.random() < tierChance(pack.pConsumable) * mult.all) {
    const all = getDungeonConsumables()
    const pool = all.filter(c => rarityOf(c) === 'COMMON')
    const c = pickFrom(pool.length ? pool : all)
    if (c) drops.push({ name: c.name, kind: 'consumable', rarity: rarityOf(c), emoji: '🧪' })
  }
  // poção rara/épica pronta fora do covil: chance natural baixa × fator do roll.
  if (!isBoss && Math.random() < pack.pConsumableRare * mult.all) {
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

  // 🎁 EQUIPAMENTO: sorteado por ELEGIBILIDADE (classe + raça + nível), nunca um
  // item aleatório de nível alto. Arma/armadura é "achado de sorte": chance baixa,
  // gateada pelo tier do d20. O peso de raridade faz COMUM dominar; o item cai já
  // aprimorado (floresta: +4..+7). Às vezes vem um INCOMUM de OUTRA classe (teaser).
  const gearRarity = DUNGEON_GEAR_RARITY[dungeon.id]
  const pushGear = (i: { name: string; rarity: unknown; type?: string } | null | undefined) => {
    if (i) drops.push({
      name: i.name, kind: 'item', rarity: rarityOf(i), emoji: '📦',
      // acessório não vem aprimorado; só arma/armadura ganha o +N da masmorra.
      enhancement: ACCESSORY_TYPES.has(String(i.type)) ? 0 : rollDropEnhancement(dungeon.id, roll),
    })
  }

  if (Math.random() < tierChance(pack.pGear) * mult.all) {
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
    // gear de chefe: chance própria (absorve o antigo raro+épico da sorte máxima)
    if (Math.random() < tierChance(BOSS_GEAR_CHANCE) * mult.all) {
      // Tenta a raridade boa do chefe; se o jogador está subnivelado para ela
      // (nada elegível), cai para a raridade do nó — chefe nunca volta de mãos vazias.
      pushGear(
        rollEquipmentDrop(dungeon.id, level, race, charClass, gearRarity.boss, { mode: 'own' })
        ?? rollEquipmentDrop(dungeon.id, level, race, charClass, gearRarity.node, { mode: 'own' })
      )
    }
    // poção raro/épica PRONTA (alternativa ao craft) — chance baixa, só boss
    if (Math.random() < BOSS_RARE_POTION_CHANCE * mult.all) {
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
    // 🧪 ingrediente de CHEFE (a volta do Sangue de Monstro/Pena de Fênix e cia.):
    // insumo das poções raras/épicas da alquimia — só o covil entrega.
    if (Math.random() < BOSS_ING_RARE_CHANCE) {
      const d = bossIngredientDrop('rare')
      if (d) drops.push(d)
    }
    if (Math.random() < BOSS_ING_EPIC_CHANCE) {
      const d = bossIngredientDrop('epic')
      if (d) drops.push(d)
    }
  }

  // pedra de aprimoramento. BÁSICA por padrão; a CONCENTRADA só cai em TIER alto
  // (≥ CONCENTRATED_MIN_TIER). Fora isso, a concentrada vem do BOSS, do refino 10:1
  // na forja e da Coleta. No nat 20 a pedra é GARANTIDA — e aí o tier age em
  // QUANTIDADE (1 + 1 a cada 2 tiers, espelha a fórmula do boss); nos demais
  // pacotes a chance sobe com o tier (tierChance). O NÓ do boss NÃO rola pedra de
  // pacote — o abate do boss já garante 1–3 (rollKillLoot); sem esta exceção a
  // pedra dobrava no covil e estourava a âncora de paridade do sim (EV=1).
  if (!isBoss) {
    const pushStone = (weaponShare: number) => {
      const weapon = Math.random() < weaponShare
      const stone = dropsConcentrated
        ? (weapon ? STONE_NAMES.WEAPON_CONCENTRATED : STONE_NAMES.ARMOR_CONCENTRATED)
        : (weapon ? STONE_NAMES.WEAPON_BASIC : STONE_NAMES.ARMOR_BASIC)
      drops.push({ name: stone, kind: 'stone', rarity: dropsConcentrated ? 'RARE' : 'COMMON', emoji: '⚒️' })
    }
    if (pack.pStone >= 1) {
      const qty = 1 + Math.floor((dt - 1) / 2)
      for (let i = 0; i < qty; i++) pushStone(NAT20_STONE_WEAPON_SHARE)
    } else if (Math.random() < tierChance(pack.pStone) * mult.stone) {
      pushStone(STONE_WEAPON_SHARE)
    }
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
// O drop por abate segue o d20 pré-combate como fator (BASE_LOOT.killShard/
// killMat/killStone × roll/10); este fator por tipo de nó preserva o "nó menor
// rende menos" da tabela fixa antiga (minor 0.4 / main 0.6).
const KILL_KIND_MULT: Record<LootNodeKind, number> = { minor: 0.8, main: 1.0, boss: 1.0 }
const BOSS_KILL_STONES = { min: 1, max: 3 }
// ⚖️ Lançamento (P0 TET, 2026-07-05): em masmorra 3★+ (Pântano/Ruínas) o boss
// garante 1-2 Pedras CONCENTRADAS além das básicas — sem isso a única fonte era
// o pStone do chão (~1/run) e a escada de gear-alvo (TRI/TET) ficava a anos de
// distância (enhancement-cost-sim: TET ~1.010 concentradas nas chances novas).
const BOSS_KILL_CONCENTRATED = { min: 1, max: 2, minStars: 3 }
// ⚖️ P2 pedras (2026-07-05): o set aprimora 1 arma : 5 armaduras, mas o drop era
// 50/50 — pedra de arma sobrava ~3× e a de armadura era o gargalo real do +15.
// 30/70 aproxima a oferta da demanda mantendo folga p/ alts/venda.
const STONE_WEAPON_SHARE = 0.3
// 🎲 Crítico (nat 20): a pedra garantida do nó usa 40/60 — o jackpot pende um
// pouco mais pra arma, direcionando o jogador ao aprimoramento de armas (core).
const NAT20_STONE_WEAPON_SHARE = 0.4

// 🌅 BÔNUS SOLO (pendência 1 do balance, 2026-07-05): os PRIMEIROS bosses do
// DIA da CONTA rendem pedras extras. Por que por conta e não por personagem:
// o jogador solo faz ~3-4 bosses/dia (bônus ≈ +60% de pedra) enquanto o
// esquadrão de 10 chars faz ~20-35 (bônus ≈ +11%) — fecha o gap solo 32-37d →
// ~28d até o set +15 sem acelerar o farm rotativo (que já estava em 15-16d).
export const FIRST_BOSS_BONUS = { bossesPerDay: 2, stones: 3 }
export function firstBossBonusStones(): LootDrop[] {
  const drops: LootDrop[] = []
  for (let i = 0; i < FIRST_BOSS_BONUS.stones; i++) {
    const stone = Math.random() < STONE_WEAPON_SHARE ? STONE_NAMES.WEAPON_BASIC : STONE_NAMES.ARMOR_BASIC
    drops.push({ name: stone, kind: 'stone', rarity: 'UNCOMMON', emoji: '🌅' })
  }
  return drops
}

// `lootRoll` é o d20 rolado ANTES do combate (RunPending.lootRoll): ele define a
// CLASSE do drop de cada abate — matar 1 de 3 num nó de sorte 20 já rende drop
// "classe 20" mesmo que o jogador recue depois. `dungeon` habilita o killMat
// (material do pool temático); sem ela (callers legados) o abate rende só
// estilhaço/pedra.
export function rollKillLoot(
  nodeKind: LootNodeKind,
  isBoss: boolean,
  difficultyStars = 1,
  dungeonTier = 1,
  lootRoll = 10,
  dungeon?: DungeonDef,
): LootDrop[] {
  const drops: LootDrop[] = []
  const dt = clampDungeonTier(dungeonTier)
  if (isBoss) {
    // Pedras BÁSICAS: base + 1 extra a cada 2 tiers acima do 1 (tier alto = mais pedra).
    const tierBonus = Math.floor((dt - 1) / 2)
    const n = BOSS_KILL_STONES.min + tierBonus +
      Math.floor(Math.random() * (BOSS_KILL_STONES.max - BOSS_KILL_STONES.min + 1))
    for (let i = 0; i < n; i++) {
      const stone = Math.random() < STONE_WEAPON_SHARE ? STONE_NAMES.WEAPON_BASIC : STONE_NAMES.ARMOR_BASIC
      drops.push({ name: stone, kind: 'stone', rarity: 'UNCOMMON', emoji: '🪨' })
    }
    // CONCENTRADA: masmorra 3★+ (como antes) OU tier alto (≥ CONCENTRATED_MIN_TIER).
    // A contagem cresce +1 por tier acima do gate — o tier vira o farm de concentrada.
    if (difficultyStars >= BOSS_KILL_CONCENTRATED.minStars || dt >= CONCENTRATED_MIN_TIER) {
      const tierExtra = Math.max(0, dt - CONCENTRATED_MIN_TIER)
      const c = BOSS_KILL_CONCENTRATED.min + tierExtra +
        Math.floor(Math.random() * (BOSS_KILL_CONCENTRATED.max - BOSS_KILL_CONCENTRATED.min + 1))
      for (let i = 0; i < c; i++) {
        const stone = Math.random() < STONE_WEAPON_SHARE ? STONE_NAMES.WEAPON_CONCENTRATED : STONE_NAMES.ARMOR_CONCENTRATED
        drops.push({ name: stone, kind: 'stone', rarity: 'RARE', emoji: '💎' })
      }
    }
    return drops
  }
  const pack = lootPackOf(lootRoll)
  const kindMult = KILL_KIND_MULT[nodeKind]
  if (Math.random() < pack.killShard * kindMult) {
    const shard = Math.random() < STONE_WEAPON_SHARE
      ? { name: 'Estilhaço de Pedra Negra (Arma)', emoji: '🔸' }
      : { name: 'Estilhaço de Pedra Negra (Armadura)', emoji: '🔹' }
    drops.push({ name: shard.name, kind: 'material', rarity: 'COMMON', emoji: shard.emoji })
  }
  // Material do pool temático por abate: a luta também alimenta o craft.
  if (dungeon && Math.random() < pack.killMat.chance * kindMult) {
    const pool = Math.random() < pack.killMat.uncFrac ? 'uncommon' : 'common'
    const d = materialDrop(dungeon, pool)
    if (d) drops.push(d)
  }
  // Pedra por abate: chance natural baixa × fator (o jackpot é do nó).
  if (Math.random() < pack.killStone * kindMult) {
    const weapon = Math.random() < STONE_WEAPON_SHARE
    const concentrated = dt >= CONCENTRATED_MIN_TIER
    const stone = concentrated
      ? (weapon ? STONE_NAMES.WEAPON_CONCENTRATED : STONE_NAMES.ARMOR_CONCENTRATED)
      : (weapon ? STONE_NAMES.WEAPON_BASIC : STONE_NAMES.ARMOR_BASIC)
    drops.push({ name: stone, kind: 'stone', rarity: concentrated ? 'RARE' : 'COMMON', emoji: '⚒️' })
  }
  return drops
}
