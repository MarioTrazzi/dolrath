// 🗺️ Catálogo de missões — conteúdo em CÓDIGO, como itemCatalog.ts: adicionar/ajustar
// uma missão não exige migração. O banco (QuestProgress) só guarda progresso/resgate
// por questId. Módulo puro: sem Prisma/React — importável por rotas e páginas.

export type QuestKind = 'TUTORIAL' | 'DAILY' | 'WEEKLY'

// Taxonomia de eventos — strings estáveis emitidas pelas rotas de jogo
// (pós-commit, via advanceQuestProgress em questServer.ts).
export type QuestEventType =
  | 'gather_collect' // amount = itens depositados na coleta
  | 'farm_harvest' // amount = colheitas
  | 'craft_forge'
  | 'craft_potion'
  | 'craft_process'
  | 'craft_cook'
  | 'craft_any' // agregador (ver EVENT_ALIASES)
  | 'dungeon_monster_kill' // amount = monstros abatidos no nó
  | 'dungeon_boss_kill'
  | 'pvp_fight' // lutou (vitória ou derrota)
  | 'pvp_win'
  | 'level_reach' // modo 'max': progress = max(progress, value = nível atual)

// Um evento concreto também conta para os agregadores listados aqui.
export const EVENT_ALIASES: Partial<Record<QuestEventType, QuestEventType[]>> = {
  craft_forge: ['craft_any'],
  craft_potion: ['craft_any'],
  craft_process: ['craft_any'],
  craft_cook: ['craft_any'],
  pvp_win: ['pvp_fight'],
}

export interface QuestReward {
  gold?: number // Character.gold (carteira em mãos, como toda recompensa in-game)
  xp?: number
  items?: { name: string; qty: number }[] // nomes do itemCatalog (addDropToInventoryTx resolve)
}

export interface QuestDef {
  id: string
  kind: QuestKind
  title: string
  description: string
  icon: string
  objective: { event: QuestEventType; count: number; mode?: 'increment' | 'max' }
  rewards: QuestReward
  order?: number // TUTORIAL: posição na cadeia (UI mostra só a 1ª não resgatada)
  href?: string // link "Ir para" no card
}

// ⚖️ Balanço: total das diárias ≈ 1.550🪙 + login (100-250) ≈ 1.8k/dia — ~9% do teto
// diário de 20k da masmorra. Recompensa de missão é fixa e resgatável 1×/período,
// então NÃO conta no teto (o teto existe contra faucets variáveis/exploráveis).
export const QUEST_CATALOG: QuestDef[] = [
  // ——— Tutorial: "A Jornada do Herói" (uma vez por personagem, em ordem) ———
  {
    id: 'tut_gather',
    kind: 'TUTORIAL',
    order: 1,
    icon: '⛏️',
    title: 'Primeiros Recursos',
    description: 'Inicie uma sessão de coleta e deposite 5 recursos (minério, ervas ou madeira).',
    objective: { event: 'gather_collect', count: 5 },
    rewards: { gold: 150, xp: 60 },
    href: '/gathering',
  },
  {
    id: 'tut_farm',
    kind: 'TUTORIAL',
    order: 2,
    icon: '🌾',
    title: 'Mãos na Terra',
    description: 'Plante e colha 3 vezes na fazenda.',
    objective: { event: 'farm_harvest', count: 3 },
    rewards: { gold: 200, xp: 80 },
    href: '/farm',
  },
  {
    id: 'tut_craft',
    kind: 'TUTORIAL',
    order: 3,
    icon: '⚒️',
    title: 'Aprendiz de Ofício',
    description: 'Produza 1 item em qualquer ofício: forja, alquimia, processamento ou culinária.',
    objective: { event: 'craft_any', count: 1 },
    rewards: { gold: 250, xp: 100 },
    href: '/blacksmith',
  },
  {
    id: 'tut_hunt',
    kind: 'TUTORIAL',
    order: 4,
    icon: '⚔️',
    title: 'Caçador de Monstros',
    description: 'Derrote 5 monstros explorando as masmorras.',
    objective: { event: 'dungeon_monster_kill', count: 5 },
    rewards: { gold: 300, xp: 150 },
    href: '/dungeons',
  },
  {
    id: 'tut_boss',
    kind: 'TUTORIAL',
    order: 5,
    icon: '👑',
    title: 'O Primeiro Chefe',
    description: 'Derrote o chefe de uma masmorra.',
    objective: { event: 'dungeon_boss_kill', count: 1 },
    rewards: { gold: 500, xp: 250, items: [{ name: 'Poção de Vida', qty: 2 }] },
    href: '/dungeons',
  },
  {
    id: 'tut_arena',
    kind: 'TUTORIAL',
    order: 6,
    icon: '🛡️',
    title: 'Provação na Arena',
    description: 'Participe de 1 duelo PvP na arena (vitória ou derrota).',
    objective: { event: 'pvp_fight', count: 1 },
    rewards: { gold: 400, xp: 150 },
    href: '/combat-lobby',
  },
  {
    id: 'tut_lv5',
    kind: 'TUTORIAL',
    order: 7,
    icon: '🏅',
    title: 'Veterano de Dolrath',
    description: 'Alcance o nível 5 com este personagem.',
    objective: { event: 'level_reach', count: 5, mode: 'max' },
    rewards: { gold: 300 },
  },

  // ——— Diárias (reset à meia-noite UTC) ———
  {
    id: 'daily_gather',
    kind: 'DAILY',
    icon: '⛏️',
    title: 'Colheita do Dia',
    description: 'Deposite 10 recursos de coleta hoje.',
    objective: { event: 'gather_collect', count: 10 },
    rewards: { gold: 250, xp: 100 },
    href: '/gathering',
  },
  {
    id: 'daily_farm',
    kind: 'DAILY',
    icon: '🌾',
    title: 'Rotina da Fazenda',
    description: 'Faça 5 colheitas na fazenda hoje.',
    objective: { event: 'farm_harvest', count: 5 },
    rewards: { gold: 200, xp: 80 },
    href: '/farm',
  },
  {
    id: 'daily_hunt',
    kind: 'DAILY',
    icon: '⚔️',
    title: 'Limpeza da Masmorra',
    description: 'Derrote 10 monstros nas masmorras hoje.',
    objective: { event: 'dungeon_monster_kill', count: 10 },
    rewards: { gold: 350, xp: 150 },
    href: '/dungeons',
  },
  {
    id: 'daily_boss',
    kind: 'DAILY',
    icon: '👑',
    title: 'Caça ao Chefe',
    description: 'Derrote 1 chefe de masmorra hoje.',
    objective: { event: 'dungeon_boss_kill', count: 1 },
    rewards: { gold: 400, xp: 150 },
    href: '/dungeons',
  },
  {
    id: 'daily_arena',
    kind: 'DAILY',
    icon: '🛡️',
    title: 'Gladiador do Dia',
    description: 'Vença 1 duelo PvP hoje.',
    objective: { event: 'pvp_win', count: 1 },
    rewards: { gold: 350, xp: 120 },
    href: '/combat-lobby',
  },
]

const QUESTS_BY_ID = new Map(QUEST_CATALOG.map((q) => [q.id, q]))

export function getQuestById(id: string): QuestDef | undefined {
  return QUESTS_BY_ID.get(id)
}

export const TUTORIAL_QUESTS = QUEST_CATALOG.filter((q) => q.kind === 'TUTORIAL').sort(
  (a, b) => (a.order ?? 0) - (b.order ?? 0),
)

export const DAILY_QUESTS = QUEST_CATALOG.filter((q) => q.kind === 'DAILY')

// Índice evento → missões ouvindo (com fan-out de alias: craft_forge alcança
// quests de craft_any etc.). Evento sem entrada = fast path de 0 queries.
export const QUESTS_BY_EVENT: Map<QuestEventType, QuestDef[]> = (() => {
  const map = new Map<QuestEventType, QuestDef[]>()
  const listeners = new Map<QuestEventType, QuestDef[]>()
  const allEvents: QuestEventType[] = []
  for (const q of QUEST_CATALOG) {
    const arr = listeners.get(q.objective.event) ?? []
    arr.push(q)
    listeners.set(q.objective.event, arr)
    if (!allEvents.includes(q.objective.event)) allEvents.push(q.objective.event)
  }
  for (const ev of Object.keys(EVENT_ALIASES) as QuestEventType[]) {
    if (!allEvents.includes(ev)) allEvents.push(ev)
  }
  for (const ev of allEvents) {
    const reached: QuestEventType[] = [ev, ...(EVENT_ALIASES[ev] ?? [])]
    const defs = reached.flatMap((e) => listeners.get(e) ?? [])
    if (defs.length > 0) map.set(ev, defs)
  }
  return map
})()

// 🎁 Login diário (nível de CONTA, fora do catálogo acima — ver DailyLoginClaim):
// 100🪙 no 1º dia, +25 por dia de sequência, teto 250 do 7º dia em diante.
export function dailyLoginGold(streak: number): number {
  return 100 + 25 * Math.min(Math.max(streak, 1) - 1, 6)
}
