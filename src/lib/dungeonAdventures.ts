// ============================================================
// Definições das 4 masmorras temáticas de Dolrath
// - Floresta Sombria, Caverna de Cristal, Pântano Maldito, Ruínas Arcanas
// - Cada uma com monstros, boss, tabela de eventos d20 e identidade visual
// - Usado pela experiência nova de masmorras (DungeonRun + BattleScene)
// ============================================================

import { getDungeonDrops, getDungeonConsumables } from './itemCatalog'
import { pickIngredient } from './alchemy'
import { STONE_NAMES } from './enhancementSystem'

export type DungeonId = 'floresta' | 'caverna' | 'pantano' | 'ruinas'

export interface DungeonMonsterDef {
  name: string
  emoji: string
  baseHp: number
  baseAttack: number
  baseDefense: number
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
    difficulty: 1.0,
    difficultyStars: 1,
    accent: '#34d399',
    accentSoft: 'rgba(52,211,153,0.35)',
    cardGradient: 'from-emerald-950 via-green-900 to-emerald-950',
    exploreAction: 'Seguir a trilha',
    exploreHint: 'Role o d20 para se embrenhar na mata',
    enterText: 'Você cruza a fronteira das árvores. A luz da lua mal atravessa a copa...',
    monsters: [
      { name: 'Lobo Faminto', emoji: '🐺', baseHp: 42, baseAttack: 9, baseDefense: 3 },
      { name: 'Aranha Gigante', emoji: '🕷️', baseHp: 38, baseAttack: 11, baseDefense: 2 },
      { name: 'Javali Furioso', emoji: '🐗', baseHp: 55, baseAttack: 8, baseDefense: 5 },
      { name: 'Ent Corrompido', emoji: '🌳', baseHp: 70, baseAttack: 10, baseDefense: 7 },
    ],
    boss: { name: 'Anciã da Mata', title: 'Guardiã Corrompida', emoji: '🌲', baseHp: 110, baseAttack: 12, baseDefense: 7 },
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
    difficulty: 1.15,
    difficultyStars: 2,
    accent: '#22d3ee',
    accentSoft: 'rgba(34,211,238,0.35)',
    cardGradient: 'from-slate-950 via-indigo-950 to-cyan-950',
    exploreAction: 'Descer pelos túneis',
    exploreHint: 'Role o d20 para explorar as galerias',
    enterText: 'O eco dos seus passos se mistura ao gotejar distante. Cristais iluminam o caminho...',
    monsters: [
      { name: 'Morcego Sombrio', emoji: '🦇', baseHp: 34, baseAttack: 10, baseDefense: 2 },
      { name: 'Goblin Minerador', emoji: '👺', baseHp: 45, baseAttack: 9, baseDefense: 4 },
      { name: 'Slime de Cristal', emoji: '🟣', baseHp: 50, baseAttack: 8, baseDefense: 6 },
      { name: 'Golem de Pedra', emoji: '🗿', baseHp: 78, baseAttack: 11, baseDefense: 9 },
    ],
    boss: { name: 'Wyrm Cristalino', title: 'Senhor das Profundezas', emoji: '🐉', baseHp: 130, baseAttack: 14, baseDefense: 9 },
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
    difficulty: 1.3,
    difficultyStars: 3,
    accent: '#a3e635',
    accentSoft: 'rgba(163,230,53,0.3)',
    cardGradient: 'from-stone-950 via-emerald-950 to-lime-950',
    exploreAction: 'Atravessar o lamaçal',
    exploreHint: 'Role o d20 para avançar pela névoa',
    enterText: 'A lama engole suas botas. Luzes azuladas piscam na névoa, chamando você...',
    monsters: [
      { name: 'Sapo Venenoso', emoji: '🐸', baseHp: 36, baseAttack: 12, baseDefense: 2 },
      { name: 'Serpente do Lodo', emoji: '🐍', baseHp: 44, baseAttack: 13, baseDefense: 3 },
      { name: 'Bruxa do Brejo', emoji: '🧙‍♀️', baseHp: 52, baseAttack: 15, baseDefense: 4 },
      { name: 'Crocodilo Ancião', emoji: '🐊', baseHp: 68, baseAttack: 14, baseDefense: 6 },
    ],
    boss: { name: 'Hidra do Pântano', title: 'Terror de Três Cabeças', emoji: '🐲', baseHp: 150, baseAttack: 16, baseDefense: 10 },
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
    difficulty: 1.45,
    difficultyStars: 4,
    accent: '#c084fc',
    accentSoft: 'rgba(192,132,252,0.35)',
    cardGradient: 'from-stone-950 via-amber-950 to-purple-950',
    exploreAction: 'Vasculhar os escombros',
    exploreHint: 'Role o d20 para investigar as ruínas',
    enterText: 'Poeira de séculos cobre o salão. Runas mortas acendem à sua passagem...',
    monsters: [
      { name: 'Esqueleto Guerreiro', emoji: '💀', baseHp: 48, baseAttack: 13, baseDefense: 5 },
      { name: 'Espectro Errante', emoji: '👻', baseHp: 40, baseAttack: 16, baseDefense: 3 },
      { name: 'Múmia Real', emoji: '🧟', baseHp: 64, baseAttack: 14, baseDefense: 7 },
      { name: 'Gárgula de Obsidiana', emoji: '🦅', baseHp: 74, baseAttack: 15, baseDefense: 9 },
    ],
    boss: { name: 'Lich Imperador', title: 'O Que Não Morre', emoji: '👑', baseHp: 170, baseAttack: 18, baseDefense: 11 },
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
}

// ============================================================
// TUNING DE DIFICULDADE — ajuste estes valores no playtest.
// O poder do monstro = difficulty × tier × tipo-de-nó × nível.
// Mira: Floresta exige comuns +6/+11/+15 por sala; masmorras
// seguintes sobem para PRI/DUO/TRI/TET conforme o tier.
// ============================================================
const TIER_POWER_STEP = 0.6   // +60% de poder a cada sala principal dentro da masmorra
const MINOR_NODE_FACTOR = 0.55 // nó menor = fração do poder da sala principal do mesmo tier
const BOSS_POWER_MULT = 1.8   // ataque/defesa do boss sobre a última sala
const BOSS_HP_MULT = 1.8      // HP extra do boss
const LEVEL_POWER_STEP = 0.04 // influência do nível do personagem (sutil)

export interface NodeScaling {
  /** 1..rooms — qual sala principal (nós menores herdam o tier da próxima sala) */
  tier: number
  /** true em sala principal (monstro garantido, mais forte) */
  isMain: boolean
  isBoss?: boolean
}

export function scaleMonster(
  def: DungeonMonsterDef,
  dungeon: DungeonDef,
  characterLevel: number,
  s: NodeScaling
): ScaledMonster {
  const d = dungeon.difficulty
  const tierFactor = 1 + (s.tier - 1) * TIER_POWER_STEP
  const nodeFactor = s.isBoss ? BOSS_POWER_MULT : s.isMain ? 1 : MINOR_NODE_FACTOR
  const lvlFactor = 1 + Math.max(0, characterLevel - dungeon.levelReq) * LEVEL_POWER_STEP
  const power = d * tierFactor * nodeFactor * lvlFactor

  const hp = Math.floor(def.baseHp * power * (s.isBoss ? BOSS_HP_MULT : 1))
  const bossTitle = s.isBoss && 'title' in def ? ` • ${(def as DungeonBossDef).title}` : ''
  // Nível do monstro acompanha o requisito da masmorra + a sala (acopla evolução do player)
  const monLevel = Math.max(1, Math.round(dungeon.levelReq + (s.tier - 1) * 3 + (s.isBoss ? 4 : s.isMain ? 1 : 0)))
  // Quem tem ataque especial: o boss e as salas PRINCIPAIS mais próximas dele.
  // Quantas salas finais têm especial cresce com a dificuldade da masmorra
  // (Floresta = só boss + última sala; masmorras mais difíceis começam antes).
  // Nós menores ("fraquinhos") nunca têm especial.
  const specialFromTier = dungeon.rooms - (dungeon.difficultyStars - 1)
  const hasSpecial = !!s.isBoss || (!!s.isMain && s.tier >= specialFromTier)
  return {
    id: `${s.isBoss ? 'boss' : 'monster'}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: s.isBoss ? `👑 ${def.name}${bossTitle}` : def.name,
    emoji: def.emoji,
    level: monLevel,
    hp,
    maxHp: hp,
    attack: Math.floor(def.baseAttack * power),
    defense: Math.floor(def.baseDefense * power),
    // AP um pouco acima do ataque físico para o especial ser ameaçador.
    magicPower: hasSpecial ? Math.floor(def.baseAttack * power * 1.2) : 0,
    hasSpecial,
    goldReward: Math.floor((s.isBoss ? 150 + Math.random() * 150 : s.isMain ? 25 + Math.random() * 25 : 6 + Math.random() * 10) * d * tierFactor),
    xpReward: Math.floor((s.isBoss ? 150 + Math.random() * 100 : s.isMain ? 35 + Math.random() * 25 : 12 + Math.random() * 12) * d * tierFactor),
    isBoss: !!s.isBoss,
  }
}

export function pickMonster(dungeon: DungeonDef): DungeonMonsterDef {
  return dungeon.monsters[Math.floor(Math.random() * dungeon.monsters.length)]
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

export type LootKind = 'ingredient' | 'consumable' | 'item' | 'stone'
export interface LootDrop {
  name: string
  kind: LootKind
  rarity?: string
  emoji: string
}
export interface NodeLoot {
  gold: number
  drops: LootDrop[]
}

export type LootNodeKind = 'minor' | 'main' | 'boss'

const LUCK_CFG: Record<
  LuckTier,
  {
    goldBase: number; goldVar: number; pMaterial: number; pConsumable: number; pStone: number;
    // Items: normal (nós principais/menores) + boss (covil)
    pItemCommon: number; pItemUncommon: number;
    pItemRare: number; pItemEpic: number;
  }
> = {
  low: {
    goldBase: 4, goldVar: 8, pMaterial: 0.7, pConsumable: 0.18, pStone: 0.02,
    pItemCommon: 0.10, pItemUncommon: 0.05,
    pItemRare: 0.02, pItemEpic: 0.01,
  },
  mid: {
    goldBase: 10, goldVar: 16, pMaterial: 0.5, pConsumable: 0.35, pStone: 0.05,
    pItemCommon: 0.25, pItemUncommon: 0.15,
    pItemRare: 0.07, pItemEpic: 0.04,
  },
  high: {
    goldBase: 18, goldVar: 30, pMaterial: 0.3, pConsumable: 0.45, pStone: 0.1,
    pItemCommon: 0.40, pItemUncommon: 0.25,
    pItemRare: 0.15, pItemEpic: 0.07,
  },
}

// Nó menor dropa menos; pedra mais rara nele; sala/boss dão mais ouro.
const NODE_LOOT_MULT: Record<LootNodeKind, { all: number; stone: number; gold: number }> = {
  minor: { all: 0.8, stone: 0.4, gold: 0.8 },
  main: { all: 1.0, stone: 1.0, gold: 1.3 },
  boss: { all: 1.0, stone: 2.5, gold: 2.0 },
}

const pickFrom = <T>(arr: T[]): T | undefined => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined)
const rarityOf = (x: { rarity: unknown }) => String(x.rarity).toUpperCase()

export function rollNodeLoot(dungeon: DungeonDef, roll: number, nodeKind: LootNodeKind, level: number): NodeLoot {
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
  if (Math.random() < cfg.pMaterial * mult.all) {
    const rarities = isBoss
      ? (['COMMON', 'UNCOMMON', 'RARE', 'EPIC'] as const)
      : (['COMMON', 'UNCOMMON'] as const)
    const ing = pickIngredient([...rarities])
    if (ing) drops.push({ name: ing.name, kind: 'ingredient', rarity: rarityOf(ing), emoji: ing.emoji })
  }
  // consumível de masmorra
  if (Math.random() < cfg.pConsumable * mult.all) {
    const all = getDungeonConsumables()
    const pool = all.filter(c => rarityOf(c) === 'COMMON')
    const c = pickFrom(pool.length ? pool : all)
    if (c) drops.push({ name: c.name, kind: 'consumable', rarity: rarityOf(c), emoji: '🧪' })
  }

  // equipamento: COMMON
  if (Math.random() < cfg.pItemCommon * mult.all) {
    const all = getDungeonDrops(dungeon.id)
    const pool = all.filter(i => rarityOf(i) === 'COMMON')
    const i = pickFrom(pool.length ? pool : all)
    if (i) drops.push({ name: i.name, kind: 'item', rarity: rarityOf(i), emoji: '📦' })
  }
  // equipamento: UNCOMMON
  if (Math.random() < cfg.pItemUncommon * mult.all) {
    const all = getDungeonDrops(dungeon.id)
    const pool = all.filter(i => rarityOf(i) === 'UNCOMMON')
    const i = pickFrom(pool)
    if (i) drops.push({ name: i.name, kind: 'item', rarity: rarityOf(i), emoji: '📦' })
  }

  // Itens RARE e EPIC só em BOSS
  if (isBoss) {
    // equipamento: RARE (só boss)
    if (Math.random() < cfg.pItemRare * mult.all) {
      const all = getDungeonDrops(dungeon.id)
      const pool = all.filter(i => rarityOf(i) === 'RARE')
      const i = pickFrom(pool)
      if (i) drops.push({ name: i.name, kind: 'item', rarity: rarityOf(i), emoji: '📦' })
    }
    // equipamento: EPIC (só boss)
    if (Math.random() < cfg.pItemEpic * mult.all) {
      const all = getDungeonDrops(dungeon.id)
      const pool = all.filter(i => rarityOf(i) === 'EPIC')
      const i = pickFrom(pool)
      if (i) drops.push({ name: i.name, kind: 'item', rarity: rarityOf(i), emoji: '📦' })
    }
    // poção raro/épica PRONTA (alternativa ao craft) — chance baixa, só boss
    if (Math.random() < cfg.pItemRare * mult.all) {
      const pool = getDungeonConsumables().filter(c => {
        const r = rarityOf(c)
        return r === 'RARE' || r === 'EPIC'
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
