// 🔔 Avisos pendentes POR PERSONAGEM — o que o herói tem esperando e o jogador
// ainda não viu: missão resgatável, ponto de atributo/habilidade por gastar e
// espólio de coleta parado. O dashboard e o seletor da navbar leem daqui para
// pintar o selo no card, então a conta toda sai numa consulta só (nada de um
// fetch por herói).
import { prisma } from '@/lib/prisma'
import { DAILY_QUESTS, TUTORIAL_QUESTS } from '@/lib/questCatalog'
import { periodKeyFor, utcDayKey } from '@/lib/questServer'
import { freeInventorySlots } from '@/lib/inventoryMutations'

/** Motivo da coleta estar pedindo atenção: sessão esgotada ou mochila cheia. */
export type GatherAlert = 'ready' | 'full'

export interface CharacterAlerts {
  /** Missões (tutorial + diárias) prontas para resgate deste personagem. */
  quests: number
  /** Pontos de atributo/habilidade ainda não distribuídos. */
  points: number
  /** Coleta parada esperando o jogador (ou null quando está fluindo). */
  gather: GatherAlert | null
  /** Soma para o selo do card: cada aviso vale 1, missão vale o contador. */
  total: number
}

export function emptyAlerts(): CharacterAlerts {
  return { quests: 0, points: 0, gather: null, total: 0 }
}

export async function getAccountCharacterAlerts(
  userId: string,
): Promise<Record<string, CharacterAlerts>> {
  const characters = await prisma.character.findMany({
    where: { userId },
    select: { id: true, availablePoints: true },
  })
  if (characters.length === 0) return {}

  const ids = characters.map((c) => c.id)
  const now = new Date()
  const dayKey = utcDayKey(now)

  const [questRows, sessions] = await Promise.all([
    prisma.questProgress.findMany({
      where: { characterId: { in: ids }, periodKey: { in: ['', dayKey] } },
      select: { characterId: true, questId: true, periodKey: true, progress: true, claimedAt: true },
    }),
    prisma.gatheringSession.findMany({
      where: { userId, status: { in: ['active', 'exhausted'] } },
      select: { characterId: true, status: true },
    }),
  ])

  // O login diário é da CONTA, não do herói: fica de fora do selo do card (quem
  // o anuncia é o botão de Missões do dashboard).
  const defs = [...TUTORIAL_QUESTS, ...DAILY_QUESTS]
  const questRowsByChar = new Map<string, Map<string, { progress: number; claimedAt: Date | null }>>()
  for (const row of questRows) {
    let m = questRowsByChar.get(row.characterId)
    if (!m) {
      m = new Map()
      questRowsByChar.set(row.characterId, m)
    }
    m.set(`${row.questId}|${row.periodKey}`, { progress: row.progress, claimedAt: row.claimedAt })
  }

  // Mochila cheia trava a coleta sem gastar stamina — é aviso, não é erro.
  const gatherByChar = new Map<string, GatherAlert>()
  await Promise.all(
    sessions.map(async (s) => {
      if (s.status === 'exhausted') {
        gatherByChar.set(s.characterId, 'ready')
        return
      }
      const { free } = await freeInventorySlots(prisma, s.characterId)
      if (free <= 0) gatherByChar.set(s.characterId, 'full')
    }),
  )

  const out: Record<string, CharacterAlerts> = {}
  for (const c of characters) {
    const rows = questRowsByChar.get(c.id)
    const quests = defs.filter((def) => {
      const row = rows?.get(`${def.id}|${periodKeyFor(def.kind, now)}`)
      if (!row || row.claimedAt) return false
      return row.progress >= def.objective.count
    }).length
    const points = Math.max(0, Number(c.availablePoints ?? 0))
    const gather = gatherByChar.get(c.id) ?? null
    out[c.id] = { quests, points, gather, total: quests + points + (gather ? 1 : 0) }
  }
  return out
}
